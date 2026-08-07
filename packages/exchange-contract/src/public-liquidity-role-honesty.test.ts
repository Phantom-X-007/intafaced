import { describe, expect, it } from 'vitest';
import {
  publicLiquidityRoleCatalogBoardCard,
  publicLiquidityRoleCatalogStatusLine,
  parsePublicLiquidityRoleCatalogStatusLine,
  publicLiquidityRoleCatalogStatusLineMatches,
  publicLiquidityRoleCatalogStatusLineConsistent,
  publicLiquidityRoleCatalogExportHeader,
  publicLiquidityRoleCatalogExportLines,
  publicLiquidityRoleCatalogExportText,
  isDeclaredPublicLiquidityRole,
  PUBLIC_LIQUIDITY_ROLES,
} from './public-liquidity-role-honesty.js';

describe('L3 wave207 public-liquidity-role catalog honesty', () => {
  it('public liquidity role catalog boards', () => {
    expect(PUBLIC_LIQUIDITY_ROLES).toEqual(['maker', 'taker']);
    expect(publicLiquidityRoleCatalogBoardCard()).toEqual({
      roles: 2,
      hasMaker: 1,
      hasTaker: 1,
    });
    expect(publicLiquidityRoleCatalogStatusLine()).toBe('roles=2 maker=1 taker=1');
    expect(publicLiquidityRoleCatalogStatusLineMatches()).toBe(true);
    expect(publicLiquidityRoleCatalogStatusLineConsistent(publicLiquidityRoleCatalogStatusLine())).toBe(true);
    expect(publicLiquidityRoleCatalogExportText().startsWith(publicLiquidityRoleCatalogExportHeader())).toBe(true);
    expect(publicLiquidityRoleCatalogExportLines()).toEqual([...PUBLIC_LIQUIDITY_ROLES]);
    expect(isDeclaredPublicLiquidityRole('taker')).toBe(true);
    expect(isDeclaredPublicLiquidityRole('hybrid')).toBe(false);
    expect(parsePublicLiquidityRoleCatalogStatusLine('nope')).toBeNull();
  });
});
