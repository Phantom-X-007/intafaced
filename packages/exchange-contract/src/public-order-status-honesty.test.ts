import { describe, expect, it } from 'vitest';
import {
  publicOrderStatusCatalogBoardCard,
  publicOrderStatusCatalogStatusLine,
  parsePublicOrderStatusCatalogStatusLine,
  publicOrderStatusCatalogStatusLineMatches,
  publicOrderStatusCatalogStatusLineConsistent,
  publicOrderStatusCatalogExportHeader,
  publicOrderStatusCatalogExportLines,
  publicOrderStatusCatalogExportText,
  isDeclaredPublicOrderStatus,
  PUBLIC_ORDER_STATUSES,
} from './public-order-status-honesty.js';

describe('L3 wave200 public-order-status catalog honesty', () => {
  it('public order status catalog boards', () => {
    expect(PUBLIC_ORDER_STATUSES).toEqual(['open', 'closed', 'canceled', 'expired', 'rejected']);
    expect(publicOrderStatusCatalogBoardCard()).toEqual({
      statuses: 5,
      hasOpen: 1,
      hasClosed: 1,
      hasCanceled: 1,
      hasRejected: 1,
    });
    expect(publicOrderStatusCatalogStatusLine()).toBe('statuses=5 open=1 closed=1 canceled=1 rejected=1');
    expect(publicOrderStatusCatalogStatusLineMatches()).toBe(true);
    expect(publicOrderStatusCatalogStatusLineConsistent(publicOrderStatusCatalogStatusLine())).toBe(true);
    expect(publicOrderStatusCatalogExportText().startsWith(publicOrderStatusCatalogExportHeader())).toBe(true);
    expect(publicOrderStatusCatalogExportLines()).toEqual([...PUBLIC_ORDER_STATUSES]);
    expect(isDeclaredPublicOrderStatus('canceled')).toBe(true);
    expect(isDeclaredPublicOrderStatus('cancelled')).toBe(false);
    expect(parsePublicOrderStatusCatalogStatusLine('nope')).toBeNull();
  });
});
