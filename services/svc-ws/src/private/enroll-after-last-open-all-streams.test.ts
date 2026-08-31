import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { newlyEnrolledPasskeyOpensAllStreams } from './enroll-after-last-open-all-streams.js';
import { SessionPasskeyError, assertSessionPasskey } from './session-passkey.js';
import { assertLiveCredential, type LiveCredentialPort, type OwnershipSnapshot } from './live-credential.js';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SESSION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const KEY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const VERIFIED = '2026-08-25T00:00:00.000Z';
const SECRET = 'ws-test-identity-ownership-secret-32';

const LIVE: OwnershipSnapshot = { id: SESSION, userId: USER, revoked: false };
const LIVE_KEY: OwnershipSnapshot = { id: KEY, userId: USER, revoked: false };

const ENROLLED_AGAIN = {
  userId: USER,
  webauthnCreds: [{ credentialId: 'cred-3', lastVerifiedAt: VERIFIED }],
};
const EMPTY = { userId: USER, webauthnCreds: [] };
const UNVERIFIED = { userId: USER, webauthnCreds: [{ credentialId: 'cred-3' }] };

function port(account: unknown, http = 200): LiveCredentialPort {
  return {
    async getSession() {
      return LIVE;
    },
    async getApiKey() {
      return LIVE_KEY;
    },
    sessionPasskey: {
      identityUrl: 'http://identity.test',
      identityOwnershipSecret: SECRET,
      fetch: async () =>
        new Response(typeof account === 'string' ? account : JSON.stringify(account), {
          status: http,
          headers: { 'content-type': 'application/json' },
        }),
    },
  };
}

describe('newlyEnrolledPasskeyOpensAllStreams — enroll after last unenroll', () => {
  it('newly enrolled verified cred opens every existing session', async () => {
    expect(() => newlyEnrolledPasskeyOpensAllStreams(ENROLLED_AGAIN)).not.toThrow();
    expect(() => assertSessionPasskey(ENROLLED_AGAIN)).not.toThrow();
    await expect(assertLiveCredential(port(ENROLLED_AGAIN), { userId: USER, sessionId: SESSION })).resolves.toEqual({
      id: SESSION,
      userId: USER,
      revoked: false,
    });
  });

  it('newly enrolled cred without lastVerifiedAt is auth.passkey_verify_unavailable', () => {
    try {
      newlyEnrolledPasskeyOpensAllStreams(UNVERIFIED);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SessionPasskeyError);
      expect((err as SessionPasskeyError).code).toBe('auth.passkey_verify_unavailable');
    }
    try {
      assertSessionPasskey(UNVERIFIED);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SessionPasskeyError);
      expect((err as SessionPasskeyError).code).toBe('auth.passkey_verify_unavailable');
    }
  });

  it('empty after last unenroll is auth.passkey_missing', async () => {
    try {
      newlyEnrolledPasskeyOpensAllStreams(EMPTY);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SessionPasskeyError);
      expect((err as SessionPasskeyError).code).toBe('auth.passkey_missing');
    }
    try {
      assertSessionPasskey(EMPTY);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SessionPasskeyError);
      expect((err as SessionPasskeyError).code).toBe('auth.passkey_missing');
    }
    await expect(assertLiveCredential(port(EMPTY), { userId: USER, sessionId: SESSION })).rejects.toMatchObject({
      code: 'auth.passkey_missing',
    });
  });

  it('source reuses assertSessionPasskey; no invented challenge or session; not one-stream open or drop-all', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, 'enroll-after-last-open-all-streams.ts'), 'utf8');
    expect(src).toMatch(/assertSessionPasskey/);
    expect(src).toMatch(/newlyEnrolledPasskeyOpensAllStreams/);
    expect(src).not.toMatch(/newlyEnrolledPasskeyOpensStream[^A]/);
    expect(src).not.toMatch(/newlyEnrolledPasskeyDropsAllStreams/);
    expect(src).not.toMatch(/generateAuthenticationOptions/);
    expect(src).not.toMatch(/INSERT\s+sessions/i);
    expect(src).not.toMatch(/INSERT INTO sessions/);
  });
});
