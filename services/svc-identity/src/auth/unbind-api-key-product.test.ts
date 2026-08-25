import { describe, expect, it } from 'vitest';
import { ApiKeyProductError } from './api-key-product.js';
import { apiKeyProductAllowed } from './api-key-product.js';
import { unbindApiKeyProductScope } from './unbind-api-key-product.js';

const KEY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LISTED = 'trade';
const KEEP = 'p2p';

function fakeSqlSequence(results: unknown[][]) {
  let i = 0;
  const fn = async () => results[Math.min(i++, results.length - 1)] ?? [];
  return fn as unknown as Parameters<typeof unbindApiKeyProductScope>[0];
}

describe('unbindApiKeyProductScope', () => {
  it('removes one listed product and leaves the rest', async () => {
    const sql = fakeSqlSequence([[{ id: KEY, product_scopes: [LISTED, KEEP] }], [{ id: KEY, product_scopes: [KEEP] }]]);
    await expect(unbindApiKeyProductScope(sql, USER, KEY, ` ${LISTED} `)).resolves.toEqual({
      id: KEY,
      productScopes: [KEEP],
    });
  });

  it('use of the unbound product is then refused; a still-listed product stays open', async () => {
    const sql = fakeSqlSequence([[{ id: KEY, product_scopes: [LISTED, KEEP] }], [{ id: KEY, product_scopes: [KEEP] }]]);
    const { productScopes } = await unbindApiKeyProductScope(sql, USER, KEY, LISTED);
    expect(apiKeyProductAllowed(productScopes, LISTED)).toBe(false);
    expect(apiKeyProductAllowed(productScopes, KEEP)).toBe(true);
  });

  it('refuses invalid products, a missing key, and a product that is not on the list', async () => {
    await expect(unbindApiKeyProductScope(fakeSqlSequence([[]]), USER, KEY, 'spot')).rejects.toMatchObject({
      code: 'auth.product_invalid',
    });
    await expect(unbindApiKeyProductScope(fakeSqlSequence([[]]), USER, KEY, LISTED)).rejects.toBeInstanceOf(ApiKeyProductError);
    await expect(
      unbindApiKeyProductScope(fakeSqlSequence([[{ id: KEY, product_scopes: [KEEP] }]]), USER, KEY, LISTED),
    ).rejects.toMatchObject({
      code: 'auth.not_found',
    });
  });
});
