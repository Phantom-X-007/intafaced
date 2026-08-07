import { describe, expect, it } from 'vitest';
import {
  publicOrderSideCatalogBoardCard,
  publicOrderSideCatalogStatusLine,
  parsePublicOrderSideCatalogStatusLine,
  publicOrderSideCatalogStatusLineMatches,
  publicOrderSideCatalogStatusLineConsistent,
  publicOrderSideCatalogExportHeader,
  publicOrderSideCatalogExportLines,
  publicOrderSideCatalogExportText,
  isDeclaredPublicOrderSide,
  PUBLIC_ORDER_SIDES,
} from './public-order-side-honesty.js';

describe('L3 wave206 public-order-side catalog honesty', () => {
  it('public order side catalog boards', () => {
    expect(PUBLIC_ORDER_SIDES).toEqual(['buy', 'sell']);
    expect(publicOrderSideCatalogBoardCard()).toEqual({
      sides: 2,
      hasBuy: 1,
      hasSell: 1,
    });
    expect(publicOrderSideCatalogStatusLine()).toBe('sides=2 buy=1 sell=1');
    expect(publicOrderSideCatalogStatusLineMatches()).toBe(true);
    expect(publicOrderSideCatalogStatusLineConsistent(publicOrderSideCatalogStatusLine())).toBe(true);
    expect(publicOrderSideCatalogExportText().startsWith(publicOrderSideCatalogExportHeader())).toBe(true);
    expect(publicOrderSideCatalogExportLines()).toEqual([...PUBLIC_ORDER_SIDES]);
    expect(isDeclaredPublicOrderSide('sell')).toBe(true);
    expect(isDeclaredPublicOrderSide('long')).toBe(false);
    expect(parsePublicOrderSideCatalogStatusLine('nope')).toBeNull();
  });
});
