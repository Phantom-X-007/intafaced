/**
 * Futures mark feed (trade.futures residual).
 *
 * PURE PORT: supplies marks to liquidation tick / funding consumers.
 * Never invents a price. Missing / stale / invalid → null (skip liquidate).
 *
 * Quality ladder (matches bank loans honesty pattern):
 *   - index — real external index (nothing produces this yet in product)
 *   - mid   — mid of a two-sided book when both sides exist
 *   - last  — last trade print (weak; liquidation consumers may refuse)
 *
 * A wrong mark becomes someone else's liquidation. Prefer null over guess.
 */
import type { MarkSource } from './liquidation-tick.js';

export type FuturesMarkQuality = 'index' | 'mid' | 'last';

export interface FuturesMarkQuote {
  /** Decimal string price. */
  price: string;
  quality: FuturesMarkQuality;
  /** When the quote was observed (ms epoch). */
  asOfMs: number;
  marketId: string;
  symbol?: string;
}

export interface FuturesMarkPolicy {
  /**
   * Max age in ms before a quote is treated as missing.
   * Default 60_000. Set 0 to disable staleness.
   */
  maxAgeMs?: number;
  /**
   * Qualities allowed for liquidation decisions.
   * Default: index + mid only (refuse last).
   */
  liquidateOn?: readonly FuturesMarkQuality[];
}

const DEFAULT_LIQ_QUALITIES: readonly FuturesMarkQuality[] = ['index', 'mid'];

/**
 * Mid of best bid / best ask as decimal strings.
 * Returns null if either side missing or non-positive.
 */
export function midFromBook(bestBid: string | null | undefined, bestAsk: string | null | undefined): string | null {
  if (bestBid == null || bestAsk == null || bestBid === '' || bestAsk === '') return null;
  // Pure string decimal mid via bigint scaled 1e18 — avoid float.
  try {
    const SCALE = 10n ** 18n;
    const bid = parseScaled(bestBid, SCALE);
    const ask = parseScaled(bestAsk, SCALE);
    if (bid <= 0n || ask <= 0n || ask < bid) return null;
    const mid = (bid + ask) / 2n;
    return formatScaled(mid, SCALE);
  } catch {
    return null;
  }
}

function parseScaled(s: string, scale: bigint): bigint {
  const t = s.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) throw new Error('bad_decimal');
  const [w, f = ''] = t.split('.');
  const frac = (f + '0'.repeat(18)).slice(0, 18);
  return BigInt(w!) * scale + BigInt(frac || '0');
}

function formatScaled(v: bigint, scale: bigint): string {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const whole = a / scale;
  let frac = (a % scale).toString().padStart(18, '0').replace(/0+$/, '');
  const body = frac.length === 0 ? whole.toString() : `${whole}.${frac}`;
  return neg ? `-${body}` : body;
}

export function isFresh(quote: FuturesMarkQuote, atMs: number, maxAgeMs: number): boolean {
  if (maxAgeMs <= 0) return true;
  return atMs - quote.asOfMs <= maxAgeMs && atMs >= quote.asOfMs;
}

/**
 * In-memory mark book for tests and single-process dev.
 * Production will replace with an index feed adapter — same MarkSource port.
 */
export function memoryMarkBook(opts?: { now?: () => number }): {
  set(quote: FuturesMarkQuote): void;
  clear(marketId: string): void;
  source(policy?: FuturesMarkPolicy): MarkSource;
  /** Full quote including quality (for funding / diagnostics). */
  quote(marketId: string, atMs?: number, policy?: FuturesMarkPolicy): FuturesMarkQuote | null;
} {
  const byMarket = new Map<string, FuturesMarkQuote>();
  const now = opts?.now ?? (() => Date.now());

  function resolve(marketId: string, atMs: number, policy?: FuturesMarkPolicy): FuturesMarkQuote | null {
    const q = byMarket.get(marketId);
    if (!q) return null;
    const maxAge = policy?.maxAgeMs ?? 60_000;
    if (!isFresh(q, atMs, maxAge)) return null;
    const allowed = policy?.liquidateOn ?? DEFAULT_LIQ_QUALITIES;
    if (!allowed.includes(q.quality)) return null;
    if (!isPositiveDecimal(q.price)) return null;
    return q;
  }

  return {
    set(quote) {
      byMarket.set(quote.marketId, quote);
    },
    clear(marketId) {
      byMarket.delete(marketId);
    },
    quote(marketId, atMs, policy) {
      return resolve(marketId, atMs ?? now(), policy);
    },
    source(policy) {
      return {
        async markPrice({ marketId, at }) {
          const q = resolve(marketId, at.getTime(), policy);
          return q?.price ?? null;
        },
      };
    },
  };
}

/**
 * Build a MarkSource from an injectable book snapshot reader.
 * Mid when two-sided; optional last fallback only if policy allows `last`.
 * Empty book → null (never invent).
 */
export function markSourceFromBook(input: {
  /** Return best bid/ask/last for a market. Any field may be null. */
  readBook: (marketId: string) => Promise<{
    bestBid: string | null;
    bestAsk: string | null;
    last: string | null;
  } | null>;
  policy?: FuturesMarkPolicy;
}): MarkSource {
  const policy = input.policy ?? {};
  const allowed = policy.liquidateOn ?? DEFAULT_LIQ_QUALITIES;

  return {
    async markPrice({ marketId }) {
      const book = await input.readBook(marketId);
      if (!book) return null;

      if (allowed.includes('mid')) {
        const mid = midFromBook(book.bestBid, book.bestAsk);
        if (mid != null) return mid;
      }
      if (allowed.includes('last') && book.last != null && isPositiveDecimal(book.last)) {
        return book.last;
      }
      return null;
    },
  };
}

function isPositiveDecimal(s: string): boolean {
  if (!/^\d+(\.\d+)?$/.test(s.trim())) return false;
  // reject all-zero
  return /[1-9]/.test(s);
}
