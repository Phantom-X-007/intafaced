/**
 * Matching L3 — pure cancel-reason catalog honesty (structural only).
 *
 * Mirrors engine/types.ts CANCEL_REASONS.
 * Does not invent money hold-release amounts.
 */

export const CANCEL_REASONS = ['requested', 'self_trade_prevention', 'ioc_remainder', 'market_remainder', 'trigger_rejected'] as const;
export type CancelReasonId = (typeof CANCEL_REASONS)[number];

/** L3 — catalog board. */
export function cancelReasonCatalogBoardCard(): {
  readonly reasons: number;
  readonly hasRequested: number;
  readonly hasStp: number;
  readonly hasIocRemainder: number;
  readonly hasTriggerRejected: number;
} {
  return {
    reasons: CANCEL_REASONS.length,
    hasRequested: CANCEL_REASONS.includes('requested') ? 1 : 0,
    hasStp: CANCEL_REASONS.includes('self_trade_prevention') ? 1 : 0,
    hasIocRemainder: CANCEL_REASONS.includes('ioc_remainder') ? 1 : 0,
    hasTriggerRejected: CANCEL_REASONS.includes('trigger_rejected') ? 1 : 0,
  };
}

/** L3 — status line. */
export function cancelReasonCatalogStatusLine(): string {
  const c = cancelReasonCatalogBoardCard();
  return `reasons=${c.reasons} requested=${c.hasRequested} stp=${c.hasStp} ioc_remainder=${c.hasIocRemainder} trigger_rejected=${c.hasTriggerRejected}`;
}

/** L3 — parse status. */
export function parseCancelReasonCatalogStatusLine(line: string): {
  readonly reasons: number;
  readonly requested: number;
  readonly stp: number;
  readonly iocRemainder: number;
  readonly triggerRejected: number;
} | null {
  const m = line.trim().match(/^reasons=(\d+) requested=([01]) stp=([01]) ioc_remainder=([01]) trigger_rejected=([01])$/);
  if (!m) return null;
  return {
    reasons: Number(m[1]),
    requested: Number(m[2]),
    stp: Number(m[3]),
    iocRemainder: Number(m[4]),
    triggerRejected: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function cancelReasonCatalogStatusLineMatches(): boolean {
  const p = parseCancelReasonCatalogStatusLine(cancelReasonCatalogStatusLine());
  if (!p) return false;
  const c = cancelReasonCatalogBoardCard();
  return (
    p.reasons === c.reasons &&
    p.requested === c.hasRequested &&
    p.stp === c.hasStp &&
    p.iocRemainder === c.hasIocRemainder &&
    p.triggerRejected === c.hasTriggerRejected
  );
}

/** L3 — five reasons. */
export function cancelReasonCatalogStatusLineConsistent(line: string): boolean {
  const p = parseCancelReasonCatalogStatusLine(line);
  if (!p) return false;
  return p.reasons === 5 && p.requested === 1 && p.stp === 1 && p.iocRemainder === 1 && p.triggerRejected === 1;
}

/** L3 — export header. */
export function cancelReasonCatalogExportHeader(): string {
  return 'cancel_reason';
}

/** L3 — export lines. */
export function cancelReasonCatalogExportLines(): readonly string[] {
  return [...CANCEL_REASONS];
}

/** L3 — full export. */
export function cancelReasonCatalogExportText(): string {
  return [cancelReasonCatalogExportHeader(), ...cancelReasonCatalogExportLines()].join('\n');
}

/** L3 — reason declared. */
export function isDeclaredCancelReason(r: string): boolean {
  return (CANCEL_REASONS as readonly string[]).includes(r);
}
