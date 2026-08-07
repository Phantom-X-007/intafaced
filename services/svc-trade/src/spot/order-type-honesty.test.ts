import { describe, expect, it } from 'vitest';
import {
  orderTypeCatalogBoardCard,
  orderTypeCatalogStatusLine,
  parseOrderTypeCatalogStatusLine,
  orderTypeCatalogStatusLineMatches,
  orderTypeCatalogStatusLineConsistent,
  orderTypeCatalogExportHeader,
  orderTypeCatalogExportLines,
  orderTypeCatalogExportText,
  isDeclaredOrderType,
  ORDER_TYPES,
} from './order-type-honesty.js';

describe('L3 wave186 order-type catalog honesty', () => {
  it('order type catalog boards', () => {
    expect(ORDER_TYPES).toEqual(['market', 'limit']);
    expect(orderTypeCatalogBoardCard()).toEqual({
      types: 2,
      hasMarket: 1,
      hasLimit: 1,
    });
    expect(orderTypeCatalogStatusLine()).toBe('types=2 market=1 limit=1');
    expect(orderTypeCatalogStatusLineMatches()).toBe(true);
    expect(orderTypeCatalogStatusLineConsistent(orderTypeCatalogStatusLine())).toBe(true);
    expect(orderTypeCatalogExportText().startsWith(orderTypeCatalogExportHeader())).toBe(true);
    expect(orderTypeCatalogExportLines()).toEqual([...ORDER_TYPES]);
    expect(isDeclaredOrderType('limit')).toBe(true);
    expect(isDeclaredOrderType('stop')).toBe(false);
    expect(parseOrderTypeCatalogStatusLine('nope')).toBeNull();
  });
});
