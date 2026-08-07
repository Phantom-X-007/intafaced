import { describe, expect, it } from 'vitest';
import {
  eventLiquidityRoleCatalogBoardCard,
  eventLiquidityRoleCatalogStatusLine,
  parseEventLiquidityRoleCatalogStatusLine,
  eventLiquidityRoleCatalogStatusLineMatches,
  eventLiquidityRoleCatalogStatusLineConsistent,
  eventLiquidityRoleCatalogExportHeader,
  eventLiquidityRoleCatalogExportLines,
  eventLiquidityRoleCatalogExportText,
  isDeclaredEventLiquidityRole,
  EVENT_LIQUIDITY_ROLES,
} from './event-liquidity-role-honesty.js';

describe('L3 wave231 event-liquidity-role catalog honesty', () => {
  it('event liquidity role catalog boards', () => {
    expect(EVENT_LIQUIDITY_ROLES).toEqual(['maker', 'taker']);
    expect(eventLiquidityRoleCatalogBoardCard()).toEqual({
      roles: 2,
      hasMaker: 1,
      hasTaker: 1,
    });
    expect(eventLiquidityRoleCatalogStatusLine()).toBe('roles=2 maker=1 taker=1');
    expect(eventLiquidityRoleCatalogStatusLineMatches()).toBe(true);
    expect(eventLiquidityRoleCatalogStatusLineConsistent(eventLiquidityRoleCatalogStatusLine())).toBe(true);
    expect(eventLiquidityRoleCatalogExportText().startsWith(eventLiquidityRoleCatalogExportHeader())).toBe(true);
    expect(eventLiquidityRoleCatalogExportLines()).toEqual([...EVENT_LIQUIDITY_ROLES]);
    expect(isDeclaredEventLiquidityRole('maker')).toBe(true);
    expect(isDeclaredEventLiquidityRole('both')).toBe(false);
    expect(parseEventLiquidityRoleCatalogStatusLine('nope')).toBeNull();
  });
});
