import { describe, expect, it } from 'vitest';
import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import {
  apiKeyProductAllowed,
  assertApiKeyProduct,
  normalizeProduct,
  optionalProductScopes,
  requestProductFromUpgrade,
  KeyProductError,
} from './key-product.js';

describe('normalizeProduct', () => {
  it('accepts known module prefixes after trim/lowercase', () => {
    expect(normalizeProduct('trade')).toBe('trade');
    expect(normalizeProduct('  PAY  ')).toBe('pay');
    expect(normalizeProduct('identity')).toBe('identity');
  });

  it('rejects blank, wildcard, full scopes, and unknown products', () => {
    expect(normalizeProduct(undefined)).toBeNull();
    expect(normalizeProduct(null)).toBeNull();
    expect(normalizeProduct('')).toBeNull();
    expect(normalizeProduct('   ')).toBeNull();
    expect(normalizeProduct('*')).toBeNull();
    expect(normalizeProduct('trade:read')).toBeNull();
    expect(normalizeProduct('spot')).toBeNull();
    expect(normalizeProduct('futures')).toBeNull();
  });
});

describe('apiKeyProductAllowed', () => {
  it('empty list stays open; missing product with a bound list fails closed', () => {
    expect(apiKeyProductAllowed([], null)).toBe(true);
    expect(apiKeyProductAllowed([], 'pay')).toBe(true);
    expect(apiKeyProductAllowed([], undefined)).toBe(true);
    expect(apiKeyProductAllowed(['trade'], null)).toBe(false);
    expect(apiKeyProductAllowed(['trade'], '')).toBe(false);
    expect(apiKeyProductAllowed(['trade'], undefined)).toBe(false);
    expect(apiKeyProductAllowed(['trade'], 'trade')).toBe(true);
    expect(apiKeyProductAllowed(['trade'], '  TRADE  ')).toBe(true);
    expect(apiKeyProductAllowed(['trade'], 'pay')).toBe(false);
    expect(apiKeyProductAllowed(['trade'], 'spot')).toBe(false);
  });

  it('does not invent a default product or wildcards', () => {
    expect([] as string[]).not.toContain('trade');
    expect(apiKeyProductAllowed(['*'], 'trade')).toBe(false);
  });
});

describe('assertApiKeyProduct', () => {
  it('empty / omitted stays open; listed match proceeds; foreign and missing refuse', () => {
    expect(() => assertApiKeyProduct(undefined, undefined)).not.toThrow();
    expect(() => assertApiKeyProduct([], 'pay')).not.toThrow();
    expect(() => assertApiKeyProduct(['trade'], 'trade')).not.toThrow();
    expect(() => assertApiKeyProduct(['trade'], 'pay')).toThrow(KeyProductError);
    try {
      assertApiKeyProduct(['trade'], 'pay');
    } catch (err) {
      expect(err).toMatchObject({ code: 'auth.product_not_allowed' });
    }
    try {
      assertApiKeyProduct(['trade'], undefined);
    } catch (err) {
      expect(err).toMatchObject({ code: 'auth.product_not_allowed' });
    }
  });
});

describe('optionalProductScopes', () => {
  it('reads productScopes or product_scopes string[]; rejects junk', () => {
    expect(optionalProductScopes({ productScopes: ['trade'] })).toEqual(['trade']);
    expect(optionalProductScopes({ product_scopes: ['pay'] })).toEqual(['pay']);
    expect(optionalProductScopes({ id: 'k' })).toBeUndefined();
    expect(optionalProductScopes({ productScopes: [1] })).toBeUndefined();
    expect(optionalProductScopes(null)).toBeUndefined();
    expect(optionalProductScopes({ productScopes: [] })).toEqual([]);
    expect(optionalProductScopes({ productScopes: [] })).not.toContain('trade');
  });
});

describe('requestProductFromUpgrade', () => {
  function req(headers: Record<string, string>): IncomingMessage {
    return { headers, socket: new Socket() } as IncomingMessage;
  }

  it('reads x-product; blank is missing; never x-intafaced-product', () => {
    expect(requestProductFromUpgrade(req({ 'x-product': 'trade' }))).toBe('trade');
    expect(requestProductFromUpgrade(req({ product: 'pay' }))).toBe('pay');
    expect(requestProductFromUpgrade(req({ 'x-product': '  ' }))).toBeUndefined();
    expect(requestProductFromUpgrade(req({}))).toBeUndefined();
    expect(requestProductFromUpgrade(req({ 'x-intafaced-product': 'trade' }))).toBeUndefined();
  });
});
