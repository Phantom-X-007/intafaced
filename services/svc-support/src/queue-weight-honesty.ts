/**
 * Support L3 — pure queue category-weight catalog honesty (structural only).
 *
 * Mirrors operator-queue.ts CATEGORY_WEIGHT keys + relative order.
 * Does not invent SLAs as money.
 */

export const QUEUE_WEIGHT_CATEGORIES = ['account', 'trading', 'deposit_withdraw', 'other'] as const;
export type QueueWeightCategoryId = (typeof QUEUE_WEIGHT_CATEGORIES)[number];

/** Structural weights (product may retune; checkable on tip). */
export const QUEUE_WEIGHT_VALUES = {
  account: 40,
  trading: 30,
  deposit_withdraw: 70,
  other: 10,
} as const;

/** L3 — catalog board. */
export function queueWeightCatalogBoardCard(): {
  readonly categories: number;
  readonly maxWeight: number;
  readonly minWeight: number;
  readonly depositHighest: number;
} {
  const vals = Object.values(QUEUE_WEIGHT_VALUES);
  return {
    categories: QUEUE_WEIGHT_CATEGORIES.length,
    maxWeight: Math.max(...vals),
    minWeight: Math.min(...vals),
    depositHighest: QUEUE_WEIGHT_VALUES.deposit_withdraw === Math.max(...vals) ? 1 : 0,
  };
}

/** L3 — status line. */
export function queueWeightCatalogStatusLine(): string {
  const c = queueWeightCatalogBoardCard();
  return `categories=${c.categories} max=${c.maxWeight} min=${c.minWeight} deposit_highest=${c.depositHighest}`;
}

/** L3 — parse status. */
export function parseQueueWeightCatalogStatusLine(line: string): {
  readonly categories: number;
  readonly max: number;
  readonly min: number;
  readonly depositHighest: number;
} | null {
  const m = line.trim().match(/^categories=(\d+) max=(\d+) min=(\d+) deposit_highest=([01])$/);
  if (!m) return null;
  return {
    categories: Number(m[1]),
    max: Number(m[2]),
    min: Number(m[3]),
    depositHighest: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function queueWeightCatalogStatusLineMatches(): boolean {
  const p = parseQueueWeightCatalogStatusLine(queueWeightCatalogStatusLine());
  if (!p) return false;
  const c = queueWeightCatalogBoardCard();
  return p.categories === c.categories && p.max === c.maxWeight && p.min === c.minWeight && p.depositHighest === c.depositHighest;
}

/** L3 — four categories; deposit highest; max 70 min 10. */
export function queueWeightCatalogStatusLineConsistent(line: string): boolean {
  const p = parseQueueWeightCatalogStatusLine(line);
  if (!p) return false;
  return p.categories === 4 && p.max === 70 && p.min === 10 && p.depositHighest === 1;
}

/** L3 — export header. */
export function queueWeightCatalogExportHeader(): string {
  return 'category,weight';
}

/** L3 — export lines. */
export function queueWeightCatalogExportLines(): readonly string[] {
  return QUEUE_WEIGHT_CATEGORIES.map((k) => `${k},${QUEUE_WEIGHT_VALUES[k]}`);
}

/** L3 — full export. */
export function queueWeightCatalogExportText(): string {
  return [queueWeightCatalogExportHeader(), ...queueWeightCatalogExportLines()].join('\n');
}

/** L3 — category declared. */
export function isDeclaredQueueWeightCategory(cat: string): boolean {
  return (QUEUE_WEIGHT_CATEGORIES as readonly string[]).includes(cat);
}
