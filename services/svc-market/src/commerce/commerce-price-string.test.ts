import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatAmount, parseAmount, MoneyError } from '@intafaced/ledger-client';
import { describe, expect, it } from 'vitest';
import { decimalPriceFromDriver, purchasePriceTermsMatch } from './commerce-price.js';

/**
 * Driver numeric must be a decimal string. String(0.1) is IEEE-rounded and
 * must not be parseAmount'd. claimPurchase must not terms-match on that float.
 */

const here = dirname(fileURLToPath(import.meta.url));

describe('listing/purchase price is a decimal string', () => {
  it('proves the IEEE door: String(0.1) then parseAmount would coerce', () => {
    expect(String(0.1)).toBe('0.1');
    expect(formatAmount(parseAmount(String(0.1)))).toBe('0.1');
  });

  it('throws when the driver yields JS number 0.1 — does not coerce', () => {
    expect(() => decimalPriceFromDriver(0.1)).toThrow(MoneyError);
    expect(() => decimalPriceFromDriver(0.1)).toThrow(/decimal string, got number/);
  });

  it('accepts a decimal string and canonicalises', () => {
    expect(decimalPriceFromDriver('0.1')).toBe('0.1');
    expect(decimalPriceFromDriver('25.50')).toBe('25.5');
  });

  it('claimPurchase termsMatch does not match on rounded float 0.1', () => {
    expect(purchasePriceTermsMatch(0.1, '0.1')).toBe(false);
    expect(purchasePriceTermsMatch('0.1', '0.1')).toBe(true);
    expect(purchasePriceTermsMatch('0.10', '0.1')).toBe(true);
    expect(purchasePriceTermsMatch('0.2', '0.1')).toBe(false);
  });

  it('mappers and claimPurchase use the helper — never String(row.price)', () => {
    const src = readFileSync(join(here, 'commerce-service.ts'), 'utf8');
    expect(src).not.toContain('parseAmount(String(row.price))');
    expect(src).not.toContain('String(row.price)');
    expect(src).toContain('purchasePriceTermsMatch(row.price, input.price)');
    expect(src).toContain('decimalPriceFromDriver(row.price)');
  });
});
