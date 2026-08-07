/**
 * Exchange-contract L3 — pure public order-type catalog honesty (structural only).
 *
 * Mirrors schemas.ts orderTypeSchema: market | limit | stop | stop_limit | take_profit.
 * Does not invent money or fee law.
 */

export const PUBLIC_ORDER_TYPES = ['market', 'limit', 'stop', 'stop_limit', 'take_profit'] as const;
export type PublicOrderTypeId = (typeof PUBLIC_ORDER_TYPES)[number];

/** L3 — catalog board. */
export function publicOrderTypeCatalogBoardCard(): {
  readonly types: number;
  readonly hasMarket: number;
  readonly hasLimit: number;
  readonly hasStop: number;
  readonly hasStopLimit: number;
  readonly hasTakeProfit: number;
} {
  return {
    types: PUBLIC_ORDER_TYPES.length,
    hasMarket: PUBLIC_ORDER_TYPES.includes('market') ? 1 : 0,
    hasLimit: PUBLIC_ORDER_TYPES.includes('limit') ? 1 : 0,
    hasStop: PUBLIC_ORDER_TYPES.includes('stop') ? 1 : 0,
    hasStopLimit: PUBLIC_ORDER_TYPES.includes('stop_limit') ? 1 : 0,
    hasTakeProfit: PUBLIC_ORDER_TYPES.includes('take_profit') ? 1 : 0,
  };
}

/** L3 — status line. */
export function publicOrderTypeCatalogStatusLine(): string {
  const c = publicOrderTypeCatalogBoardCard();
  return `types=${c.types} market=${c.hasMarket} limit=${c.hasLimit} stop=${c.hasStop} stop_limit=${c.hasStopLimit} take_profit=${c.hasTakeProfit}`;
}

/** L3 — parse status. */
export function parsePublicOrderTypeCatalogStatusLine(line: string): {
  readonly types: number;
  readonly market: number;
  readonly limit: number;
  readonly stop: number;
  readonly stopLimit: number;
  readonly takeProfit: number;
} | null {
  const m = line.trim().match(/^types=(\d+) market=([01]) limit=([01]) stop=([01]) stop_limit=([01]) take_profit=([01])$/);
  if (!m) return null;
  return {
    types: Number(m[1]),
    market: Number(m[2]),
    limit: Number(m[3]),
    stop: Number(m[4]),
    stopLimit: Number(m[5]),
    takeProfit: Number(m[6]),
  };
}

/** L3 — true when status matches. */
export function publicOrderTypeCatalogStatusLineMatches(): boolean {
  const p = parsePublicOrderTypeCatalogStatusLine(publicOrderTypeCatalogStatusLine());
  if (!p) return false;
  const c = publicOrderTypeCatalogBoardCard();
  return (
    p.types === c.types &&
    p.market === c.hasMarket &&
    p.limit === c.hasLimit &&
    p.stop === c.hasStop &&
    p.stopLimit === c.hasStopLimit &&
    p.takeProfit === c.hasTakeProfit
  );
}

/** L3 — five public types including take_profit. */
export function publicOrderTypeCatalogStatusLineConsistent(line: string): boolean {
  const p = parsePublicOrderTypeCatalogStatusLine(line);
  if (!p) return false;
  return p.types === 5 && p.market === 1 && p.limit === 1 && p.stop === 1 && p.stopLimit === 1 && p.takeProfit === 1;
}

/** L3 — export header. */
export function publicOrderTypeCatalogExportHeader(): string {
  return 'public_order_type';
}

/** L3 — export lines. */
export function publicOrderTypeCatalogExportLines(): readonly string[] {
  return [...PUBLIC_ORDER_TYPES];
}

/** L3 — full export. */
export function publicOrderTypeCatalogExportText(): string {
  return [publicOrderTypeCatalogExportHeader(), ...publicOrderTypeCatalogExportLines()].join('\n');
}

/** L3 — type declared on public contract. */
export function isDeclaredPublicOrderType(t: string): boolean {
  return (PUBLIC_ORDER_TYPES as readonly string[]).includes(t);
}
