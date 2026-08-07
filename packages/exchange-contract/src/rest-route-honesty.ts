/**
 * Exchange-contract L3 — pure REST route catalog honesty (structural only).
 *
 * Mirrors api.ts REST_ROUTES keys + public/private split by scope null.
 * Does not invent rate limits as money or invent new routes.
 */

export const REST_ROUTE_NAMES = [
  'fetchMarkets',
  'fetchTicker',
  'fetchTickers',
  'fetchOrderBook',
  'fetchOHLCV',
  'fetchTrades',
  'fetchFundingRate',
  'fetchTradingFees',
  'fetchBalance',
  'createOrder',
  'cancelOrder',
  'cancelAllOrders',
  'fetchOrder',
  'fetchOpenOrders',
  'fetchClosedOrders',
  'fetchMyTrades',
  'fetchPositions',
  'setLeverage',
  'setMarginMode',
] as const;
export type RestRouteNameId = (typeof REST_ROUTE_NAMES)[number];

export const REST_PUBLIC_ROUTE_NAMES = [
  'fetchMarkets',
  'fetchTicker',
  'fetchTickers',
  'fetchOrderBook',
  'fetchOHLCV',
  'fetchTrades',
  'fetchFundingRate',
] as const;

export const REST_PRIVATE_ROUTE_NAMES = [
  'fetchTradingFees',
  'fetchBalance',
  'createOrder',
  'cancelOrder',
  'cancelAllOrders',
  'fetchOrder',
  'fetchOpenOrders',
  'fetchClosedOrders',
  'fetchMyTrades',
  'fetchPositions',
  'setLeverage',
  'setMarginMode',
] as const;

/** L3 — catalog board. */
export function restRouteCatalogBoardCard(): {
  readonly routes: number;
  readonly publicCount: number;
  readonly privateCount: number;
  readonly hasCreateOrder: number;
  readonly hasCancelOrder: number;
} {
  return {
    routes: REST_ROUTE_NAMES.length,
    publicCount: REST_PUBLIC_ROUTE_NAMES.length,
    privateCount: REST_PRIVATE_ROUTE_NAMES.length,
    hasCreateOrder: REST_ROUTE_NAMES.includes('createOrder') ? 1 : 0,
    hasCancelOrder: REST_ROUTE_NAMES.includes('cancelOrder') ? 1 : 0,
  };
}

/** L3 — status line. */
export function restRouteCatalogStatusLine(): string {
  const c = restRouteCatalogBoardCard();
  return `routes=${c.routes} public=${c.publicCount} private=${c.privateCount} create_order=${c.hasCreateOrder} cancel_order=${c.hasCancelOrder}`;
}

/** L3 — parse status. */
export function parseRestRouteCatalogStatusLine(line: string): {
  readonly routes: number;
  readonly public: number;
  readonly private: number;
  readonly createOrder: number;
  readonly cancelOrder: number;
} | null {
  const m = line.trim().match(/^routes=(\d+) public=(\d+) private=(\d+) create_order=([01]) cancel_order=([01])$/);
  if (!m) return null;
  return {
    routes: Number(m[1]),
    public: Number(m[2]),
    private: Number(m[3]),
    createOrder: Number(m[4]),
    cancelOrder: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function restRouteCatalogStatusLineMatches(): boolean {
  const p = parseRestRouteCatalogStatusLine(restRouteCatalogStatusLine());
  if (!p) return false;
  const c = restRouteCatalogBoardCard();
  return (
    p.routes === c.routes &&
    p.public === c.publicCount &&
    p.private === c.privateCount &&
    p.createOrder === c.hasCreateOrder &&
    p.cancelOrder === c.hasCancelOrder
  );
}

/** L3 — 19 routes; 7 public + 12 private; cancel present (lets user out). */
export function restRouteCatalogStatusLineConsistent(line: string): boolean {
  const p = parseRestRouteCatalogStatusLine(line);
  if (!p) return false;
  return p.routes === 19 && p.public === 7 && p.private === 12 && p.createOrder === 1 && p.cancelOrder === 1;
}

/** L3 — export header. */
export function restRouteCatalogExportHeader(): string {
  return 'rest_route';
}

/** L3 — export lines. */
export function restRouteCatalogExportLines(): readonly string[] {
  return [...REST_ROUTE_NAMES];
}

/** L3 — full export. */
export function restRouteCatalogExportText(): string {
  return [restRouteCatalogExportHeader(), ...restRouteCatalogExportLines()].join('\n');
}

/** L3 — route declared. */
export function isDeclaredRestRoute(name: string): boolean {
  return (REST_ROUTE_NAMES as readonly string[]).includes(name);
}
