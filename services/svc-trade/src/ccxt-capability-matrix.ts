/**
 * trade.ccxt-api — bot-ready capability matrix + refuse surface.
 *
 * Promise (D26-P1-T5 / paste-w10 L02 A1 / TRACKER `trade.ccxt-api`):
 * a bot (or integrator) can read, in one module, which CCXT REST surfaces
 * this venue serves, which are mounted only to refuse, and the exact
 * HTTP status + codes of every refuse arm — without treating a Fastify 404
 * as "wrong URL" or a silent 200 as "leverage set".
 *
 * Contract routes live in `@intafaced/exchange-contract` `REST_ROUTES`.
 * This matrix is the **implementation inventory** in svc-trade: claim ≡ wire.
 * Tests fail when a matrix row drifts from the mounted route or refuse arm.
 *
 * Never invents mids/rates. Futures leverage / live re-margin stay refuse.
 */

import { REST_ROUTES, type RestRouteName } from '@intafaced/exchange-contract';

/** How the route behaves for a correct, authorized call. */
export type CcxtCapabilityKind =
  /** Happy path can return 200 when deps/data allow. */
  | 'supported'
  /** Always answers with an explicit refuse (never silent success / bare 404). */
  | 'refuse'
  /**
   * Happy path when data exists; otherwise an explicit refuse arm
   * (e.g. funding rate only when published — never invent "0").
   */
  | 'conditional';

/**
 * Wire shape of the refuse body.
 * - `ccxt` → `{ code, message, intafacedCode }` (CCXT error taxonomy)
 * - `domain` → `{ error, message }` (trade domain refuse; used on price fields)
 */
export type CcxtRefuseWireShape = 'ccxt' | 'domain';

/**
 * One named refuse arm a bot must branch on.
 * ids are stable — do not rename without a product note.
 */
export type CcxtRefuseArm = {
  readonly id: string;
  /** REST_ROUTES name, or extension name (openPosition / closePosition). */
  readonly routeName: string;
  readonly method: string;
  readonly path: string;
  readonly httpStatus: 400 | 501;
  /**
   * CCXT `code` when wireShape is `ccxt`; for domain refuses, the stable
   * vocabulary class bots should treat as client error (not retried as venue).
   */
  readonly ccxtCode: string;
  /** Intafaced / domain code on the wire. */
  readonly intafacedCode: string;
  readonly wireShape: CcxtRefuseWireShape;
  /** When this arm fires — plain language for bots and humans. */
  readonly when: string;
};

export type CcxtCapabilityRow = {
  /** REST_ROUTES key, or extension (`openPosition` / `closePosition`). */
  readonly name: string;
  readonly method: string;
  readonly path: string;
  readonly auth: 'public' | 'private';
  readonly scope: string | null;
  readonly kind: CcxtCapabilityKind;
  /** Refuse-arm ids that can fire on this path (may be empty for pure supported). */
  readonly refuseArmIds: readonly string[];
  readonly notes: string;
};

/**
 * Price fields a caller may not send on position open/close.
 * Must match `PRICE_FIELDS` in private-rest.ts — pin test enforces.
 */
export const CALLER_REFUSED_PRICE_FIELDS = ['entryPrice', 'exitPrice', 'price', 'markPrice'] as const;

/**
 * Explicit refuse arms (done bar: setLeverage, setMarginMode, funding-rate
 * when unsupported, caller price on close). open also refuses caller price
 * with the same code — listed so the matrix is complete.
 */
export const CCXT_REFUSE_ARMS: readonly CcxtRefuseArm[] = [
  {
    id: 'setLeverage',
    routeName: 'setLeverage',
    method: 'POST',
    path: '/api/v1/positions/leverage',
    httpStatus: 501,
    ccxtCode: 'NotSupported',
    intafacedCode: 'trade.leverage_unsupported',
    wireShape: 'ccxt',
    when: 'always — live re-leverage is not built; margin mode is set at open only',
  },
  {
    id: 'setMarginMode',
    routeName: 'setMarginMode',
    method: 'POST',
    path: '/api/v1/positions/margin-mode',
    httpStatus: 501,
    ccxtCode: 'NotSupported',
    intafacedCode: 'trade.margin_mode_unsupported',
    wireShape: 'ccxt',
    when: 'always — live margin-mode change is not built; set at open only',
  },
  {
    id: 'fundingRateSpot',
    routeName: 'fetchFundingRate',
    method: 'GET',
    path: '/api/v1/funding-rate/:symbol',
    httpStatus: 501,
    ccxtCode: 'NotSupported',
    intafacedCode: 'trade.funding_rate_spot_market',
    wireShape: 'ccxt',
    when: 'market.kind is spot — never invent fundingRate "0"',
  },
  {
    id: 'fundingRateUnavailable',
    routeName: 'fetchFundingRate',
    method: 'GET',
    path: '/api/v1/funding-rate/:symbol',
    httpStatus: 501,
    ccxtCode: 'NotSupported',
    intafacedCode: 'trade.funding_rate_unavailable',
    wireShape: 'ccxt',
    when: 'non-spot market with no published funding rate (dep missing or null quote)',
  },
  {
    id: 'callerPriceOnClose',
    routeName: 'closePosition',
    method: 'DELETE',
    path: '/api/v1/positions/:id',
    httpStatus: 400,
    ccxtCode: 'BadRequest',
    intafacedCode: 'trade.price_not_accepted',
    wireShape: 'domain',
    when: `query carries any of ${CALLER_REFUSED_PRICE_FIELDS.join('|')} — mark path only`,
  },
  {
    id: 'callerPriceOnOpen',
    routeName: 'openPosition',
    method: 'POST',
    path: '/api/v1/positions',
    httpStatus: 400,
    ccxtCode: 'BadRequest',
    intafacedCode: 'trade.price_not_accepted',
    wireShape: 'domain',
    when: `body carries any of ${CALLER_REFUSED_PRICE_FIELDS.join('|')} — mark path only`,
  },
] as const;

