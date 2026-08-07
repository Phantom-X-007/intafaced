import { describe, expect, it } from 'vitest';
import {
  eventOrderTypeCatalogBoardCard,
  eventOrderTypeCatalogStatusLine,
  parseEventOrderTypeCatalogStatusLine,
  eventOrderTypeCatalogStatusLineMatches,
  eventOrderTypeCatalogStatusLineConsistent,
  eventOrderTypeCatalogExportHeader,
  eventOrderTypeCatalogExportLines,
  eventOrderTypeCatalogExportText,
  isDeclaredEventOrderType,
  EVENT_ORDER_TYPES,
} from './event-order-type-honesty.js';

describe('L3 wave226 event-order-type catalog honesty', () => {
  it('event order type catalog boards', () => {
    expect(EVENT_ORDER_TYPES).toEqual(['limit', 'market']);
    expect(eventOrderTypeCatalogBoardCard()).toEqual({
      types: 2,
      hasLimit: 1,
      hasMarket: 1,
    });
    expect(eventOrderTypeCatalogStatusLine()).toBe('types=2 limit=1 market=1');
    expect(eventOrderTypeCatalogStatusLineMatches()).toBe(true);
    expect(eventOrderTypeCatalogStatusLineConsistent(eventOrderTypeCatalogStatusLine())).toBe(true);
    expect(eventOrderTypeCatalogExportText().startsWith(eventOrderTypeCatalogExportHeader())).toBe(true);
    expect(eventOrderTypeCatalogExportLines()).toEqual([...EVENT_ORDER_TYPES]);
    expect(isDeclaredEventOrderType('limit')).toBe(true);
    expect(isDeclaredEventOrderType('stop')).toBe(false);
    expect(parseEventOrderTypeCatalogStatusLine('nope')).toBeNull();
  });
});
