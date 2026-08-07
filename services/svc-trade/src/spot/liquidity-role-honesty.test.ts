import { describe, expect, it } from 'vitest';
import {
  liquidityRoleCatalogBoardCard,
  liquidityRoleCatalogStatusLine,
  parseLiquidityRoleCatalogStatusLine,
  liquidityRoleCatalogStatusLineMatches,
  liquidityRoleCatalogStatusLineConsistent,
  liquidityRoleCatalogExportHeader,
  liquidityRoleCatalogExportLines,
  liquidityRoleCatalogExportText,
  isDeclaredLiquidityRole,
  LIQUIDITY_ROLES,
} from './liquidity-role-honesty.js';

describe('L3 wave187 liquidity-role catalog honesty', () => {
  it('liquidity role catalog boards', () => {
    expect(LIQUIDITY_ROLES).toEqual(['maker', 'taker']);
    expect(liquidityRoleCatalogBoardCard()).toEqual({
      roles: 2,
      hasMaker: 1,
      hasTaker: 1,
    });
    expect(liquidityRoleCatalogStatusLine()).toBe('roles=2 maker=1 taker=1');
    expect(liquidityRoleCatalogStatusLineMatches()).toBe(true);
    expect(liquidityRoleCatalogStatusLineConsistent(liquidityRoleCatalogStatusLine())).toBe(true);
    expect(liquidityRoleCatalogExportText().startsWith(liquidityRoleCatalogExportHeader())).toBe(true);
    expect(liquidityRoleCatalogExportLines()).toEqual([...LIQUIDITY_ROLES]);
    expect(isDeclaredLiquidityRole('maker')).toBe(true);
    expect(isDeclaredLiquidityRole('hybrid')).toBe(false);
    expect(parseLiquidityRoleCatalogStatusLine('nope')).toBeNull();
  });
});
