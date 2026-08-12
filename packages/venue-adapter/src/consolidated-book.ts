import { type Amount, add, parseAmount, formatAmount, mul, ZERO } from '@intafaced/ledger-client';
import type { OrderBook } from '@intafaced/exchange-contract';
import { isRoutable, type LiquiditySource } from './source.js';
import { assessOrderBookPayoutGrade, DEFAULT_PAYOUT_GRADE_POLICY, type PayoutGradePolicy } from './payout-grade.js';

/**
 * CONSOLIDATED ORDER BOOK.
 *
 * One depth view assembled from every routable venue, each level tagged with
 * where it actually lives. The user sees a single book; the router sees the
 * attribution. Both are true at once, which is the whole trick.
 *
 * D26-P1-T8: a venue whose book is not payout-grade is excluded and reported —
 * thin depth must not enter the consolidated view that routers and marks read.
 */

export interface ConsolidatedLevel {
  readonly price: Amount;
  readonly amount: Amount;
  /** Which venues contribute to this price, and how much each. */
  readonly sources: ReadonlyArray<{ venueId: string; amount: Amount }>;
}

export interface ConsolidatedBook {
  readonly symbol: string;
  /** Descending by price. */
  readonly bids: readonly ConsolidatedLevel[];
  /** Ascending by price. */
  readonly asks: readonly ConsolidatedLevel[];
  readonly timestamp: Date;
  readonly venues: readonly string[];
  readonly excluded: ReadonlyArray<{ venueId: string; reason: string }>;
}

interface Contribution {
  venueId: string;
  amount: Amount;
}

function mergeSide(books: ReadonlyArray<{ venueId: string; book: OrderBook }>, side: 'bids' | 'asks', depth: number): ConsolidatedLevel[] {
  // Price → contributions. Keyed by the canonical decimal string so that
  // "100.50" and "100.5" are the same price level, which they are.
  const byPrice = new Map<string, { price: Amount; contributions: Contribution[] }>();

  for (const { venueId, book } of books) {
    for (const [priceStr, amountStr] of book[side]) {
      const price = parseAmount(priceStr);
      const amount = parseAmount(amountStr);
      if (amount <= 0n) continue;

      const key = formatAmount(price);
      const entry = byPrice.get(key) ?? { price, contributions: [] };
      entry.contributions.push({ venueId, amount });
      byPrice.set(key, entry);
    }
  }

  const levels = [...byPrice.values()].map(({ price, contributions }) => ({
    price,
    amount: contributions.reduce((sum, c) => add(sum, c.amount), ZERO),
    sources: contributions.sort((a, b) => (a.amount === b.amount ? a.venueId.localeCompare(b.venueId) : a.amount > b.amount ? -1 : 1)),
  }));

  levels.sort((a, b) => (a.price === b.price ? 0 : side === 'bids' ? (a.price > b.price ? -1 : 1) : a.price < b.price ? -1 : 1));

  return levels.slice(0, depth);
}

export async function consolidateBook(
  symbol: string,
  sources: readonly LiquiditySource[],
  options: {
    depth?: number;
    now?: Date;
    maxStalenessMs?: number;
    /** Absolute best-level floor. Omit → `DEFAULT_PAYOUT_GRADE_POLICY`. */
    payoutGrade?: PayoutGradePolicy;
  } = {},
): Promise<ConsolidatedBook> {
  const depth = options.depth ?? 50;
  const now = options.now ?? new Date();
  const payoutGrade = options.payoutGrade ?? DEFAULT_PAYOUT_GRADE_POLICY;
  const excluded: Array<{ venueId: string; reason: string }> = [];
  const usable: Array<{ venueId: string; book: OrderBook }> = [];

  const results = await Promise.allSettled(
    sources.map(async (source) => {
      if (!isRoutable(source, now, options.maxStalenessMs ?? 5_000)) {
        throw new Error(source.health().healthy ? 'stale' : (source.health().reason ?? 'unhealthy'));
      }
      const book = await source.orderBook(symbol, depth);
      const grade = assessOrderBookPayoutGrade(book, payoutGrade);
      if (!grade.ok) {
        throw new Error(`not_payout_grade:${grade.reason}:${grade.detail}`);
      }
      return { venueId: source.id, book };
    }),
  );

  for (const [i, result] of results.entries()) {
    const source = sources[i]!;
    if (result.status === 'fulfilled') usable.push(result.value);
    else excluded.push({ venueId: source.id, reason: String(result.reason instanceof Error ? result.reason.message : result.reason) });
  }

  return {
    symbol,
    bids: mergeSide(usable, 'bids', depth),
    asks: mergeSide(usable, 'asks', depth),
    timestamp: now,
    venues: usable.map((u) => u.venueId),
    excluded,
  };
}

/** Best bid / best ask across all venues, with attribution. */
export function topOfBook(book: ConsolidatedBook): {
  bid: ConsolidatedLevel | null;
  ask: ConsolidatedLevel | null;
  spread: Amount | null;
} {
  const bid = book.bids[0] ?? null;
  const ask = book.asks[0] ?? null;
  return { bid, ask, spread: bid && ask ? ask.price - bid.price : null };
}

/**
 * A consolidated book can be crossed — venue A's bid above venue B's ask —
 * which is a real arbitrage, not a bug. Surfacing it is the point: it is a
 * signal for the internal market maker (§5.2) and a warning that naive routing
 * would trade against itself.
 */
export function isCrossed(book: ConsolidatedBook): boolean {
  const { bid, ask } = topOfBook(book);
  return bid !== null && ask !== null && bid.price >= ask.price;
}

/**
 * Cost of sweeping `amount` from one side of the consolidated book, walking
 * levels until filled. Returns what actually fills — a partial answer beats a
 * confident wrong one.
 */
export function sweepCost(
  book: ConsolidatedBook,
  side: 'buy' | 'sell',
  amount: Amount,
): { filled: Amount; cost: Amount; averagePrice: Amount; levelsConsumed: number } {
  const levels = side === 'buy' ? book.asks : book.bids;
  let remaining = amount;
  let cost = ZERO;
  let filled = ZERO;
  let levelsConsumed = 0;

  for (const level of levels) {
    if (remaining <= 0n) break;
    const take = remaining < level.amount ? remaining : level.amount;
    cost = add(cost, mul(level.price, take));
    filled = add(filled, take);
    remaining -= take;
    levelsConsumed++;
  }

  return {
    filled,
    cost,
    averagePrice: filled > 0n ? (cost * 10n ** 18n) / filled : ZERO,
    levelsConsumed,
  };
}
