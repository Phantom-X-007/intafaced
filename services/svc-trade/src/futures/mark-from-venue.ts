/**
 * Mark from §27 venue fabric public book (A-TRADE-VENUE-1 / venue.aggregation).
 *
 * Consumes `MarketDataAdapter.snapshotBook` — the credential-free public half
 * of packages/venue-adapter. Never invents a price:
 *   · unmapped marketId → null
 *   · empty / one-sided book → null
 *   · venue error / rate-limit / unreachable → null
 *
 * Quality is `mid` (two-sided book mid), not `index`. Liquidation consumers
 * already accept mid under the default MarkPolicy.
 *
 * Does not open WS streams here — a single REST snapshot is enough for a mark
 * tick. Streaming/gap-detection stays inside the fabric for adapters that need it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS MID USED TO BE SIZE-BLIND TOO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `midFromVenueBook` and the `readBook` below both read `snap.bids[0][0]` — the
 * PRICE at each best level — and discarded `[1]`, the QUANTITY, entirely. It is
 * the same defect `bestFromDepth` had before c7dfb5e4, named in that PR's
 * "honestly unproven" section and deliberately left for this one.
 *
 * It is the WORSE half of the pair. `mark-from-depth.ts` could at least argue
 * that its book is ours: nobody can rest an order on the matching engine
 * without going through our order path. This book belongs to somebody else.
 * A thin listing on an external venue, a market the venue is delisting, an
 * hour when its market makers have pulled — none of those need an attacker and
 * none of them are within this platform's control. `snapshotBook` returns what
 * the venue publishes, and what the venue publishes at 03:00 on an illiquid
 * pair can be two orders worth a fraction of a cent.
 *
 * The rule is `mark-from-depth.ts`'s, imported rather than restated: a best
 * level worth less than `minBestLevelNotional` is read as ABSENT, one absent
 * side makes the book one-sided, and a one-sided book already had exactly one
 * honest answer here — `null`, at the top of this header, already written.
 *
 * REFUSING, NOT DOWNGRADING, for the reason `mark-from-depth.ts` argues at
 * length: a `last`-shaped downgrade still clears `acceptableForMarking`, so it
 * still reaches margin-call arithmetic and a trader's screen as though somebody
 * had quoted it. And on the preference chain in `futures-jobs.ts` a refusal is
 * not even an outage — `markSourcePrefer` falls through to matching depth,
 * which runs the same gate on its own book.
 *
 * THE NUMBERS ARE THE SAME NUMBERS, deliberately. See `DepthQuotePolicy`.
 *
 * AND SO IS THE RELATIVE ONE. `mark-from-depth.ts` grew a second, size-relative
 * requirement — a best level must carry a stated fraction of the POSITION whose
 * payout its mid would authorise — after an absolute floor was measured paying
 * 190,000 USDT out of the profit pot. That requirement is imported here through
 * the same `bestLevelIsQuotable`, for the same reason the floor was: this is
 * somebody else's book, on which we control neither the depth nor the resting
 * size, so if anything the argument is stronger. `authorisesSize` arrives on
 * `MarkRequest` and is threaded to the level check without being re-decided.
 */
import { formatAmount } from '@intafaced/ledger-client/money';
import type { MarketDataAdapter } from '@intafaced/venue-contracts';
import { BinanceSpotMarketData } from '@intafaced/venue-adapter';
import type { MarkRequest, MarkSource, QuotedMarkSource } from './liquidation-tick.js';
import { markSourceFromBook, midFromBook } from './mark-source.js';
import {
  DEFAULT_DEPTH_QUOTE_POLICY,
  bestLevelIsQuotable,
  depthRequirement,
  type DepthQuotePolicy,
  type DepthQuoteRequirement,
} from './mark-from-depth.js';
import type { MarkPolicy } from './mark-policy.js';

export type VenueSymbolResolver = (marketId: string) => string | null;

