import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { MemoryEventBus } from '@intafaced/events';
import { assertTestDatabase } from '@intafaced/db';
import { verifyAccessToken, hasScope, SESSION_SCOPES } from '@intafaced/auth';
import { checkAccess } from '@intafaced/config';
import { createHash, generateKeyPairSync, randomBytes, sign as cryptoSign, type KeyObject } from 'node:crypto';
import { AuthService, AuthError } from './auth/auth-service.js';
import { RankService } from './rank/rank-service.js';
import { totp } from './auth/totp.js';
import { encodeCbor } from './auth/cbor.js';
import {
  b64urlEncode,
  buildAuthenticatorData,
  buildClientDataJSON,
  coseKeyFromJwk,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from './auth/webauthn.js';

/**
 * svc-identity against real Postgres.
 *
 * This file also carries the §4.4 Phase 1 exit criteria:
 *   · full auth lifecycle — register → TOTP → refresh → scoped API key call
 *   · XP event → rank recalculation → perks visible to a second service
 *
 * Skips cleanly when Postgres is unreachable.
 */

/**
 * The fallback is `intafaced_test`, NOT the shared `intafaced`.
 *
 * This suite applies migrations and truncates tables, so it must own its
 * database. While the default pointed at `intafaced`, an unset variable aimed a
 * destructive suite at the database the local docker fleet and every other
 * worktree share. `assertTestDatabase` below now refuses that outright,
 * whatever URL it is handed.
 */
const URL = process.env.TEST_DATABASE_URL_IDENTITY ?? 'postgres://svc_identity:svc_identity@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
/** Every migration, in order. A suite that applies only 0000 tests a schema nobody deploys. */
const migrations = ['0000_identity_init.sql', '0001_identity_kyc_review.sql', '0002_sub_accounts_revoke.sql'].map((f) =>
  readFileSync(join(here, '..', 'drizzle', f), 'utf8'),
);

const tokenConfig = {
  secret: 'an-identity-test-signing-secret-long-enough',
  issuer: 'intafaced',
  audience: 'intafaced.api',
  accessTtlSeconds: 900,
  refreshTtlSeconds: 2_592_000,
};

const webauthnConfig = {
  rpID: 'localhost',
  rpName: 'INTAFACED',
  origin: 'http://localhost:3000',
};

function softAuthenticator() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const cose = coseKeyFromJwk(jwk);
  const credId = randomBytes(16);
  let counter = 0;

  const sign = (authData: Buffer, clientDataJSON: Buffer, key: KeyObject = privateKey) => {
    const clientDataHash = createHash('sha256').update(clientDataJSON).digest();
    return cryptoSign('SHA256', Buffer.concat([authData, clientDataHash]), { key, dsaEncoding: 'ieee-p1363' });
  };

  return {
    credId,
    registrationResponse(challenge: string): RegistrationResponseJSON {
      const clientDataJSON = buildClientDataJSON({
        type: 'webauthn.create',
        challenge,
        origin: webauthnConfig.origin,
      });
      const authData = buildAuthenticatorData({
        rpID: webauthnConfig.rpID,
        counter: 0,
        credential: { id: credId, publicKeyCose: cose },
      });
      const attestationObject = Buffer.from(
        encodeCbor(
          new Map<string | number, unknown>([
            ['fmt', 'none'],
            ['attStmt', new Map()],
            ['authData', new Uint8Array(authData)],
          ]) as never,
        ),
      );
      return {
        id: b64urlEncode(credId),
        rawId: b64urlEncode(credId),
        type: 'public-key',
        response: {
          clientDataJSON: b64urlEncode(clientDataJSON),
          attestationObject: b64urlEncode(attestationObject),
          transports: ['internal'],
        },
      };
    },
    assertionResponse(challenge: string): AuthenticationResponseJSON {
      counter += 1;
      const clientDataJSON = buildClientDataJSON({
        type: 'webauthn.get',
        challenge,
        origin: webauthnConfig.origin,
      });
      const authData = buildAuthenticatorData({ rpID: webauthnConfig.rpID, counter });
      const signature = sign(authData, clientDataJSON);
      return {
        id: b64urlEncode(credId),
        rawId: b64urlEncode(credId),
        type: 'public-key',
        response: {
          clientDataJSON: b64urlEncode(clientDataJSON),
          authenticatorData: b64urlEncode(authData),
          signature: b64urlEncode(signature),
        },
      };
    },
  };
}

