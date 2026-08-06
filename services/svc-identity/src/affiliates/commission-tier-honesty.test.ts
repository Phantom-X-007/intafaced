import { describe, expect, it } from 'vitest';
import { DEFAULT_ACCRUAL_TIERS } from './commission.js';
import {
  defaultTierCatalogBoardCard,
  defaultTierCatalogStatusLine,
  parseDefaultTierCatalogStatusLine,
  defaultTierCatalogStatusLineMatches,
  defaultTierCatalogStatusLineConsistent,
  defaultTierCatalogExportHeader,
  defaultTierCatalogExportLines,
  defaultTierCatalogExportText,
  isDecimalRateString,
  defaultTierRatesAreDecimalStrings,
} from './commission-tier-honesty.js';

describe('L3 wave113 commission default tier honesty', () => {
  it('default tiers structural boards', () => {
    expect(DEFAULT_ACCRUAL_TIERS).toHaveLength(3);
    expect(defaultTierCatalogBoardCard()).toEqual({
      tiers: 3,
      minHop: 0,
      maxHop: 2,
      hasHop0: 1,
    });
    expect(defaultTierCatalogStatusLine()).toBe('tiers=3 min_hop=0 max_hop=2 hop0=1');
    expect(defaultTierCatalogStatusLineMatches()).toBe(true);
    expect(defaultTierCatalogStatusLineConsistent(defaultTierCatalogStatusLine())).toBe(true);
    expect(defaultTierCatalogExportText().startsWith(defaultTierCatalogExportHeader())).toBe(true);
    expect(defaultTierCatalogExportLines()).toEqual(['0,0.10', '1,0.05', '2,0.02']);
    expect(defaultTierRatesAreDecimalStrings()).toBe(true);
    expect(isDecimalRateString('0.10')).toBe(true);
    expect(isDecimalRateString('1.5')).toBe(false);
    expect(parseDefaultTierCatalogStatusLine('nope')).toBeNull();
  });
});
