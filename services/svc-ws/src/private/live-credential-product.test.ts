import { describe, expect, it } from 'vitest';
import {
  assertLiveCredential,
  createIdentityOwnershipClient,
  optionalProductAllowlist,
  type LiveCredentialPort,
  type OwnershipSnapshot,
} from './live-credential.js';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SESSION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const KEY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

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

describe('assertLiveCredential — API key product allowlist', () => {
  it('omitted / empty list stays open and does not invent trade', async () => {
    const input = { userId: USER, sessionId: SESSION, apiKeyId: KEY };
    await expect(assertLiveCredential(port(LIVE_KEY), input)).resolves.toEqual({
      id: KEY,
      userId: USER,
      revoked: false,
    });
    await expect(assertLiveCredential(port({ ...LIVE_KEY, productAllowlist: [] }), input)).resolves.toMatchObject({
      id: KEY,
    });
    const empty = { ...LIVE_KEY, productAllowlist: [] as const };
    expect(empty.productAllowlist).not.toContain('trade');
  });

  it('listed trade stays live; pay-only is auth.product_not_allowed, not revoked', async () => {
    const input = { userId: USER, sessionId: SESSION, apiKeyId: KEY };
    await expect(assertLiveCredential(port({ ...LIVE_KEY, productAllowlist: ['trade'] }), input)).resolves.toMatchObject({ id: KEY });
    await expect(assertLiveCredential(port({ ...LIVE_KEY, productAllowlist: ['pay'] }), input)).rejects.toMatchObject({
      code: 'auth.product_not_allowed',
    });
    await expect(assertLiveCredential(port({ ...LIVE_KEY, productAllowlist: ['spot'] }), input)).rejects.toMatchObject({
      code: 'auth.product_not_allowed',
    });
  });

  it('session seats ignore the product allowlist', async () => {
    const p: LiveCredentialPort = {
      async getSession() {
        return { id: SESSION, userId: USER, revoked: false, productAllowlist: ['pay'] };
      },
      async getApiKey() {
        return { ...LIVE_KEY, productAllowlist: ['pay'] };
      },
    };
    await expect(assertLiveCredential(p, { userId: USER, sessionId: SESSION })).resolves.toEqual({
      id: SESSION,
      userId: USER,
      revoked: false,
    });
  });
});

describe('optionalProductAllowlist', () => {
  it('reads productAllowlist / product_allowlist / productScopes / product_scopes string[]; rejects junk', () => {
    expect(optionalProductAllowlist({ productAllowlist: ['trade'] })).toEqual(['trade']);
    expect(optionalProductAllowlist({ product_allowlist: ['trade'] })).toEqual(['trade']);
    expect(optionalProductAllowlist({ productScopes: ['pay'] })).toEqual(['pay']);
    expect(optionalProductAllowlist({ product_scopes: ['pay'] })).toEqual(['pay']);
    expect(optionalProductAllowlist({ id: KEY })).toBeUndefined();
    expect(optionalProductAllowlist({ productAllowlist: [1] })).toBeUndefined();
    expect(optionalProductAllowlist(null)).toBeUndefined();
    expect(optionalProductAllowlist({ productAllowlist: [] })).toEqual([]);
    expect(optionalProductAllowlist({ productAllowlist: [] })).not.toContain('trade');
  });
});

describe('createIdentityOwnershipClient — optional key product list', () => {
  it('keeps a string[] product list from the key body; omits when absent', async () => {
    const withList = createIdentityOwnershipClient({
      baseUrl: 'http://identity.test',
      headers: {},
      fetch: async () =>
        new Response(JSON.stringify({ id: KEY, userId: USER, revoked: false, product_scopes: ['pay'] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    await expect(withList.getApiKey(KEY)).resolves.toEqual({
      id: KEY,
      userId: USER,
      revoked: false,
      productAllowlist: ['pay'],
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
    expect(row && 'productAllowlist' in row).toBe(false);
  });
});
