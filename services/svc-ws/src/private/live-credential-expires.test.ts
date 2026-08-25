import { describe, expect, it } from 'vitest';
import {
  assertLiveCredential,
  createIdentityOwnershipClient,
  optionalExpiresAt,
  type LiveCredentialPort,
  type OwnershipSnapshot,
} from './live-credential.js';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SESSION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const KEY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PAST = new Date('2020-01-01T00:00:00.000Z');
const FUTURE = new Date('2099-01-01T00:00:00.000Z');
const NOW = new Date('2026-08-25T00:00:00.000Z');

const LIVE_KEY: OwnershipSnapshot = { id: KEY, userId: USER, revoked: false };

function port(key: OwnershipSnapshot | null): LiveCredentialPort {
  return {
    async getSession() {
      return null;
    },
    async getApiKey() {
      return key;
    },
  };
}

describe('assertLiveCredential — API key expiresAt', () => {
  it('missing expiry stays open; future expiresAt stays live', async () => {
    const input = { userId: USER, sessionId: SESSION, apiKeyId: KEY, now: NOW };
    await expect(assertLiveCredential(port(LIVE_KEY), input)).resolves.toEqual({
      id: KEY,
      userId: USER,
      revoked: false,
    });
    await expect(assertLiveCredential(port({ ...LIVE_KEY, expiresAt: FUTURE }), input)).resolves.toMatchObject({
      id: KEY,
    });
  });

  it('past expiresAt is auth.api_key_expired, not revoked', async () => {
    await expect(
      assertLiveCredential(port({ ...LIVE_KEY, expiresAt: PAST }), {
        userId: USER,
        sessionId: SESSION,
        apiKeyId: KEY,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: 'auth.api_key_expired' });
  });

  it('refuses when expiresAt is set and the clock is missing', async () => {
    await expect(
      assertLiveCredential(port({ ...LIVE_KEY, expiresAt: FUTURE }), {
        userId: USER,
        sessionId: SESSION,
        apiKeyId: KEY,
        now: null,
      }),
    ).rejects.toMatchObject({ code: 'auth.clock_missing' });
  });

  it('session seats ignore key expiry', async () => {
    const p: LiveCredentialPort = {
      async getSession() {
        return { id: SESSION, userId: USER, revoked: false, expiresAt: PAST };
      },
      async getApiKey() {
        return { ...LIVE_KEY, expiresAt: PAST };
      },
    };
    await expect(assertLiveCredential(p, { userId: USER, sessionId: SESSION, now: NOW })).resolves.toEqual({
      id: SESSION,
      userId: USER,
      revoked: false,
    });
  });
});

describe('optionalExpiresAt', () => {
  it('reads expiresAt or expires_at; rejects junk', () => {
    expect(optionalExpiresAt({ expiresAt: PAST.toISOString() })).toEqual(PAST);
    expect(optionalExpiresAt({ expires_at: FUTURE.toISOString() })).toEqual(FUTURE);
    expect(optionalExpiresAt({ id: KEY })).toBeUndefined();
    expect(optionalExpiresAt({ expiresAt: 'nope' })).toBeUndefined();
    expect(optionalExpiresAt(null)).toBeUndefined();
  });
});

describe('createIdentityOwnershipClient — optional key expiresAt', () => {
  it('keeps expiresAt from the key body; omits when absent', async () => {
    const withExp = createIdentityOwnershipClient({
      baseUrl: 'http://identity.test',
      headers: {},
      fetch: async () =>
        new Response(JSON.stringify({ id: KEY, userId: USER, revoked: false, expiresAt: PAST.toISOString() }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    await expect(withExp.getApiKey(KEY)).resolves.toEqual({
      id: KEY,
      userId: USER,
      revoked: false,
      expiresAt: PAST,
    });

    const bare = createIdentityOwnershipClient({
      baseUrl: 'http://identity.test',
      headers: {},
      fetch: async () =>
        new Response(JSON.stringify({ id: KEY, userId: USER, revoked: false }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    const row = await bare.getApiKey(KEY);
    expect(row).toEqual({ id: KEY, userId: USER, revoked: false });
    expect(row && 'expiresAt' in row).toBe(false);
  });
});
