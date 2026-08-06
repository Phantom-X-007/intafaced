import { describe, expect, it } from 'vitest';
import {
  dispatchOutcomeCounts,
  dispatchReportBoardCard,
  dispatchReportStatusLine,
  dispatchReportStatusLineIsEmpty,
  parseDispatchReportStatusLine,
  dispatchReportStatusLineMatches,
  dispatchReportStatusLineConsistent,
  dispatchReportExportHeader,
  dispatchReportExportLine,
  dispatchReportExportText,
  dispatchAcceptedInRange,
  dispatchHasRetryable,
  type DispatchReportInput,
} from './dispatch-honesty.js';

describe('L3 wave57 dispatch report honesty', () => {
  const empty: DispatchReportInput = { notificationId: 'n1', outcomes: [], retry: false };

  const mixed: DispatchReportInput = {
    notificationId: 'n2',
    retry: true,
    outcomes: [
      { channel: 'inapp', status: 'accepted', code: null, detail: null, retryable: false },
      { channel: 'email', status: 'refused', code: 'channel.not_configured', detail: null, retryable: false },
      { channel: 'push', status: 'failed', code: null, detail: 'timeout', retryable: true },
    ],
  };

  it('empty and mixed boards', () => {
    expect(dispatchReportStatusLineIsEmpty(empty)).toBe(true);
    expect(dispatchReportStatusLineMatches(empty)).toBe(true);
    expect(dispatchOutcomeCounts(empty).accepted).toBe(0);
    expect(parseDispatchReportStatusLine('nope')).toBeNull();

    expect(dispatchReportBoardCard(mixed).accepted).toBe(1);
    expect(dispatchReportBoardCard(mixed).refused).toBe(1);
    expect(dispatchReportBoardCard(mixed).failed).toBe(1);
    expect(dispatchReportBoardCard(mixed).retryableCount).toBe(1);
    expect(dispatchReportStatusLine(mixed)).toBe('total=3 accepted=1 refused=1 failed=1 retry=1');
    expect(dispatchReportStatusLineMatches(mixed)).toBe(true);
    expect(dispatchReportStatusLineConsistent(dispatchReportStatusLine(mixed))).toBe(true);
    expect(dispatchReportExportText(mixed).startsWith(dispatchReportExportHeader())).toBe(true);
    expect(dispatchReportExportLine(mixed)).toContain('n2,3,1,1,1,1');
    expect(dispatchAcceptedInRange(mixed, 1, 1)).toBe(true);
    expect(dispatchAcceptedInRange(mixed, 2, 1)).toBe(false);
    expect(dispatchHasRetryable(mixed)).toBe(true);
    expect(dispatchHasRetryable(empty)).toBe(false);
  });
});
