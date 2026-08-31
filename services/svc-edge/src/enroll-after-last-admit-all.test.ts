import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { newlyEnrolledPasskeyAdmitsAllRequests } from './enroll-after-last-admit-all.js';
import { SessionPasskeyError, assertIdentitySessionPasskey, assertSessionPasskey } from './session-passkey.js';

const USER = '11111111-1111-4111-8111-111111111111';
const VERIFIED = '2026-08-25T00:00:00.000Z';

const ENROLLED_AGAIN = {
  userId: USER,
  webauthnCreds: [{ credentialId: 'cred-3', lastVerifiedAt: VERIFIED }],
};

const options = {
  identityUrl: 'http://identity.test',
  userId: USER,
  identityOwnershipSecret: 'edge-test-identity-ownership-secret-32',
};

describe('newlyEnrolledPasskeyAdmitsAllRequests — enroll after last unenroll', () => {
  it('newly enrolled verified cred admits every private request', async () => {
    expect(() => newlyEnrolledPasskeyAdmitsAllRequests(ENROLLED_AGAIN)).not.toThrow();
    expect(() => assertSessionPasskey(ENROLLED_AGAIN)).not.toThrow();
    const fetchOk = async () =>
      new Response(JSON.stringify(ENROLLED_AGAIN), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    await expect(assertIdentitySessionPasskey({ ...options, fetch: fetchOk })).resolves.toBeUndefined();
    await expect(assertIdentitySessionPasskey({ ...options, fetch: fetchOk })).resolves.toBeUndefined();
  });

  it('newly enrolled cred without lastVerifiedAt is auth.passkey_verify_unavailable', () => {
    const enrolledUnverified = { userId: USER, webauthnCreds: [{ credentialId: 'cred-3' }] };
    try {
      newlyEnrolledPasskeyAdmitsAllRequests(enrolledUnverified);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SessionPasskeyError);
      expect((err as SessionPasskeyError).code).toBe('auth.passkey_verify_unavailable');
    }
    try {
      assertSessionPasskey(enrolledUnverified);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SessionPasskeyError);
      expect((err as SessionPasskeyError).code).toBe('auth.passkey_verify_unavailable');
    }
  });

  it('empty after last unenroll is auth.passkey_missing', () => {
    const empty = { userId: USER, webauthnCreds: [] };
    try {
      newlyEnrolledPasskeyAdmitsAllRequests(empty);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SessionPasskeyError);
      expect((err as SessionPasskeyError).code).toBe('auth.passkey_missing');
    }
    try {
      assertSessionPasskey(empty);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SessionPasskeyError);
      expect((err as SessionPasskeyError).code).toBe('auth.passkey_missing');
    }
  });

  it('source reuses assertSessionPasskey; no invented challenge or session; not one-request admit', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, 'enroll-after-last-admit-all.ts'), 'utf8');
    expect(src).toMatch(/assertSessionPasskey/);
    expect(src).toMatch(/newlyEnrolledPasskeyAdmitsAllRequests/);
    expect(src).not.toMatch(/newlyEnrolledPasskeyAdmitsRequest[^s]/);
    expect(src).not.toMatch(/generateAuthenticationOptions/);
    expect(src).not.toMatch(/INSERT\s+sessions/i);
    expect(src).not.toMatch(/INSERT INTO sessions/);
  });
});
