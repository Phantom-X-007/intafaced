/**
 * Trade L3 — pure order-side catalog honesty (structural only).
 *
 * Mirrors types.ts OrderSide: buy | sell.
 * Does not invent fees, sizes, or money.
 */

export const ORDER_SIDES = ['buy', 'sell'] as const;
export type OrderSideId = (typeof ORDER_SIDES)[number];

/** L3 — catalog board. */
export function orderSideCatalogBoardCard(): {
  readonly sides: number;
  readonly hasBuy: number;
  readonly hasSell: number;
} {
  return {
    sides: ORDER_SIDES.length,
    hasBuy: ORDER_SIDES.includes('buy') ? 1 : 0,
    hasSell: ORDER_SIDES.includes('sell') ? 1 : 0,
  };
}

/** L3 — status line. */
export function orderSideCatalogStatusLine(): string {
  const c = orderSideCatalogBoardCard();
  return `sides=${c.sides} buy=${c.hasBuy} sell=${c.hasSell}`;
}

/** L3 — parse status. */
export function parseOrderSideCatalogStatusLine(line: string): {
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
export function orderSideCatalogStatusLineMatches(): boolean {
  const p = parseOrderSideCatalogStatusLine(orderSideCatalogStatusLine());
  if (!p) return false;
  const c = orderSideCatalogBoardCard();
  return p.sides === c.sides && p.buy === c.hasBuy && p.sell === c.hasSell;
}

/** L3 — two sides declared. */
export function orderSideCatalogStatusLineConsistent(line: string): boolean {
  const p = parseOrderSideCatalogStatusLine(line);
  if (!p) return false;
  return p.sides === 2 && p.buy === 1 && p.sell === 1;
}

/** L3 — export header. */
export function orderSideCatalogExportHeader(): string {
  return 'order_side';
}

/** L3 — export lines. */
export function orderSideCatalogExportLines(): readonly string[] {
  return [...ORDER_SIDES];
}

/** L3 — full export. */
export function orderSideCatalogExportText(): string {
  return [orderSideCatalogExportHeader(), ...orderSideCatalogExportLines()].join('\n');
}

/** L3 — side declared. */
export function isDeclaredOrderSide(side: string): boolean {
  return (ORDER_SIDES as readonly string[]).includes(side);
}
