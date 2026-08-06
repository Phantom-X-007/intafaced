import { describe, expect, it } from 'vitest';
import {
  supportStatusHistogram,
  supportCategoryHistogram,
  supportAssigneeSplit,
  supportTicketBoardCard,
  supportTicketStatusLine,
  parseSupportTicketStatusLine,
  supportTicketStatusLineMatches,
  supportTicketStatusLineConsistent,
  supportTicketExportHeader,
  supportTicketExportLine,
  supportTicketExportText,
  supportHasNoOpen,
  supportTicketCountInRange,
  supportCatalogBoardCard,
  supportCatalogStatusLine,
  parseSupportCatalogStatusLine,
  supportCatalogStatusLineMatches,
  SUPPORT_TICKET_STATUSES,
  SUPPORT_TICKET_CATEGORIES,
  type SupportTicketBoardInput,
} from './support-honesty.js';

describe('L3 wave70 support ticket honesty', () => {
  it('empty and mixed ticket boards', () => {
    const empty: readonly SupportTicketBoardInput[] = [];
    expect(supportTicketBoardCard(empty).tickets).toBe(0);
    expect(supportHasNoOpen(empty)).toBe(true);
    expect(supportTicketStatusLineMatches(empty)).toBe(true);
    expect(supportTicketStatusLineConsistent(supportTicketStatusLine(empty))).toBe(true);
    expect(parseSupportTicketStatusLine('nope')).toBeNull();

    const mixed: readonly SupportTicketBoardInput[] = [
      { status: 'open', category: 'account', assigneeId: null },
      { status: 'pending', category: 'trading', assigneeId: 'op-1' },
      { status: 'resolved', category: 'other', assigneeId: 'op-1' },
      { status: 'closed', category: 'deposit_withdraw', assigneeId: null },
    ];
    expect(supportStatusHistogram(mixed)).toEqual({
      open: 1,
      pending: 1,
      resolved: 1,
      closed: 1,
    });
    expect(supportCategoryHistogram(mixed).trading).toBe(1);
    expect(supportAssigneeSplit(mixed)).toEqual({ assigned: 2, unassigned: 2 });
    expect(supportTicketStatusLine(mixed)).toBe('tickets=4 open=1 pending=1 resolved=1 closed=1 assigned=2 unassigned=2');
    expect(supportTicketStatusLineMatches(mixed)).toBe(true);
    expect(supportTicketStatusLineConsistent(supportTicketStatusLine(mixed))).toBe(true);
    expect(supportTicketExportText(mixed).startsWith(supportTicketExportHeader())).toBe(true);
    expect(supportTicketExportLine(mixed)).toBe('4,1,1,1,1,2,2');
    expect(supportHasNoOpen(mixed)).toBe(false);
    expect(supportTicketCountInRange(mixed, 4, 4)).toBe(true);
    expect(supportTicketCountInRange(mixed, 5, 1)).toBe(false);
  });

  it('catalog sizes match support enums', () => {
    expect(SUPPORT_TICKET_STATUSES).toHaveLength(4);
    expect(SUPPORT_TICKET_CATEGORIES).toHaveLength(4);
    expect(supportCatalogBoardCard()).toEqual({ statuses: 4, categories: 4 });
    expect(supportCatalogStatusLineMatches()).toBe(true);
    expect(parseSupportCatalogStatusLine(supportCatalogStatusLine())).toEqual({
      statuses: 4,
      categories: 4,
    });
    expect(parseSupportCatalogStatusLine('nope')).toBeNull();
  });
});
