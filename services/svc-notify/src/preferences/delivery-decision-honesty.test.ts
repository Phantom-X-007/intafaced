import { describe, expect, it } from 'vitest';
import {
  deliveryActionHistogram,
  deliveryDecisionBoardCard,
  deliveryDecisionStatusLine,
  parseDeliveryDecisionStatusLine,
  deliveryDecisionStatusLineMatches,
  deliveryDecisionStatusLineConsistent,
  deliveryDecisionExportHeader,
  deliveryDecisionExportLine,
  deliveryDecisionExportText,
  deliveryHasNoMutedSkips,
  deliveryDecisionCountInRange,
  type DeliveryDecisionInput,
} from './delivery-decision-honesty.js';

describe('L3 wave80 delivery decision honesty', () => {
  it('empty and mixed decision boards', () => {
    const empty: readonly DeliveryDecisionInput[] = [];
    expect(deliveryDecisionBoardCard(empty).decisions).toBe(0);
    expect(deliveryDecisionStatusLineMatches(empty)).toBe(true);
    expect(deliveryDecisionStatusLineConsistent(deliveryDecisionStatusLine(empty))).toBe(true);
    expect(parseDeliveryDecisionStatusLine('nope')).toBeNull();

    const mixed: readonly DeliveryDecisionInput[] = [
      { action: 'send_now', channel: 'email' },
      { action: 'hold_digest', channel: 'push' },
      { action: 'skip_muted', channel: 'sms' },
      { action: 'inapp_only' },
      { action: 'send_now', channel: 'inapp' },
    ];
    expect(deliveryActionHistogram(mixed)).toEqual({
      send_now: 2,
      hold_digest: 1,
      skip_muted: 1,
      inapp_only: 1,
    });
    expect(deliveryDecisionBoardCard(mixed)).toEqual({
      decisions: 5,
      sendNow: 2,
      holdDigest: 1,
      skipMuted: 1,
      inappOnly: 1,
    });
    expect(deliveryDecisionStatusLine(mixed)).toBe('decisions=5 send_now=2 hold_digest=1 skip_muted=1 inapp_only=1');
    expect(deliveryDecisionStatusLineMatches(mixed)).toBe(true);
    expect(deliveryDecisionStatusLineConsistent(deliveryDecisionStatusLine(mixed))).toBe(true);
    expect(deliveryDecisionExportText(mixed).startsWith(deliveryDecisionExportHeader())).toBe(true);
    expect(deliveryDecisionExportLine(mixed)).toBe('5,2,1,1,1');
    expect(deliveryHasNoMutedSkips(mixed)).toBe(false);
    expect(deliveryDecisionCountInRange(mixed, 5, 5)).toBe(true);
    expect(deliveryDecisionCountInRange(mixed, 6, 1)).toBe(false);
  });
});
