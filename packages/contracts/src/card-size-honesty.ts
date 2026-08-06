/**
 * Contracts L3 — pure blueprint card-size catalog honesty.
 *
 * Mirrors blueprint.ts cardSizeSchema: portrait | landscape.
 * Does not invent renderer product law.
 */

export const CARD_SIZES = ['portrait', 'landscape'] as const;
export type CardSizeId = (typeof CARD_SIZES)[number];

/** L3 — catalog board. */
export function cardSizeCatalogBoardCard(): {
  readonly sizes: number;
  readonly hasPortrait: number;
  readonly hasLandscape: number;
} {
  return {
    sizes: CARD_SIZES.length,
    hasPortrait: CARD_SIZES.includes('portrait') ? 1 : 0,
    hasLandscape: CARD_SIZES.includes('landscape') ? 1 : 0,
  };
}

/** L3 — status line. */
export function cardSizeCatalogStatusLine(): string {
  const c = cardSizeCatalogBoardCard();
  return `sizes=${c.sizes} portrait=${c.hasPortrait} landscape=${c.hasLandscape}`;
}

/** L3 — parse status. */
export function parseCardSizeCatalogStatusLine(line: string): {
  readonly sizes: number;
  readonly portrait: number;
  readonly landscape: number;
} | null {
  const m = line.trim().match(/^sizes=(\d+) portrait=([01]) landscape=([01])$/);
  if (!m) return null;
  return { sizes: Number(m[1]), portrait: Number(m[2]), landscape: Number(m[3]) };
}

/** L3 — true when status matches. */
export function cardSizeCatalogStatusLineMatches(): boolean {
  const p = parseCardSizeCatalogStatusLine(cardSizeCatalogStatusLine());
  if (!p) return false;
  const c = cardSizeCatalogBoardCard();
  return p.sizes === c.sizes && p.portrait === c.hasPortrait && p.landscape === c.hasLandscape;
}

/** L3 — two sizes. */
export function cardSizeCatalogStatusLineConsistent(line: string): boolean {
  const p = parseCardSizeCatalogStatusLine(line);
  if (!p) return false;
  return p.sizes === 2 && p.portrait === 1 && p.landscape === 1;
}

/** L3 — export header. */
export function cardSizeCatalogExportHeader(): string {
  return 'size';
}

/** L3 — export lines. */
export function cardSizeCatalogExportLines(): readonly string[] {
  return [...CARD_SIZES];
}

/** L3 — full export. */
export function cardSizeCatalogExportText(): string {
  return [cardSizeCatalogExportHeader(), ...cardSizeCatalogExportLines()].join('\n');
}

/** L3 — size declared. */
export function isDeclaredCardSize(size: string): boolean {
  return (CARD_SIZES as readonly string[]).includes(size);
}
