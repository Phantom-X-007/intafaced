/**
 * Notify L3 — pure delivery-row status catalog honesty.
 *
 * Mirrors router/store delivery status: pending | accepted | refused | failed | abandoned.
 * Complements delivery-outcome (accepted|refused|failed). Does not invent gateway I/O.
 */

export const DELIVERY_STATUSES = ['pending', 'accepted', 'refused', 'failed', 'abandoned'] as const;
export type DeliveryStatusId = (typeof DELIVERY_STATUSES)[number];

/** L3 — catalog board. */
export function deliveryStatusCatalogBoardCard(): {
  readonly statuses: number;
  readonly hasPending: number;
  readonly hasAccepted: number;
  readonly hasAbandoned: number;
} {
  return {
    statuses: DELIVERY_STATUSES.length,
    hasPending: DELIVERY_STATUSES.includes('pending') ? 1 : 0,
    hasAccepted: DELIVERY_STATUSES.includes('accepted') ? 1 : 0,
    hasAbandoned: DELIVERY_STATUSES.includes('abandoned') ? 1 : 0,
  };
}

/** L3 — status line. */
export function deliveryStatusCatalogStatusLine(): string {
  const c = deliveryStatusCatalogBoardCard();
  return `statuses=${c.statuses} pending=${c.hasPending} accepted=${c.hasAccepted} abandoned=${c.hasAbandoned}`;
}

/** L3 — parse status. */
export function parseDeliveryStatusCatalogStatusLine(line: string): {
  readonly statuses: number;
  readonly pending: number;
  readonly accepted: number;
  readonly abandoned: number;
} | null {
  const m = line.trim().match(/^statuses=(\d+) pending=([01]) accepted=([01]) abandoned=([01])$/);
  if (!m) return null;
  return {
    statuses: Number(m[1]),
    pending: Number(m[2]),
    accepted: Number(m[3]),
    abandoned: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function deliveryStatusCatalogStatusLineMatches(): boolean {
  const p = parseDeliveryStatusCatalogStatusLine(deliveryStatusCatalogStatusLine());
  if (!p) return false;
  const c = deliveryStatusCatalogBoardCard();
  return p.statuses === c.statuses && p.pending === c.hasPending && p.accepted === c.hasAccepted && p.abandoned === c.hasAbandoned;
}

/** L3 — five statuses. */
export function deliveryStatusCatalogStatusLineConsistent(line: string): boolean {
  const p = parseDeliveryStatusCatalogStatusLine(line);
  if (!p) return false;
  return p.statuses === 5 && p.pending === 1 && p.accepted === 1 && p.abandoned === 1;
}

/** L3 — export header. */
export function deliveryStatusCatalogExportHeader(): string {
  return 'status';
}

/** L3 — export lines. */
export function deliveryStatusCatalogExportLines(): readonly string[] {
  return [...DELIVERY_STATUSES];
}

/** L3 — full export. */
export function deliveryStatusCatalogExportText(): string {
  return [deliveryStatusCatalogExportHeader(), ...deliveryStatusCatalogExportLines()].join('\n');
}

/** L3 — status declared. */
export function isDeclaredDeliveryStatus(status: string): boolean {
  return (DELIVERY_STATUSES as readonly string[]).includes(status);
}
