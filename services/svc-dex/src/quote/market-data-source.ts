import { formatAmount, type Amount } from '@intafaced/ledger-client/money';
import { sweepCost, type ConsolidatedBook, type QuoteRequest, type VenueHealth, type VenueQuote } from '@intafaced/venue-adapter';
import type { Market, OrderBook } from '@intafaced/exchange-contract';
import type { QuoteVenue, TimestampedBook, VenueCapabilityList, VenueKind } from './venue.js';
import { VenueExecutionRefused } from './venue.js';

/**
 * THE `MarketDataAdapter` HALF OF §27, AND ONLY THAT HALF.
 *
 * §27 splits the venue fabric three ways: `MarketDataAdapter`, `TradeAdapter`,
 * `AccountAdapter`. Everything in svc-dex is the first one. The other two are
 * `svc-execution` (§28) and the Venue Vault, neither of which exists, and
 * neither of which belongs in a `custodial: false` service anyway.
 *
 * So this base class carries the `LiquiditySource` surface that a market-data
 * adapter can honestly implement, and refuses the rest **loudly**:
 *
 *   · `capabilities` declares `quote` and `orderbook`. Not `submit`, not
 *     `cancel`, not `stream`. A caller that checks `supports()` before routing —
 *     as venue-adapter's own helpers do — never reaches the refusal at all.
 *   · `submit()` throws `VenueExecutionRefused`. Not a no-op, not a stub that
 *     returns `status: 'rejected'`: an execution port that answers plausibly
 *     while doing nothing reports fills that never happened. Whoever wires
 *     execution later has to delete a throw to do it, and that is the point.
 *
 * ── Health, and what "latency grading" actually measures ────────────────────
 *
 * §27 asks for adapters "continuously scored — round-trip, book staleness,
 * reject rates". What is scored here is round-trip and staleness of OUR LAST
 * READ, updated on every fetch. Reject rates need an execution path to reject
 * anything, so there is nothing to count yet and nothing is pretended.
 *
 * Before the first fetch a source reports `healthy: false` with a reason. That
 * is deliberate: `isRoutable` consults `health()`, and a source that claimed
 * health it had not yet earned would be routable on the strength of a
 * `lastUpdate` that describes construction time rather than data.
 */

export interface MarketDataSourceOptions {
  /**
   * How long a derived `VenueQuote` stays valid, in ms.
   *
   * Wired to `QUOTE_MAX_AGE_MS`. It only affects `quote()`, which exists for
   * venue-adapter's own router; svc-dex's path applies the same ceiling itself
   * against `observedAt` and does not take a venue's word for its expiry.
   */
  readonly quoteTtlMs: number;
  /**
   * Book levels `quote()` pulls. Wired from `DEX_QUOTE_DEPTH`.
   * Unset / not a positive int → refuse (never invent 50).
   * Owner-explicit 50 is a published window, not a git default.
   */
  readonly depth?: number;
}

/** Unset / null refuses. Owner-explicit 50 is a published window, not a git default. */
function publishedOrderBookLimit(value: number | undefined | null): number {
  if (value === undefined || value === null) {
    throw new Error('orderBook limit is unset — refuse to invent 50');
  }
  return value;
}

/** Unset / not a positive int refuses. Owner-explicit 50 is a published window, not a git default. */
function publishedQuoteDepth(value: number | undefined | null): number {
  if (value === undefined || value === null || !Number.isInteger(value) || value < 1) {
    throw new Error('quote depth is unset — refuse to invent 50');
  }
  return value;
}

/** One venue's book in the shape `sweepCost` walks. */
export function asConsolidatedBook(book: TimestampedBook): ConsolidatedBook {
  const level = (l: readonly [Amount, Amount]) => ({
    price: l[0],
    amount: l[1],
    sources: [{ venueId: book.venueId, amount: l[1] }],
  });

  return {
    symbol: book.symbol,
    bids: book.bids.map(level),
    asks: book.asks.map(level),
    timestamp: book.observedAt,
    venues: [book.venueId],
    excluded: [],
  };
}

export abstract class MarketDataSource implements QuoteVenue {
  abstract readonly id: string;
  abstract readonly kind: VenueKind;
  abstract readonly feeBps: number;
  abstract readonly settlementCost: Amount;

  /** Read-only, and declared so callers can check before they route. */
  readonly capabilities: VenueCapabilityList = ['quote', 'orderbook'];

  readonly #quoteTtlMs: number;
  readonly #depth: number | undefined;
  #lastUpdate: Date | null = null;
  #latencyMs = 0;
  #lastFailure: string | null = null;

