/**
 * Exchange-contract L3 — pure margin-mode catalog honesty (structural only).
 *
 * Mirrors positionSchema.marginMode: cross | isolated.
 * Does not invent leverage ratios or money margin amounts.
 */

export const MARGIN_MODES = ['cross', 'isolated'] as const;
export type MarginModeId = (typeof MARGIN_MODES)[number];

/** L3 — catalog board. */
export function marginModeCatalogBoardCard(): {
  readonly modes: number;
  readonly hasCross: number;
  readonly hasIsolated: number;
} {
  return {
    modes: MARGIN_MODES.length,
    hasCross: MARGIN_MODES.includes('cross') ? 1 : 0,
    hasIsolated: MARGIN_MODES.includes('isolated') ? 1 : 0,
  };
}

/** L3 — status line. */
export function marginModeCatalogStatusLine(): string {
  const c = marginModeCatalogBoardCard();
  return `modes=${c.modes} cross=${c.hasCross} isolated=${c.hasIsolated}`;
}

/** L3 — parse status. */
export function parseMarginModeCatalogStatusLine(line: string): {
  readonly modes: number;
  readonly cross: number;
  readonly isolated: number;
} | null {
  const m = line.trim().match(/^modes=(\d+) cross=([01]) isolated=([01])$/);
  if (!m) return null;
  return {
    modes: Number(m[1]),
    cross: Number(m[2]),
    isolated: Number(m[3]),
  };
}

/** L3 — true when status matches. */
export function marginModeCatalogStatusLineMatches(): boolean {
  const p = parseMarginModeCatalogStatusLine(marginModeCatalogStatusLine());
  if (!p) return false;
  const c = marginModeCatalogBoardCard();
  return p.modes === c.modes && p.cross === c.hasCross && p.isolated === c.hasIsolated;
}

/** L3 — two modes. */
export function marginModeCatalogStatusLineConsistent(line: string): boolean {
  const p = parseMarginModeCatalogStatusLine(line);
  if (!p) return false;
  return p.modes === 2 && p.cross === 1 && p.isolated === 1;
}

/** L3 — export header. */
export function marginModeCatalogExportHeader(): string {
  return 'margin_mode';
}

/** L3 — export lines. */
export function marginModeCatalogExportLines(): readonly string[] {
  return [...MARGIN_MODES];
}

/** L3 — full export. */
export function marginModeCatalogExportText(): string {
  return [marginModeCatalogExportHeader(), ...marginModeCatalogExportLines()].join('\n');
}

/** L3 — mode declared. */
export function isDeclaredMarginMode(m: string): boolean {
  return (MARGIN_MODES as readonly string[]).includes(m);
}
