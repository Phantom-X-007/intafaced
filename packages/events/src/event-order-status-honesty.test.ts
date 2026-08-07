import { describe, expect, it } from 'vitest';
import {
  eventOrderStatusCatalogBoardCard,
  eventOrderStatusCatalogStatusLine,
  parseEventOrderStatusCatalogStatusLine,
  eventOrderStatusCatalogStatusLineMatches,
  eventOrderStatusCatalogStatusLineConsistent,
  eventOrderStatusCatalogExportHeader,
  eventOrderStatusCatalogExportLines,
  eventOrderStatusCatalogExportText,
  isDeclaredEventOrderStatus,
  EVENT_ORDER_STATUSES,
} from './event-order-status-honesty.js';

describe('L3 wave230 event-order-status catalog honesty', () => {
  it('event order status catalog boards', () => {
    expect(EVENT_ORDER_STATUSES).toEqual(['pending', 'open', 'filled', 'cancelled', 'rejected', 'expired']);
    expect(eventOrderStatusCatalogBoardCard()).toEqual({
      statuses: 6,
      hasPending: 1,
      hasOpen: 1,
      hasFilled: 1,
      hasExpired: 1,
    });
    expect(eventOrderStatusCatalogStatusLine()).toBe('statuses=6 pending=1 open=1 filled=1 expired=1');
    expect(eventOrderStatusCatalogStatusLineMatches()).toBe(true);
    expect(eventOrderStatusCatalogStatusLineConsistent(eventOrderStatusCatalogStatusLine())).toBe(true);
    expect(eventOrderStatusCatalogExportText().startsWith(eventOrderStatusCatalogExportHeader())).toBe(true);
    expect(eventOrderStatusCatalogExportLines()).toEqual([...EVENT_ORDER_STATUSES]);
    expect(isDeclaredEventOrderStatus('filled')).toBe(true);
    expect(isDeclaredEventOrderStatus('canceled')).toBe(false);
    expect(parseEventOrderStatusCatalogStatusLine('nope')).toBeNull();
  });
});
