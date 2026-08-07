/**
 * Exchange-contract L3 — pure public order-status catalog honesty (structural only).
 *
 * Mirrors orderStatusSchema: open | closed | canceled | expired | rejected
 * (US spelling canceled — contract wire, not svc-trade cancelled).
 * Does not invent money fill amounts.
 */

export const PUBLIC_ORDER_STATUSES = ['open', 'closed', 'canceled', 'expired', 'rejected'] as const;
export type PublicOrderStatusId = (typeof PUBLIC_ORDER_STATUSES)[number];

/** L3 — catalog board. */
export function publicOrderStatusCatalogBoardCard(): {
  readonly statuses: number;
  readonly hasOpen: number;
  readonly hasClosed: number;
  readonly hasCanceled: number;
  readonly hasRejected: number;
} {
  return {
    statuses: PUBLIC_ORDER_STATUSES.length,
    hasOpen: PUBLIC_ORDER_STATUSES.includes('open') ? 1 : 0,
    hasClosed: PUBLIC_ORDER_STATUSES.includes('closed') ? 1 : 0,
    hasCanceled: PUBLIC_ORDER_STATUSES.includes('canceled') ? 1 : 0,
    hasRejected: PUBLIC_ORDER_STATUSES.includes('rejected') ? 1 : 0,
  };
}

/** L3 — status line. */
export function publicOrderStatusCatalogStatusLine(): string {
  const c = publicOrderStatusCatalogBoardCard();
  return `statuses=${c.statuses} open=${c.hasOpen} closed=${c.hasClosed} canceled=${c.hasCanceled} rejected=${c.hasRejected}`;
}

/** L3 — parse status. */
export function parsePublicOrderStatusCatalogStatusLine(line: string): {
  readonly statuses: number;
  readonly open: number;
  readonly closed: number;
  readonly canceled: number;
  readonly rejected: number;
} | null {
  const m = line.trim().match(/^statuses=(\d+) open=([01]) closed=([01]) canceled=([01]) rejected=([01])$/);
  if (!m) return null;
  return {
    statuses: Number(m[1]),
    open: Number(m[2]),
    closed: Number(m[3]),
    canceled: Number(m[4]),
    rejected: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function publicOrderStatusCatalogStatusLineMatches(): boolean {
  const p = parsePublicOrderStatusCatalogStatusLine(publicOrderStatusCatalogStatusLine());
  if (!p) return false;
  const c = publicOrderStatusCatalogBoardCard();
  return (
    p.statuses === c.statuses &&
    p.open === c.hasOpen &&
    p.closed === c.hasClosed &&
    p.canceled === c.hasCanceled &&
    p.rejected === c.hasRejected
  );
}

/** L3 — five public statuses; canceled (US) not cancelled. */
export function publicOrderStatusCatalogStatusLineConsistent(line: string): boolean {
  const p = parsePublicOrderStatusCatalogStatusLine(line);
  if (!p) return false;
  return p.statuses === 5 && p.open === 1 && p.closed === 1 && p.canceled === 1 && p.rejected === 1;
}

/** L3 — export header. */
export function publicOrderStatusCatalogExportHeader(): string {
  return 'public_order_status';
}

/** L3 — export lines. */
export function publicOrderStatusCatalogExportLines(): readonly string[] {
  return [...PUBLIC_ORDER_STATUSES];
}

/** L3 — full export. */
export function publicOrderStatusCatalogExportText(): string {
  return [publicOrderStatusCatalogExportHeader(), ...publicOrderStatusCatalogExportLines()].join('\n');
}

/** L3 — status declared. */
export function isDeclaredPublicOrderStatus(s: string): boolean {
  return (PUBLIC_ORDER_STATUSES as readonly string[]).includes(s);
}
