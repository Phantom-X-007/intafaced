import type { Amount } from '@intafaced/ledger-client/money';
import { MarketDataSource, type MarketDataSourceOptions } from './market-data-source.js';
import type { TimestampedBook, VenueKind } from './venue.js';
import { VenueUnavailableError } from './venue.js';
import { getJson, parseLevels, trimBaseUrl, type HttpVenueOptions } from './wire.js';

/**
 * OUR OWN BOOK, VIA svc-matching (§8.6).
 *
 * `kind: 'internal'` — and that word carries weight. `source.ts`'s header states
 * the property this adapter must not break:
 *
 *   _"The internal book implements this interface too. That is deliberate and it
 *    is the most important design decision in this package: the router has no
 *    notion of 'ours' versus 'theirs', so it cannot quietly favour us."_
 *
 * It holds. This class is the same type as the on-chain venue and the external
 * ones, and svc-dex's router ranks on effective price alone — there is **no
 * internal-preference thumb on the scale anywhere in this service's path**.
 * (venue-adapter's own `planRoute` has a bounded, documented one; svc-dex does
 * not use that router, and this is the note for whoever wonders why.)
 *
 * §8.6: _"Smart order router: internal book vs. pool quote → best execution."_
 * This is the "internal book" half, and svc-dex's README named it as the source
 * to wire: _"Wiring it to svc-indexer read models and the internal book is the
 * next PR."_
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE PLANE PROBLEM, AND WHY THE ANSWER IS DISCLOSURE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * svc-matching is the FIAT PLANE engine. Its depth is public market data — the
 * matrix says so out loud (`DEFAULT_MODULE_RULES.matching` is `minTier: 'none'`,
 * on the reasoning that "there is no user, no account and no asset behind a
 * depth frame"), and svc-matching's own router leaves reads open while
 * authenticating every write. So READING it here breaks nothing.
 *
 * EXECUTING against it is another matter. A fill on the internal book settles
 * through the ledger, and svc-trade requires `minTier: 'basic'` to place the
 * order. A permissionless caller can therefore be quoted a price on this venue
 * that they cannot actually take.
 *
 * Two ways to handle that. Hiding the venue costs the user the best price when
 * the internal book genuinely has it. Quoting it silently sells them a price
 * behind a gate they were promised did not exist. So: quote it, and
 * **disclose** — every venue in a `dex.quote` response carries `plane` and
 * `custodial`, derived from `kind` rather than configured, and a client that
 * wants only sovereign liquidity filters on one field.
 * `DEX_INTERNAL_BOOK_ENABLED` turns it off wholesale.
 *
 * ── What this returns today ─────────────────────────────────────────────────
 *
 * Whatever svc-matching actually has. The engine is real and in-memory, so on a
 * running stack with a seeded book this venue answers with live depth — it is
 * the one price source in the platform that can answer right now. On a market
 * the engine has never seen it 404s, and a 404 becomes `unreachable` rather than
 * an empty book: "this engine has no such market" and "this market has no bids"
 * are different facts and only one of them is a market condition.
 */

export interface MatchingVenueOptions extends HttpVenueOptions, MarketDataSourceOptions {
  readonly feeBps: number;
}

export class MatchingQuoteVenue extends MarketDataSource {
  readonly id = 'internal-book';
  readonly kind: VenueKind = 'internal';
  readonly feeBps: number;
  /**
   * Zero, and not configurable.
   *
   * An internal fill settles as a ledger post — there is no gas leg to price. A
   * knob here would only ever be used to invent one.
   */
  readonly settlementCost: Amount = 0n;

  readonly #baseUrl: string;
  readonly #http: HttpVenueOptions;

  constructor(options: MatchingVenueOptions) {
    super(options);
    this.#baseUrl = trimBaseUrl(options.baseUrl);
    this.#http = options;
    this.feeBps = options.feeBps;
  }

  protected async fetchDepth(symbol: string, limit: number): Promise<TimestampedBook> {
    const body = await getJson(this.id, `${this.#baseUrl}/markets/${encodeURIComponent(symbol)}/depth?limit=${limit}`, this.#http);
    const observedAt = new Date();

    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new VenueUnavailableError(this.id, 'malformed', 'svc-matching depth response was not an object');
    }
    const raw = body as Record<string, unknown>;

    // The engine's sequence is how svc-ws proves a delta stream is continuous.
    // We do not stream, but its absence means we are not talking to the engine's
    // depth route at all — and a book of unknown provenance is not a book.
    if (typeof raw.sequence !== 'number' || !Number.isInteger(raw.sequence)) {
      throw new VenueUnavailableError(this.id, 'malformed', 'svc-matching depth response carried no integer sequence');
    }

    return {
      venueId: this.id,
      symbol,
      bids: parseLevels(raw.bids, 'bids', this.id),
      asks: parseLevels(raw.asks, 'asks', this.id),
      observedAt,
      sequence: raw.sequence,
    };
  }
}
