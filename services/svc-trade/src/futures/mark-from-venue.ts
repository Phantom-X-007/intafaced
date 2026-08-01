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
 * already accept mid under the default FuturesMarkPolicy.
 *
 * Does not open WS streams here — a single REST snapshot is enough for a mark
 * tick. Streaming/gap-detection stays inside the fabric for adapters that need it.
 */
import { formatAmount } from '@intafaced/ledger-client/money';
import type { MarketDataAdapter } from '@intafaced/venue-contracts';
import { BinanceSpotMarketData } from '@intafaced/venue-adapter';
import type { MarkSource } from './liquidation-tick.js';
import { markSourceFromBook, midFromBook, type FuturesMarkPolicy } from './mark-source.js';

export type VenueSymbolResolver = (marketId: string) => string | null;

/**
 * Mid from a venue book snapshot (top of book).
 * Null when either side missing — never invents.
 */
export function midFromVenueBook(snapshot: {
  bids: readonly (readonly [bigint, bigint])[];
  asks: readonly (readonly [bigint, bigint])[];
}): string | null {
  const bestBid = snapshot.bids[0] ? formatAmount(snapshot.bids[0][0]) : null;
  const bestAsk = snapshot.asks[0] ? formatAmount(snapshot.asks[0][0]) : null;
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
  policy?: FuturesMarkPolicy;
  /** Snapshot depth — top of book only needs a few levels. Default 5. */
  depthLimit?: number;
}): MarkSource {
  const limit = input.depthLimit ?? 5;
  return markSourceFromBook({
    policy: input.policy,
    async readBook(marketId) {
      const symbol = input.resolveSymbol(marketId);
      if (symbol == null || symbol.trim() === '') return null;
      try {
        const snap = await input.adapter.snapshotBook(symbol, limit);
        const bestBid = snap.bids[0] ? formatAmount(snap.bids[0][0]) : null;
        const bestAsk = snap.asks[0] ? formatAmount(snap.asks[0][0]) : null;
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
 */
export function markSourcePrefer(primary: MarkSource, secondary: MarkSource): MarkSource {
  return {
    async markPrice(args) {
      const first = await primary.markPrice(args);
      if (first != null) return first;
      return secondary.markPrice(args);
    },
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
  policy?: FuturesMarkPolicy;
  /** Injectable for tests (skip real HTTP). Requires a non-empty venueId. */
  adapter?: Pick<MarketDataAdapter, 'snapshotBook'> | null;
}): { source: MarkSource; venueId: string; symbolCount: number } | null {
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
    }),
  };
}
