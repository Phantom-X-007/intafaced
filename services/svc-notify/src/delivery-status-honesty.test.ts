import { describe, expect, it } from 'vitest';
import {
  deliveryStatusCatalogBoardCard,
  deliveryStatusCatalogStatusLine,
  parseDeliveryStatusCatalogStatusLine,
  deliveryStatusCatalogStatusLineMatches,
  deliveryStatusCatalogStatusLineConsistent,
  deliveryStatusCatalogExportHeader,
  deliveryStatusCatalogExportLines,
  deliveryStatusCatalogExportText,
  isDeclaredDeliveryStatus,
  DELIVERY_STATUSES,
} from './delivery-status-honesty.js';

describe('L3 wave165 delivery-status catalog honesty', () => {
  it('status catalog boards', () => {
    expect(DELIVERY_STATUSES).toEqual(['pending', 'accepted', 'refused', 'failed', 'abandoned']);
    expect(deliveryStatusCatalogBoardCard()).toEqual({
      statuses: 5,
      hasPending: 1,
      hasAccepted: 1,
      hasAbandoned: 1,
    });
    expect(deliveryStatusCatalogStatusLine()).toBe('statuses=5 pending=1 accepted=1 abandoned=1');
    expect(deliveryStatusCatalogStatusLineMatches()).toBe(true);
    expect(deliveryStatusCatalogStatusLineConsistent(deliveryStatusCatalogStatusLine())).toBe(true);
    expect(deliveryStatusCatalogExportText().startsWith(deliveryStatusCatalogExportHeader())).toBe(true);
    expect(deliveryStatusCatalogExportLines()).toEqual([...DELIVERY_STATUSES]);
    expect(isDeclaredDeliveryStatus('abandoned')).toBe(true);
    expect(isDeclaredDeliveryStatus('delivered')).toBe(false);
    expect(parseDeliveryStatusCatalogStatusLine('nope')).toBeNull();
  });
});
