import { describe, expect, it } from 'vitest';
import {
  orderStatusCatalogBoardCard,
  orderStatusCatalogStatusLine,
  parseOrderStatusCatalogStatusLine,
  orderStatusCatalogStatusLineMatches,
  orderStatusCatalogStatusLineConsistent,
  orderStatusCatalogExportHeader,
  orderStatusCatalogExportLines,
  orderStatusCatalogExportText,
  isDeclaredOrderStatus,
  ORDER_STATUSES,
} from './order-status-honesty.js';

describe('L3 wave189 order-status catalog honesty', () => {
  it('order status catalog boards', () => {
    expect(ORDER_STATUSES).toEqual(['pending', 'open', 'filled', 'cancelled', 'rejected', 'expired']);
    expect(orderStatusCatalogBoardCard()).toEqual({
      statuses: 6,
      hasOpen: 1,
      hasFilled: 1,
      hasCancelled: 1,
      hasRejected: 1,
    });
    expect(orderStatusCatalogStatusLine()).toBe('statuses=6 open=1 filled=1 cancelled=1 rejected=1');
    expect(orderStatusCatalogStatusLineMatches()).toBe(true);
    expect(orderStatusCatalogStatusLineConsistent(orderStatusCatalogStatusLine())).toBe(true);
    expect(orderStatusCatalogExportText().startsWith(orderStatusCatalogExportHeader())).toBe(true);
    expect(orderStatusCatalogExportLines()).toEqual([...ORDER_STATUSES]);
    expect(isDeclaredOrderStatus('cancelled')).toBe(true);
    expect(isDeclaredOrderStatus('partial')).toBe(false);
    expect(parseOrderStatusCatalogStatusLine('nope')).toBeNull();
  });
});
