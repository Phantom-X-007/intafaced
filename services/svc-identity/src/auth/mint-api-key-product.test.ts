import { describe, expect, it } from 'vitest';
import { apiKeyProductAllowed } from './api-key-product.js';
import { mintApiKeyWithProductScope } from './mint-api-key-product.js';
import type { ApiKeyMinter } from './mint-api-key-ip.js';

function fakeSql(queue: unknown[][]) {
  let i = 0;
  const fn = async () => {
    const rows = queue[i] ?? [];
    i += 1;
    return rows;
  };
  return fn as unknown as Parameters<typeof mintApiKeyWithProductScope>[1];
}

function makeMinter() {
  const created: unknown[] = [];
  const revoked: string[] = [];
  const minter: ApiKeyMinter = {
    async createApiKey(input) {
      created.push(input);
      return { id: 'k1', key: 'ifk_live_secret', prefix: 'ifk_live', mode: input.mode ?? 'live' };
    },
    async revokeApiKey(_userId, keyId) {
      revoked.push(keyId);
      return true;
    },
  };
  return { minter, created, revoked };
}

const GRANTOR = ['identity:read', 'identity:write', 'trade:read', 'p2p:read'];
const base = {
  userId: 'u',
  name: 'desk',
  scopes: ['trade:read'],
  grantorScopes: GRANTOR,
};

describe('mintApiKeyWithProductScope', () => {
  it('refuses invalid products before create', async () => {
    const { minter, created } = makeMinter();
    await expect(mintApiKeyWithProductScope(minter, fakeSql([]), { ...base, products: ['spot'] })).rejects.toMatchObject({
      code: 'auth.product_invalid',
    });
    expect(created).toEqual([]);
  });

  it('refuses a product the grantor does not hold before create', async () => {
    const { minter, created } = makeMinter();
    await expect(mintApiKeyWithProductScope(minter, fakeSql([]), { ...base, products: ['pay'] })).rejects.toMatchObject({
      code: 'auth.product_widen',
    });
    expect(created).toEqual([]);
  });

  it('refuses scopes outside the product list before create', async () => {
    const { minter, created } = makeMinter();
    await expect(
      mintApiKeyWithProductScope(minter, fakeSql([]), { ...base, scopes: ['p2p:read'], products: ['trade'] }),
    ).rejects.toMatchObject({ code: 'auth.product_outside' });
    expect(created).toEqual([]);
  });

  it('binds the list so an unlisted product is refused from the first call', async () => {
    const { minter, created, revoked } = makeMinter();
    const minted = await mintApiKeyWithProductScope(
      minter,
      fakeSql([[{ id: 'k1', scopes: ['trade:read'] }], [{ id: 'k1', product_scopes: ['trade'] }]]),
      { ...base, products: ['  TRADE  '] },
    );
    expect(minted.productScopes).toEqual(['trade']);
    expect(created).toHaveLength(1);
    expect(revoked).toEqual([]);
    expect(apiKeyProductAllowed(minted.productScopes, 'pay')).toBe(false);
    expect(apiKeyProductAllowed(minted.productScopes, undefined)).toBe(false);
    expect(apiKeyProductAllowed(minted.productScopes, 'trade')).toBe(true);
  });

  it('empty products stays unset — does not invent a default product', async () => {
    const { minter, created } = makeMinter();
    const minted = await mintApiKeyWithProductScope(
      minter,
      fakeSql([[{ id: 'k1', scopes: ['trade:read'] }], [{ id: 'k1', product_scopes: [] }]]),
      { ...base, products: [] },
    );
    expect(minted.productScopes).toEqual([]);
    expect(minted.productScopes).not.toContain('trade');
    expect(apiKeyProductAllowed(minted.productScopes, 'pay')).toBe(true);
    expect(created).toHaveLength(1);
  });

  it('revokes the minted key if bind fails', async () => {
    const { minter, revoked } = makeMinter();
    await expect(mintApiKeyWithProductScope(minter, fakeSql([[]]), { ...base, products: ['trade'] })).rejects.toMatchObject({
      code: 'auth.not_found',
    });
    expect(revoked).toEqual(['k1']);
  });
});
