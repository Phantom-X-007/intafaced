/**
 * Mark from matching depth (trade.futures residual).
 *
 * Adapts EngineDepth (bids/asks levels) into MarkSource via mid-of-book.
 * Empty or one-sided book → null (never invent; never fall back to last
 * unless policy opts in — default still mid-only).
 *
 * Does not call matching itself; inject depth reader (svc-matching port).
 */
import type { EngineDepth } from '../spot/matching-client.js';
import type { MarkSource } from './liquidation-tick.js';
import { markSourceFromBook, type FuturesMarkPolicy } from './mark-source.js';

export type DepthReader = (marketId: string) => Promise<EngineDepth | null>;

/** Best bid/ask price strings from depth levels, or null if empty. */
export function bestFromDepth(depth: EngineDepth | null | undefined): {
  bestBid: string | null;
  bestAsk: string | null;
} {
  if (!depth) return { bestBid: null, bestAsk: null };
  const bid = depth.bids[0]?.[0] ?? null;
  const ask = depth.asks[0]?.[0] ?? null;
  return {
    bestBid: bid && bid.length > 0 ? bid : null,
    bestAsk: ask && ask.length > 0 ? ask : null,
  };
}

/**
 * MarkSource that mids the injected book. Never invents when empty.
 * `last` is always null here — last print is a separate feed.
 */
export function markSourceFromDepth(readDepth: DepthReader, policy?: FuturesMarkPolicy): MarkSource {
  return markSourceFromBook({
    policy,
    async readBook(marketId) {
      const depth = await readDepth(marketId);
      if (!depth) return null;
      const { bestBid, bestAsk } = bestFromDepth(depth);
      return { bestBid, bestAsk, last: null };
    },
  });
}
