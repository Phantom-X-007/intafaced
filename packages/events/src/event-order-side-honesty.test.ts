import { describe, expect, it } from 'vitest';
import {
  eventOrderSideCatalogBoardCard,
  eventOrderSideCatalogStatusLine,
  parseEventOrderSideCatalogStatusLine,
  eventOrderSideCatalogStatusLineMatches,
  eventOrderSideCatalogStatusLineConsistent,
  eventOrderSideCatalogExportHeader,
  eventOrderSideCatalogExportLines,
  eventOrderSideCatalogExportText,
  isDeclaredEventOrderSide,
  EVENT_ORDER_SIDES,
} from './event-order-side-honesty.js';

describe('L3 wave232 event-order-side catalog honesty', () => {
  it('event order side catalog boards', () => {
    expect(EVENT_ORDER_SIDES).toEqual(['buy', 'sell']);
    expect(eventOrderSideCatalogBoardCard()).toEqual({
      sides: 2,
      hasBuy: 1,
      hasSell: 1,
    });
    expect(eventOrderSideCatalogStatusLine()).toBe('sides=2 buy=1 sell=1');
    expect(eventOrderSideCatalogStatusLineMatches()).toBe(true);
    expect(eventOrderSideCatalogStatusLineConsistent(eventOrderSideCatalogStatusLine())).toBe(true);
    expect(eventOrderSideCatalogExportText().startsWith(eventOrderSideCatalogExportHeader())).toBe(true);
    expect(eventOrderSideCatalogExportLines()).toEqual([...EVENT_ORDER_SIDES]);
    expect(isDeclaredEventOrderSide('buy')).toBe(true);
    expect(isDeclaredEventOrderSide('long')).toBe(false);
    expect(parseEventOrderSideCatalogStatusLine('nope')).toBeNull();
  });
});
