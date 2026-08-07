/**
 * Events L3 — pure event-order-status catalog honesty (structural only).
 *
 * Mirrors catalog.ts order status: pending | open | filled | cancelled | rejected | expired.
 * Does not invent matching, TIF, or trade product law.
 */

export const EVENT_ORDER_STATUSES = ['pending', 'open', 'filled', 'cancelled', 'rejected', 'expired'] as const;
export type EventOrderStatusId = (typeof EVENT_ORDER_STATUSES)[number];

/** L3 — catalog board. */
export function eventOrderStatusCatalogBoardCard(): {
  readonly statuses: number;
  readonly hasPending: number;
  readonly hasOpen: number;
  readonly hasFilled: number;
  readonly hasExpired: number;
} {
  return {
    statuses: EVENT_ORDER_STATUSES.length,
    hasPending: EVENT_ORDER_STATUSES.includes('pending') ? 1 : 0,
    hasOpen: EVENT_ORDER_STATUSES.includes('open') ? 1 : 0,
    hasFilled: EVENT_ORDER_STATUSES.includes('filled') ? 1 : 0,
    hasExpired: EVENT_ORDER_STATUSES.includes('expired') ? 1 : 0,
  };
}

/** L3 — status line. */
export function eventOrderStatusCatalogStatusLine(): string {
  const c = eventOrderStatusCatalogBoardCard();
  return `statuses=${c.statuses} pending=${c.hasPending} open=${c.hasOpen} filled=${c.hasFilled} expired=${c.hasExpired}`;
}

/** L3 — parse status. */
export function parseEventOrderStatusCatalogStatusLine(line: string): {
  readonly statuses: number;
  readonly pending: number;
  readonly open: number;
  readonly filled: number;
  readonly expired: number;
} | null {
  const m = line.trim().match(/^statuses=(\d+) pending=([01]) open=([01]) filled=([01]) expired=([01])$/);
  if (!m) return null;
  return {
    statuses: Number(m[1]),
    pending: Number(m[2]),
    open: Number(m[3]),
    filled: Number(m[4]),
    expired: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function eventOrderStatusCatalogStatusLineMatches(): boolean {
  const p = parseEventOrderStatusCatalogStatusLine(eventOrderStatusCatalogStatusLine());
  if (!p) return false;
  const c = eventOrderStatusCatalogBoardCard();
  return (
    p.statuses === c.statuses &&
    p.pending === c.hasPending &&
    p.open === c.hasOpen &&
    p.filled === c.hasFilled &&
    p.expired === c.hasExpired
  );
}

/** L3 — six statuses. */
export function eventOrderStatusCatalogStatusLineConsistent(line: string): boolean {
  const p = parseEventOrderStatusCatalogStatusLine(line);
  if (!p) return false;
  return p.statuses === 6 && p.pending === 1 && p.open === 1 && p.filled === 1 && p.expired === 1;
}

/** L3 — export header. */
export function eventOrderStatusCatalogExportHeader(): string {
  return 'event_order_status';
}

/** L3 — export lines. */
export function eventOrderStatusCatalogExportLines(): readonly string[] {
  return [...EVENT_ORDER_STATUSES];
}

/** L3 — full export. */
export function eventOrderStatusCatalogExportText(): string {
  return [eventOrderStatusCatalogExportHeader(), ...eventOrderStatusCatalogExportLines()].join('\n');
}

/** L3 — status declared. */
export function isDeclaredEventOrderStatus(status: string): boolean {
  return (EVENT_ORDER_STATUSES as readonly string[]).includes(status);
}
