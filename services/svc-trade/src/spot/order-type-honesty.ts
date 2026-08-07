/**
 * Trade L3 — pure order-type catalog honesty (structural only).
 *
 * Mirrors types.ts OrderType: market | limit.
 * Does not invent stop/trigger law or money.
 */

export const ORDER_TYPES = ['market', 'limit'] as const;
export type OrderTypeId = (typeof ORDER_TYPES)[number];

/** L3 — catalog board. */
export function orderTypeCatalogBoardCard(): {
  readonly types: number;
  readonly hasMarket: number;
  readonly hasLimit: number;
} {
  return {
    types: ORDER_TYPES.length,
    hasMarket: ORDER_TYPES.includes('market') ? 1 : 0,
    hasLimit: ORDER_TYPES.includes('limit') ? 1 : 0,
  };
}

/** L3 — status line. */
export function orderTypeCatalogStatusLine(): string {
  const c = orderTypeCatalogBoardCard();
  return `types=${c.types} market=${c.hasMarket} limit=${c.hasLimit}`;
}

/** L3 — parse status. */
export function parseOrderTypeCatalogStatusLine(line: string): {
  readonly types: number;
  readonly market: number;
  readonly limit: number;
} | null {
  const m = line.trim().match(/^types=(\d+) market=([01]) limit=([01])$/);
  if (!m) return null;
  return {
    types: Number(m[1]),
    market: Number(m[2]),
    limit: Number(m[3]),
  };
}

/** L3 — true when status matches. */
export function orderTypeCatalogStatusLineMatches(): boolean {
  const p = parseOrderTypeCatalogStatusLine(orderTypeCatalogStatusLine());
  if (!p) return false;
  const c = orderTypeCatalogBoardCard();
  return p.types === c.types && p.market === c.hasMarket && p.limit === c.hasLimit;
}

/** L3 — two types. */
export function orderTypeCatalogStatusLineConsistent(line: string): boolean {
  const p = parseOrderTypeCatalogStatusLine(line);
  if (!p) return false;
  return p.types === 2 && p.market === 1 && p.limit === 1;
}

/** L3 — export header. */
export function orderTypeCatalogExportHeader(): string {
  return 'order_type';
}

/** L3 — export lines. */
export function orderTypeCatalogExportLines(): readonly string[] {
  return [...ORDER_TYPES];
}

/** L3 — full export. */
export function orderTypeCatalogExportText(): string {
  return [orderTypeCatalogExportHeader(), ...orderTypeCatalogExportLines()].join('\n');
}

/** L3 — type declared. */
export function isDeclaredOrderType(t: string): boolean {
  return (ORDER_TYPES as readonly string[]).includes(t);
}
