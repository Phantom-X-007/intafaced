/**
 * Trade L3 — pure order-status catalog honesty (structural only).
 *
 * Mirrors types.ts OrderStatus: pending | open | filled | cancelled | rejected | expired.
 * Does not invent money fill amounts.
 */

export const ORDER_STATUSES = ['pending', 'open', 'filled', 'cancelled', 'rejected', 'expired'] as const;
export type OrderStatusId = (typeof ORDER_STATUSES)[number];

/** L3 — catalog board. */
export function orderStatusCatalogBoardCard(): {
  readonly statuses: number;
  readonly hasOpen: number;
  readonly hasFilled: number;
  readonly hasCancelled: number;
  readonly hasRejected: number;
} {
  return {
    statuses: ORDER_STATUSES.length,
    hasOpen: ORDER_STATUSES.includes('open') ? 1 : 0,
    hasFilled: ORDER_STATUSES.includes('filled') ? 1 : 0,
    hasCancelled: ORDER_STATUSES.includes('cancelled') ? 1 : 0,
    hasRejected: ORDER_STATUSES.includes('rejected') ? 1 : 0,
  };
}

/** L3 — status line. */
export function orderStatusCatalogStatusLine(): string {
  const c = orderStatusCatalogBoardCard();
  return `statuses=${c.statuses} open=${c.hasOpen} filled=${c.hasFilled} cancelled=${c.hasCancelled} rejected=${c.hasRejected}`;
}

/** L3 — parse status. */
export function parseOrderStatusCatalogStatusLine(line: string): {
  readonly statuses: number;
  readonly open: number;
  readonly filled: number;
  readonly cancelled: number;
  readonly rejected: number;
} | null {
  const m = line.trim().match(/^statuses=(\d+) open=([01]) filled=([01]) cancelled=([01]) rejected=([01])$/);
  if (!m) return null;
  return {
    statuses: Number(m[1]),
    open: Number(m[2]),
    filled: Number(m[3]),
    cancelled: Number(m[4]),
    rejected: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function orderStatusCatalogStatusLineMatches(): boolean {
  const p = parseOrderStatusCatalogStatusLine(orderStatusCatalogStatusLine());
  if (!p) return false;
  const c = orderStatusCatalogBoardCard();
  return (
    p.statuses === c.statuses &&
    p.open === c.hasOpen &&
    p.filled === c.hasFilled &&
    p.cancelled === c.hasCancelled &&
    p.rejected === c.hasRejected
  );
}

/** L3 — six statuses; cancelled present (lets user out). */
export function orderStatusCatalogStatusLineConsistent(line: string): boolean {
  const p = parseOrderStatusCatalogStatusLine(line);
  if (!p) return false;
  return p.statuses === 6 && p.open === 1 && p.filled === 1 && p.cancelled === 1 && p.rejected === 1;
}

/** L3 — export header. */
export function orderStatusCatalogExportHeader(): string {
  return 'order_status';
}

/** L3 — export lines. */
export function orderStatusCatalogExportLines(): readonly string[] {
  return [...ORDER_STATUSES];
}

/** L3 — full export. */
export function orderStatusCatalogExportText(): string {
  return [orderStatusCatalogExportHeader(), ...orderStatusCatalogExportLines()].join('\n');
}

/** L3 — status declared. */
export function isDeclaredOrderStatus(s: string): boolean {
  return (ORDER_STATUSES as readonly string[]).includes(s);
}
