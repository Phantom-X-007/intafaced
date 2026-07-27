import type { Amount } from '@intafaced/ledger-client';
import type { OrderBook, Timeframe, OHLCV, Ticker, Market } from '@intafaced/exchange-contract';

/**
 * LiquiditySource — the §5.2 adapter interface.
 *
 * Doctrine §0.4: "Adapters, not integrations. All external rails sit behind
 * internal interfaces… the platform never depends on them to function."
 *
 * The internal book implements this interface too. That is deliberate and it is
 * the most important design decision in this package: the router has no notion
 * of "ours" versus "theirs", so it cannot quietly favour us. It ranks on price.
 * We win by pricing well — see `internalPreference` in the router, which is the
 * ONE explicit, bounded, documented thumb on the scale.
 */

export type VenueKind = 'internal' | 'external-cex' | 'external-dex' | 'amm' | 'otc';

export type VenueCapability = 'quote' | 'orderbook' | 'ohlcv' | 'ticker' | 'submit' | 'cancel' | 'stream';

export interface VenueHealth {
  readonly healthy: boolean;
  /** Round-trip latency in ms; used to break ties and to detect degradation. */
  readonly latencyMs: number;
  /** When this venue's data was last refreshed. */
  readonly lastUpdate: Date;
  readonly reason?: string;
}

export interface QuoteRequest {
  readonly symbol: string;
  readonly side: 'buy' | 'sell';
  /** Base quantity sought. */
  readonly amount: Amount;
}

export interface VenueQuote {
  readonly venueId: string;
  readonly symbol: string;
  readonly side: 'buy' | 'sell';
  /**
   * Quantity this venue can actually fill at `price`. May be less than
   * requested — a venue that promises depth it does not have is worse than one
   * that admits the shortfall, because the router can then split the order.
   */
  readonly amount: Amount;
  /** Average price for `amount`, walking the venue's book. */
  readonly price: Amount;
  /** Taker fee in basis points at this venue for this account. */
  readonly feeBps: number;
  /** When this quote stops being trustworthy. */
  readonly expiresAt: Date;
}

export interface SubmitRequest {
  readonly symbol: string;
  readonly side: 'buy' | 'sell';
  readonly amount: Amount;
  /** Worst acceptable average price. The router always sets this. */
  readonly limitPrice: Amount;
  readonly clientOrderId: string;
}

export interface VenueExecution {
  readonly venueId: string;
  readonly venueOrderId: string;
  readonly filledAmount: Amount;
  readonly averagePrice: Amount;
  readonly feeAmount: Amount;
  readonly feeAsset: string;
  readonly status: 'filled' | 'partial' | 'rejected';
  readonly executedAt: Date;
}

export interface LiquiditySource {
  readonly id: string;
  readonly kind: VenueKind;
  readonly capabilities: readonly VenueCapability[];

  health(): VenueHealth;
  markets(): Promise<Market[]>;
  /** Null when this venue cannot serve the request at all. */
  quote(request: QuoteRequest): Promise<VenueQuote | null>;
  orderBook(symbol: string, limit?: number): Promise<OrderBook>;
  ticker?(symbol: string): Promise<Ticker>;
  ohlcv?(symbol: string, timeframe: Timeframe, since?: number, limit?: number): Promise<OHLCV[]>;
  submit(request: SubmitRequest): Promise<VenueExecution>;
  cancel?(venueOrderId: string, symbol: string): Promise<void>;
}

export function supports(source: LiquiditySource, capability: VenueCapability): boolean {
  return source.capabilities.includes(capability);
}

/**
 * A source is routable only when it is healthy AND its data is fresh.
 *
 * Staleness is the failure that actually costs money: a venue that has stopped
 * updating still answers, still quotes, and still looks fine — right up until
 * the fill comes back at a price from thirty seconds ago.
 */
export function isRoutable(source: LiquiditySource, now: Date = new Date(), maxStalenessMs = 5_000): boolean {
  const health = source.health();
  if (!health.healthy) return false;
  return now.getTime() - health.lastUpdate.getTime() <= maxStalenessMs;
}