  constructor(options: MarketDataSourceOptions) {
    this.#quoteTtlMs = options.quoteTtlMs;
    this.#depth = options.depth;
  }

  /**
   * Fetch and normalise this venue's book. Implemented per venue.
   *
   * Must throw `VenueUnavailableError` rather than returning an empty book when
   * it cannot read the venue — an empty book is a market state, not an outage.
   */
  protected abstract fetchDepth(symbol: string, limit: number): Promise<TimestampedBook>;

  async depth(symbol: string, limit: number): Promise<TimestampedBook> {
    const startedAt = Date.now();
    try {
      const book = await this.fetchDepth(symbol, limit);
      this.#latencyMs = Date.now() - startedAt;
      this.#lastUpdate = book.observedAt;
      this.#lastFailure = null;
      return book;
    } catch (err) {
      // Latency is recorded on a failure too. A venue that takes four seconds to
      // time out is a slow venue, and a grading system that only sampled
      // successes would score it as if it were fast.
      this.#latencyMs = Date.now() - startedAt;
      this.#lastFailure = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  health(): VenueHealth {
    if (this.#lastUpdate === null) {
      return {
        healthy: false,
        latencyMs: this.#latencyMs,
        // Epoch, not "now". A source that has never answered must not look fresh
        // to `isRoutable`, and `new Date()` here would make it look perfect.
        lastUpdate: new Date(0),
        reason: this.#lastFailure ?? 'no successful read yet',
      };
    }
    return {
      healthy: this.#lastFailure === null,
      latencyMs: this.#latencyMs,
      lastUpdate: this.#lastUpdate,
      ...(this.#lastFailure ? { reason: this.#lastFailure } : {}),
    };
  }

  /**
   * Market metadata, which a public depth endpoint does not publish.
   *
   * Empty, on purpose. A `Market` carries precision, limits and fee rates; a
   * depth response carries none of them, and filling them in with plausible
   * defaults would put invented tick sizes and invented fees into a structure
   * whose whole job is to be authoritative. An empty list is a true statement
   * about what this adapter knows. `svc-connect` (§27) is where market
   * metadata is meant to come from.
   */
  async markets(): Promise<Market[]> {
    return [];
  }

  /** `limit` is required. Unset refuses (never invent 50). Owner-explicit 50 is a published window. */
  async orderBook(symbol: string, limit?: number | null): Promise<OrderBook> {
    const n = publishedOrderBookLimit(limit);
    const book = await this.depth(symbol, n);
    const wire = (levels: readonly (readonly [Amount, Amount])[]) =>
      levels.map((l) => [formatAmount(l[0]), formatAmount(l[1])] as [string, string]);

    return {
      symbol,
      bids: wire(book.bids),
      asks: wire(book.asks),
      timestamp: book.observedAt.getTime(),
      datetime: book.observedAt.toISOString(),
      // The venue's own sequence where it publishes one, 0 where it does not.
      // Inventing a monotonic counter would let a consumer believe it could
      // detect a gap on a venue that gives it no way to.
      nonce: book.sequence,
    };
  }

  /**
   * A quote for a size, by walking this venue's own book.
   *
   * Depth is `DEX_QUOTE_DEPTH` (injected). Unset refuses — never invent 50.
   *
   * `null` rather than a zero-quantity quote when nothing can fill — a quote of
   * nothing at a price of nothing ranks like a free trade.
   */
  async quote(request: QuoteRequest): Promise<VenueQuote | null> {
    const book = await this.depth(request.symbol, publishedQuoteDepth(this.#depth));
    const sweep = sweepCost(asConsolidatedBook(book), request.side, request.amount);
    if (sweep.filled <= 0n) return null;

    return {
      venueId: this.id,
      symbol: request.symbol,
      side: request.side,
      amount: sweep.filled,
      price: sweep.averagePrice,
      feeBps: this.feeBps,
      expiresAt: new Date(book.observedAt.getTime() + this.#quoteTtlMs),
    };
  }

  /**
   * REFUSED. See the header.
   *
   * svc-dex is Protocol Plane, `custodial: false`. Cross-venue execution is §28
   * (`svc-execution`, not built) and it needs Venue Vault credentials that do
   * not exist. Both gaps are stated in the message rather than papered over,
   * because the alternative is a router that reports a fill nobody made.
   */
  async submit(): Promise<never> {
    throw new VenueExecutionRefused(
      this.id,
      'dex.execution.not_this_service',
      `${this.id}: svc-dex quotes and routes, it never executes. Cross-venue execution is svc-execution (§28), ` +
        'which is not built, and external venues need trade-scoped Venue Vault credentials (§27) that have not been issued. ' +
        'This adapter is market-data only — see its `capabilities`.',
    );
  }
}
