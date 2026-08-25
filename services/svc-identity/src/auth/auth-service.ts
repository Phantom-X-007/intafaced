import type { Sql } from 'postgres';
import { transaction } from '@intafaced/db';
import type { AccountState } from '@intafaced/contracts';
import { assertDelegatableScopes, issueAccessToken, SESSION_SCOPES, type Scope, type TokenConfig } from '@intafaced/auth';
import type { EventBus } from '@intafaced/events';
import { dummyPasswordHash, generateApiKey, generateToken, hashPassword, hashToken, needsRehash, verifyPassword } from './passwords.js';
import { generateRecoveryCodes, generateSecret, matchTotpStep, totpUri } from './totp.js';
import { encryptTotpSecret, materializeTotpSecret, parseTotpSecretKey } from './totp-crypto.js';
import { apiKeyOriginAllowed } from './api-key-origin.js';
import { SqlPendingTotpEnrolmentStore, type PendingTotpEnrolmentStore } from './pending-totp-store.js';
import {
  b64urlDecode,
  b64urlEncode,
  SqlChallengeStore,
  createAuthenticationOptions,
  createRegistrationOptions,
  generateChallenge,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  WebAuthnError,
} from './webauthn.js';
import type {
  AuthenticationOptionsJSON,
  AuthenticationResponseJSON,
  ChallengeStorePort,
  RegistrationOptionsJSON,
  RegistrationResponseJSON,
  StoredWebAuthnCredential,
  WebAuthnConfig,
} from './webauthn.js';
import {
  syncNavigatorSessionClosed,
  syncNavigatorSessionOpen,
  syncNavigatorSessionsClosedForUser,
} from '../agents/navigator-session-projection-sync.js';
import type { RankService } from '../rank/rank-service.js';

/**
 * AUTH (§4.1, §9).
 *
 * Sovereignty means owning this. No third-party auth dependency, which also
 * means no third party to blame — every decision here is ours to get right.
 *
 * Schema: SQL is search_path-relative (not hard-coded `identity.*`). Production
 * connects with `search_path = identity,public` (see `src/index.ts`). Tests use
 * `createTestDb`, which allocates a unique schema per suite so parallel
 * worktrees cannot TRUNCATE each other into a poisoned KYC queue.
 */

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'auth.invalid_credentials'
      | 'auth.account_frozen'
      | 'auth.handle_taken'
      | 'auth.email_taken'
      | 'auth.mfa_required'
      | 'auth.mfa_invalid'
      | 'auth.mfa_already_enrolled'
      | 'auth.session_invalid'
      | 'auth.session_reused'
      | 'auth.not_found'
      /** A KYC record exists but is not in a state an operator can act on. */
      | 'auth.kyc_not_pending'
      /**
       * KYC approve/reject tried to write `reviewed_by` from an agent principal
       * (service caller or API-key token). Approval is an operator action.
       */
      | 'auth.kyc_agent_refused'
      /** Step-up asked for on an account with no second factor to step up with. */
      | 'auth.mfa_not_enrolled'
      /** WebAuthn ceremony failed (bad signature, origin, challenge, counter). */
      | 'auth.webauthn_invalid'
      /** Account has no registered WebAuthn credential for assertion. */
      | 'auth.webauthn_not_enrolled'
      /**
       * API key has a domain whitelist and the request origin is missing or
       * not on it. Empty whitelist stays open (server bots).
       */
      | 'auth.domain_not_allowed'
      /**
       * Ownership / transfer door: a sub-account id was missing or empty.
       * SPEC-SUBACCOUNTS §2 — never default to primary.
       */
      | 'auth.sub_account_required'
      /** Ownership / transfer door: caller does not own the named partition. */
      | 'auth.sub_account_denied'
      /** Ownership / transfer door: partition is soft-revoked. */
      | 'auth.sub_account_revoked'
      /** Transfer door: from and to name the same partition. */
      | 'auth.sub_account_same'
      /**
       * Create refused — live partitions already at the owner-published max
       * (SPEC-SUBACCOUNTS §4 / §8). Unbounded books are an abuse surface.
       */
      | 'auth.sub_account_limit'
      /**
       * Place door: API key id was missing or unknown. Same answer as a
       * foreign guess — no existence oracle (pair with revoked).
       */
      | 'auth.api_key_denied'
      /** Place door: API key is hard-revoked (revoked=true). */
      | 'auth.api_key_revoked'
      /**
       * Place door: session id was missing or unknown. Same answer as a
       * foreign guess — no existence oracle (pair with revoked).
       */
      | 'auth.session_denied'
      /** Place door: session is revoked or expired. */
      | 'auth.session_revoked'
      /**
       * TOTP encrypt-at-rest key missing/invalid. Enrol refuses rather than
       * writing base32 plaintext to users.totp_secret (IDENTITY_TOTP_SECRET_KEY).
       */
      | 'auth.totp_key_missing',
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export type { WebAuthnConfig, StoredWebAuthnCredential };

/**
 * Pin: `reviewed_by` is an operator name. A service caller (`svc-agents`) or
 * an API-key principal (`kid`) is an agent, not a compliance operator — refuse
 * before the UPDATE. Interactive operator sessions omit both.
 */
export function assertOperatorKycReview(input: { service?: string | null; kid?: string | null }): void {
  if (input.service || input.kid) {
    throw new AuthError('KYC review is an operator action — an agent must never write reviewed_by', 'auth.kyc_agent_refused');
  }
}

export type KycTier = 'none' | 'basic' | 'full' | 'institutional';
export type SubmittableKycTier = Exclude<KycTier, 'none'>;

export interface KycRecordView {
  id: string;
  userId: string;
  tier: KycTier;
  jurisdiction: string;
  providerRef: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  /** The operator who granted it. Null on a record nobody has reviewed yet. */
  reviewedBy: string | null;
  reviewedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

interface KycRow {
  id: string;
  user_id: string;
  tier: KycTier;
  jurisdiction: string;
  provider_ref: string | null;
  status: KycRecordView['status'];
  reviewed_by: string | null;
  reviewed_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
}

function toKycRecord(row: KycRow): KycRecordView {
  return {
    id: row.id,
    userId: row.user_id,
    tier: row.tier,
    jurisdiction: row.jurisdiction,
    providerRef: row.provider_ref,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

const TIER_ORDER: Readonly<Record<KycTier, number>> = { none: 0, basic: 1, full: 2, institutional: 3 };

/**
 * How long an elevated (step-up) access token lives.
 *
 * Five minutes, and deliberately far shorter than a normal access token: the
 * whole reason `trade:withdraw` is absent from a session's default scopes is so
 * that a stolen token cannot drain an account. An elevation that lasted the
 * full access TTL would hand the thief the same window as the owner.
 */
const STEP_UP_TTL_SECONDS = 300;

/** The only scopes a step-up may add. Not caller-supplied — an elevation endpoint that takes a scope list is a scope-granting endpoint. */
const STEP_UP_SCOPES: readonly Scope[] = ['trade:withdraw'];

export interface RegisterInput {
  handle: string;
  email: string;
  password: string;
  region?: string;
  device?: string;
  ip?: string;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  sessionId: string;
  userId: string;
  mfaRequired: boolean;
}

const DEFAULT_WEBAUTHN: WebAuthnConfig = {
  rpID: 'localhost',
  rpName: 'INTAFACED',
  origin: 'http://localhost:3000',
};

/** Conservative live-partition cap until owner publishes IDENTITY_MAX_SUB_ACCOUNTS. */
export const DEFAULT_MAX_SUB_ACCOUNTS = 25;

export class AuthService {
