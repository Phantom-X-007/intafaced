/**
 * Matching L3 — pure engine order-type catalog honesty (structural only).
 *
 * Mirrors engine EngineOrderType: market | limit | stop | stop_limit
 * (public take_profit mapped away before engine).
 * Does not invent money or trigger rates.
 */

export const ENGINE_ORDER_TYPES = ['market', 'limit', 'stop', 'stop_limit'] as const;
export type EngineOrderTypeId = (typeof ENGINE_ORDER_TYPES)[number];

/** L3 — catalog board. */
export function engineOrderTypeCatalogBoardCard(): {
  readonly types: number;
  readonly hasMarket: number;
  readonly hasLimit: number;
  readonly hasStop: number;
  readonly hasStopLimit: number;
  readonly hasTakeProfit: number;
} {
  return {
    types: ENGINE_ORDER_TYPES.length,
    hasMarket: ENGINE_ORDER_TYPES.includes('market') ? 1 : 0,
    hasLimit: ENGINE_ORDER_TYPES.includes('limit') ? 1 : 0,
    hasStop: ENGINE_ORDER_TYPES.includes('stop') ? 1 : 0,
    hasStopLimit: ENGINE_ORDER_TYPES.includes('stop_limit') ? 1 : 0,
    hasTakeProfit: 0,
  };
}

/** L3 — status line. */
export function engineOrderTypeCatalogStatusLine(): string {
  const c = engineOrderTypeCatalogBoardCard();
  return `types=${c.types} market=${c.hasMarket} limit=${c.hasLimit} stop=${c.hasStop} stop_limit=${c.hasStopLimit} take_profit=${c.hasTakeProfit}`;
}

/** L3 — parse status. */
export function parseEngineOrderTypeCatalogStatusLine(line: string): {
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
export function engineOrderTypeCatalogStatusLineMatches(): boolean {
  const p = parseEngineOrderTypeCatalogStatusLine(engineOrderTypeCatalogStatusLine());
  if (!p) return false;
  const c = engineOrderTypeCatalogBoardCard();
  return (
    p.types === c.types &&
    p.market === c.hasMarket &&
    p.limit === c.hasLimit &&
    p.stop === c.hasStop &&
    p.stopLimit === c.hasStopLimit &&
    p.takeProfit === c.hasTakeProfit
  );
}

/** L3 — four engine types; take_profit not in engine. */
export function engineOrderTypeCatalogStatusLineConsistent(line: string): boolean {
  const p = parseEngineOrderTypeCatalogStatusLine(line);
  if (!p) return false;
  return p.types === 4 && p.market === 1 && p.limit === 1 && p.stop === 1 && p.stopLimit === 1 && p.takeProfit === 0;
}

/** L3 — export header. */
export function engineOrderTypeCatalogExportHeader(): string {
  return 'engine_order_type';
}

/** L3 — export lines. */
export function engineOrderTypeCatalogExportLines(): readonly string[] {
  return [...ENGINE_ORDER_TYPES];
}

/** L3 — full export. */
export function engineOrderTypeCatalogExportText(): string {
  return [engineOrderTypeCatalogExportHeader(), ...engineOrderTypeCatalogExportLines()].join('\n');
}

/** L3 — type declared on engine. */
export function isDeclaredEngineOrderType(t: string): boolean {
  return (ENGINE_ORDER_TYPES as readonly string[]).includes(t);
}