async function reachable(): Promise<boolean> {
  const probe = postgres(URL, { max: 1, connect_timeout: 3, onnotice: () => undefined });
  try {
    await probe`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await probe.end({ timeout: 2 }).catch(() => undefined);
  }
}

const available = await reachable();

if (!available) {
  describe.skip('svc-identity (Postgres unavailable — start docker compose)', () => {
    it('skipped', () => undefined);
  });
} else {
  const sql = postgres(URL, {
    max: 8,
    connection: { search_path: 'identity,public', application_name: 'svc-identity-test' },
    onnotice: () => undefined,
  });

  // Owns its database, or does not run. Must precede the first migration.
  await assertTestDatabase(sql, 'svc-identity');

  for (const migration of migrations) await sql.unsafe(migration);

  const bus = new MemoryEventBus('svc-identity');
  const rank = new RankService(sql, bus);
  const auth = new AuthService(sql, bus, rank, tokenConfig, webauthnConfig);
  await rank.seedTiers();

  let counter = 0;
  const unique = () => `u${process.pid}${++counter}`;

  const register = () => {
    const handle = unique();
    return auth.register({ handle, email: `${handle}@example.com`, password: 'correct horse battery staple', region: 'DE' });
  };

  beforeEach(async () => {
    bus.reset();
    /**
     * Reset the review queue, not just the bus.
     *
     * `kyc_records` is append-only in normal operation and nothing here ever
     * removed rows, so the table grew without bound across runs — 307 pending
     * rows on the shared database by the time this was tracked down. The queue
     * is served oldest-first under a LIMIT, so once the backlog exceeded that
     * limit a record created *now* could never appear in it, and the pending
     * queue test failed with an assertion that looked exactly like a real
     * regression. It passed on fresh Postgres, which is why CI stayed green.
     *
     * Truncating here rather than only scoping the assertion is deliberate:
     * scoping would paper over the growth while leaving the table to grow
     * forever, and the *next* limit-sensitive test would hit the same wall.
     * The root cause is unbounded accumulation, so the fix removes it.
     *
     * This is a destructive statement, which is legitimate only because
     * `assertTestDatabase` above has already proved we own this database.
     * `kyc_records` is a leaf — nothing references it — so no CASCADE.
     */
    await sql`TRUNCATE identity.kyc_records`;
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  describe('registration', () => {
    it('creates a user, profile and rank row, and returns a session', async () => {
      const session = await register();
      expect(session.accessToken).toBeTruthy();
      expect(session.refreshToken).toBeTruthy();

      const principal = await verifyAccessToken(session.accessToken, tokenConfig);
      expect(principal.userId).toBe(session.userId);
      expect(principal.mfa).toBe(false);
      expect(principal.tier).toBe('none');
    });

    it('awards registration XP exactly once, even if the call is repeated', async () => {
      const session = await register();
      const first = await rank.get(session.userId);
      expect(first.xp).toBe(50n);

      await rank.awardXp({
        userId: session.userId,
        sourceModule: 'identity',
        action: 'identity.registered',
        xpDelta: 50,
        idempotencyKey: `identity.registered:${session.userId}`,
      });

      expect((await rank.get(session.userId)).xp).toBe(50n);
    });

    it('refuses a duplicate handle and a duplicate email, distinctly', async () => {
      const handle = unique();
      await auth.register({ handle, email: `${handle}@example.com`, password: 'correct horse battery staple' });

      await expect(
        auth.register({ handle, email: `${unique()}@example.com`, password: 'correct horse battery staple' }),
      ).rejects.toMatchObject({ code: 'auth.handle_taken' });

      await expect(
        auth.register({ handle: unique(), email: `${handle}@example.com`, password: 'correct horse battery staple' }),
      ).rejects.toMatchObject({ code: 'auth.email_taken' });
    });

    it('treats handles case-insensitively — impersonation by casing is a real attack', async () => {
      const handle = unique();
      await auth.register({ handle, email: `${handle}@example.com`, password: 'correct horse battery staple' });

      await expect(
        auth.register({ handle: handle.toUpperCase(), email: `${unique()}@example.com`, password: 'correct horse battery staple' }),
      ).rejects.toThrow(AuthError);
    });

    it('emits userCreated', async () => {
      const session = await register();
      const emitted = bus.emitted('userCreated');
      expect(emitted.some((e) => e.payload.userId === session.userId)).toBe(true);
    });
  });

  describe('login', () => {
    it('accepts the right password', async () => {
      const handle = unique();
      await auth.register({ handle, email: `${handle}@example.com`, password: 'correct horse battery staple' });
      await expect(auth.login({ identifier: handle, password: 'correct horse battery staple' })).resolves.toMatchObject({
        userId: expect.any(String),
      });
    });

    it('logs in by email as well as handle', async () => {
      const handle = unique();
      await auth.register({ handle, email: `${handle}@example.com`, password: 'correct horse battery staple' });
      await expect(auth.login({ identifier: `${handle}@example.com`, password: 'correct horse battery staple' })).resolves.toBeTruthy();
    });

    it('rejects the wrong password', async () => {
      const handle = unique();
      await auth.register({ handle, email: `${handle}@example.com`, password: 'correct horse battery staple' });
      await expect(auth.login({ identifier: handle, password: 'wrong password entirely' })).rejects.toMatchObject({
        code: 'auth.invalid_credentials',
      });
    });

    it('gives an unknown user the same error as a wrong password', async () => {
      // Anything else is an account-enumeration oracle.
      await expect(auth.login({ identifier: 'nobody-here-at-all', password: 'whatever it is' })).rejects.toMatchObject({
        code: 'auth.invalid_credentials',
      });
    });

    it('refuses a frozen account', async () => {
      const session = await register();
      await sql`UPDATE identity.users SET status = 'frozen' WHERE id = ${session.userId}`;
      const handleRow = await sql<Array<{ handle: string }>>`SELECT handle FROM identity.users WHERE id = ${session.userId}`;
      await expect(auth.login({ identifier: handleRow[0]!.handle, password: 'correct horse battery staple' })).rejects.toMatchObject({
        code: 'auth.account_frozen',
      });
    });
  });

  describe('TOTP enrolment', () => {
    it('does not persist the secret until a code confirms it', async () => {
      const session = await register();
      const { secret } = await auth.startTotpEnrolment(session.userId);

      const before = await sql<Array<{ totp_secret: string | null }>>`
        SELECT totp_secret FROM identity.users WHERE id = ${session.userId}
      `;
      expect(before[0]!.totp_secret).toBeNull();

      await auth.confirmTotpEnrolment(session.userId, secret, totp(secret));

      const after = await sql<Array<{ totp_secret: string | null }>>`
        SELECT totp_secret FROM identity.users WHERE id = ${session.userId}
      `;
      expect(after[0]!.totp_secret).toBe(secret);
    });

    it('rejects a wrong confirmation code', async () => {
      const session = await register();
      const { secret } = await auth.startTotpEnrolment(session.userId);
      await expect(auth.confirmTotpEnrolment(session.userId, secret, '000000')).rejects.toMatchObject({ code: 'auth.mfa_invalid' });
    });

    it('then requires the code at login, and marks the session mfa', async () => {
      const handle = unique();
      const session = await auth.register({ handle, email: `${handle}@example.com`, password: 'correct horse battery staple' });
      const { secret } = await auth.startTotpEnrolment(session.userId);
      await auth.confirmTotpEnrolment(session.userId, secret, totp(secret));

      await expect(auth.login({ identifier: handle, password: 'correct horse battery staple' })).rejects.toMatchObject({
        code: 'auth.mfa_required',
      });

      await expect(auth.login({ identifier: handle, password: 'correct horse battery staple', totpCode: '000000' })).rejects.toMatchObject({
        code: 'auth.mfa_invalid',
      });

      const withMfa = await auth.login({ identifier: handle, password: 'correct horse battery staple', totpCode: totp(secret) });
      const principal = await verifyAccessToken(withMfa.accessToken, tokenConfig);
      expect(principal.mfa).toBe(true);
    });
  });

  describe('WebAuthn registration + assertion', () => {
    it('enrols a credential and issues an MFA session on assertion', async () => {
      const handle = unique();
      const session = await auth.register({
        handle,
        email: `${handle}@example.com`,
        password: 'correct horse battery staple',
      });
      const authenticator = softAuthenticator();

      const options = await auth.startWebauthnRegistration(session.userId);
      expect(options.challenge).toBeTruthy();
      expect(options.rp.id).toBe('localhost');

      const enrolled = await auth.confirmWebauthnRegistration(session.userId, authenticator.registrationResponse(options.challenge));
      expect(enrolled.credentialId).toBe(b64urlEncode(authenticator.credId));

      const stored = await sql<Array<{ webauthn_creds: unknown }>>`
        SELECT webauthn_creds FROM identity.users WHERE id = ${session.userId}
      `;
      expect(Array.isArray(stored[0]!.webauthn_creds)).toBe(true);
      expect((stored[0]!.webauthn_creds as unknown[]).length).toBe(1);

      const authOptions = await auth.startWebauthnAuthentication(handle);
      expect(authOptions.allowCredentials).toHaveLength(1);

      const tokens = await auth.confirmWebauthnAuthentication(handle, authenticator.assertionResponse(authOptions.challenge));
      expect(tokens.userId).toBe(session.userId);
      const principal = await verifyAccessToken(tokens.accessToken, tokenConfig);
      expect(principal.mfa).toBe(true);
    });

    it('does not persist a credential when the challenge is wrong', async () => {
      const session = await register();
      const authenticator = softAuthenticator();
      const options = await auth.startWebauthnRegistration(session.userId);
      // Consume the real challenge by never using it; present a different one.
      await expect(
        auth.confirmWebauthnRegistration(session.userId, authenticator.registrationResponse('not-the-challenge')),
      ).rejects.toMatchObject({ code: 'auth.webauthn_invalid' });

      const stored = await sql<Array<{ webauthn_creds: unknown }>>`
        SELECT webauthn_creds FROM identity.users WHERE id = ${session.userId}
      `;
      expect(stored[0]!.webauthn_creds).toEqual([]);
      // Real challenge must still be single-use only after a successful take —
      // a failed verify with a foreign challenge leaves the real one intact, so
      // a second attempt with the real challenge still works.
      await expect(
        auth.confirmWebauthnRegistration(session.userId, authenticator.registrationResponse(options.challenge)),
      ).resolves.toMatchObject({ credentialId: b64urlEncode(authenticator.credId) });
    });

    it('refuses assertion for an account with no credential without revealing it via authOptions', async () => {
      const handle = unique();
      await auth.register({ handle, email: `${handle}@example.com`, password: 'correct horse battery staple' });
      const options = await auth.startWebauthnAuthentication(handle);
      expect(options.allowCredentials).toEqual([]);

      const authenticator = softAuthenticator();
      await expect(auth.confirmWebauthnAuthentication(handle, authenticator.assertionResponse(options.challenge))).rejects.toMatchObject({
        code: 'auth.webauthn_not_enrolled',
      });
    });
  });

  describe('session refresh and rotation', () => {
    it('issues a new refresh token and invalidates the old one', async () => {
      const session = await register();
      const refreshed = await auth.refresh(session.refreshToken);

      expect(refreshed.refreshToken).not.toBe(session.refreshToken);
      expect(refreshed.userId).toBe(session.userId);
      expect(refreshed.sessionId).not.toBe(session.sessionId);
    });

    it('detects reuse of a rotated token and revokes every session', async () => {
      const session = await register();
      const refreshed = await auth.refresh(session.refreshToken);

      // The stolen copy is presented after the legitimate holder already rotated.
      await expect(auth.refresh(session.refreshToken)).rejects.toMatchObject({ code: 'auth.session_reused' });

      // Everything burns, including the token the thief did not have.
      await expect(auth.refresh(refreshed.refreshToken)).rejects.toThrow(AuthError);
    });

    it('rejects an unknown or expired token', async () => {
      await expect(auth.refresh('not-a-real-token')).rejects.toMatchObject({ code: 'auth.session_invalid' });

      const session = await register();
      await sql`UPDATE identity.sessions SET expires_at = now() - interval '1 day' WHERE id = ${session.sessionId}`;
      await expect(auth.refresh(session.refreshToken)).rejects.toMatchObject({ code: 'auth.session_invalid' });
    });

    it('logout revokes the session', async () => {
      const session = await register();
      await auth.logout(session.refreshToken);
      await expect(auth.refresh(session.refreshToken)).rejects.toThrow(AuthError);
    });
  });

  describe('API keys', () => {
    it('returns the key once and stores only its hash', async () => {
      const session = await register();
      const { key, prefix } = await auth.createApiKey({
        userId: session.userId,
        name: 'bot',
        scopes: ['trade:read'],
        grantorScopes: SESSION_SCOPES,
      });

      const stored = await sql<Array<{ key_hash: string; key_prefix: string }>>`
        SELECT key_hash, key_prefix FROM identity.api_keys WHERE user_id = ${session.userId}
      `;
      expect(stored[0]!.key_hash).not.toContain(key);
      expect(stored[0]!.key_prefix).toBe(prefix);
    });

    it('verifies a valid key and rejects a wrong one', async () => {
      const session = await register();
      const { key } = await auth.createApiKey({
        userId: session.userId,
        name: 'bot',
        scopes: ['trade:read', 'trade:write'],
        grantorScopes: SESSION_SCOPES,
      });

      const verified = await auth.verifyApiKey(key);
      expect(verified?.userId).toBe(session.userId);
      expect(hasScope(verified!.scopes, 'trade:read')).toBe(true);

      expect(await auth.verifyApiKey('ifc_totally_wrong')).toBeNull();
    });

    it('refuses to mint a key that could withdraw — service AND database', async () => {
      const session = await register();

      await expect(
        auth.createApiKey({
          userId: session.userId,
          name: 'dangerous',
          scopes: ['trade:read', 'trade:withdraw'],
          grantorScopes: SESSION_SCOPES,
        }),
      ).rejects.toThrow(/interactive/);

      // The database is the backstop if that check is ever bypassed.
      await expect(
        sql`
          INSERT INTO identity.api_keys (user_id, name, key_hash, key_prefix, scopes)
          VALUES (${session.userId}, 'x', ${'h' + Date.now()}, 'ifc_x', ARRAY['trade:withdraw'])
        `,
      ).rejects.toThrow(/api_keys_no_withdraw_ck/);
    });

    it('stops accepting a revoked or expired key', async () => {
      const session = await register();
      const { key, id } = await auth.createApiKey({
        userId: session.userId,
        name: 'bot',
        scopes: ['trade:read'],
        grantorScopes: SESSION_SCOPES,
      });
      expect(await auth.verifyApiKey(key)).not.toBeNull();

      await auth.revokeApiKey(session.userId, id);
      expect(await auth.verifyApiKey(key)).toBeNull();

      const other = await auth.createApiKey({
        userId: session.userId,
        name: 'expiring',
        scopes: ['trade:read'],
        grantorScopes: SESSION_SCOPES,
        expiresAt: new Date(Date.now() - 1000),
      });
      expect(await auth.verifyApiKey(other.key)).toBeNull();
    });

    it('will not let one user revoke another user’s key', async () => {
      const owner = await register();
      const attacker = await register();
      const { id } = await auth.createApiKey({ userId: owner.userId, name: 'mine', scopes: ['trade:read'], grantorScopes: SESSION_SCOPES });

      expect(await auth.revokeApiKey(attacker.userId, id)).toBe(false);
    });
  });

  describe('sub-accounts', () => {
    it('creates and lists only the parent’s books', async () => {
      const owner = await register();
      const other = await register();
      const { id } = await auth.createSubAccount(owner.userId, 'bot-a', 'mm');
      await auth.createSubAccount(other.userId, 'not-yours');

      const mine = await auth.listSubAccounts(owner.userId);
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ id, label: 'bot-a', purpose: 'mm', revoked: false });
      expect(await auth.listSubAccounts(other.userId)).toHaveLength(1);
    });

    it('soft-revokes without deleting the row (ledger owner id must survive)', async () => {
      const session = await register();
      const { id } = await auth.createSubAccount(session.userId, 'retire-me');

      expect(await auth.revokeSubAccount(session.userId, id)).toBe(true);
      expect(await auth.revokeSubAccount(session.userId, id)).toBe(false);

      const listed = await auth.listSubAccounts(session.userId);
      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({ id, revoked: true });

      const rows = await sql<Array<{ id: string; revoked: boolean }>>`
        SELECT id, revoked FROM identity.sub_accounts WHERE id = ${id}
      `;
      expect(rows).toHaveLength(1);
      expect(rows[0]!.revoked).toBe(true);
    });

    it('will not let one user revoke another user’s sub-account', async () => {
      const owner = await register();
      const attacker = await register();
      const { id } = await auth.createSubAccount(owner.userId, 'mine');

      expect(await auth.revokeSubAccount(attacker.userId, id)).toBe(false);
      const still = await auth.listSubAccounts(owner.userId);
      expect(still[0]).toMatchObject({ id, revoked: false });
    });
  });

  describe('KYC', () => {
    it('raises the tier on the next issued token', async () => {
      const handle = unique();
      const session = await auth.register({ handle, email: `${handle}@example.com`, password: 'correct horse battery staple' });
      expect((await verifyAccessToken(session.accessToken, tokenConfig)).tier).toBe('none');

      await auth.approveKyc({ userId: session.userId, tier: 'full', jurisdiction: 'DE' });

      const refreshed = await auth.refresh(session.refreshToken);
      expect((await verifyAccessToken(refreshed.accessToken, tokenConfig)).tier).toBe('full');
    });

    it('reports the highest approved tier', async () => {
      const session = await register();
      await auth.approveKyc({ userId: session.userId, tier: 'basic', jurisdiction: 'DE' });
      await auth.approveKyc({ userId: session.userId, tier: 'full', jurisdiction: 'DE' });
      expect(await auth.kycTier(session.userId)).toBe('full');
    });

    it('ignores an expired record', async () => {
      const session = await register();
      await auth.approveKyc({ userId: session.userId, tier: 'full', jurisdiction: 'DE' });
      await sql`UPDATE identity.kyc_records SET expires_at = now() - interval '1 day' WHERE user_id = ${session.userId}`;
      expect(await auth.kycTier(session.userId)).toBe('none');
    });
  });

  /**
   * THE ROUTED OPERATOR FLOW — submit → approve.
   *
   * This is the gap that made the custodial side unusable: `approveKyc` existed
   * on no route, so every account sat at `none` forever and every module the
   * jurisdiction matrix gates on a tier was unreachable. These tests are the
   * ones that fail if the flow breaks again.
   */
  describe('KYC review flow', () => {
    it('SUBMIT GRANTS NOTHING — a submitted record leaves the tier at none', async () => {
      const session = await register();
      const record = await auth.submitKyc({ userId: session.userId, tier: 'basic', jurisdiction: 'DE' });

      expect(record.status).toBe('pending');
      expect(record.reviewedBy).toBeNull();
      // The whole point of splitting submit from approve. If this ever returns
      // 'basic', a user has granted themselves custodial access.
      expect(await auth.kycTier(session.userId)).toBe('none');
    });

    it('approval raises the tier and records WHICH operator granted it', async () => {
      const session = await register();
      const operator = await register();
      const submitted = await auth.submitKyc({ userId: session.userId, tier: 'basic', jurisdiction: 'DE' });

      const approved = await auth.approveKycRecord({ recordId: submitted.id, reviewerId: operator.userId });

      expect(approved.status).toBe('approved');
      expect(approved.reviewedBy).toBe(operator.userId);
      expect(approved.reviewedAt).toBeInstanceOf(Date);
      expect(await auth.kycTier(session.userId)).toBe('basic');
    });

    it('unblocks the custodial matrix rule that was blocking every new account', async () => {
      const session = await register();
      const operator = await register();

      // `trade` is OPEN_BASIC — the CUSTODIAL spot venue, which holds user funds
      // in ledger accounts. Before approval a freshly registered user cannot
      // place an order at all.
      const before = checkAccess({ module: 'trade', region: 'DE', plane: 'fiat', kycTier: await auth.kycTier(session.userId) });
      expect(before.allowed).toBe(false);
      expect(before.code).toBe('denied.kyc_required');

      const submitted = await auth.submitKyc({ userId: session.userId, tier: 'basic', jurisdiction: 'DE' });
      await auth.approveKycRecord({ recordId: submitted.id, reviewerId: operator.userId });

      const after = checkAccess({ module: 'trade', region: 'DE', plane: 'fiat', kycTier: await auth.kycTier(session.userId) });
      expect(after.allowed).toBe(true);
    });

    it('leaves the PERMISSIONLESS plane alone — no tier is ever consulted there (§22)', async () => {
      const session = await register();

      // The correction that matters: zero-KYC follows custody. A non-custodial
      // Protocol Plane module returns `allowed.permissionless` BEFORE any tier
      // is read, so an unverified account is not second class there — it is the
      // normal case. If this ever fails, a KYC gate has leaked onto a plane that
      // holds nothing.
      const decision = checkAccess({ module: 'protocol', region: 'DE', plane: 'protocol', kycTier: await auth.kycTier(session.userId) });
      expect(decision.allowed).toBe(true);
      expect(decision.code).toBe('allowed.permissionless');
    });

    it('is idempotent on (user, tier) — a double tap does not queue two reviews', async () => {
      const session = await register();
      const first = await auth.submitKyc({ userId: session.userId, tier: 'basic', jurisdiction: 'DE' });
      const second = await auth.submitKyc({ userId: session.userId, tier: 'basic', jurisdiction: 'DE' });

      expect(second.id).toBe(first.id);
      const rows = await sql`SELECT id FROM identity.kyc_records WHERE user_id = ${session.userId}`;
      expect(rows).toHaveLength(1);
    });

    it('does not let a re-submit reset an approved tier back to pending', async () => {
      const session = await register();
      const operator = await register();
      const submitted = await auth.submitKyc({ userId: session.userId, tier: 'full', jurisdiction: 'DE' });
      await auth.approveKycRecord({ recordId: submitted.id, reviewerId: operator.userId });

      const again = await auth.submitKyc({ userId: session.userId, tier: 'basic', jurisdiction: 'DE' });

      expect(again.status).toBe('approved');
      // Still `full`. A resubmit that downgraded a live tier would be a way for
      // a user to lock themselves out, and for an attacker to do it to them.
      expect(await auth.kycTier(session.userId)).toBe('full');
    });

    it('approving twice is a no-op, not a second grant', async () => {
      const session = await register();
      const operator = await register();
      const submitted = await auth.submitKyc({ userId: session.userId, tier: 'basic', jurisdiction: 'DE' });

      const once = await auth.approveKycRecord({ recordId: submitted.id, reviewerId: operator.userId });
      const twice = await auth.approveKycRecord({ recordId: submitted.id, reviewerId: operator.userId });

      expect(twice.id).toBe(once.id);
      expect(twice.reviewedAt?.getTime()).toBe(once.reviewedAt?.getTime());
      const rows = await sql`SELECT id FROM identity.kyc_records WHERE user_id = ${session.userId} AND status = 'approved'`;
      expect(rows).toHaveLength(1);
    });

    it('refuses to approve a rejected record', async () => {
      const session = await register();
      const operator = await register();
      const submitted = await auth.submitKyc({ userId: session.userId, tier: 'basic', jurisdiction: 'DE' });
      await auth.rejectKycRecord({ recordId: submitted.id, reviewerId: operator.userId });

      await expect(auth.approveKycRecord({ recordId: submitted.id, reviewerId: operator.userId })).rejects.toMatchObject({
        code: 'auth.kyc_not_pending',
      });
      expect(await auth.kycTier(session.userId)).toBe('none');
    });

    it('refuses an unknown record rather than creating one', async () => {
      await expect(auth.approveKycRecord({ recordId: '00000000-0000-4000-8000-000000000000', reviewerId: 'op' })).rejects.toMatchObject({
        code: 'auth.not_found',
      });
    });

    it('announces the grant once, on the bus and as XP', async () => {
      const session = await register();
      const operator = await register();
      const submitted = await auth.submitKyc({ userId: session.userId, tier: 'basic', jurisdiction: 'DE' });

      bus.reset();
      await auth.approveKycRecord({ recordId: submitted.id, reviewerId: operator.userId });
      await auth.approveKycRecord({ recordId: submitted.id, reviewerId: operator.userId });

      const published = bus.published.filter((p) => p.subject.includes('kyc'));
      expect(published).toHaveLength(1);
    });

    it('surfaces the pending queue oldest first, and drops a record once reviewed', async () => {
      const a = await register();
      const b = await register();
      const operator = await register();
      const first = await auth.submitKyc({ userId: a.userId, tier: 'basic', jurisdiction: 'DE' });
      const second = await auth.submitKyc({ userId: b.userId, tier: 'basic', jurisdiction: 'DE' });

      /**
       * Assert the ordering claim over *these two* records rather than over
       * absolute positions in the queue. The claim under test is "the queue is
       * FIFO", which is a statement about relative order; comparing raw indices
       * additionally assumes nothing else is pending, which is an assumption
       * about the fixture, not about the code. Belt and braces with the
       * `beforeEach` truncate above — that removes the backlog, this makes the
       * test state what it actually means.
       */
      const queue = await auth.listPendingKyc(200);
      const ids = queue.map((r) => r.id);
      expect(ids).toContain(first.id);
      expect(ids).toContain(second.id);
      const mine = ids.filter((id) => id === first.id || id === second.id);
      expect(mine).toEqual([first.id, second.id]);

      await auth.approveKycRecord({ recordId: first.id, reviewerId: operator.userId });
      expect((await auth.listPendingKyc(200)).map((r) => r.id)).not.toContain(first.id);
    });
  });

  /**
   * THE STEP-UP CHALLENGE.
   *
   * `defaultScopes()` withholds `trade:withdraw` "until a step-up challenge",
   * and there was no step-up challenge anywhere in the OS — so no session could
   * ever reach a withdrawal endpoint. These tests hold that door open.
   */
  describe('step-up elevation', () => {
    const enrol = async (userId: string) => {
      const { secret } = await auth.startTotpEnrolment(userId);
      await auth.confirmTotpEnrolment(userId, secret, totp(secret));
      return secret;
    };

    it('a normal session does NOT carry trade:withdraw', async () => {
      const session = await register();
      const principal = await verifyAccessToken(session.accessToken, tokenConfig);

      expect(hasScope(principal.scopes, 'trade:withdraw')).toBe(false);
      expect(principal.mfa).toBe(false);
    });

    it('a valid TOTP code buys a token that carries trade:withdraw with mfa set', async () => {
      const session = await register();
      const secret = await enrol(session.userId);

      const elevated = await auth.stepUp({ userId: session.userId, sessionId: session.sessionId, totpCode: totp(secret) });
      const principal = await verifyAccessToken(elevated.accessToken, tokenConfig);

      expect(hasScope(principal.scopes, 'trade:withdraw')).toBe(true);
      // Both halves matter: `requireScope` demands the scope AND `mfa`, because
      // `trade:withdraw` is in INTERACTIVE_ONLY_SCOPES.
      expect(principal.mfa).toBe(true);
    });

    it('the elevated token expires far sooner than a normal one', async () => {
      const session = await register();
      const secret = await enrol(session.userId);

      const elevated = await auth.stepUp({ userId: session.userId, sessionId: session.sessionId, totpCode: totp(secret) });
      const lifetimeSeconds = (elevated.expiresAt.getTime() - Date.now()) / 1000;

      // Five minutes, not the 900s a normal access token gets. An elevation that
      // lasted the full TTL would hand a thief the same window as the owner.
      expect(lifetimeSeconds).toBeLessThanOrEqual(300);
      expect(lifetimeSeconds).toBeGreaterThan(240);
    });

    it('refuses a wrong code', async () => {
      const session = await register();
      await enrol(session.userId);

      await expect(auth.stepUp({ userId: session.userId, sessionId: session.sessionId, totpCode: '000000' })).rejects.toMatchObject({
        code: 'auth.mfa_invalid',
      });
    });

    it('refuses an account with no second factor to step up with', async () => {
      const session = await register();

      // §9: moving value off the platform requires 2FA. An account without it
      // is refused, not waved through — and the code says which, so the client
      // can send the user to enrolment rather than retrying a code forever.
      await expect(auth.stepUp({ userId: session.userId, sessionId: session.sessionId, totpCode: '123456' })).rejects.toMatchObject({
        code: 'auth.mfa_not_enrolled',
      });
    });

    it('refuses to elevate off a session that has been logged out', async () => {
      const session = await register();
      const secret = await enrol(session.userId);
      await auth.logoutAll(session.userId);

      // Otherwise a logout could be undone by whoever still holds the old
      // access token, which is precisely the party a logout is aimed at.
      await expect(auth.stepUp({ userId: session.userId, sessionId: session.sessionId, totpCode: totp(secret) })).rejects.toMatchObject({
        code: 'auth.session_invalid',
      });
    });

    it('refuses a frozen account', async () => {
      const session = await register();
      const secret = await enrol(session.userId);
      await sql`UPDATE identity.users SET status = 'frozen' WHERE id = ${session.userId}`;

      await expect(auth.stepUp({ userId: session.userId, sessionId: session.sessionId, totpCode: totp(secret) })).rejects.toMatchObject({
        code: 'auth.account_frozen',
      });
    });
  });

  describe('rank engine', () => {
    it('accumulates XP and promotes across tiers', async () => {
      const session = await register(); // starts at 50

      await rank.awardXp({
        userId: session.userId,
        sourceModule: 'academy',
        action: 'academy.certification.earned',
        xpDelta: 500,
        idempotencyKey: `cert:${session.userId}:1`,
      });

      const snapshot = await rank.get(session.userId);
      expect(snapshot.xp).toBe(550n);
      expect(snapshot.rank).toBe(1);
      expect(snapshot.title).toBe('Operator');
    });

    it('emits rankUpdated only when the rank actually changes', async () => {
      const session = await register();
      bus.reset();

      await rank.awardXp({
        userId: session.userId,
        sourceModule: 'trade',
        action: 'trade.order.filled',
        xpDelta: 5,
        idempotencyKey: `fill:${session.userId}:1`,
      });
      expect(bus.emitted('rankUpdated')).toHaveLength(0);

      await rank.awardXp({
        userId: session.userId,
        sourceModule: 'academy',
        action: 'academy.certification.earned',
        xpDelta: 500,
        idempotencyKey: `cert:${session.userId}:2`,
      });
      expect(bus.emitted('rankUpdated')).toHaveLength(1);
    });

    it('is idempotent under a replayed event', async () => {
      const session = await register();
      const award = {
        userId: session.userId,
        sourceModule: 'p2p',
        action: 'p2p.trade.completed',
        xpDelta: 25,
        idempotencyKey: `p2p:${session.userId}:trade-1`,
      };

      const first = await rank.awardXp(award);
      const replay = await rank.awardXp(award);

      expect(first.applied).toBe(true);
      expect(replay.applied).toBe(false);
      expect((await rank.get(session.userId)).xp).toBe(75n);
    });

    it('survives concurrent awards without losing any', async () => {
      const session = await register();

      await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          rank.awardXp({
            userId: session.userId,
            sourceModule: 'trade',
            action: 'trade.order.filled',
            xpDelta: 5,
            idempotencyKey: `conc:${session.userId}:${i}`,
          }),
        ),
      );

      expect((await rank.get(session.userId)).xp).toBe(150n); // 50 + 20×5
    });

    it('demotes honestly on a correction — a rank you cannot lose is not a rank', async () => {
      const session = await register();
      await rank.awardXp({
        userId: session.userId,
        sourceModule: 'academy',
        action: 'academy.certification.earned',
        xpDelta: 500,
        idempotencyKey: `demote:${session.userId}:up`,
      });
      expect((await rank.get(session.userId)).rank).toBe(1);

      await rank.awardXp({
        userId: session.userId,
        sourceModule: 'academy',
        action: 'academy.certification.revoked',
        xpDelta: -500,
        idempotencyKey: `demote:${session.userId}:down`,
      });
      expect((await rank.get(session.userId)).rank).toBe(0);
    });

    it('floors XP at zero', async () => {
      const session = await register();
      await rank.awardXp({
        userId: session.userId,
        sourceModule: 'ops',
        action: 'correction',
        xpDelta: -10_000,
        idempotencyKey: `floor:${session.userId}`,
      });
      expect((await rank.get(session.userId)).xp).toBe(0n);
    });

    it('resets season XP without touching lifetime XP or rank', async () => {
      const session = await register();
      await rank.awardXp({
        userId: session.userId,
        sourceModule: 'academy',
        action: 'academy.certification.earned',
        xpDelta: 500,
        idempotencyKey: `season:${session.userId}`,
      });

      await rank.resetSeason();

      const snapshot = await rank.get(session.userId);
      expect(snapshot.seasonXp).toBe(0n);
      expect(snapshot.xp).toBe(550n);
      expect(snapshot.rank).toBe(1);
    });
  });

  // ── §4.4 PHASE 1 EXIT CRITERIA ────────────────────────────────────────────

  describe('§4.4 exit criteria', () => {
    it('full auth lifecycle: register → TOTP → refresh → scoped API key call', async () => {
      const handle = unique();

      // 1 · register
      const registered = await auth.register({
        handle,
        email: `${handle}@example.com`,
        password: 'correct horse battery staple',
        region: 'DE',
      });

      // 2 · enrol TOTP
      const { secret } = await auth.startTotpEnrolment(registered.userId);
      await auth.confirmTotpEnrolment(registered.userId, secret, totp(secret));

      // 3 · log in with the second factor
      const loggedIn = await auth.login({
        identifier: handle,
        password: 'correct horse battery staple',
        totpCode: totp(secret),
      });
      expect((await verifyAccessToken(loggedIn.accessToken, tokenConfig)).mfa).toBe(true);

      // 4 · refresh the session
      const refreshed = await auth.refresh(loggedIn.refreshToken);
      const principal = await verifyAccessToken(refreshed.accessToken, tokenConfig);
      expect(principal.userId).toBe(registered.userId);

      // 5 · scoped API key call
      const { key } = await auth.createApiKey({
        userId: registered.userId,
        name: 'trading-bot',
        scopes: ['trade:read', 'trade:write'],
        grantorScopes: SESSION_SCOPES,
      });
      const verified = await auth.verifyApiKey(key);

      expect(verified?.userId).toBe(registered.userId);
      expect(hasScope(verified!.scopes, 'trade:write')).toBe(true);
      // The key cannot do what the session can.
      expect(hasScope(verified!.scopes, 'trade:withdraw')).toBe(false);
    });

    it('XP event → rank recalc → perks visible to a second service', async () => {
      const session = await register();

      // A DIFFERENT module awards XP — svc-academy, which knows nothing about ranks.
      await rank.awardXp({
        userId: session.userId,
        sourceModule: 'academy',
        action: 'academy.certification.earned',
        xpDelta: 4_000,
        idempotencyKey: `exit-criteria:${session.userId}`,
      });

      // svc-identity recalculated. It is the only writer to rank_state.
      const snapshot = await rank.get(session.userId);
      expect(snapshot.rank).toBe(3);
      expect(snapshot.title).toBe('Dealer');

      // A THIRD service reads the perk table and acts on it, knowing nothing
      // about the Academy — this is the whole point of one XP graph.
      const perks = await rank.perks(session.userId);
      expect(perks.feeDiscountBps).toBe(100); // svc-trade applies this
      expect(perks.p2pLimitMultiplier).toBe(2); // svc-p2p applies this
      expect(perks.cardTier).toBe('standard'); // svc-bank applies this

      // And the rank change was announced so caches invalidate.
      expect(bus.emitted('rankUpdated').some((e) => e.payload.userId === session.userId)).toBe(true);
    });

    it('a verified user passes the jurisdiction matrix that an unverified one fails', async () => {
      const session = await register();

      // Ties identity to §22: the tier this service issues is what the matrix reads.
      expect(checkAccess({ module: 'bank', region: 'DE', plane: 'fiat', kycTier: await auth.kycTier(session.userId) }).allowed).toBe(false);

      await auth.approveKyc({ userId: session.userId, tier: 'full', jurisdiction: 'DE' });

      expect(checkAccess({ module: 'bank', region: 'DE', plane: 'fiat', kycTier: await auth.kycTier(session.userId) }).allowed).toBe(true);
    });
  });
}
