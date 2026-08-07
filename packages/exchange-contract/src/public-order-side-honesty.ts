/**
 * Exchange-contract L3 — pure public order-side catalog honesty (structural only).
 *
 * Mirrors orderSideSchema: buy | sell.
 * Does not invent fees or money sizes.
 */

export const PUBLIC_ORDER_SIDES = ['buy', 'sell'] as const;
export type PublicOrderSideId = (typeof PUBLIC_ORDER_SIDES)[number];

/** L3 — catalog board. */
export function publicOrderSideCatalogBoardCard(): {
  readonly sides: number;
  readonly hasBuy: number;
  readonly hasSell: number;
} {
  return {
    sides: PUBLIC_ORDER_SIDES.length,
    hasBuy: PUBLIC_ORDER_SIDES.includes('buy') ? 1 : 0,
    hasSell: PUBLIC_ORDER_SIDES.includes('sell') ? 1 : 0,
  };
}

/** L3 — status line. */
export function publicOrderSideCatalogStatusLine(): string {
  const c = publicOrderSideCatalogBoardCard();
  return `sides=${c.sides} buy=${c.hasBuy} sell=${c.hasSell}`;
}

/** L3 — parse status. */
export function parsePublicOrderSideCatalogStatusLine(line: string): {
  readonly sides: number;
  readonly buy: number;
  readonly sell: number;
} | null {
  const m = line.trim().match(/^sides=(\d+) buy=([01]) sell=([01])$/);
  if (!m) return null;
  return {
    sides: Number(m[1]),
    buy: Number(m[2]),
    sell: Number(m[3]),
  };
}

/** L3 — true when status matches. */
export function publicOrderSideCatalogStatusLineMatches(): boolean {
  const p = parsePublicOrderSideCatalogStatusLine(publicOrderSideCatalogStatusLine());
  if (!p) return false;
  const c = publicOrderSideCatalogBoardCard();
  return p.sides === c.sides && p.buy === c.hasBuy && p.sell === c.hasSell;
}

/** L3 — two sides. */
export function publicOrderSideCatalogStatusLineConsistent(line: string): boolean {
  const p = parsePublicOrderSideCatalogStatusLine(line);
  if (!p) return false;
  return p.sides === 2 && p.buy === 1 && p.sell === 1;
}

/** L3 — export header. */
export function publicOrderSideCatalogExportHeader(): string {
  return 'public_order_side';
}

/** L3 — export lines. */
export function publicOrderSideCatalogExportLines(): readonly string[] {
  return [...PUBLIC_ORDER_SIDES];
}

/** L3 — full export. */
export function publicOrderSideCatalogExportText(): string {
  return [publicOrderSideCatalogExportHeader(), ...publicOrderSideCatalogExportLines()].join('\n');
}

/** L3 — side declared. */
export function isDeclaredPublicOrderSide(s: string): boolean {
  return (PUBLIC_ORDER_SIDES as readonly string[]).includes(s);
}
