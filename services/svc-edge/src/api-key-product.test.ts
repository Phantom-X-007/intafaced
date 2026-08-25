import { describe, expect, it } from 'vitest';
import {
  apiKeyProductAllowed,
  assertApiKeyProduct,
  optionalProductScopes,
  optionalProductScopesFromExchange,
  requestProduct,
  KeyProductError,
} from './api-key-product.js';

const LISTED = 'trade';
const KEEP = 'p2p';
const FOREIGN = 'pay';

describe('optionalProductScopes', () => {
  it('reads productScopes / product_scopes; never invents a default product', () => {
    expect(optionalProductScopes({ productScopes: [LISTED] })).toEqual([LISTED]);
    expect(optionalProductScopes({ product_scopes: [KEEP] })).toEqual([KEEP]);
    expect(optionalProductScopes({ productScopes: [` ${LISTED} `] })).toEqual([LISTED]);
    expect(optionalProductScopes({ productScopes: [] })).toEqual([]);
    expect(optionalProductScopes({ productScopes: [] })).not.toContain('trade');
    expect(optionalProductScopes({ id: 'k' })).toBeUndefined();
    expect(optionalProductScopes({ productScopes: 'trade' })).toBeUndefined();
    expect(optionalProductScopes(null)).toBeUndefined();
  });
});

describe('optionalProductScopesFromExchange', () => {
  it('reads tRPC envelope or bare body; never invents a list', () => {
    expect(optionalProductScopesFromExchange({ result: { data: { json: { productScopes: [LISTED] } } } })).toEqual([LISTED]);
    expect(optionalProductScopesFromExchange({ result: { data: { product_scopes: [KEEP] } } })).toEqual([KEEP]);
    expect(optionalProductScopesFromExchange({ product_scopes: [LISTED] })).toEqual([LISTED]);
    expect(optionalProductScopesFromExchange({ accessToken: 'x' })).toBeUndefined();
  });
});

describe('requestProduct', () => {
  it('reads x-product; blank / wildcard / scope is missing', () => {
    expect(requestProduct({ 'x-product': LISTED })).toBe(LISTED);
    expect(requestProduct({ 'X-Product': ` ${KEEP} ` })).toBe(KEEP);
    expect(requestProduct({ 'x-product': '  ' })).toBeUndefined();
    expect(requestProduct({ 'x-product': 'trade:read' })).toBeUndefined();
    expect(requestProduct({ 'x-product': '*' })).toBeUndefined();
    expect(requestProduct({})).toBeUndefined();
    expect(requestProduct({ 'x-intafaced-product': LISTED })).toBeUndefined();
  });
});

describe('apiKeyProductAllowed', () => {
  it('empty list stays open; no invented default product', () => {
    expect(apiKeyProductAllowed([], undefined)).toBe(true);
    expect(apiKeyProductAllowed([], FOREIGN)).toBe(true);
    expect(apiKeyProductAllowed([], LISTED)).toBe(true);
    expect([] as string[]).not.toContain('trade');
  });

  it('refuses missing product when the list is set', () => {
    expect(apiKeyProductAllowed([LISTED], undefined)).toBe(false);
    expect(apiKeyProductAllowed([LISTED], null)).toBe(false);
    expect(apiKeyProductAllowed([LISTED], '')).toBe(false);
  });

  it('matching product proceeds; foreign product refuses', () => {
    const list = [LISTED, KEEP];
    expect(apiKeyProductAllowed(list, 'trade')).toBe(true);
    expect(apiKeyProductAllowed(list, '  TRADE  ')).toBe(true);
    expect(apiKeyProductAllowed(list, KEEP)).toBe(true);
    expect(apiKeyProductAllowed(list, FOREIGN)).toBe(false);
    expect(apiKeyProductAllowed(list, 'spot')).toBe(false);
  });
});

describe('assertApiKeyProduct', () => {
  it('empty / missing list stays open; bound list refuses foreign product', () => {
    expect(() => assertApiKeyProduct(undefined, FOREIGN)).not.toThrow();
    expect(() => assertApiKeyProduct([], FOREIGN)).not.toThrow();
    expect(() => assertApiKeyProduct([LISTED], LISTED)).not.toThrow();
    expect(() => assertApiKeyProduct([LISTED], FOREIGN)).toThrow(KeyProductError);
    try {
      assertApiKeyProduct([LISTED], FOREIGN);
    } catch (err) {
      expect(err).toMatchObject({ code: 'auth.domain_not_allowed' });
    }
    expect(() => assertApiKeyProduct([LISTED], undefined)).toThrow(KeyProductError);
  });
});
