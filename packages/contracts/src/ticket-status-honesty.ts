/**
 * Contracts L3 — pure support ticket status catalog honesty.
 *
 * Mirrors support.ts supportTicketStatusSchema: open | pending | resolved | closed.
 * No money / refund invent.
 */

export const TICKET_STATUSES = ['open', 'pending', 'resolved', 'closed'] as const;
export type TicketStatusId = (typeof TICKET_STATUSES)[number];

/** L3 — catalog board. */
export function ticketStatusCatalogBoardCard(): {
  readonly statuses: number;
  readonly hasOpen: number;
  readonly hasPending: number;
  readonly hasResolved: number;
  readonly hasClosed: number;
} {
  return {
    statuses: TICKET_STATUSES.length,
    hasOpen: TICKET_STATUSES.includes('open') ? 1 : 0,
    hasPending: TICKET_STATUSES.includes('pending') ? 1 : 0,
    hasResolved: TICKET_STATUSES.includes('resolved') ? 1 : 0,
    hasClosed: TICKET_STATUSES.includes('closed') ? 1 : 0,
  };
}

/** L3 — status line. */
export function ticketStatusCatalogStatusLine(): string {
  const c = ticketStatusCatalogBoardCard();
  return `statuses=${c.statuses} open=${c.hasOpen} pending=${c.hasPending} resolved=${c.hasResolved} closed=${c.hasClosed}`;
}

/** L3 — parse status. */
export function parseTicketStatusCatalogStatusLine(line: string): {
  readonly statuses: number;
  readonly open: number;
  readonly pending: number;
  readonly resolved: number;
  readonly closed: number;
} | null {
  const m = line.trim().match(/^statuses=(\d+) open=([01]) pending=([01]) resolved=([01]) closed=([01])$/);
  if (!m) return null;
  return {
    statuses: Number(m[1]),
    open: Number(m[2]),
    pending: Number(m[3]),
    resolved: Number(m[4]),
    closed: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function ticketStatusCatalogStatusLineMatches(): boolean {
  const p = parseTicketStatusCatalogStatusLine(ticketStatusCatalogStatusLine());
  if (!p) return false;
  const c = ticketStatusCatalogBoardCard();
  return (
    p.statuses === c.statuses &&
    p.open === c.hasOpen &&
    p.pending === c.hasPending &&
    p.resolved === c.hasResolved &&
    p.closed === c.hasClosed
  );
}

/** L3 — four statuses. */
export function ticketStatusCatalogStatusLineConsistent(line: string): boolean {
  const p = parseTicketStatusCatalogStatusLine(line);
  if (!p) return false;
  return p.statuses === 4 && p.open === 1 && p.pending === 1 && p.resolved === 1 && p.closed === 1;
}

/** L3 — export header. */
export function ticketStatusCatalogExportHeader(): string {
  return 'status';
}

/** L3 — export lines. */
export function ticketStatusCatalogExportLines(): readonly string[] {
  return [...TICKET_STATUSES];
}

/** L3 — full export. */
export function ticketStatusCatalogExportText(): string {
  return [ticketStatusCatalogExportHeader(), ...ticketStatusCatalogExportLines()].join('\n');
}

/** L3 — status declared. */
export function isDeclaredTicketStatus(status: string): boolean {
  return (TICKET_STATUSES as readonly string[]).includes(status);
}
