/**
 * Events L3 — pure event-order-type catalog honesty (structural only).
 *
 * Mirrors catalog.ts order type on trade events: limit | market.
 * Does not invent matching, TIF, or public order-type product law.
 */

export const EVENT_ORDER_TYPES = ['limit', 'market'] as const;
export type EventOrderTypeId = (typeof EVENT_ORDER_TYPES)[number];

/** L3 — catalog board. */
export function eventOrderTypeCatalogBoardCard(): {
  readonly types: number;
  readonly hasLimit: number;
  readonly hasMarket: number;
} {
  return {
    types: EVENT_ORDER_TYPES.length,
    hasLimit: EVENT_ORDER_TYPES.includes('limit') ? 1 : 0,
    hasMarket: EVENT_ORDER_TYPES.includes('market') ? 1 : 0,
  };
}

/** L3 — status line. */
export function eventOrderTypeCatalogStatusLine(): string {
  const c = eventOrderTypeCatalogBoardCard();
  return `types=${c.types} limit=${c.hasLimit} market=${c.hasMarket}`;
}

/** L3 — parse status. */
export function parseEventOrderTypeCatalogStatusLine(line: string): {
  readonly types: number;
  readonly limit: number;
  readonly market: number;
} | null {
  const m = line.trim().match(/^types=(\d+) limit=([01]) market=([01])$/);
  if (!m) return null;
  return { types: Number(m[1]), limit: Number(m[2]), market: Number(m[3]) };
}

/** L3 — true when status matches. */
export function eventOrderTypeCatalogStatusLineMatches(): boolean {
  const p = parseEventOrderTypeCatalogStatusLine(eventOrderTypeCatalogStatusLine());
  if (!p) return false;
  const c = eventOrderTypeCatalogBoardCard();
  return p.types === c.types && p.limit === c.hasLimit && p.market === c.hasMarket;
}

/** L3 — two types. */
export function eventOrderTypeCatalogStatusLineConsistent(line: string): boolean {
  const p = parseEventOrderTypeCatalogStatusLine(line);
  if (!p) return false;
  return p.types === 2 && p.limit === 1 && p.market === 1;
}

/** L3 — export header. */
export function eventOrderTypeCatalogExportHeader(): string {
  return 'event_order_type';
}

/** L3 — export lines. */
export function eventOrderTypeCatalogExportLines(): readonly string[] {
  return [...EVENT_ORDER_TYPES];
}

/** L3 — full export. */
export function eventOrderTypeCatalogExportText(): string {
  return [eventOrderTypeCatalogExportHeader(), ...eventOrderTypeCatalogExportLines()].join('\n');
}

/** L3 — type declared. */
export function isDeclaredEventOrderType(type: string): boolean {
  return (EVENT_ORDER_TYPES as readonly string[]).includes(type);
}
