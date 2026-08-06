import { describe, expect, it } from 'vitest';
import {
  pendingSocketSplit,
  subscriptionReportBoardCard,
  subscriptionReportStatusLine,
  parseSubscriptionReportStatusLine,
  subscriptionReportStatusLineMatches,
  subscriptionReportStatusLineConsistent,
  subscriptionReportExportHeader,
  subscriptionReportExportLine,
  subscriptionReportExportText,
  subscriptionHasNoUndeclared,
  pendingCountInRange,
  type SubscriptionReportInput,
} from './subscription-honesty.js';

describe('L3 wave67 subscription report honesty', () => {
  it('empty and mixed pending boards', () => {
    const empty: SubscriptionReportInput = { subscriptionCount: 2, pending: [] };
    expect(subscriptionReportBoardCard(empty).pending).toBe(0);
    expect(subscriptionHasNoUndeclared(empty)).toBe(true);
    expect(subscriptionReportStatusLineMatches(empty)).toBe(true);
    expect(parseSubscriptionReportStatusLine('nope')).toBeNull();

    const mixed: SubscriptionReportInput = {
      subscriptionCount: 3,
      pending: [
        { event: 'e1', subject: 's1', durable: 'd1', reason: 'no publisher', socket: 'socket.a' },
        { event: 'e2', subject: 's2', durable: 'd2', reason: 'orphan', socket: null },
      ],
    };
    expect(pendingSocketSplit(mixed)).toEqual({ declared: 1, undeclared: 1 });
    expect(subscriptionReportStatusLine(mixed)).toBe('subs=3 pending=2 declared=1 undeclared=1');
    expect(subscriptionReportStatusLineMatches(mixed)).toBe(true);
    expect(subscriptionReportStatusLineConsistent(subscriptionReportStatusLine(mixed))).toBe(true);
    expect(subscriptionReportExportText(mixed).startsWith(subscriptionReportExportHeader())).toBe(true);
    expect(subscriptionReportExportLine(mixed)).toBe('3,2,1,1');
    expect(subscriptionHasNoUndeclared(mixed)).toBe(false);
    expect(pendingCountInRange(mixed, 2, 2)).toBe(true);
    expect(pendingCountInRange(mixed, 3, 1)).toBe(false);
  });
});
