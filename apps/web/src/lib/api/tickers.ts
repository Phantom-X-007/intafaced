import { z } from 'zod';
import type { EdgeClient } from './edge-client';
import type { Result } from '../result';

/**
 * ALL-MARKET TICKERS — svc-edge `/api/v1/tickers` → svc-trade `public-rest.ts`.
 *
 * Public: no bearer. CCXT `fetchTickers` shape — a record keyed by unified
 * symbol.
 *
 * ── Every price on this contract is `string | null`, and both halves matter ──
 *
 * `string` because money is never a `number` in this codebase. The service
 * sends `formatAmount`'d decimal strings straight off the fill tape, and this
 * client hands them to the renderer untouched: no `parseFloat`, no
 * `toLocaleString`, no thousands separators added on the way past. A price that
 * has been through a float is a price this app cannot promise it did not round.
 *
 * `null` because svc-trade refuses to invent. `presentTicker` returns `last:
 * null` for a market that has never traded, and every 24h rollup — high, low,
 * vwap, change, percentage, baseVolume, quoteVolume — is `null` unconditionally
 * until a windowed aggregation job exists. A caller that renders `null` as `0`,
 * or as `—` next to a currency symbol, has undone the honesty at the last inch.
 * Render the absence as an absence.
 *
 * Unknown keys are stripped by the object schema, so a service that adds a
 * field does not break this client; a service that changes a price to a number
 * does, on purpose.
 */

const tickerSchema = z.object({
  symbol: z.string(),
  timestamp: z.number().int().nonnegative(),
  datetime: z.string(),
  /** Best bid / ask off the book. Null when the book is empty or unavailable. */
  bid: z.string().nullable(),
  ask: z.string().nullable(),
  /** Last traded price. Null when the market has never traded — never zero. */
  last: z.string().nullable(),
  /** Signed 24h change, e.g. "+2.41". Null until the aggregation job exists. */
  percentage: z.string().nullable(),
  baseVolume: z.string().nullable(),
  quoteVolume: z.string().nullable(),
});

export type Ticker = z.infer<typeof tickerSchema>;

const tickersSchema = z.record(z.string(), tickerSchema);

export type TickerMap = z.infer<typeof tickersSchema>;

/** Public. Empty record when nothing is listed; `last: null` when nothing traded. */
export function fetchTickers(edge: EdgeClient): Promise<Result<TickerMap>> {
  return edge.restGet('/api/v1/tickers', tickersSchema, { auth: false });
}

/** Symbols in a stable order — the service returns an unordered record. */
export function tickersInOrder(map: TickerMap): readonly Ticker[] {
  return Object.keys(map)
    .sort()
    .map((symbol) => map[symbol]!);
}

/** How many listed markets have a last price. Zero is the honest common case. */
export function tradedCount(tickers: readonly Ticker[]): number {
  return tickers.filter((t) => t.last !== null).length;
}
