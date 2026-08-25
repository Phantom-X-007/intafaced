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
