/**
 * Futures mark feed (trade.futures residual).
 *
 * PURE PORT: supplies marks to the liquidation tick, the close path and public
 * REST. Never invents a price. Missing / malformed → null.
 *
 * ── Source and gate are two jobs ─────────────────────────────────────────────
 *
 * A source's job is to say WHAT IT HAS and HOW IT GOT IT — a price, when it was
 * observed, and whether it is a mid, a last print or a real index. Deciding
 * whether that is good enough to move someone's money is `mark-policy.ts`'s
 * job, and it answers differently for a valuation than for a liquidation.
 *
 * This file used to do both, with its own `maxAgeMs` / `liquidateOn` spelling.
 * That was a second mark vocabulary next to `svc-bank/src/loans/prices.ts`, and
 * `docs/adr/2026-08-05-futures-risk-and-mark-law.md` is explicit that futures
 * uses the existing one. So the policy type here IS `MarkPolicy`, and the
 * gates are `acceptableForMarking` / `acceptableForLiquidation`.
 *
 * A wrong mark becomes someone else's liquidation. Prefer null over guess.
 */
import { formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client';
import type { MarkSource, QuotedMarkSource } from './liquidation-tick.js';
import {
  DEFAULT_FUTURES_MARK_POLICY,
  acceptableForLiquidation,
  type FuturesQuotedMark,
  type MarkPolicy,
  type MarkQuality,
} from './mark-policy.js';

/**
 * Convenience input for feeding a mark in as decimal strings — an ergonomic
 * setter for the in-memory book and for tests, not a second mark shape. It is
 * converted to `FuturesQuotedMark` (scaled bigint + Date) on the way in, and
 * nothing downstream sees this type.
 */
export interface FuturesMarkQuote {
  /** Decimal string price. */
  price: string;
  quality: MarkQuality;
  /** When the quote was observed (ms epoch). */
  asOfMs: number;
  marketId: string;
  symbol?: string;
}

/** Parse a fed quote into the money-path shape. Non-positive / malformed → null. */
export function toQuotedMark(input: FuturesMarkQuote): FuturesQuotedMark | null {
  if (!isPositiveDecimal(input.price)) return null;
  let price: Amount;
  try {
    price = parseAmount(input.price);
  } catch {
    return null;
  }
  if (price <= 0n) return null;
  return {
    marketId: input.marketId,
    symbol: input.symbol,
    price,
    asOf: new Date(input.asOfMs),
    quality: input.quality,
  };
}

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
  const frac = (a % scale).toString().padStart(18, '0').replace(/0+$/, '');
  const body = frac.length === 0 ? whole.toString() : `${whole}.${frac}`;
  return neg ? `-${body}` : body;
}

/**
 * The legacy string port, derived from a quoted source by running the
 * LIQUIDATION gate. `MarkSource.markPrice` is what the liquidation tick and
 * public REST have always consumed, and it has always meant "a price I am
 * willing to close a position on" — so the strict gate is the honest one here.
 * Callers that need the weaker valuation bar ask for `quote()` and gate it
 * themselves with `acceptableForMarking`.
 *
 * ── THE DEVIATION BREAKER IS NOT ARMED HERE, AND CANNOT BE ───────────────────
 *
 * Its basis is "the last mark THIS POSITION was accepted against", and this is a
 * per-MARKET port with no position in scope — there is nothing for it to look
 * up, so `null` here is a statement about the shape of the port and not the
 * oversight that `accepted-mark.ts` was written to fix.
 *
 * The money-moving callers do not rely on this gate for the breaker. Both
 * `liquidation-tick.ts` and `PositionService.requirePayoutGrade` hold a position
 * id, read a basis, and re-run `acceptableForLiquidation` with it before
 * anything is seized or paid. What reaches a screen through `markPrice()` is
 * still gated on quality, staleness and sign.
 */
function markPriceFromQuote(
  quote: (input: { marketId: string; symbol?: string; at: Date }) => Promise<FuturesQuotedMark | null>,
  policy: MarkPolicy,
): MarkSource['markPrice'] {
  return async (input) => {
    const q = await quote(input);
    if (!q) return null;
    if (!acceptableForLiquidation(q, null, input.at, policy).ok) return null;
    return formatAmount(q.price);
  };
}

