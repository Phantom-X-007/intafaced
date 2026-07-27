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
      | 'auth.not_found',
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

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

  async approveKyc(input: {
    userId: string;
    tier: 'basic' | 'full' | 'institutional';
    jurisdiction: string;
    providerRef?: string;
  }): Promise<void> {
    await this.sql`
      INSERT INTO identity.kyc_records (user_id, tier, jurisdiction, provider_ref, status, reviewed_at)
      VALUES (${input.userId}, ${input.tier}, ${input.jurisdiction}, ${input.providerRef ?? null}, 'approved', now())
    `;

    await this.bus.publish(
      'kycApproved',
      { userId: input.userId, tier: input.tier, jurisdiction: input.jurisdiction },
      { idempotencyKey: `kyc.approved:${input.userId}:${input.tier}` },
    );

    await this.rank.awardXp({
      userId: input.userId,
      sourceModule: 'identity',
      action: 'identity.kyc.approved',
      xpDelta: 200,
      idempotencyKey: `identity.kyc.approved:${input.userId}:${input.tier}`,
    });
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
