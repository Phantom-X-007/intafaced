import { describe, expect, it } from 'vitest';
import {
  ticketStatusCatalogBoardCard,
  ticketStatusCatalogStatusLine,
  parseTicketStatusCatalogStatusLine,
  ticketStatusCatalogStatusLineMatches,
  ticketStatusCatalogStatusLineConsistent,
  ticketStatusCatalogExportHeader,
  ticketStatusCatalogExportLines,
  ticketStatusCatalogExportText,
  isDeclaredTicketStatus,
  TICKET_STATUSES,
} from './ticket-status-honesty.js';

describe('L3 wave156 ticket status catalog honesty', () => {
  it('status catalog boards', () => {
    expect(TICKET_STATUSES).toEqual(['open', 'pending', 'resolved', 'closed']);
    expect(ticketStatusCatalogBoardCard()).toEqual({
      statuses: 4,
      hasOpen: 1,
      hasPending: 1,
      hasResolved: 1,
      hasClosed: 1,
    });
    expect(ticketStatusCatalogStatusLine()).toBe('statuses=4 open=1 pending=1 resolved=1 closed=1');
    expect(ticketStatusCatalogStatusLineMatches()).toBe(true);
    expect(ticketStatusCatalogStatusLineConsistent(ticketStatusCatalogStatusLine())).toBe(true);
    expect(ticketStatusCatalogExportText().startsWith(ticketStatusCatalogExportHeader())).toBe(true);
    expect(ticketStatusCatalogExportLines()).toEqual([...TICKET_STATUSES]);
    expect(isDeclaredTicketStatus('resolved')).toBe(true);
    expect(isDeclaredTicketStatus('archived')).toBe(false);
    expect(parseTicketStatusCatalogStatusLine('nope')).toBeNull();
  });
});
