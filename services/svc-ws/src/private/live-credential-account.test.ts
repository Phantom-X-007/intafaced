import { describe, expect, it } from 'vitest';
import {
  assertLiveCredential,
  createIdentityOwnershipClient,
  optionalAccountIdFromBody,
  type LiveCredentialPort,
  type OwnershipSnapshot,
} from './live-credential.js';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SESSION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const KEY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ACC = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OTHER = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

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

describe('assertLiveCredential — API key account bind', () => {
  it('unbound stays open; matching account stays live', async () => {
    const input = { userId: USER, sessionId: SESSION, apiKeyId: KEY, accountId: ACC };
    await expect(assertLiveCredential(port(LIVE_KEY), input)).resolves.toEqual({
      id: KEY,
      userId: USER,
      revoked: false,
    });
    await expect(assertLiveCredential(port(LIVE_KEY), { ...input, accountId: undefined })).resolves.toMatchObject({
      id: KEY,
    });
    await expect(assertLiveCredential(port({ ...LIVE_KEY, accountId: ACC }), input)).resolves.toMatchObject({ id: KEY });
  });

  it('wrong or missing account on a bound key is account_mismatch / account_required, not revoked', async () => {
    const bound: OwnershipSnapshot = { ...LIVE_KEY, accountId: ACC };
    await expect(
      assertLiveCredential(port(bound), { userId: USER, sessionId: SESSION, apiKeyId: KEY, accountId: OTHER }),
    ).rejects.toMatchObject({ code: 'auth.account_mismatch' });
    await expect(
      assertLiveCredential(port(bound), { userId: USER, sessionId: SESSION, apiKeyId: KEY, accountId: null }),
    ).rejects.toMatchObject({ code: 'auth.account_required' });
    await expect(assertLiveCredential(port(bound), { userId: USER, sessionId: SESSION, apiKeyId: KEY })).rejects.toMatchObject({
      code: 'auth.account_required',
    });
  });

  it('session seats ignore the account bind', async () => {
    const p: LiveCredentialPort = {
      async getSession() {
        return { id: SESSION, userId: USER, revoked: false, accountId: ACC };
      },
      async getApiKey() {
        return { ...LIVE_KEY, accountId: ACC };
      },
    };
    await expect(assertLiveCredential(p, { userId: USER, sessionId: SESSION, accountId: OTHER })).resolves.toEqual({
      id: SESSION,
      userId: USER,
      revoked: false,
    });
  });
});

describe('optionalAccountIdFromBody', () => {
  it('reads accountId or account_id; rejects junk', () => {
    expect(optionalAccountIdFromBody({ accountId: ACC })).toBe(ACC);
    expect(optionalAccountIdFromBody({ account_id: OTHER })).toBe(OTHER);
    expect(optionalAccountIdFromBody({ id: KEY })).toBeUndefined();
    expect(optionalAccountIdFromBody({ accountId: 1 })).toBeUndefined();
    expect(optionalAccountIdFromBody(null)).toBeUndefined();
  });
});

describe('createIdentityOwnershipClient — optional key accountId', () => {
  it('keeps accountId from the key body; omits when absent', async () => {
    const withAcc = createIdentityOwnershipClient({
      baseUrl: 'http://identity.test',
      headers: {},
      fetch: async () =>
        new Response(JSON.stringify({ id: KEY, userId: USER, revoked: false, accountId: ACC }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    await expect(withAcc.getApiKey(KEY)).resolves.toEqual({
      id: KEY,
      userId: USER,
      revoked: false,
      accountId: ACC,
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
    expect(row && 'accountId' in row).toBe(false);
  });
});