/**
 * In-memory mark book for tests and single-process dev.
 * Production will replace with an index feed adapter — same QuotedMarkSource port.
 */
export function memoryMarkBook(): {
  set(quote: FuturesMarkQuote): void;
  clear(marketId: string): void;
  source(policy?: MarkPolicy): QuotedMarkSource;
  /** Raw labelled quote — no gate applied. Null when absent or the price is not a price. */
  quote(marketId: string, symbol?: string): FuturesQuotedMark | null;
} {
  // No clock here on purpose: `asOfMs` is when the feed OBSERVED the price, and
  // stamping it at read time is how a stale mark passes a staleness check.
  const byMarket = new Map<string, FuturesQuotedMark>();

  function raw(marketId: string, symbol?: string): FuturesQuotedMark | null {
    const q = byMarket.get(marketId);
    if (!q) return null;
    return symbol != null && q.symbol == null ? { ...q, symbol } : q;
  }

  return {
    set(quote) {
      const parsed = toQuotedMark(quote);
      // A non-positive or malformed feed value is not a cheap market, it is a
      // broken feed. Refusing it here keeps it out of the book entirely.
      if (parsed) byMarket.set(quote.marketId, parsed);
      else byMarket.delete(quote.marketId);
    },
    clear(marketId) {
      byMarket.delete(marketId);
    },
    quote(marketId, symbol) {
      return raw(marketId, symbol);
    },
    source(policy) {
      const p = policy ?? DEFAULT_FUTURES_MARK_POLICY;
      const quote = async (args: { marketId: string; symbol?: string; at: Date }): Promise<FuturesQuotedMark | null> =>
        raw(args.marketId, args.symbol);
      return {
        quote,
        markPrice: markPriceFromQuote(quote, p),
      };
    },
  };
}

/**
 * Build a QuotedMarkSource from an injectable book snapshot reader.
 *
 * Mid when two-sided (quality `mid`); otherwise the last print, LABELLED `last`
 * rather than withheld. Withholding it would leave the valuation path with
 * nothing on a market that has a perfectly good price for a screen — and the
 * liquidation gate refuses `last` anyway, which is where the danger was.
 *
 * Empty book → null (never invent).
 */
export function markSourceFromBook(input: {
  /** Return best bid/ask/last for a market. Any field may be null. */
  readBook: (marketId: string) => Promise<{
    bestBid: string | null;
    bestAsk: string | null;
    last: string | null;
  } | null>;
  policy?: MarkPolicy;
  /**
   * Observation clock. Omitted, the quote is stamped with the instant the
   * CALLER asked for — which for a live book snapshot is the truth: there is no
   * venue timestamp to carry, and the read happened now. Supply this only when
   * the underlying feed knows better than the caller's clock.
   */
  now?: () => Date;
}): QuotedMarkSource {
  const policy = input.policy ?? DEFAULT_FUTURES_MARK_POLICY;

  const quote = async (args: { marketId: string; symbol?: string; at: Date }): Promise<FuturesQuotedMark | null> => {
    const book = await input.readBook(args.marketId);
    if (!book) return null;
    const asOfMs = (input.now ? input.now() : args.at).getTime();

    const mid = midFromBook(book.bestBid, book.bestAsk);
    if (mid != null) {
      return toQuotedMark({ marketId: args.marketId, symbol: args.symbol, price: mid, quality: 'mid', asOfMs });
    }
    if (book.last != null) {
      return toQuotedMark({ marketId: args.marketId, symbol: args.symbol, price: book.last, quality: 'last', asOfMs });
    }
    return null;
  };

  return {
    quote: (args) => quote(args),
    markPrice: markPriceFromQuote(quote, policy),
  };
}

function isPositiveDecimal(s: string): boolean {
  if (!/^\d+(\.\d+)?$/.test(s.trim())) return false;
  // reject all-zero
  return /[1-9]/.test(s);
}
