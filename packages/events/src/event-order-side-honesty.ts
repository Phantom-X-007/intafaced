/**
 * Events L3 — pure event-order-side catalog honesty (structural only).
 *
 * Mirrors catalog.ts order/fill side: buy | sell.
 * Does not invent market microstructure or product law.
 */

export const EVENT_ORDER_SIDES = ['buy', 'sell'] as const;
export type EventOrderSideId = (typeof EVENT_ORDER_SIDES)[number];

/** L3 — catalog board. */
export function eventOrderSideCatalogBoardCard(): {
  readonly sides: number;
  readonly hasBuy: number;
  readonly hasSell: number;
} {
  return {
    sides: EVENT_ORDER_SIDES.length,
    hasBuy: EVENT_ORDER_SIDES.includes('buy') ? 1 : 0,
    hasSell: EVENT_ORDER_SIDES.includes('sell') ? 1 : 0,
  };
}

/** L3 — status line. */
export function eventOrderSideCatalogStatusLine(): string {
  const c = eventOrderSideCatalogBoardCard();
  return `sides=${c.sides} buy=${c.hasBuy} sell=${c.hasSell}`;
}

/** L3 — parse status. */
export function parseEventOrderSideCatalogStatusLine(line: string): {
  readonly sides: number;
  readonly buy: number;
  readonly sell: number;
} | null {
  const m = line.trim().match(/^sides=(\d+) buy=([01]) sell=([01])$/);
  if (!m) return null;
  return { sides: Number(m[1]), buy: Number(m[2]), sell: Number(m[3]) };
}

/** L3 — true when status matches. */
export function eventOrderSideCatalogStatusLineMatches(): boolean {
  const p = parseEventOrderSideCatalogStatusLine(eventOrderSideCatalogStatusLine());
  if (!p) return false;
  const c = eventOrderSideCatalogBoardCard();
  return p.sides === c.sides && p.buy === c.hasBuy && p.sell === c.hasSell;
}

/** L3 — two sides. */
export function eventOrderSideCatalogStatusLineConsistent(line: string): boolean {
  const p = parseEventOrderSideCatalogStatusLine(line);
  if (!p) return false;
  return p.sides === 2 && p.buy === 1 && p.sell === 1;
}

/** L3 — export header. */
export function eventOrderSideCatalogExportHeader(): string {
  return 'event_order_side';
}

/** L3 — export lines. */
export function eventOrderSideCatalogExportLines(): readonly string[] {
  return [...EVENT_ORDER_SIDES];
}

/** L3 — full export. */
export function eventOrderSideCatalogExportText(): string {
  return [eventOrderSideCatalogExportHeader(), ...eventOrderSideCatalogExportLines()].join('\n');
}

/** L3 — side declared. */
export function isDeclaredEventOrderSide(side: string): boolean {
  return (EVENT_ORDER_SIDES as readonly string[]).includes(side);
}
