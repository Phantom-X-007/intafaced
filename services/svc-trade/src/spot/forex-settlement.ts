import { TradeError, type Market } from './types.js';

/**
 * D26-P1-T7 · `trade.forex` — refuse-closed until settlement law.
 *
 * Product-complete forex is **only** after:
 *   1. **D26-P0-05** — options/forex settlement asset law (ADR: live set,
 *      settlement asset, refuse matrix), and
 *   2. **Fiat settle rails posture** — a real rail that can settle the chosen
 *      asset (not `PAY_CRYPTO_ASSETS` accidentally mapping EUR → a euro
 *      stablecoin).
 *
 * Until both exist, production forex/commodity listing and place stay refuse-
 * closed. Modelling (`paper=true`) and non-active statuses remain honest.
 *
 * §13 — `socket.forex-settlement`. Do **not** invent the settlement asset
 * (stablecoin-margined vs true fiat omnibus). That is owner law (D8 / P0-05).
 */

export const FOREX_SETTLEMENT_SOCKET = 'socket.forex-settlement' as const;

/** Error code shared with D-S-05 listing/place refuse (#1169 / #1220). */
export const FOREX_SETTLEMENT_REFUSE_CODE = 'trade.unsettled_asset_class_listing' as const;

export const FOREX_SETTLEMENT_RESIDUAL =
  'D26-P0-05 options/forex settlement asset law + fiat settle rails — refuse-closed (never invent settlement asset)';

export type ForexSettlementStatus = {
  /** Always false until P0-05 ADR + fiat rails are owner-published. */
  published: false;
  socket: typeof FOREX_SETTLEMENT_SOCKET;
  statusLine: string;
  residual: string;
  blockers: readonly ['D26-P0-05', 'fiat_settle_rails'];
  /** What remains legal while the socket is open. */
  allowed: {
    paperListing: true;
    nonActiveListing: true;
    productionActiveListing: false;
    productionPlace: false;
  };
};

/**
 * Public posture — same shape as OTC/copy deskStatus refuse-closed surfaces.
 * Never reports a publishable settlement asset; there is none until P0-05.
 */
export function forexSettlementStatus(): ForexSettlementStatus {
  return {
    published: false,
    socket: FOREX_SETTLEMENT_SOCKET,
    statusLine: `published=0 socket=${FOREX_SETTLEMENT_SOCKET} residual=D26-P0-05+fiat_settle_rails`,
    residual: FOREX_SETTLEMENT_RESIDUAL,
    blockers: ['D26-P0-05', 'fiat_settle_rails'],
    allowed: {
      paperListing: true,
      nonActiveListing: true,
      productionActiveListing: false,
      productionPlace: false,
    },
  };
}

function isUnsettledAssetClass(assetClass: Market['assetClass'] | string): boolean {
  return assetClass === 'forex' || assetClass === 'commodity';
}

/**
 * NEW production (active, non-paper) forex/commodity listings — refuse.
 * Paper drills and pending/halted/delisted rows stay allowed (model without open risk).
 */
export function assertProductionUnsettledAssetClassListing(input: {
  assetClass: Market['assetClass'] | string;
  status: Market['status'] | string;
  paper: boolean;
}): void {
  if (!isUnsettledAssetClass(input.assetClass)) return;
  if (input.paper) return;
  if (input.status !== 'active') return;
  throw new TradeError(
    `${input.assetClass} cannot be listed for production trading until ${FOREX_SETTLEMENT_SOCKET} closes ` +
      `(D26-P0-05 settlement asset law + fiat settle rails — list as paper=true or status pending/halted; never invent settlement)`,
    FOREX_SETTLEMENT_REFUSE_CODE,
  );
}

/**
 * Place / convert / TWAP on an already-seeded production FX/commodity market.
 * Seeds stay `active` in DB; this is the hold-path seal that does not invent rails.
 */
export function assertSettlementRails(market: Pick<Market, 'symbol' | 'assetClass' | 'paper'>): void {
  if (market.paper) return;
  if (!isUnsettledAssetClass(market.assetClass)) return;
  throw new TradeError(
    `${market.symbol} is ${market.assetClass} — production place refuse-closed at ${FOREX_SETTLEMENT_SOCKET} ` +
      `(D26-P0-05 + fiat settle rails; list as paper or wait for owner settlement law — never invent)`,
    FOREX_SETTLEMENT_REFUSE_CODE,
  );
}
