import type { Sql } from 'postgres';
import { transaction } from '@intafaced/db';
import type { AccountState } from '@intafaced/contracts';
import { assertDelegatableScopes, issueAccessToken, SESSION_SCOPES, type Scope, type TokenConfig } from '@intafaced/auth';
import type { EventBus } from '@intafaced/events';
import { dummyPasswordHash, generateApiKey, generateToken, hashPassword, hashToken, needsRehash, verifyPassword } from './passwords.js';
import { generateRecoveryCodes, generateSecret, matchTotpStep, totpUri } from './totp.js';
import { encryptTotpSecret, materializeTotpSecret, parseTotpSecretKey } from './totp-crypto.js';
import { apiKeyOriginAllowed } from './api-key-origin.js';
import { apiKeyIpAllowed, normalizeIp } from './api-key-ip.js';
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
      | 'auth.kyc_not_pending'
      | 'auth.kyc_agent_refused'
      | 'auth.mfa_not_enrolled'
      | 'auth.webauthn_invalid'
      | 'auth.webauthn_not_enrolled'
      | 'auth.domain_not_allowed'
      | 'auth.ip_not_allowed'
      | 'auth.ip_invalid'
      | 'auth.sub_account_required'
      | 'auth.sub_account_denied'
      | 'auth.sub_account_revoked'
      | 'auth.sub_account_same'
      | 'auth.sub_account_limit'
      | 'auth.api_key_denied'
      | 'auth.api_key_revoked'
      | 'auth.session_denied'
      | 'auth.session_revoked'
      | 'auth.totp_key_missing',
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export type { WebAuthnConfig, StoredWebAuthnCredential };

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
const STEP_UP_TTL_SECONDS = 300;
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

export const DEFAULT_MAX_SUB_ACCOUNTS = 25;

export class AuthService {
  private readonly pendingTotp: PendingTotpEnrolmentStore;
  private readonly challenges: ChallengeStorePort;
  private readonly webauthn: WebAuthnConfig;
  private readonly totpSecretKey: Buffer | null;
  private readonly maxSubAccounts: number;

  constructor(
    private readonly sql: Sql,
    private readonly bus: EventBus,
    private readonly rank: RankService,
    private readonly tokens: TokenConfig & { refreshTtlSeconds: number },
    webauthn: WebAuthnConfig = DEFAULT_WEBAUTHN,
    totpSecretKeyMaterial?: string,
    challenges?: ChallengeStorePort,
    pendingTotp?: PendingTotpEnrolmentStore,
    maxSubAccounts: number = DEFAULT_MAX_SUB_ACCOUNTS,
  ) {
    this.webauthn = webauthn;
    this.totpSecretKey = parseTotpSecretKey(totpSecretKeyMaterial);
    this.challenges = challenges ?? new SqlChallengeStore(sql, webauthn.challengeTtlMs);
    this.pendingTotp = pendingTotp ?? new SqlPendingTotpEnrolmentStore(sql);
    this.maxSubAccounts = Number.isFinite(maxSubAccounts) && maxSubAccounts >= 1 ? Math.floor(maxSubAccounts) : DEFAULT_MAX_SUB_ACCOUNTS;
  }

  private openTotpSecretColumn(stored: string): string {
    try {
      return materializeTotpSecret(this.totpSecretKey, stored);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'TOTP secret unreadable';
      throw new AuthError(msg, 'auth.mfa_invalid');
    }
  }

  async register(input: RegisterInput): Promise<SessionTokens> {
    const passwordHash = await hashPassword(input.password);
    const userId = await transaction(this.sql, async (tx) => {
      const clash = await tx<Array<{ handle: string; email: string }>>`SELECT handle, email FROM users WHERE handle = ${input.handle} OR email = ${input.email}`;
      for (const row of clash) {
        if (row.handle.toLowerCase() === input.handle.toLowerCase()) {
          throw new AuthError('That handle is taken', 'auth.handle_taken');
        }
        throw new AuthError('An account with that email already exists', 'auth.email_taken');
      }
      const inserted = await tx<Array<{ id: string }>>`INSERT INTO users (handle, email, password_hash) VALUES (${input.handle}, ${input.email}, ${passwordHash}) RETURNING id`;
      const id = inserted[0]!.id;
      await tx`INSERT INTO profiles (user_id, display_name, region) VALUES (${id}, ${input.handle}, ${input.region ?? null})`;
      await tx`INSERT INTO rank_state (user_id) VALUES (${id})`;
      return id;
    });
    await this.bus.publish('userCreated', { userId, handle: input.handle, ...(input.region ? { region: input.region } : {}) }, { idempotencyKey: `user.created:${userId}` });
    await this.rank.awardXp({ userId, sourceModule: 'identity', action: 'identity.registered', xpDelta: 50, idempotencyKey: `identity.registered:${userId}` });
    return this.issueSession(userId, { device: input.device, ip: input.ip, mfa: false });
  }
