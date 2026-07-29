import type { Amount } from '@intafaced/ledger-client/money';
import { MarketDataSource, type MarketDataSourceOptions } from './market-data-source.js';
import type { TimestampedBook, VenueKind } from './venue.js';
import { VenueUnavailableError } from './venue.js';
import { getJson, parseLevels, trimBaseUrl, type HttpVenueOptions } from './wire.js';

/**
 * THE ON-CHAIN BOOK, VIA svc-indexer (§17.5).
 *
 * `kind: 'external-dex'` — an on-chain venue where the user's own key holds the
 * asset. This is the sovereign leg, and the only one in the set that a
 * permissionless caller can both be quoted AND execute.
 *
 * The Protocol Plane keeps its state on chain. Nothing can query a chain fast
 * enough to price an order, so svc-indexer follows chain state and projects it
 * into read models — and `env.ts` has said from the beginning what that means
 * for this service:
 *
 *   "Read models. Quotes are served from projections, never from a chain call."
 *
 * This is the adapter that finally reads them.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS RETURNS TODAY, STATED PLAINLY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * **A refusal.** svc-indexer boots on `NullChainSource` — SOCKET §13
 * (`socket.evm-rpc`). There is no EVM RPC in this stack and no deployed CLOB
 * contract to read, so nothing has ever been projected, `book.asOfHeight` is
 * `null`, and this adapter refuses with `not_ready`.
 *
 * That is the correct behaviour and it is the whole point. The alternative — an
 * adapter that returns something anyway — is the failure this file exists to
 * prevent. **The DEX cannot quote the sovereign plane until a chain exists to
 * quote**, and a refusal code is the honest form of that sentence. The moment
 * `socket.evm-rpc` closes and svc-indexer projects a real book, this adapter
 * starts answering without a line of it changing.
 *
 * ── Two refusals that are not the same thing ────────────────────────────────
 *
 * · `halted` — the projection hit a reorg deeper than its retained history. It
 *   knows its book is wrong and cannot repair it. svc-indexer already leaves its
 *   own readiness rotation for this; a quote path that read the book anyway
 *   would be reading the one state that service explicitly declares untrustworthy.
 * · `asOfHeight === null` — nothing has been indexed at all. An empty book from
 *   an empty index is not "no liquidity", it is "no data", and pricing against
 *   it would report a market with no bids as a market with no buyers.
 *
 * ── The freshness this adapter can and cannot enforce ───────────────────────
 *
 * It enforces observation age: `observedAt` is stamped when the read returns and
 * `quote-service.ts` refuses anything past `QUOTE_MAX_AGE_MS`.
 *
 * It does NOT measure how far behind the chain the projection is. That needs the
 * head block's own timestamp, and `indexer.status` publishes `indexedHeight` and
 * `halted` but no block time. A projection that is up, unhalted and twenty
 * blocks behind therefore looks fresh here. Closing that gap is one extra field
 * on svc-indexer's status output — a change to another service, so it is
 * recorded here rather than smuggled in.
 */

export interface IndexerVenueOptions extends HttpVenueOptions, MarketDataSourceOptions {
  readonly feeBps: number;
  readonly settlementCost: Amount;
  /** Forwarded so a screened region stays screened at the upstream too. */
  readonly region?: string;
}

interface TrpcEnvelope {
  result?: { data?: unknown };
}

function unwrap(venueId: string, body: unknown, what: string): Record<string, unknown> {
  const data = (body as TrpcEnvelope | null)?.result?.data;
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new VenueUnavailableError(venueId, 'malformed', `svc-indexer ${what} response carried no result data`);
  }
  return data as Record<string, unknown>;
}

export class IndexerQuoteVenue extends MarketDataSource {
  readonly id = 'intachain-clob';
  readonly kind: VenueKind = 'external-dex';
  readonly feeBps: number;
  readonly settlementCost: Amount;

  readonly #baseUrl: string;
  readonly #http: HttpVenueOptions;
  readonly #headers: Record<string, string>;

  constructor(options: IndexerVenueOptions) {
    super(options);
    this.#baseUrl = trimBaseUrl(options.baseUrl);
    this.#http = options;
    this.feeBps = options.feeBps;
    this.settlementCost = options.settlementCost;
    this.#headers = options.region ? { 'x-intafaced-region': options.region } : {};
  }

  protected async fetchDepth(symbol: string, limit: number): Promise<TimestampedBook> {
    const input = encodeURIComponent(JSON.stringify({ market: symbol, depth: limit }));

    // Both in flight together. Sequential calls would make the book older than
    // the status that vouched for it by a whole round trip, against a ceiling
    // that is 2000ms by default.
    const [statusBody, bookBody] = await Promise.all([
      getJson(this.id, `${this.#baseUrl}/trpc/status`, this.#http, this.#headers),
      getJson(this.id, `${this.#baseUrl}/trpc/book?input=${input}`, this.#http, this.#headers),
    ]);

    // Stamped after both reads land, so it describes the older of the two.
    const observedAt = new Date();

    const status = unwrap(this.id, statusBody, 'status');
    if (status.halted !== null && status.halted !== undefined) {
      const reason = (status.halted as { reason?: unknown }).reason;
      throw new VenueUnavailableError(
        this.id,
        'not_ready',
        `svc-indexer is halted (${typeof reason === 'string' ? reason : 'unknown reason'}) — its projection knows it is wrong`,
      );
    }

    const view = unwrap(this.id, bookBody, 'book');
    if (view.asOfHeight === null || view.asOfHeight === undefined) {
      throw new VenueUnavailableError(
        this.id,
        'not_ready',
        'svc-indexer has projected no chain state — there is no on-chain book to quote (SOCKET §13 socket.evm-rpc)',
      );
    }
    if (typeof view.asOfHeight !== 'number' || !Number.isInteger(view.asOfHeight)) {
      throw new VenueUnavailableError(this.id, 'malformed', 'svc-indexer book carried no integer asOfHeight');
    }

    return {
      venueId: this.id,
      symbol,
      bids: parseLevels(view.bids, 'bids', this.id),
      asks: parseLevels(view.asks, 'asks', this.id),
      observedAt,
      // Block height is this venue's sequence: it is monotonic on the canonical
      // chain and it is what `asOfHash` pins the book to.
      sequence: view.asOfHeight,
    };
  }
}
