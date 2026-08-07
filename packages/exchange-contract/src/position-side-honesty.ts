/**
 * Exchange-contract L3 — pure position-side catalog honesty (structural only).
 *
 * Mirrors positionSchema.side: long | short.
 * Does not invent leverage, margin, or money fields.
 */

export const POSITION_SIDES = ['long', 'short'] as const;
export type PositionSideId = (typeof POSITION_SIDES)[number];

/** L3 — catalog board. */
export function positionSideCatalogBoardCard(): {
  readonly sides: number;
  readonly hasLong: number;
  readonly hasShort: number;
} {
  return {
    sides: POSITION_SIDES.length,
    hasLong: POSITION_SIDES.includes('long') ? 1 : 0,
    hasShort: POSITION_SIDES.includes('short') ? 1 : 0,
  };
}

/** L3 — status line. */
export function positionSideCatalogStatusLine(): string {
  const c = positionSideCatalogBoardCard();
  return `sides=${c.sides} long=${c.hasLong} short=${c.hasShort}`;
}

/** L3 — parse status. */
export function parsePositionSideCatalogStatusLine(line: string): {
  readonly sides: number;
  readonly long: number;
  readonly short: number;
} | null {
  const m = line.trim().match(/^sides=(\d+) long=([01]) short=([01])$/);
  if (!m) return null;
  return {
    sides: Number(m[1]),
    long: Number(m[2]),
    short: Number(m[3]),
  };
}

/** L3 — true when status matches. */
export function positionSideCatalogStatusLineMatches(): boolean {
  const p = parsePositionSideCatalogStatusLine(positionSideCatalogStatusLine());
  if (!p) return false;
  const c = positionSideCatalogBoardCard();
  return p.sides === c.sides && p.long === c.hasLong && p.short === c.hasShort;
}

/** L3 — two sides. */
export function positionSideCatalogStatusLineConsistent(line: string): boolean {
  const p = parsePositionSideCatalogStatusLine(line);
  if (!p) return false;
  return p.sides === 2 && p.long === 1 && p.short === 1;
}

/** L3 — export header. */
export function positionSideCatalogExportHeader(): string {
  return 'position_side';
}

/** L3 — export lines. */
export function positionSideCatalogExportLines(): readonly string[] {
  return [...POSITION_SIDES];
}

/** L3 — full export. */
export function positionSideCatalogExportText(): string {
  return [positionSideCatalogExportHeader(), ...positionSideCatalogExportLines()].join('\n');
}

/** L3 — side declared. */
export function isDeclaredPositionSide(s: string): boolean {
  return (POSITION_SIDES as readonly string[]).includes(s);
}
