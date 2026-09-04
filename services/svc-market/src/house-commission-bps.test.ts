import { describe, expect, it } from 'vitest';
import { marketHouseCommissionBpsSchema } from './house-commission-bps.js';

describe('MARKET_HOUSE_COMMISSION_BPS — blank is unset, not 0', () => {
  it('treats missing, empty, and whitespace as unset', () => {
    for (const raw of [undefined, null, '', ' ', '  ', '\t', '\n', ' \t\n ']) {
      expect(marketHouseCommissionBpsSchema.parse(raw)).toBeUndefined();
    }
  });

  it('keeps an explicit owner 0', () => {
    expect(marketHouseCommissionBpsSchema.parse('0')).toBe(0);
    expect(marketHouseCommissionBpsSchema.parse(0)).toBe(0);
  });

  it('parses a configured rate', () => {
    expect(marketHouseCommissionBpsSchema.parse('500')).toBe(500);
  });
});
