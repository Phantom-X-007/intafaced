/**
 * Support L3 — pure operator queue honesty boards (no ticket I/O).
 *
 * Shapes mirror operator-queue.ts QueueResult / category weights.
 * Does not invent SLAs as money.
 */

export const QUEUE_CATEGORY_WEIGHTS = {
  account: 40,
  trading: 30,
  deposit_withdraw: 70,
  other: 10,
} as const;

export type QueueEntryBoardInput = {
  readonly category: string;
  readonly status: 'open' | 'pending' | 'resolved' | 'closed';
  readonly score: number;
};

export type QueueResultBoardInput =
  | { readonly status: 'ok'; readonly entries: readonly QueueEntryBoardInput[] }
  | { readonly status: 'empty' };

/** L3 — category weight catalog board. */
export function queueWeightCatalogBoardCard(): {
  readonly categories: number;
  readonly maxWeight: number;
  readonly minWeight: number;
} {
  const weights = Object.values(QUEUE_CATEGORY_WEIGHTS);
  return {
    categories: weights.length,
    maxWeight: Math.max(...weights),
    minWeight: Math.min(...weights),
  };
}

/** L3 — weight catalog status line. */
export function queueWeightCatalogStatusLine(): string {
  const c = queueWeightCatalogBoardCard();
  return `categories=${c.categories} max_weight=${c.maxWeight} min_weight=${c.minWeight}`;
}

/** L3 — parse weight catalog. */
export function parseQueueWeightCatalogStatusLine(line: string): {
  readonly categories: number;
  readonly maxWeight: number;
  readonly minWeight: number;
} | null {
  const m = line.trim().match(/^categories=(\d+) max_weight=(\d+) min_weight=(\d+)$/);
  if (!m) return null;
  return {
    categories: Number(m[1]),
    maxWeight: Number(m[2]),
    minWeight: Number(m[3]),
  };
}

/** L3 — true when weight catalog matches. */
export function queueWeightCatalogStatusLineMatches(): boolean {
  const p = parseQueueWeightCatalogStatusLine(queueWeightCatalogStatusLine());
  if (!p) return false;
  const c = queueWeightCatalogBoardCard();
  return (
    p.categories === c.categories &&
    p.maxWeight === c.maxWeight &&
    p.minWeight === c.minWeight
  );
}

/** L3 — queue result board. */
export function operatorQueueBoardCard(result: QueueResultBoardInput): {
  readonly status: string;
  readonly entries: number;
  readonly open: number;
  readonly pending: number;
} {
  if (result.status === 'empty') {
    return { status: 'empty', entries: 0, open: 0, pending: 0 };
  }
  let open = 0;
  let pending = 0;
  for (const e of result.entries) {
    if (e.status === 'open') open += 1;
    else if (e.status === 'pending') pending += 1;
  }
  return {
    status: 'ok',
    entries: result.entries.length,
    open,
    pending,
  };
}

/** L3 — status line. */
export function operatorQueueStatusLine(result: QueueResultBoardInput): string {
  const c = operatorQueueBoardCard(result);
  return `status=${c.status} entries=${c.entries} open=${c.open} pending=${c.pending}`;
}

/** L3 — parse status. */
export function parseOperatorQueueStatusLine(line: string): {
  readonly status: string;
  readonly entries: number;
  readonly open: number;
  readonly pending: number;
} | null {
  const m = line.trim().match(/^status=(ok|empty) entries=(\d+) open=(\d+) pending=(\d+)$/);
  if (!m) return null;
  return {
    status: m[1]!,
    entries: Number(m[2]),
    open: Number(m[3]),
    pending: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function operatorQueueStatusLineMatches(result: QueueResultBoardInput): boolean {
  const p = parseOperatorQueueStatusLine(operatorQueueStatusLine(result));
  if (!p) return false;
  const c = operatorQueueBoardCard(result);
  return (
    p.status === c.status &&
    p.entries === c.entries &&
    p.open === c.open &&
    p.pending === c.pending
  );
}

/** L3 — open+pending ≤ entries; empty has zero. */
export function operatorQueueStatusLineConsistent(line: string): boolean {
  const p = parseOperatorQueueStatusLine(line);
  if (!p) return false;
  if (p.status === 'empty') return p.entries === 0;
  return p.open + p.pending <= p.entries;
}

/** L3 — export header. */
export function operatorQueueExportHeader(): string {
  return 'status,entries,open,pending';
}

/** L3 — export line. */
export function operatorQueueExportLine(result: QueueResultBoardInput): string {
  const c = operatorQueueBoardCard(result);
  return `${c.status},${c.entries},${c.open},${c.pending}`;
}

/** L3 — full export. */
export function operatorQueueExportText(result: QueueResultBoardInput): string {
  return [operatorQueueExportHeader(), operatorQueueExportLine(result)].join('\n');
}

/** L3 — entry count in range. */
export function queueEntryCountInRange(
  result: QueueResultBoardInput,
  min: number,
  max: number,
): boolean {
  if (min > max) return false;
  const n = operatorQueueBoardCard(result).entries;
  return n >= min && n <= max;
}
