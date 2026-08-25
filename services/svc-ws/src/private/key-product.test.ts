import { describe, expect, it } from 'vitest';
import { apiKeyProductAllowed, normalizeProduct, STREAM_PRODUCT } from './key-product.js';

describe('STREAM_PRODUCT', () => {
  it('is the trade module — not a market type', () => {
    expect(STREAM_PRODUCT).toBe('trade');
    expect(STREAM_PRODUCT).not.toBe('spot');
    expect(STREAM_PRODUCT).not.toBe('perp');
  });
});

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
    expect(normalizeProduct('perp')).toBeNull();
  });
});

describe('apiKeyProductAllowed', () => {
  it('empty list stays open and does not invent trade', () => {
    expect(apiKeyProductAllowed([], undefined)).toBe(true);
    expect(apiKeyProductAllowed([], null)).toBe(true);
    expect(apiKeyProductAllowed([], '')).toBe(true);
    expect(apiKeyProductAllowed([], 'trade')).toBe(true);
    expect(apiKeyProductAllowed([], 'pay')).toBe(true);
    expect([] as string[]).not.toContain('trade');
  });

  it('listed trade proceeds; pay-only or unknown list refuses trade', () => {
    expect(apiKeyProductAllowed(['trade'], STREAM_PRODUCT)).toBe(true);
    expect(apiKeyProductAllowed(['  TRADE  '], STREAM_PRODUCT)).toBe(true);
    expect(apiKeyProductAllowed(['trade', 'pay'], STREAM_PRODUCT)).toBe(true);
    expect(apiKeyProductAllowed(['pay'], STREAM_PRODUCT)).toBe(false);
    expect(apiKeyProductAllowed(['pay'], 'pay')).toBe(true);
    expect(apiKeyProductAllowed(['spot'], STREAM_PRODUCT)).toBe(false);
    expect(apiKeyProductAllowed(['*'], STREAM_PRODUCT)).toBe(false);
  });

  it('missing presented product with a bound list fails closed', () => {
    expect(apiKeyProductAllowed(['trade'], undefined)).toBe(false);
    expect(apiKeyProductAllowed(['trade'], null)).toBe(false);
    expect(apiKeyProductAllowed(['trade'], '')).toBe(false);
  });
});
