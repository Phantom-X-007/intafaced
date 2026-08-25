import { describe, expect, it } from 'vitest';
import { AuthError, type AuthService } from './auth-service.js';
import { apiKeyProductAllowed } from './api-key-product.js';
import { bindApiKeyProductScope, installApiKeyProductExchange, requestProductAls } from './auth-service-product.js';

function fakeSql(queue: unknown[][]) {
  let i = 0;
  const fn = async () => {
    const rows = queue[i] ?? [];
    i += 1;
    return rows;
  };
  return fn as unknown as Parameters<typeof bindApiKeyProductScope>[0];
}

const USER = 'u';
const KEY = 'k';
const GRANTOR = ['identity:read', 'identity:write', 'trade:read', 'p2p:read'] as const;

describe('bindApiKeyProductScope', () => {
  it('refuses invalid products and does not write', async () => {
    await expect(bindApiKeyProductScope(fakeSql([]), USER, KEY, ['spot'], GRANTOR)).rejects.toMatchObject({
      code: 'auth.product_invalid',
    });
    await expect(bindApiKeyProductScope(fakeSql([]), USER, KEY, ['trade', '   '], GRANTOR)).rejects.toMatchObject({
      code: 'auth.product_invalid',
    });
  });

  it('refuses a product the grantor does not hold', async () => {
    await expect(bindApiKeyProductScope(fakeSql([]), USER, KEY, ['pay'], GRANTOR)).rejects.toMatchObject({
      code: 'auth.product_widen',
    });
  });

  it('refuses when the key already has scopes outside the list', async () => {
    await expect(
      bindApiKeyProductScope(fakeSql([[{ id: KEY, scopes: ['trade:read', 'p2p:read'] }]]), USER, KEY, ['trade'], GRANTOR),
    ).rejects.toMatchObject({ code: 'auth.product_outside' });
  });

  it('returns the bound list and treats a missing key as not found', async () => {
    const ok = fakeSql([[{ id: KEY, scopes: ['trade:read'] }], [{ id: KEY, product_scopes: ['trade'] }]]);
    await expect(bindApiKeyProductScope(ok, USER, KEY, ['  TRADE  '], GRANTOR)).resolves.toEqual({
      id: KEY,
      productScopes: ['trade'],
    });
    await expect(bindApiKeyProductScope(fakeSql([[]]), USER, KEY, ['trade'], GRANTOR)).rejects.toMatchObject({
      code: 'auth.not_found',
    });
  });

  it('empty list stays unset — does not invent a default product', async () => {
    const ok = fakeSql([[{ id: KEY, scopes: ['trade:read', 'p2p:read'] }], [{ id: KEY, product_scopes: [] }]]);
    await expect(bindApiKeyProductScope(ok, USER, KEY, [], GRANTOR)).resolves.toEqual({
      id: KEY,
      productScopes: [],
    });
    expect(apiKeyProductAllowed([], 'pay')).toBe(true);
  });
});

describe('installApiKeyProductExchange', () => {
  it('bound key: missing or other product refuses; match exchanges; empty stays open', async () => {
    const exchanged: string[] = [];
    const auth = {
      async exchangeApiKey(key: string) {
        exchanged.push(key);
        return { accessToken: 't', expiresAt: new Date(), userId: USER, keyId: KEY, scopes: [], mode: 'live' as const };
      },
    };
    const boundSql = fakeSql(Array.from({ length: 4 }, () => [{ product_scopes: ['trade'] }]));
    installApiKeyProductExchange(auth as AuthService, boundSql);

    await expect(auth.exchangeApiKey('secret')).rejects.toBeInstanceOf(AuthError);
    await expect(auth.exchangeApiKey('secret')).rejects.toMatchObject({ code: 'auth.domain_not_allowed' });
    await expect(requestProductAls.run('pay', () => auth.exchangeApiKey('secret'))).rejects.toMatchObject({
      code: 'auth.domain_not_allowed',
    });
    await expect(requestProductAls.run('trade', () => auth.exchangeApiKey('secret'))).resolves.toMatchObject({
      accessToken: 't',
    });
    expect(exchanged).toEqual(['secret']);

    const open = {
      async exchangeApiKey(key: string) {
        return { accessToken: key, expiresAt: new Date(), userId: USER, keyId: KEY, scopes: [], mode: 'live' as const };
      },
    };
    installApiKeyProductExchange(open as AuthService, fakeSql([[{ product_scopes: [] }]]));
    await expect(open.exchangeApiKey('legacy')).resolves.toMatchObject({ accessToken: 'legacy' });
  });
});