const refuseIds = (...ids: string[]): readonly string[] => ids;

function route(name: RestRouteName, kind: CcxtCapabilityKind, refuseArmIds: readonly string[], notes: string): CcxtCapabilityRow {
  const r = REST_ROUTES[name];
  return {
    name,
    method: r.method,
    path: r.path,
    auth: r.scope === null ? 'public' : 'private',
    scope: r.scope,
    kind,
    refuseArmIds,
    notes,
  };
}

/**
 * Full capability matrix: every REST_ROUTES entry + position open/close
 * extensions that own refuse arms on the private surface.
 */
export const CCXT_CAPABILITY_MATRIX: readonly CcxtCapabilityRow[] = [
  // ── Public (REST_ROUTES) ──────────────────────────────────────────────────
  route('fetchMarkets', 'supported', [], 'List listings; paper + schedule flags on wire'),
  route('fetchTicker', 'supported', [], 'BBO + last from book/tape; never invents 24h stats'),
  route('fetchTickers', 'supported', [], 'All-market ticker map; missing book → empty BBO, not 502'),
  route('fetchOrderBook', 'supported', [], 'Depth from matching; empty [] is honest no-book'),
  route('fetchOHLCV', 'supported', [], 'Candles from real fill tape only; gap ≠ zero candle'),
  route('fetchTrades', 'supported', [], 'Public tape; optional since= ms'),
  route(
    'fetchFundingRate',
    'conditional',
    refuseIds('fundingRateSpot', 'fundingRateUnavailable'),
    'Spot always refuse; futures only when a rate is published — never invent 0',
  ),

  // ── Private (REST_ROUTES) ─────────────────────────────────────────────────
  route('fetchTradingFees', 'supported', [], 'Per-market maker/taker fee rates'),
  route('fetchBalance', 'supported', [], 'Ledger balances for principal'),
  route('createOrder', 'supported', [], 'Place spot (and gated) order — money path'),
  route('cancelOrder', 'supported', [], 'Cancel one open order by id'),
  route('cancelAllOrders', 'supported', [], 'Cancel open orders; optional symbol filter'),
  route('fetchOrder', 'supported', [], 'One order by id'),
  route('fetchOpenOrders', 'supported', [], 'Open orders; optional symbol'),
  route('fetchClosedOrders', 'supported', [], 'Closed orders; optional symbol/since/limit'),
  route('fetchMyTrades', 'supported', [], 'Account fills; optional symbol/since/limit'),
  route('fetchPositions', 'supported', [], 'Open/closing futures rows; [] when none — no invent'),
  route('setLeverage', 'refuse', refuseIds('setLeverage'), 'Mounted 501 NotSupported — never silent success'),
  route('setMarginMode', 'refuse', refuseIds('setMarginMode'), 'Mounted 501 NotSupported — never silent success'),

  // ── Extensions beyond REST_ROUTES (position open/close; refuse caller price)
  {
    name: 'openPosition',
    method: 'POST',
    path: '/api/v1/positions',
    auth: 'private',
    scope: 'trade:write',
    kind: 'supported',
    refuseArmIds: refuseIds('callerPriceOnOpen'),
    notes: 'Open funded futures position; entry price from mark, never from body',
  },
  {
    name: 'closePosition',
    method: 'DELETE',
    path: '/api/v1/positions/:id',
    auth: 'private',
    scope: 'trade:write',
    kind: 'supported',
    refuseArmIds: refuseIds('callerPriceOnClose'),
    notes: 'Close at current mark; exitPrice/price query fields refused 400',
  },
] as const;

/** Lookup refuse arm by stable id. */
export function refuseArmById(id: string): CcxtRefuseArm | undefined {
  return CCXT_REFUSE_ARMS.find((a) => a.id === id);
}

/** All matrix rows that are pure refuse mounts. */
export function refuseOnlyRoutes(): readonly CcxtCapabilityRow[] {
  return CCXT_CAPABILITY_MATRIX.filter((r) => r.kind === 'refuse');
}

/** REST_ROUTES names claimed by the matrix (excludes open/close extensions). */
export function matrixRestRouteNames(): readonly string[] {
  return CCXT_CAPABILITY_MATRIX.filter((r) => r.name in REST_ROUTES).map((r) => r.name);
}

/** Every refuse arm id referenced by the matrix exists in CCXT_REFUSE_ARMS. */
export function danglingRefuseArmIds(): readonly string[] {
  const known = new Set(CCXT_REFUSE_ARMS.map((a) => a.id));
  const dangling: string[] = [];
  for (const row of CCXT_CAPABILITY_MATRIX) {
    for (const id of row.refuseArmIds) {
      if (!known.has(id)) dangling.push(`${row.name}:${id}`);
    }
  }
  return dangling;
}

/** Refuse arms that no matrix row points at (orphan inventory). */
export function orphanRefuseArmIds(): readonly string[] {
  const used = new Set(CCXT_CAPABILITY_MATRIX.flatMap((r) => [...r.refuseArmIds]));
  return CCXT_REFUSE_ARMS.filter((a) => !used.has(a.id)).map((a) => a.id);
}