/** Top-of-book levels as the fabric hands them over: scaled-bigint pairs. */
interface VenueTopOfBook {
  bids: readonly (readonly [bigint, bigint])[];
  asks: readonly (readonly [bigint, bigint])[];
}

/**
 * Best bid/ask price strings from a venue snapshot, or null if the side is
 * empty — or too thin to be worth quoting, which this file treats as the same
 * thing, exactly as `bestFromDepth` does for the matching book.
 *
 * The requirement argument is REQUIRED and carries the position being priced —
 * the unsafe reading must not be the one you get by leaving an argument off, and
 * on this function the unsafe reading is now "size-blind about the payout" as
 * well as "size-blind about the level". Build it with `depthRequirement(size)`,
 * or `depthRequirement(null)` where the read authorises nothing.
 */
export function bestFromVenueBook(
  snapshot: VenueTopOfBook,
  requirement: DepthQuoteRequirement,
): { bestBid: string | null; bestAsk: string | null } {
  const side = (level: readonly [bigint, bigint] | undefined): string | null => {
    if (!level) return null;
    const [price, quantity] = level;
    if (typeof price !== 'bigint' || typeof quantity !== 'bigint') return null;
    return bestLevelIsQuotable(price, quantity, requirement) ? formatAmount(price) : null;
  };

  return { bestBid: side(snapshot.bids[0]), bestAsk: side(snapshot.asks[0]) };
}

/**
 * Mid from a venue book snapshot (top of book).
 * Null when either side is missing, or too thin to quote — never invents.
 */
export function midFromVenueBook(snapshot: VenueTopOfBook, requirement: DepthQuoteRequirement): string | null {
  const { bestBid, bestAsk } = bestFromVenueBook(snapshot, requirement);
  return midFromBook(bestBid, bestAsk);
}

/**
 * MarkSource that mids an external venue public book via MarketDataAdapter.
 * Inject the adapter (real BinanceSpotMarketData or a test double).
 */
export function markSourceFromVenuePublicBook(input: {
  adapter: Pick<MarketDataAdapter, 'snapshotBook'>;
  /** marketId → unified venue symbol (e.g. BTC/USDT). Missing → null mark. */
  resolveSymbol: VenueSymbolResolver;
  policy?: MarkPolicy;
  /** Snapshot depth — top of book only needs a few levels. Default 5. */
  depthLimit?: number;
  /**
   * Both depth thresholds — the absolute floor at a best level, and the fraction
   * of the priced position that must rest behind it. Optional, and omitting it
   * applies the defaults; see `DEFAULT_MIN_BEST_LEVEL_NOTIONAL` and
   * `DEFAULT_MIN_BEST_LEVEL_BPS_OF_NOTIONAL` in `mark-from-depth.ts` for the
   * numbers and for whose ruling they are awaiting.
   */
  depthPolicy?: DepthQuotePolicy;
}): QuotedMarkSource {
  const limit = input.depthLimit ?? 5;
  const depthPolicy = input.depthPolicy ?? DEFAULT_DEPTH_QUOTE_POLICY;
  return markSourceFromBook({
    policy: input.policy,
    async readBook(marketId, authorisesSize) {
      const symbol = input.resolveSymbol(marketId);
      if (symbol == null || symbol.trim() === '') return null;
      try {
        const snap = await input.adapter.snapshotBook(symbol, limit);
        const { bestBid, bestAsk } = bestFromVenueBook(snap, depthRequirement(authorisesSize, depthPolicy));
        return { bestBid, bestAsk, last: null };
      } catch {
        // Venue down / rate limited / malformed — null, never invent a mid.
        return null;
      }
    },
  });
}

/**
 * Prefer primary (venue fabric) when it has a mark; else secondary (matching depth).
 * Either may return null — still never invents.
 *
 * Preference runs at the QUOTE level too, so the winning source's quality and
 * observation time survive the fallback. Collapsing to a bare price string here
 * would hand the liquidation gate an unlabelled mark, and an unlabelled mark is
 * one the gate has no grounds to refuse.
 *
 * THE WHOLE REQUEST IS FORWARDED, `authorisesSize` included. Typing this
 * parameter as anything narrower than `MarkRequest` would silently drop the
 * stake on the way to the source that actually checks it — the fallback path
 * quietly running a weaker gate than the primary, which is how a size-blind
 * reading gets back in after being closed twice.
 */
