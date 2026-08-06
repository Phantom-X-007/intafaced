/**
 * Notify L3 — pure delivery outcome honesty boards (no gateway I/O).
 *
 * Three outcomes: accepted | refused | failed — never collapse to void.
 */

export const DELIVERY_OUTCOMES = ['accepted', 'refused', 'failed'] as const;
export type DeliveryOutcomeId = (typeof DELIVERY_OUTCOMES)[number];

export type DeliveryOutcomeBoardInput = {
  readonly outcome: DeliveryOutcomeId;
  readonly channel: string;
};

/** L3 — catalog board. */
export function deliveryOutcomeCatalogBoardCard(): {
  readonly outcomes: number;
  readonly hasAccepted: number;
  readonly hasRefused: number;
  readonly hasFailed: number;
} {
  return {
    outcomes: DELIVERY_OUTCOMES.length,
    hasAccepted: 1,
    hasRefused: 1,
    hasFailed: 1,
  };
}

/** L3 — catalog status line. */
export function deliveryOutcomeCatalogStatusLine(): string {
  const c = deliveryOutcomeCatalogBoardCard();
  return `outcomes=${c.outcomes} accepted=${c.hasAccepted} refused=${c.hasRefused} failed=${c.hasFailed}`;
}

/** L3 — parse catalog. */
export function parseDeliveryOutcomeCatalogStatusLine(line: string): {
  readonly outcomes: number;
  readonly accepted: number;
  readonly refused: number;
  readonly failed: number;
} | null {
  const m = line
    .trim()
    .match(/^outcomes=(\d+) accepted=([01]) refused=([01]) failed=([01])$/);
  if (!m) return null;
  return {
    outcomes: Number(m[1]),
    accepted: Number(m[2]),
    refused: Number(m[3]),
    failed: Number(m[4]),
  };
}

/** L3 — true when catalog matches. */
export function deliveryOutcomeCatalogStatusLineMatches(): boolean {
  const p = parseDeliveryOutcomeCatalogStatusLine(deliveryOutcomeCatalogStatusLine());
  if (!p) return false;
  const c = deliveryOutcomeCatalogBoardCard();
  return (
    p.outcomes === c.outcomes &&
    p.accepted === c.hasAccepted &&
    p.refused === c.hasRefused &&
    p.failed === c.hasFailed
  );
}

/** L3 — three distinct outcomes. */
export function deliveryOutcomeCatalogStatusLineConsistent(line: string): boolean {
  const p = parseDeliveryOutcomeCatalogStatusLine(line);
  if (!p) return false;
  return p.outcomes === 3 && p.accepted === 1 && p.refused === 1 && p.failed === 1;
}

/** L3 — histogram board. */
export function deliveryOutcomeListBoardCard(
  rows: readonly DeliveryOutcomeBoardInput[],
): {
  readonly total: number;
  readonly accepted: number;
  readonly refused: number;
  readonly failed: number;
} {
  let accepted = 0;
  let refused = 0;
  let failed = 0;
  for (const r of rows) {
    if (r.outcome === 'accepted') accepted += 1;
    else if (r.outcome === 'refused') refused += 1;
    else failed += 1;
  }
  return { total: rows.length, accepted, refused, failed };
}

/** L3 — list status line. */
export function deliveryOutcomeListStatusLine(
  rows: readonly DeliveryOutcomeBoardInput[],
): string {
  const c = deliveryOutcomeListBoardCard(rows);
  return `total=${c.total} accepted=${c.accepted} refused=${c.refused} failed=${c.failed}`;
}

/** L3 — parse list. */
export function parseDeliveryOutcomeListStatusLine(line: string): {
  readonly total: number;
  readonly accepted: number;
  readonly refused: number;
  readonly failed: number;
} | null {
  const m = line.trim().match(/^total=(\d+) accepted=(\d+) refused=(\d+) failed=(\d+)$/);
  if (!m) return null;
  return {
    total: Number(m[1]),
    accepted: Number(m[2]),
    refused: Number(m[3]),
    failed: Number(m[4]),
  };
}

/** L3 — true when list status matches. */
export function deliveryOutcomeListStatusLineMatches(
  rows: readonly DeliveryOutcomeBoardInput[],
): boolean {
  const p = parseDeliveryOutcomeListStatusLine(deliveryOutcomeListStatusLine(rows));
  if (!p) return false;
  const c = deliveryOutcomeListBoardCard(rows);
  return (
    p.total === c.total &&
    p.accepted === c.accepted &&
    p.refused === c.refused &&
    p.failed === c.failed
  );
}

/** L3 — parts sum to total. */
export function deliveryOutcomeListStatusLineConsistent(line: string): boolean {
  const p = parseDeliveryOutcomeListStatusLine(line);
  if (!p) return false;
  return p.total === p.accepted + p.refused + p.failed;
}

/** L3 — export header. */
export function deliveryOutcomeListExportHeader(): string {
  return 'total,accepted,refused,failed';
}

/** L3 — export line. */
export function deliveryOutcomeListExportLine(
  rows: readonly DeliveryOutcomeBoardInput[],
): string {
  const c = deliveryOutcomeListBoardCard(rows);
  return `${c.total},${c.accepted},${c.refused},${c.failed}`;
}

/** L3 — full export. */
export function deliveryOutcomeListExportText(
  rows: readonly DeliveryOutcomeBoardInput[],
): string {
  return [deliveryOutcomeListExportHeader(), deliveryOutcomeListExportLine(rows)].join('\n');
}

/** L3 — outcome declared. */
export function isDeclaredDeliveryOutcome(outcome: string): boolean {
  return (DELIVERY_OUTCOMES as readonly string[]).includes(outcome);
}
