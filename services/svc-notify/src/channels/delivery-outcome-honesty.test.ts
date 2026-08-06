import { describe, expect, it } from 'vitest';
import {
  deliveryOutcomeCatalogBoardCard,
  deliveryOutcomeCatalogStatusLine,
  parseDeliveryOutcomeCatalogStatusLine,
  deliveryOutcomeCatalogStatusLineMatches,
  deliveryOutcomeCatalogStatusLineConsistent,
  deliveryOutcomeListBoardCard,
  deliveryOutcomeListStatusLine,
  parseDeliveryOutcomeListStatusLine,
  deliveryOutcomeListStatusLineMatches,
  deliveryOutcomeListStatusLineConsistent,
  deliveryOutcomeListExportHeader,
  deliveryOutcomeListExportLine,
  deliveryOutcomeListExportText,
  isDeclaredDeliveryOutcome,
  DELIVERY_OUTCOMES,
  type DeliveryOutcomeBoardInput,
} from './delivery-outcome-honesty.js';

describe('L3 wave115 delivery outcome honesty', () => {
  it('catalog and list boards', () => {
    expect(DELIVERY_OUTCOMES).toEqual(['accepted', 'refused', 'failed']);
    expect(deliveryOutcomeCatalogBoardCard()).toEqual({
      outcomes: 3,
      hasAccepted: 1,
      hasRefused: 1,
      hasFailed: 1,
    });
    expect(deliveryOutcomeCatalogStatusLineMatches()).toBe(true);
    expect(deliveryOutcomeCatalogStatusLineConsistent(deliveryOutcomeCatalogStatusLine())).toBe(true);
    expect(isDeclaredDeliveryOutcome('accepted')).toBe(true);
    expect(isDeclaredDeliveryOutcome('delivered')).toBe(false);
    expect(parseDeliveryOutcomeCatalogStatusLine('nope')).toBeNull();

    const rows: readonly DeliveryOutcomeBoardInput[] = [
      { outcome: 'accepted', channel: 'email' },
      { outcome: 'refused', channel: 'sms' },
      { outcome: 'failed', channel: 'push' },
      { outcome: 'accepted', channel: 'inapp' },
    ];
    expect(deliveryOutcomeListBoardCard(rows)).toEqual({
      total: 4,
      accepted: 2,
      refused: 1,
      failed: 1,
    });
    expect(deliveryOutcomeListStatusLine(rows)).toBe('total=4 accepted=2 refused=1 failed=1');
    expect(deliveryOutcomeListStatusLineMatches(rows)).toBe(true);
    expect(deliveryOutcomeListStatusLineConsistent(deliveryOutcomeListStatusLine(rows))).toBe(true);
    expect(deliveryOutcomeListExportText(rows).startsWith(deliveryOutcomeListExportHeader())).toBe(true);
    expect(deliveryOutcomeListExportLine(rows)).toBe('4,2,1,1');
    expect(parseDeliveryOutcomeListStatusLine('nope')).toBeNull();
  });
});
