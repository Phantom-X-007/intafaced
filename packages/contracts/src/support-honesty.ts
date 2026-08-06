/**
 * Contracts L3 — pure support ticket honesty boards (no service I/O).
 *
 * Shapes mirror support.ts ticket status / category enums.
 * No money: refunds are out of scope here.
 */

export const SUPPORT_TICKET_STATUSES = ['open', 'pending', 'resolved', 'closed'] as const;
export type SupportTicketStatusId = (typeof SUPPORT_TICKET_STATUSES)[number];

export const SUPPORT_TICKET_CATEGORIES = ['account', 'trading', 'deposit_withdraw', 'other'] as const;
export type SupportTicketCategoryId = (typeof SUPPORT_TICKET_CATEGORIES)[number];

export type SupportTicketBoardInput = {
  readonly status: SupportTicketStatusId;
  readonly category: SupportTicketCategoryId;
  readonly assigneeId: string | null;
};

/** L3 — status histogram. */
export function supportStatusHistogram(
  tickets: readonly SupportTicketBoardInput[],
): Readonly<Record<SupportTicketStatusId, number>> {
  const out: Record<SupportTicketStatusId, number> = {
    open: 0,
    pending: 0,
    resolved: 0,
    closed: 0,
  };
  for (const t of tickets) {
    out[t.status] += 1;
  }
  return out;
}

/** L3 — category histogram. */
export function supportCategoryHistogram(
  tickets: readonly SupportTicketBoardInput[],
): Readonly<Record<SupportTicketCategoryId, number>> {
  const out: Record<SupportTicketCategoryId, number> = {
    account: 0,
    trading: 0,
    deposit_withdraw: 0,
    other: 0,
  };
  for (const t of tickets) {
    out[t.category] += 1;
  }
  return out;
}

/** L3 — assigned vs unassigned. */
export function supportAssigneeSplit(tickets: readonly SupportTicketBoardInput[]): {
  readonly assigned: number;
  readonly unassigned: number;
} {
  let assigned = 0;
  let unassigned = 0;
  for (const t of tickets) {
    if (t.assigneeId == null) unassigned += 1;
    else assigned += 1;
  }
  return { assigned, unassigned };
}

/** L3 — board card. */
export function supportTicketBoardCard(tickets: readonly SupportTicketBoardInput[]): {
  readonly tickets: number;
  readonly open: number;
  readonly pending: number;
  readonly resolved: number;
  readonly closed: number;
  readonly assigned: number;
  readonly unassigned: number;
} {
  const h = supportStatusHistogram(tickets);
  const a = supportAssigneeSplit(tickets);
  return {
    tickets: tickets.length,
    open: h.open,
    pending: h.pending,
    resolved: h.resolved,
    closed: h.closed,
    assigned: a.assigned,
    unassigned: a.unassigned,
  };
}

/** L3 — status line. */
export function supportTicketStatusLine(tickets: readonly SupportTicketBoardInput[]): string {
  const c = supportTicketBoardCard(tickets);
  return `tickets=${c.tickets} open=${c.open} pending=${c.pending} resolved=${c.resolved} closed=${c.closed} assigned=${c.assigned} unassigned=${c.unassigned}`;
}

/** L3 — parse status. Invalid → null. */
export function parseSupportTicketStatusLine(line: string): {
  readonly tickets: number;
  readonly open: number;
  readonly pending: number;
  readonly resolved: number;
  readonly closed: number;
  readonly assigned: number;
  readonly unassigned: number;
} | null {
  const m = line
    .trim()
    .match(
      /^tickets=(\d+) open=(\d+) pending=(\d+) resolved=(\d+) closed=(\d+) assigned=(\d+) unassigned=(\d+)$/,
    );
  if (!m) return null;
  return {
    tickets: Number(m[1]),
    open: Number(m[2]),
    pending: Number(m[3]),
    resolved: Number(m[4]),
    closed: Number(m[5]),
    assigned: Number(m[6]),
    unassigned: Number(m[7]),
  };
}

/** L3 — true when status matches. */
export function supportTicketStatusLineMatches(tickets: readonly SupportTicketBoardInput[]): boolean {
  const p = parseSupportTicketStatusLine(supportTicketStatusLine(tickets));
  if (!p) return false;
  const c = supportTicketBoardCard(tickets);
  return (
    p.tickets === c.tickets &&
    p.open === c.open &&
    p.pending === c.pending &&
    p.resolved === c.resolved &&
    p.closed === c.closed &&
    p.assigned === c.assigned &&
    p.unassigned === c.unassigned
  );
}

/** L3 — true when open+pending+resolved+closed equals tickets and assigned+unassigned equals tickets. */
export function supportTicketStatusLineConsistent(line: string): boolean {
  const p = parseSupportTicketStatusLine(line);
  if (!p) return false;
  return (
    p.tickets === p.open + p.pending + p.resolved + p.closed &&
    p.tickets === p.assigned + p.unassigned
  );
}

/** L3 — export header. */
export function supportTicketExportHeader(): string {
  return 'tickets,open,pending,resolved,closed,assigned,unassigned';
}

/** L3 — export line. */
export function supportTicketExportLine(tickets: readonly SupportTicketBoardInput[]): string {
  const c = supportTicketBoardCard(tickets);
  return `${c.tickets},${c.open},${c.pending},${c.resolved},${c.closed},${c.assigned},${c.unassigned}`;
}

/** L3 — full export. */
export function supportTicketExportText(tickets: readonly SupportTicketBoardInput[]): string {
  return [supportTicketExportHeader(), supportTicketExportLine(tickets)].join('\n');
}

/** L3 — true when no open tickets. */
export function supportHasNoOpen(tickets: readonly SupportTicketBoardInput[]): boolean {
  return supportStatusHistogram(tickets).open === 0;
}

/** L3 — ticket count in inclusive range. */
export function supportTicketCountInRange(
  tickets: readonly SupportTicketBoardInput[],
  min: number,
  max: number,
): boolean {
  if (min > max) return false;
  const n = tickets.length;
  return n >= min && n <= max;
}

/** L3 — catalog sizes (mirror support.ts enums). */
export function supportCatalogBoardCard(): {
  readonly statuses: number;
  readonly categories: number;
} {
  return {
    statuses: SUPPORT_TICKET_STATUSES.length,
    categories: SUPPORT_TICKET_CATEGORIES.length,
  };
}

/** L3 — catalog status line. */
export function supportCatalogStatusLine(): string {
  const c = supportCatalogBoardCard();
  return `statuses=${c.statuses} categories=${c.categories}`;
}

/** L3 — parse catalog status. */
export function parseSupportCatalogStatusLine(
  line: string,
): { readonly statuses: number; readonly categories: number } | null {
  const m = line.trim().match(/^statuses=(\d+) categories=(\d+)$/);
  if (!m) return null;
  return { statuses: Number(m[1]), categories: Number(m[2]) };
}

/** L3 — true when catalog status matches. */
export function supportCatalogStatusLineMatches(): boolean {
  const p = parseSupportCatalogStatusLine(supportCatalogStatusLine());
  if (!p) return false;
  const c = supportCatalogBoardCard();
  return p.statuses === c.statuses && p.categories === c.categories;
}
