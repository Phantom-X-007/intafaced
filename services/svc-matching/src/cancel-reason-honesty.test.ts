import { describe, expect, it } from 'vitest';
import {
  cancelReasonCatalogBoardCard,
  cancelReasonCatalogStatusLine,
  parseCancelReasonCatalogStatusLine,
  cancelReasonCatalogStatusLineMatches,
  cancelReasonCatalogStatusLineConsistent,
  cancelReasonCatalogExportHeader,
  cancelReasonCatalogExportLines,
  cancelReasonCatalogExportText,
  isDeclaredCancelReason,
  CANCEL_REASONS,
} from './cancel-reason-honesty.js';

describe('L3 wave192 cancel-reason catalog honesty', () => {
  it('cancel reason catalog boards', () => {
    expect(CANCEL_REASONS).toEqual(['requested', 'self_trade_prevention', 'ioc_remainder', 'market_remainder', 'trigger_rejected']);
    expect(cancelReasonCatalogBoardCard()).toEqual({
      reasons: 5,
      hasRequested: 1,
      hasStp: 1,
      hasIocRemainder: 1,
      hasTriggerRejected: 1,
    });
    expect(cancelReasonCatalogStatusLine()).toBe('reasons=5 requested=1 stp=1 ioc_remainder=1 trigger_rejected=1');
    expect(cancelReasonCatalogStatusLineMatches()).toBe(true);
    expect(cancelReasonCatalogStatusLineConsistent(cancelReasonCatalogStatusLine())).toBe(true);
    expect(cancelReasonCatalogExportText().startsWith(cancelReasonCatalogExportHeader())).toBe(true);
    expect(cancelReasonCatalogExportLines()).toEqual([...CANCEL_REASONS]);
    expect(isDeclaredCancelReason('self_trade_prevention')).toBe(true);
    expect(isDeclaredCancelReason('admin_force')).toBe(false);
    expect(parseCancelReasonCatalogStatusLine('nope')).toBeNull();
  });
});
