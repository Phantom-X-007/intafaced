import { describe, expect, it } from 'vitest';
import {
  orderSideCatalogBoardCard,
  orderSideCatalogStatusLine,
  parseOrderSideCatalogStatusLine,
  orderSideCatalogStatusLineMatches,
  orderSideCatalogStatusLineConsistent,
  orderSideCatalogExportHeader,
  orderSideCatalogExportLines,
  orderSideCatalogExportText,
  isDeclaredOrderSide,
  ORDER_SIDES,
} from './order-side-honesty.js';

describe('L3 wave183 order-side catalog honesty', () => {
  it('order side catalog boards', () => {
    expect(ORDER_SIDES).toEqual(['buy', 'sell']);
    expect(orderSideCatalogBoardCard()).toEqual({
      sides: 2,
      hasBuy: 1,
      hasSell: 1,
    });
    expect(orderSideCatalogStatusLine()).toBe('sides=2 buy=1 sell=1');
    expect(orderSideCatalogStatusLineMatches()).toBe(true);
    expect(orderSideCatalogStatusLineConsistent(orderSideCatalogStatusLine())).toBe(true);
    expect(orderSideCatalogExportText().startsWith(orderSideCatalogExportHeader())).toBe(true);
    expect(orderSideCatalogExportLines()).toEqual([...ORDER_SIDES]);
    expect(isDeclaredOrderSide('buy')).toBe(true);
    expect(isDeclaredOrderSide('short')).toBe(false);
    expect(parseOrderSideCatalogStatusLine('nope')).toBeNull();
  });
});
