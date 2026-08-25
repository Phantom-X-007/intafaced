import { describe, expect, it } from 'vitest';
import {
  assertLiveCredential,
  createIdentityOwnershipClient,
  optionalProductScopes,
  type LiveCredentialPort,
  type OwnershipSnapshot,
} from './live-credential.js';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SESSION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const KEY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LISTED = 'trade';
const FOREIGN = 'pay';

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

describe('assertLiveCredential — API key product scope', () => {
  it('empty / omitted list stays open; listed product stays live', async () => {
    const input = { userId: USER, sessionId: SESSION, apiKeyId: KEY, product: LISTED };
    await expect(assertLiveCredential(port(LIVE_KEY), input)).resolves.toEqual({
      id: KEY,
      userId: USER,
      revoked: false,
    });
    await expect(assertLiveCredential(port({ ...LIVE_KEY, productScopes: [] }), input)).resolves.toMatchObject({
      id: KEY,
    });
    await expect(assertLiveCredential(port({ ...LIVE_KEY, productScopes: [LISTED] }), input)).resolves.toMatchObject({
      id: KEY,
    });
  });

  it('foreign or missing product on a bound key is auth.product_not_allowed, not revoked', async () => {
    const bound: OwnershipSnapshot = { ...LIVE_KEY, productScopes: [LISTED] };
    await expect(
      assertLiveCredential(port(bound), { userId: USER, sessionId: SESSION, apiKeyId: KEY, product: FOREIGN }),
    ).rejects.toMatchObject({ code: 'auth.product_not_allowed' });
    await expect(
      assertLiveCredential(port(bound), { userId: USER, sessionId: SESSION, apiKeyId: KEY, product: null }),
    ).rejects.toMatchObject({ code: 'auth.product_not_allowed' });
    await expect(assertLiveCredential(port(bound), { userId: USER, sessionId: SESSION, apiKeyId: KEY })).rejects.toMatchObject({
      code: 'auth.product_not_allowed',
    });
  });

  it('session seats ignore the product list', async () => {
    const p: LiveCredentialPort = {
      async getSession() {
        return { id: SESSION, userId: USER, revoked: false, productScopes: [LISTED] };
      },
      async getApiKey() {
        return { ...LIVE_KEY, productScopes: [LISTED] };
      },
    };
    await expect(assertLiveCredential(p, { userId: USER, sessionId: SESSION, product: FOREIGN })).resolves.toEqual({
      id: SESSION,
      userId: USER,
      revoked: false,
    });
  });
});

describe('optionalProductScopes', () => {
  it('reads productScopes or product_scopes string[]; rejects junk', () => {
    expect(optionalProductScopes({ productScopes: [LISTED] })).toEqual([LISTED]);
    expect(optionalProductScopes({ product_scopes: [LISTED] })).toEqual([LISTED]);
    expect(optionalProductScopes({ id: KEY })).toBeUndefined();
    expect(optionalProductScopes({ productScopes: [1] })).toBeUndefined();
    expect(optionalProductScopes(null)).toBeUndefined();
    expect(optionalProductScopes({ productScopes: [] })).toEqual([]);
    expect(optionalProductScopes({ productScopes: [] })).not.toContain('trade');
  });
});

describe('createIdentityOwnershipClient — optional key product list', () => {
  it('keeps a string[] productScopes from the key body; omits when absent', async () => {
    const withList = createIdentityOwnershipClient({
      baseUrl: 'http://identity.test',
      headers: {},
      fetch: async () =>
        new Response(JSON.stringify({ id: KEY, userId: USER, revoked: false, productScopes: [LISTED] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    await expect(withList.getApiKey(KEY)).resolves.toEqual({
      id: KEY,
      userId: USER,
      revoked: false,
      productScopes: [LISTED],
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
    expect(row && 'productScopes' in row).toBe(false);
  });
});
