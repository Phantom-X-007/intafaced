import { describe, expect, it } from 'vitest';
import {
  publicOrderTypeCatalogBoardCard,
  publicOrderTypeCatalogStatusLine,
  parsePublicOrderTypeCatalogStatusLine,
  publicOrderTypeCatalogStatusLineMatches,
  publicOrderTypeCatalogStatusLineConsistent,
  publicOrderTypeCatalogExportHeader,
  publicOrderTypeCatalogExportLines,
  publicOrderTypeCatalogExportText,
  isDeclaredPublicOrderType,
  PUBLIC_ORDER_TYPES,
} from './public-order-type-honesty.js';

describe('L3 wave195 public-order-type catalog honesty', () => {
  it('public order type catalog boards', () => {
    expect(PUBLIC_ORDER_TYPES).toEqual(['market', 'limit', 'stop', 'stop_limit', 'take_profit']);
    expect(publicOrderTypeCatalogBoardCard()).toEqual({
      types: 5,
      hasMarket: 1,
      hasLimit: 1,
      hasStop: 1,
      hasStopLimit: 1,
      hasTakeProfit: 1,
    });
    expect(publicOrderTypeCatalogStatusLine()).toBe('types=5 market=1 limit=1 stop=1 stop_limit=1 take_profit=1');
    expect(publicOrderTypeCatalogStatusLineMatches()).toBe(true);
    expect(publicOrderTypeCatalogStatusLineConsistent(publicOrderTypeCatalogStatusLine())).toBe(true);
    expect(publicOrderTypeCatalogExportText().startsWith(publicOrderTypeCatalogExportHeader())).toBe(true);
    expect(publicOrderTypeCatalogExportLines()).toEqual([...PUBLIC_ORDER_TYPES]);
    expect(isDeclaredPublicOrderType('take_profit')).toBe(true);
    expect(isDeclaredPublicOrderType('iceberg')).toBe(false);
    expect(parsePublicOrderTypeCatalogStatusLine('nope')).toBeNull();
  });
});