export function markSourcePrefer(primary: MarkSource, secondary: MarkSource): MarkSource {
  const quote =
    primary.quote || secondary.quote
      ? async (args: MarkRequest) => {
          const first = primary.quote ? await primary.quote(args) : null;
          if (first != null) return first;
          return secondary.quote ? await secondary.quote(args) : null;
        }
      : undefined;

  return {
    async markPrice(args) {
      const first = await primary.markPrice(args);
      if (first != null) return first;
      return secondary.markPrice(args);
    },
    ...(quote ? { quote } : {}),
  };
}

/**
 * Parse `marketId:BTC/USDT,other:ETH/USDT`.
 * Empty / whitespace → empty map (no invent of symbols).
 * Malformed pairs (no colon, empty either side) are skipped.
 */
export function parseVenueMarkSymbols(raw: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (raw == null || raw.trim() === '') return out;
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(':');
    if (colon <= 0) continue;
    const marketId = trimmed.slice(0, colon).trim();
    const symbol = trimmed.slice(colon + 1).trim();
    if (!marketId || !symbol) continue;
    out.set(marketId, symbol);
  }
  return out;
}

/**
 * Supported venue ids for this thin mount.
 * Unknown id → null (refuse invent of an adapter).
 * Empty / off / none → null (feature off).
 */
export function createVenueMarketDataAdapter(
  venueId: string,
  options?: ConstructorParameters<typeof BinanceSpotMarketData>[0],
): MarketDataAdapter | null {
  const id = venueId.trim().toLowerCase();
  if (!id || id === 'off' || id === 'none' || id === 'false') return null;
  if (id === 'binance-spot') return new BinanceSpotMarketData(options);
  return null;
}

/**
 * Build a venue mark source from ops config, or null when not configured / unknown venue.
 * Symbol map empty is allowed — every market then resolves to null until mapped.
 */
export function createConfiguredVenueMarkSource(input: {
  venueId: string;
  /** Raw `marketId:SYMBOL,...` or pre-parsed map. */
  symbols: string | Map<string, string>;
  policy?: MarkPolicy;
  /** Injectable for tests (skip real HTTP). Requires a non-empty venueId. */
  adapter?: Pick<MarketDataAdapter, 'snapshotBook'> | null;
  /**
   * Both depth thresholds — absolute floor and fraction-of-position. Omitted →
   * the defaults.
   *
   * Present so that the day the owner rules differently for external venues than
   * for our own book, the answer lands here and no call site moves. Today they
   * are deliberately the same numbers on both paths — see the notes on
   * `DEFAULT_MIN_BEST_LEVEL_NOTIONAL` and
   * `DEFAULT_MIN_BEST_LEVEL_BPS_OF_NOTIONAL`.
   */
  depthPolicy?: DepthQuotePolicy;
}): { source: QuotedMarkSource; venueId: string; symbolCount: number } | null {
  const venueId = input.venueId.trim().toLowerCase();
  // Feature off — empty / off / none never invents a mark port.
  if (!venueId || venueId === 'off' || venueId === 'none' || venueId === 'false') return null;

  const map = typeof input.symbols === 'string' ? parseVenueMarkSymbols(input.symbols) : input.symbols;
  const adapter = input.adapter === undefined ? createVenueMarketDataAdapter(venueId) : input.adapter;
  if (!adapter) return null;

  return {
    venueId,
    symbolCount: map.size,
    source: markSourceFromVenuePublicBook({
      adapter,
      resolveSymbol: (marketId) => map.get(marketId) ?? null,
      policy: input.policy,
      ...(input.depthPolicy ? { depthPolicy: input.depthPolicy } : {}),
    }),
  };
}
