/**
 * Matching L3 — pure resting-kind catalog honesty (structural only).
 *
 * Mirrors RestingRef.kind: book | stop.
 * Does not invent money or book depths.
 */

export const RESTING_KINDS = ['book', 'stop'] as const;
export type RestingKindId = (typeof RESTING_KINDS)[number];

/** L3 — catalog board. */
export function restingKindCatalogBoardCard(): {
  readonly kinds: number;
  readonly hasBook: number;
  readonly hasStop: number;
} {
  return {
    kinds: RESTING_KINDS.length,
    hasBook: RESTING_KINDS.includes('book') ? 1 : 0,
    hasStop: RESTING_KINDS.includes('stop') ? 1 : 0,
  };
}

/** L3 — status line. */
export function restingKindCatalogStatusLine(): string {
  const c = restingKindCatalogBoardCard();
  return `kinds=${c.kinds} book=${c.hasBook} stop=${c.hasStop}`;
}

/** L3 — parse status. */
export function parseRestingKindCatalogStatusLine(line: string): {
  readonly kinds: number;
  readonly book: number;
  readonly stop: number;
} | null {
  const m = line.trim().match(/^kinds=(\d+) book=([01]) stop=([01])$/);
  if (!m) return null;
  return {
    kinds: Number(m[1]),
    book: Number(m[2]),
    stop: Number(m[3]),
  };
}

/** L3 — true when status matches. */
export function restingKindCatalogStatusLineMatches(): boolean {
  const p = parseRestingKindCatalogStatusLine(restingKindCatalogStatusLine());
  if (!p) return false;
  const c = restingKindCatalogBoardCard();
  return p.kinds === c.kinds && p.book === c.hasBook && p.stop === c.hasStop;
}

/** L3 — two kinds. */
export function restingKindCatalogStatusLineConsistent(line: string): boolean {
  const p = parseRestingKindCatalogStatusLine(line);
  if (!p) return false;
  return p.kinds === 2 && p.book === 1 && p.stop === 1;
}

/** L3 — export header. */
export function restingKindCatalogExportHeader(): string {
  return 'resting_kind';
}

/** L3 — export lines. */
export function restingKindCatalogExportLines(): readonly string[] {
  return [...RESTING_KINDS];
}

/** L3 — full export. */
export function restingKindCatalogExportText(): string {
  return [restingKindCatalogExportHeader(), ...restingKindCatalogExportLines()].join('\n');
}

/** L3 — kind declared. */
export function isDeclaredRestingKind(k: string): boolean {
  return (RESTING_KINDS as readonly string[]).includes(k);
}
