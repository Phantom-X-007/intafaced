import type { Sql } from 'postgres';
import { transaction } from '@intafaced/db';
import { assertKeyScopesAllowed, issueAccessToken, type Scope, type TokenConfig } from '@intafaced/auth';
import type { EventBus } from '@intafaced/events';
import { dummyPasswordHash, generateApiKey, generateToken, hashPassword, hashToken, needsRehash, verifyPassword } from './passwords.js';
import { generateRecoveryCodes, generateSecret, totpUri, verifyTotp } from './totp.js';
import type { RankService } from '../rank/rank-service.js';

/**
 * AUTH (§4.1, §9).
 *
 * Sovereignty means owning this. No third-party auth dependency, which also
 * means no third party to blame — every decision here is ours to get right.
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
      /** Step-up asked for on an account with no second factor to step up with. */
      | 'auth.mfa_not_enrolled',
  ) {
    super(message);
    this.name = 'AuthError';
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

export class AuthService {
  constructor(
    private readonly sql: Sql,
    private readonly bus: EventBus,
    private readonly rank: RankService,
    private readonly tokens: TokenConfig & { refreshTtlSeconds: number },
  ) {}

  // ── Registration ───────────────────────────────────────────────────────────

  async register(input: RegisterInput): Promise<SessionTokens> {
    const passwordHash = await hashPassword(input.password);

    const userId = await transaction(this.sql, async (tx) => {
      const clash = await tx<Array<{ handle: string; email: string }>>`
        SELECT handle, email FROM identity.users WHERE handle = ${input.handle} OR email = ${input.email}
      `;
      for (const row of clash) {
        if (row.handle.toLowerCase() === input.handle.toLowerCase()) {
          throw new AuthError('That handle is taken', 'auth.handle_taken');
        }
        throw new AuthError('An account with that email already exists', 'auth.email_taken');
      }

      const inserted = await tx<Array<{ id: string }>>`
        INSERT INTO identity.users (handle, email, password_hash)
        VALUES (${input.handle}, ${input.email}, ${passwordHash})
        RETURNING id
      `;
      const id = inserted[0]!.id;

      await tx`
        INSERT INTO identity.profiles (user_id, display_name, region)
        VALUES (${id}, ${input.handle}, ${input.region ?? null})
      `;
      await tx`INSERT INTO identity.rank_state (user_id) VALUES (${id})`;

      return id;
    });

    await this.bus.publish(
      'userCreated',
      { userId, handle: input.handle, ...(input.region ? { region: input.region } : {}) },
      { idempotencyKey: `user.created:${userId}` },
    );

    await this.rank.awardXp({
      userId,
      sourceModule: 'identity',
      action: 'identity.registered',
      xpDelta: 50,
      idempotencyKey: `identity.registered:${userId}`,
    });

    return this.issueSession(userId, { device: input.device, ip: input.ip, mfa: false });
  }

  // ── Login ──────────────────────────────────────────────────────────────────

  async login(input: { identifier: string; password: string; totpCode?: string; device?: string; ip?: string }): Promise<SessionTokens> {
    const rows = await this.sql<Array<{ id: string; password_hash: string; status: string; totp_secret: string | null }>>`
      SELECT id, password_hash, status, totp_secret FROM identity.users
       WHERE handle = ${input.identifier} OR email = ${input.identifier}
    `;
    const user = rows[0];

    // Do the hash comparison even when there is no user, against a REAL hash of
    // a random string, so an unknown account costs the same time as a wrong
    // password. A hand-written fake would return early and leak the difference.
    const storedHash = user?.password_hash ?? (await dummyPasswordHash());
    const passwordOk = await verifyPassword(storedHash, input.password);

    if (!user || !passwordOk) throw new AuthError('Invalid credentials', 'auth.invalid_credentials');
    if (user.status !== 'active') throw new AuthError(`Account is ${user.status}`, 'auth.account_frozen');

    let mfa = false;
    if (user.totp_secret) {
      if (!input.totpCode) throw new AuthError('Two-factor code required', 'auth.mfa_required');
      if (!verifyTotp(user.totp_secret, input.totpCode)) throw new AuthError('Invalid two-factor code', 'auth.mfa_invalid');
      mfa = true;
    }

    // Opportunistic upgrade: a scrypt hash becomes argon2id on next login, so
    // nobody has to reset a password to benefit from the stronger algorithm.
    if (await needsRehash(user.password_hash)) {
      const upgraded = await hashPassword(input.password);
      await this.sql`UPDATE identity.users SET password_hash = ${upgraded}, updated_at = now() WHERE id = ${user.id}`;
    }

    return this.issueSession(user.id, { device: input.device, ip: input.ip, mfa });
  }

  // ── Sessions ───────────────────────────────────────────────────────────────

  private async issueSession(
    userId: string,
    options: { device?: string | undefined; ip?: string | undefined; mfa: boolean },
  ): Promise<SessionTokens> {
    const refreshToken = generateToken(48);
    const expiresAt = new Date(Date.now() + this.tokens.refreshTtlSeconds * 1000);

    const inserted = await this.sql<Array<{ id: string }>>`
      INSERT INTO identity.sessions (user_id, refresh_hash, device, ip, mfa, expires_at)
      VALUES (${userId}, ${hashToken(refreshToken)}, ${options.device ?? null}, ${options.ip ?? null}, ${options.mfa}, ${expiresAt})
      RETURNING id
    `;
    const sessionId = inserted[0]!.id;

    const tier = await this.kycTier(userId);

    const { token: accessToken, expiresAt: accessExpiresAt } = await issueAccessToken(
      { userId, sessionId, scopes: this.defaultScopes(), tier, mfa: options.mfa },
      this.tokens,
    );

    return { accessToken, refreshToken, expiresAt: accessExpiresAt, sessionId, userId, mfaRequired: false };
  }

  /**
   * Refresh with rotation.
   *
   * The old token is invalidated the moment it is used. If a rotated token is
   * presented again, that means two parties hold it — the original holder and
   * a thief — so every session for that user is revoked immediately. Losing a
   * login is a far better outcome than an undetected account takeover.
   */
  async refresh(refreshToken: string, options: { device?: string; ip?: string } = {}): Promise<SessionTokens> {
    const hash = hashToken(refreshToken);

    /** Explicit, so `in` narrows rather than the generic collapsing the union. */
    type RefreshOutcome =
      { kind: 'reuse'; userId: string; sessionId: string } | { kind: 'expired' } | { kind: 'rotated'; tokens: SessionTokens };

    const result = await transaction<RefreshOutcome>(this.sql, async (tx) => {
      const rows = await tx<Array<{ id: string; user_id: string; revoked: boolean; mfa: boolean; expires_at: Date }>>`
        SELECT id, user_id, revoked, mfa, expires_at FROM identity.sessions WHERE refresh_hash = ${hash} FOR UPDATE
      `;
      const session = rows[0];
      if (!session) throw new AuthError('Session not found', 'auth.session_invalid');

      // Reuse of a rotated token.
      //
      // The revocation must NOT happen in this transaction: throwing from
      // inside would roll it back, so the thief's replay would revoke nothing.
      // Report it, commit, and burn the sessions outside.
      if (session.revoked) return { kind: 'reuse', userId: session.user_id, sessionId: session.id };

      if (session.expires_at.getTime() < Date.now()) {
        await tx`UPDATE identity.sessions SET revoked = true WHERE id = ${session.id}`;
        return { kind: 'expired' };
      }

      await tx`UPDATE identity.sessions SET revoked = true, last_used_at = now() WHERE id = ${session.id}`;

      const nextToken = generateToken(48);
      const expiresAt = new Date(Date.now() + this.tokens.refreshTtlSeconds * 1000);
      const nextSession = await tx<Array<{ id: string }>>`
        INSERT INTO identity.sessions (user_id, refresh_hash, device, ip, mfa, expires_at)
        VALUES (
          ${session.user_id}, ${hashToken(nextToken)}, ${options.device ?? null},
          ${options.ip ?? null}, ${session.mfa}, ${expiresAt}
        )
        RETURNING id
      `;
      const sessionId = nextSession[0]!.id;

      const tier = await this.kycTier(session.user_id, tx);
      const { token: accessToken, expiresAt: accessExpiresAt } = await issueAccessToken(
        { userId: session.user_id, sessionId, scopes: this.defaultScopes(), tier, mfa: session.mfa },
        this.tokens,
      );

      return {
        kind: 'rotated',
        tokens: {
          accessToken,
          refreshToken: nextToken,
          expiresAt: accessExpiresAt,
          sessionId,
          userId: session.user_id,
          mfaRequired: false,
        },
      };
    });

    if (result.kind === 'reuse') {
      // Committed separately, so it survives the error we are about to raise.
      // Losing every session is the correct outcome: two parties hold a token
      // that only one should, and we cannot tell which one is the owner.
      await this.sql`
        UPDATE identity.sessions
           SET revoked = true, reuse_detected_at = now()
         WHERE user_id = ${result.userId} AND revoked = false
      `;
      await this.sql`UPDATE identity.sessions SET reuse_detected_at = now() WHERE id = ${result.sessionId}`;
      throw new AuthError('Refresh token reuse detected — all sessions revoked', 'auth.session_reused');
    }

    if (result.kind === 'expired') throw new AuthError('Session expired', 'auth.session_invalid');

    return result.tokens;
  }

  async logout(refreshToken: string): Promise<void> {
    await this.sql`UPDATE identity.sessions SET revoked = true WHERE refresh_hash = ${hashToken(refreshToken)}`;
  }

  async logoutAll(userId: string): Promise<number> {
    const result = await this.sql`UPDATE identity.sessions SET revoked = true WHERE user_id = ${userId} AND revoked = false`;
    return result.count;
  }

  // ── TOTP ───────────────────────────────────────────────────────────────────

  async startTotpEnrolment(userId: string): Promise<{ secret: string; uri: string; recoveryCodes: string[] }> {
    const rows = await this.sql<Array<{ email: string; totp_secret: string | null }>>`
      SELECT email, totp_secret FROM identity.users WHERE id = ${userId}
    `;
    const user = rows[0];
    if (!user) throw new AuthError('User not found', 'auth.not_found');
    if (user.totp_secret) throw new AuthError('Two-factor is already enrolled', 'auth.mfa_already_enrolled');

    const secret = generateSecret();
    const recoveryCodes = generateRecoveryCodes();

    // The secret is NOT persisted yet — only a confirmed code proves the user
    // actually scanned it. Storing it now would lock out anyone who abandoned
    // enrolment halfway.
    return { secret, uri: totpUri(secret, user.email), recoveryCodes };
  }

  async confirmTotpEnrolment(userId: string, secret: string, code: string): Promise<void> {
    if (!verifyTotp(secret, code)) throw new AuthError('Invalid two-factor code', 'auth.mfa_invalid');

    await this.sql`
      UPDATE identity.users SET totp_secret = ${secret}, totp_enrolled_at = now(), updated_at = now()
       WHERE id = ${userId} AND totp_secret IS NULL
    `;

    await this.rank.awardXp({
      userId,
      sourceModule: 'identity',
      action: 'identity.totp.enrolled',
      xpDelta: 100,
      idempotencyKey: `identity.totp.enrolled:${userId}`,
    });
  }

  // ── API keys ───────────────────────────────────────────────────────────────

  async createApiKey(input: {
    userId: string;
    name: string;
    scopes: string[];
    domainWhitelist?: string[];
    expiresAt?: Date;
  }): Promise<{ id: string; key: string; prefix: string }> {
    // §9: a long-lived key must never be able to move value off the platform.
    assertKeyScopesAllowed(input.scopes);

    const { key, hash, prefix } = generateApiKey();
    const rows = await this.sql<Array<{ id: string }>>`
      INSERT INTO identity.api_keys (user_id, name, key_hash, key_prefix, scopes, domain_whitelist, expires_at)
      VALUES (
        ${input.userId}, ${input.name}, ${hash}, ${prefix},
        ${input.scopes}, ${input.domainWhitelist ?? []}, ${input.expiresAt ?? null}
      )
      RETURNING id
    `;

    // Returned once. There is no endpoint that can retrieve it again.
    return { id: rows[0]!.id, key, prefix };
  }

  async verifyApiKey(key: string): Promise<{ userId: string; scopes: string[]; keyId: string } | null> {
    const rows = await this.sql<Array<{ id: string; user_id: string; scopes: string[]; expires_at: Date | null }>>`
      SELECT id, user_id, scopes, expires_at FROM identity.api_keys
       WHERE key_hash = ${hashToken(key)} AND revoked = false
    `;
    const row = rows[0];
    if (!row) return null;
    if (row.expires_at && row.expires_at.getTime() < Date.now()) return null;

    await this.sql`UPDATE identity.api_keys SET last_used_at = now() WHERE id = ${row.id}`;
    return { userId: row.user_id, scopes: row.scopes, keyId: row.id };
  }

  async revokeApiKey(userId: string, keyId: string): Promise<boolean> {
    const result = await this.sql`
      UPDATE identity.api_keys SET revoked = true WHERE id = ${keyId} AND user_id = ${userId} AND revoked = false
    `;
    return result.count > 0;
  }

  async listApiKeys(userId: string) {
    return this.sql<Array<{ id: string; name: string; key_prefix: string; scopes: string[]; last_used_at: Date | null; revoked: boolean }>>`
      SELECT id, name, key_prefix, scopes, last_used_at, revoked FROM identity.api_keys
       WHERE user_id = ${userId} ORDER BY created_at DESC
    `;
  }

  // ── KYC ────────────────────────────────────────────────────────────────────

  /** Highest approved, unexpired tier. Anything else is `none`. */
  async kycTier(userId: string, sql: Sql = this.sql): Promise<'none' | 'basic' | 'full' | 'institutional'> {
    const rows = await sql<Array<{ tier: 'basic' | 'full' | 'institutional' }>>`
      SELECT tier FROM identity.kyc_records
       WHERE user_id = ${userId} AND status = 'approved' AND (expires_at IS NULL OR expires_at > now())
    `;
    const order = { basic: 1, full: 2, institutional: 3 } as const;
    let best: 'none' | 'basic' | 'full' | 'institutional' = 'none';
    for (const row of rows) {
      if (best === 'none' || order[row.tier] > order[best as 'basic' | 'full' | 'institutional']) best = row.tier;
    }
    return best;
  }

  /**
   * A user asks to be verified at a tier. Nothing is granted here.
   *
   * The record lands `pending` and only an operator holding `admin:compliance`
   * can move it to `approved` — which is the whole point of splitting submit
   * from approve. A single "setKycTier" would be a procedure that grants its own
   * caller access to every custodial module, and no scope check makes that safe.
   *
   * Idempotent on (user, tier), serialised on the user row rather than on a
   * unique index: two taps on a slow "Verify me" button must not produce two
   * pending records for one operator to adjudicate, and `kyc_records` carries no
   * constraint that would stop them.
   */
  async submitKyc(input: { userId: string; tier: SubmittableKycTier; jurisdiction: string; providerRef?: string }): Promise<KycRecordView> {
    return transaction(this.sql, async (tx) => {
      const users = await tx<Array<{ id: string }>>`SELECT id FROM identity.users WHERE id = ${input.userId} FOR UPDATE`;
      if (!users[0]) throw new AuthError('User not found', 'auth.not_found');

      // An approved, unexpired record at this tier or higher already answers the
      // request. Re-submitting must not reset anyone to `pending` — that would
      // let a user drop their own tier and, worse, make it look reviewable again.
      const existing = await tx<KycRow[]>`
        SELECT id, user_id, tier, jurisdiction, provider_ref, status, reviewed_by, reviewed_at, expires_at, created_at FROM identity.kyc_records
         WHERE user_id = ${input.userId}
           AND (
             (status = 'approved' AND (expires_at IS NULL OR expires_at > now()))
             OR (status = 'pending' AND tier = ${input.tier})
           )
         ORDER BY created_at DESC
      `;

      const approved = existing.find((r) => r.status === 'approved' && TIER_ORDER[r.tier] >= TIER_ORDER[input.tier]);
      if (approved) return toKycRecord(approved);

      const pending = existing.find((r) => r.status === 'pending');
      if (pending) return toKycRecord(pending);

      const inserted = await tx<KycRow[]>`
        INSERT INTO identity.kyc_records (user_id, tier, jurisdiction, provider_ref, status)
        VALUES (${input.userId}, ${input.tier}, ${input.jurisdiction}, ${input.providerRef ?? null}, 'pending')
        RETURNING id, user_id, tier, jurisdiction, provider_ref, status, reviewed_by, reviewed_at, expires_at, created_at
      `;
      return toKycRecord(inserted[0]!);
    });
  }

  /** Every record for one user, newest first. What `kyc.status` renders. */
  async listKycRecords(userId: string): Promise<KycRecordView[]> {
    const rows = await this.sql<KycRow[]>`
      SELECT id, user_id, tier, jurisdiction, provider_ref, status, reviewed_by, reviewed_at, expires_at, created_at FROM identity.kyc_records
       WHERE user_id = ${userId} ORDER BY created_at DESC
    `;
    return rows.map(toKycRecord);
  }

  /** The operator review queue — oldest first, because a queue that is not FIFO is a backlog. */
  async listPendingKyc(limit = 50): Promise<KycRecordView[]> {
    const rows = await this.sql<KycRow[]>`
      SELECT id, user_id, tier, jurisdiction, provider_ref, status, reviewed_by, reviewed_at, expires_at, created_at
        FROM identity.kyc_records
       WHERE status = 'pending' ORDER BY created_at ASC LIMIT ${limit}
    `;
    return rows.map(toKycRecord);
  }

  async getKycRecord(recordId: string): Promise<KycRecordView | null> {
    const rows = await this.sql<KycRow[]>`
      SELECT id, user_id, tier, jurisdiction, provider_ref, status, reviewed_by, reviewed_at, expires_at, created_at FROM identity.kyc_records WHERE id = ${recordId}
    `;
    return rows[0] ? toKycRecord(rows[0]) : null;
  }

  /**
   * THE OPERATOR ACTION. A pending record becomes an approved tier.
   *
   * This is the single most consequential write in this service: the tier it
   * sets is what `checkAccess` reads, so approving a record is granting access
   * to every custodial module in the OS. `reviewed_by` is therefore not
   * decoration — it is the only record of who made that grant.
   *
   * Idempotent: approving an already-approved record returns it and re-announces
   * nothing new, because both the event and the XP award carry business keys.
   */
  async approveKycRecord(input: { recordId: string; reviewerId: string; expiresAt?: Date | null }): Promise<KycRecordView> {
    const outcome = await transaction(this.sql, async (tx) => {
      const rows = await tx<KycRow[]>`
        SELECT id, user_id, tier, jurisdiction, provider_ref, status, reviewed_by, reviewed_at, expires_at, created_at FROM identity.kyc_records WHERE id = ${input.recordId} FOR UPDATE
      `;
      const row = rows[0];
      if (!row) throw new AuthError('KYC record not found', 'auth.not_found');
      if (row.status === 'approved') return { record: toKycRecord(row), granted: false };
      if (row.status !== 'pending') {
        throw new AuthError(`KYC record is ${row.status}; only a pending record can be approved`, 'auth.kyc_not_pending');
      }

      const updated = await tx<KycRow[]>`
        UPDATE identity.kyc_records
           SET status = 'approved', reviewed_at = now(), reviewed_by = ${input.reviewerId},
               expires_at = ${input.expiresAt ?? null}
         WHERE id = ${row.id}
        RETURNING id, user_id, tier, jurisdiction, provider_ref, status, reviewed_by, reviewed_at, expires_at, created_at
      `;
      return { record: toKycRecord(updated[0]!), granted: true };
    });

    // Announced AFTER the transaction commits, and only when a grant actually
    // happened. Publishing from inside would emit "tier granted" from a
    // transaction that may still roll back; publishing on the no-op path would
    // re-announce a grant that is already old news, and the bus is at-least-once
    // in the other direction already.
    if (outcome.granted) await this.announceKycApproval(outcome.record);
    return outcome.record;
  }

  /** Reject a pending record. No tier is granted, nothing is announced. */
  async rejectKycRecord(input: { recordId: string; reviewerId: string }): Promise<KycRecordView> {
    return transaction(this.sql, async (tx) => {
      const rows = await tx<KycRow[]>`
        SELECT id, user_id, tier, jurisdiction, provider_ref, status, reviewed_by, reviewed_at, expires_at, created_at FROM identity.kyc_records WHERE id = ${input.recordId} FOR UPDATE
      `;
      const row = rows[0];
      if (!row) throw new AuthError('KYC record not found', 'auth.not_found');
      if (row.status === 'rejected') return toKycRecord(row);
      if (row.status !== 'pending') {
        throw new AuthError(`KYC record is ${row.status}; only a pending record can be rejected`, 'auth.kyc_not_pending');
      }

      const updated = await tx<KycRow[]>`
        UPDATE identity.kyc_records
           SET status = 'rejected', reviewed_at = now(), reviewed_by = ${input.reviewerId}
         WHERE id = ${row.id}
        RETURNING id, user_id, tier, jurisdiction, provider_ref, status, reviewed_by, reviewed_at, expires_at, created_at
      `;
      return toKycRecord(updated[0]!);
    });
  }

  /**
   * Direct grant, with no reviewable record in front of it.
   *
   * Kept for seeding and for tests that need a verified user without driving the
   * operator flow. It is exposed on NO route on purpose — the routed path is
   * `submitKyc` → `approveKycRecord`, so that every tier granted in production
   * carries a `reviewed_by`.
   */
  async approveKyc(input: { userId: string; tier: SubmittableKycTier; jurisdiction: string; providerRef?: string }): Promise<void> {
    await this.sql`
      INSERT INTO identity.kyc_records (user_id, tier, jurisdiction, provider_ref, status, reviewed_at)
      VALUES (${input.userId}, ${input.tier}, ${input.jurisdiction}, ${input.providerRef ?? null}, 'approved', now())
    `;

    await this.announceKycApproval({ userId: input.userId, tier: input.tier, jurisdiction: input.jurisdiction });
  }

  private async announceKycApproval(record: { userId: string; tier: KycTier; jurisdiction: string }): Promise<void> {
    if (record.tier === 'none') return;

    await this.bus.publish(
      'kycApproved',
      { userId: record.userId, tier: record.tier, jurisdiction: record.jurisdiction },
      { idempotencyKey: `kyc.approved:${record.userId}:${record.tier}` },
    );

    await this.rank.awardXp({
      userId: record.userId,
      sourceModule: 'identity',
      action: 'identity.kyc.approved',
      xpDelta: 200,
      idempotencyKey: `identity.kyc.approved:${record.userId}:${record.tier}`,
    });
  }

  // ── Step-up ────────────────────────────────────────────────────────────────

  /**
   * Trade a live session plus a fresh TOTP code for a SHORT-LIVED token that
   * carries `trade:withdraw`.
   *
   * This exists because `defaultScopes()` deliberately withholds
   * `trade:withdraw` — "added only after a step-up challenge" — and until now
   * there was no step-up challenge, which made every withdrawal surface in the
   * OS unreachable by any real session. A guard nothing can satisfy is not a
   * guard; it is an outage with a comment.
   *
   * Three things make the elevated token weaker than a normal one, and all three
   * matter: it lasts five minutes, it is bound to the session that asked for it,
   * and it is only issued to an account that actually has a second factor.
   */
  async stepUp(input: { userId: string; sessionId: string; totpCode: string }): Promise<{
    accessToken: string;
    expiresAt: Date;
    scopes: Scope[];
  }> {
    const users = await this.sql<Array<{ totp_secret: string | null; status: string }>>`
      SELECT totp_secret, status FROM identity.users WHERE id = ${input.userId}
    `;
    const user = users[0];
    if (!user) throw new AuthError('User not found', 'auth.not_found');
    if (user.status !== 'active') throw new AuthError(`Account is ${user.status}`, 'auth.account_frozen');

    // §9: moving value off the platform requires a second factor. An account
    // with none cannot be elevated — not "is elevated without one".
    if (!user.totp_secret) {
      throw new AuthError('Enrol two-factor authentication before withdrawing', 'auth.mfa_not_enrolled');
    }
    if (!verifyTotp(user.totp_secret, input.totpCode)) {
      throw new AuthError('Invalid two-factor code', 'auth.mfa_invalid');
    }

    // The session must still be live. Elevating off a revoked session would let
    // a logout be undone by whoever still holds the old access token.
    const sessions = await this.sql<Array<{ id: string }>>`
      SELECT id FROM identity.sessions
       WHERE id = ${input.sessionId} AND user_id = ${input.userId} AND revoked = false AND expires_at > now()
    `;
    if (!sessions[0]) throw new AuthError('Session is no longer valid', 'auth.session_invalid');

    const scopes: Scope[] = [...this.defaultScopes(), ...STEP_UP_SCOPES];
    const tier = await this.kycTier(input.userId);

    const { token, expiresAt } = await issueAccessToken(
      { userId: input.userId, sessionId: input.sessionId, scopes, tier, mfa: true },
      { ...this.tokens, accessTtlSeconds: Math.min(this.tokens.accessTtlSeconds, STEP_UP_TTL_SECONDS) },
    );

    return { accessToken: token, expiresAt, scopes };
  }

  // ── Sub-accounts ───────────────────────────────────────────────────────────

  async createSubAccount(userId: string, label: string, purpose?: string): Promise<{ id: string }> {
    const rows = await this.sql<Array<{ id: string }>>`
      INSERT INTO identity.sub_accounts (parent_user_id, label, purpose)
      VALUES (${userId}, ${label}, ${purpose ?? null})
      RETURNING id
    `;
    return rows[0]!;
  }

  /**
   * Scopes granted to a normal interactive session.
   *
   * Note `trade:withdraw` is absent by default even here — it is added only
   * after a step-up challenge, so an XSS-stolen access token cannot drain an
   * account (§9 withdrawal allow-lists + delay tiers).
   */
  private defaultScopes(): Scope[] {
    return [
      'identity:read',
      'identity:write',
      'ledger:read',
      'trade:read',
      'trade:write',
      'p2p:read',
      'p2p:write',
      'token:read',
      'token:stake',
      'academy:read',
      'agents:read',
    ];
  }
}
