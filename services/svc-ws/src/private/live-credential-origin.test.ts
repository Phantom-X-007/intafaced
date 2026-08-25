import { describe, expect, it } from 'vitest';
import {
  assertLiveCredential,
  createIdentityOwnershipClient,
  optionalOriginAllowlist,
  type LiveCredentialPort,
  type OwnershipSnapshot,
} from './live-credential.js';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SESSION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const KEY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LISTED = 'app.example.com';
const FOREIGN = 'https://evil.example';

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

describe('assertLiveCredential — API key origin allowlist', () => {
  it('empty / omitted list stays open; listed Origin stays live', async () => {
    const input = { userId: USER, sessionId: SESSION, apiKeyId: KEY, requestOrigin: 'https://app.example.com' };
    await expect(assertLiveCredential(port(LIVE_KEY), input)).resolves.toEqual({
      id: KEY,
      userId: USER,
      revoked: false,
    });
    await expect(assertLiveCredential(port({ ...LIVE_KEY, originAllowlist: [] }), input)).resolves.toMatchObject({
      id: KEY,
    });
    await expect(assertLiveCredential(port({ ...LIVE_KEY, originAllowlist: [LISTED] }), input)).resolves.toMatchObject({
      id: KEY,
    });
  });

  it('foreign or missing Origin on a bound key is auth.domain_not_allowed, not revoked', async () => {
    const bound: OwnershipSnapshot = { ...LIVE_KEY, originAllowlist: [LISTED] };
    await expect(
      assertLiveCredential(port(bound), { userId: USER, sessionId: SESSION, apiKeyId: KEY, requestOrigin: FOREIGN }),
    ).rejects.toMatchObject({ code: 'auth.domain_not_allowed' });
    await expect(
      assertLiveCredential(port(bound), { userId: USER, sessionId: SESSION, apiKeyId: KEY, requestOrigin: null }),
    ).rejects.toMatchObject({ code: 'auth.domain_not_allowed' });
    await expect(assertLiveCredential(port(bound), { userId: USER, sessionId: SESSION, apiKeyId: KEY })).rejects.toMatchObject({
      code: 'auth.domain_not_allowed',
    });
  });

  it('session seats ignore the origin allowlist', async () => {
    const p: LiveCredentialPort = {
      async getSession() {
        return { id: SESSION, userId: USER, revoked: false, originAllowlist: [LISTED] };
      },
      async getApiKey() {
        return { ...LIVE_KEY, originAllowlist: [LISTED] };
      },
    };
    await expect(assertLiveCredential(p, { userId: USER, sessionId: SESSION, requestOrigin: FOREIGN })).resolves.toEqual({
      id: SESSION,
      userId: USER,
      revoked: false,
    });
  });
});

describe('optionalOriginAllowlist', () => {
  it('reads originAllowlist, origin_allowlist, or domain_whitelist string[]; rejects junk', () => {
    expect(optionalOriginAllowlist({ originAllowlist: [LISTED] })).toEqual([LISTED]);
    expect(optionalOriginAllowlist({ origin_allowlist: [LISTED] })).toEqual([LISTED]);
    expect(optionalOriginAllowlist({ domain_whitelist: [LISTED] })).toEqual([LISTED]);
    expect(optionalOriginAllowlist({ id: KEY })).toBeUndefined();
    expect(optionalOriginAllowlist({ originAllowlist: [1] })).toBeUndefined();
    expect(optionalOriginAllowlist(null)).toBeUndefined();
    expect(optionalOriginAllowlist({ originAllowlist: [] })).toEqual([]);
    expect(optionalOriginAllowlist({ originAllowlist: [] })).not.toContain('localhost');
  });
});

describe('createIdentityOwnershipClient — optional key origin list', () => {
  it('keeps a string[] originAllowlist from the key body; omits when absent', async () => {
    const withList = createIdentityOwnershipClient({
      baseUrl: 'http://identity.test',
      headers: {},
      fetch: async () =>
        new Response(JSON.stringify({ id: KEY, userId: USER, revoked: false, originAllowlist: [LISTED] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    await expect(withList.getApiKey(KEY)).resolves.toEqual({
      id: KEY,
      userId: USER,
      revoked: false,
      originAllowlist: [LISTED],
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
    expect(row && 'originAllowlist' in row).toBe(false);
  });
});
