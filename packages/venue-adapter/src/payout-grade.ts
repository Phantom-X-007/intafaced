import { parseAmount, type Amount } from '@intafaced/ledger-client';
import type { OrderBook } from '@intafaced/exchange-contract';
import type { MarketDataAdapter, PriceLevel, VenueBookSnapshot } from '@intafaced/venue-contracts';
import { VenueUnavailableError } from '@intafaced/venue-contracts';

/**
 * PAYOUT-GRADE BOOK GATE (D26-P1-T8 / venue.aggregation).
 *
 * A book that is live, sequenced and fresh can still be worthless: two dust
 * rests mint a mid that money paths must never pay on. svc-trade already gates
 * marks with `bestLevelIsQuotable` in `mark-from-depth.ts`. This module puts the
 * same absolute floor on the §27 fabric side — aggregation and adapters refuse
 * a thin book rather than hand it upstream as usable depth.
 *
 * WHAT THIS CHECKS (absolute floor only). Aggregation does not authorise a
 * named position payout, so the size-relative half of the futures rule has no
 * stake to measure against. The absolute floor is what catches femto-cent books
 * when no position is in scope — the same reading `depthRequirement(null)` uses
 * on the mark path.
 *
 * THE NUMBER IS THE SAME NUMBER, deliberately. `DEFAULT_MIN_BEST_LEVEL_NOTIONAL`
 * below mirrors `services/svc-trade/src/futures/mark-from-depth.ts`. It is a
 * placeholder awaiting the owner's risk-parameter ruling (DIRECTION §8 item 8).
 * A second constant here would be a second unruled number, not a second
 * decision. When the owner rules once, both call sites take the same value.
 *
 * REFUSE, NEVER INVENT. A non-grade book is excluded and reported. There is no
 * mid fabrication, no walk-to-the-next-level, and no silent substitution of
 * another venue's price under this one's name.
 */

/**
 * Minimum resting notional at a best level, in quote-asset units.
 * Same placeholder as svc-trade's mark depth gate — see file header.
 */
export const DEFAULT_MIN_BEST_LEVEL_NOTIONAL = '100';

const SCALE = 10n ** 18n;

export interface PayoutGradePolicy {
  /** Decimal string, quote-asset units. Unreadable → default, never "skip". */
  readonly minBestLevelNotional: string;
}

export const DEFAULT_PAYOUT_GRADE_POLICY: PayoutGradePolicy = {
  minBestLevelNotional: DEFAULT_MIN_BEST_LEVEL_NOTIONAL,
};

export type PayoutGradeRefuseReason = 'empty_book' | 'one_sided' | 'thin_bid' | 'thin_ask' | 'malformed_level';

export interface PayoutGradeAccepted {
  readonly ok: true;
  readonly bestBidNotional: Amount;
  readonly bestAskNotional: Amount;
  readonly minNotional: Amount;
}

export interface PayoutGradeRefused {
  readonly ok: false;
  readonly reason: PayoutGradeRefuseReason;
  readonly detail: string;
  readonly minNotional: Amount;
}

export type PayoutGradeVerdict = PayoutGradeAccepted | PayoutGradeRefused;

export function minBestLevelNotional(policy: PayoutGradePolicy = DEFAULT_PAYOUT_GRADE_POLICY): Amount {
  try {
    return parseAmount(policy.minBestLevelNotional);
  } catch {
    return parseAmount(DEFAULT_MIN_BEST_LEVEL_NOTIONAL);
  }
}

/** Level notional in quote units (both legs 1e18-scaled). */
export function levelNotional(price: Amount, quantity: Amount): Amount {
  if (price <= 0n || quantity <= 0n) return 0n;
  return (price * quantity) / SCALE;
}

export function bestLevelMeetsFloor(price: Amount, quantity: Amount, minNotional: Amount): boolean {
  return levelNotional(price, quantity) >= minNotional;
}

function parseWireLevel(level: readonly [string, string] | undefined): readonly [Amount, Amount] | null {
  if (!level) return null;
  const [price, quantity] = level;
  if (price == null || price.length === 0 || quantity == null || quantity.length === 0) return null;
  try {
    return [parseAmount(price), parseAmount(quantity)] as const;
  } catch {
    return null;
  }
}

function parseScaledLevel(level: PriceLevel | undefined): readonly [Amount, Amount] | null {
  if (!level) return null;
  const [price, quantity] = level;
  if (typeof price !== 'bigint' || typeof quantity !== 'bigint') return null;
  if (price <= 0n || quantity <= 0n) return null;
  return [price, quantity] as const;
}

function verdictFromSides(
  bid: readonly [Amount, Amount] | null,
  ask: readonly [Amount, Amount] | null,
  minNotional: Amount,
  malformed: boolean,
): PayoutGradeVerdict {
  if (malformed) {
    return { ok: false, reason: 'malformed_level', detail: 'best level is not readable as money', minNotional };
  }
  if (bid == null && ask == null) {
    return { ok: false, reason: 'empty_book', detail: 'no resting bids or asks', minNotional };
  }
  if (bid == null || ask == null) {
    return {
      ok: false,
      reason: 'one_sided',
      detail: bid == null ? 'no quotable best bid' : 'no quotable best ask',
      minNotional,
    };
  }
  const bidNotional = levelNotional(bid[0], bid[1]);
  if (bidNotional < minNotional) {
    return {
      ok: false,
      reason: 'thin_bid',
      detail: `best bid notional below payout-grade floor ${DEFAULT_MIN_BEST_LEVEL_NOTIONAL}`,
      minNotional,
    };
  }
  const askNotional = levelNotional(ask[0], ask[1]);
  if (askNotional < minNotional) {
    return {
      ok: false,
      reason: 'thin_ask',
      detail: `best ask notional below payout-grade floor ${DEFAULT_MIN_BEST_LEVEL_NOTIONAL}`,
      minNotional,
    };
  }
  return { ok: true, bestBidNotional: bidNotional, bestAskNotional: askNotional, minNotional };
}

/**
 * Is this LiquiditySource / exchange-contract book thick enough to aggregate?
 *
 * Wire levels are decimal strings. Empty or one-sided books refuse — the same
 * answer a mark path gives when either side is absent.
 */
export function assessOrderBookPayoutGrade(
  book: Pick<OrderBook, 'bids' | 'asks'>,
  policy: PayoutGradePolicy = DEFAULT_PAYOUT_GRADE_POLICY,
): PayoutGradeVerdict {
  const minNotional = minBestLevelNotional(policy);
  let malformed = false;
  const bidRaw = book.bids[0];
  const askRaw = book.asks[0];
  if (bidRaw !== undefined && parseWireLevel(bidRaw) == null) malformed = true;
  if (askRaw !== undefined && parseWireLevel(askRaw) == null) malformed = true;
  return verdictFromSides(parseWireLevel(bidRaw), parseWireLevel(askRaw), minNotional, malformed);
}

/** Fabric snapshot (scaled bigint levels). */
export function assessVenueBookPayoutGrade(
  snapshot: Pick<VenueBookSnapshot, 'bids' | 'asks'>,
  policy: PayoutGradePolicy = DEFAULT_PAYOUT_GRADE_POLICY,
): PayoutGradeVerdict {
  const minNotional = minBestLevelNotional(policy);
  return verdictFromSides(parseScaledLevel(snapshot.bids[0]), parseScaledLevel(snapshot.asks[0]), minNotional, false);
}

export function isPayoutGradeOrderBook(
  book: Pick<OrderBook, 'bids' | 'asks'>,
  policy: PayoutGradePolicy = DEFAULT_PAYOUT_GRADE_POLICY,
): boolean {
  return assessOrderBookPayoutGrade(book, policy).ok;
}

export function isPayoutGradeVenueBook(
  snapshot: Pick<VenueBookSnapshot, 'bids' | 'asks'>,
  policy: PayoutGradePolicy = DEFAULT_PAYOUT_GRADE_POLICY,
): boolean {
  return assessVenueBookPayoutGrade(snapshot, policy).ok;
}

/**
 * Wrap a MarketDataAdapter so `snapshotBook` refuses non-payout-grade depth.
 *
 * Reason is `no_depth`: the venue answered, the book is formed, and nothing at
 * the top is thick enough to stand behind money. Callers that need raw thin
 * books for diagnostics hold the unwrapped adapter.
 */
export function withPayoutGradeGate(
  adapter: MarketDataAdapter,
  policy: PayoutGradePolicy = DEFAULT_PAYOUT_GRADE_POLICY,
): MarketDataAdapter {
  return {
    get venue() {
      return adapter.venue;
    },
    markets: () => adapter.markets(),
    snapshotBook: async (symbol, limit) => {
      const snap = await adapter.snapshotBook(symbol, limit);
      const verdict = assessVenueBookPayoutGrade(snap, policy);
      if (!verdict.ok) {
        throw new VenueUnavailableError(
          adapter.venue.id,
          'no_depth',
          `${adapter.venue.id}:${symbol} book is not payout-grade (${verdict.reason}: ${verdict.detail})`,
        );
      }
      return snap;
    },
    streamBook: (symbol) => adapter.streamBook(symbol),
    streamTrades: adapter.streamTrades?.bind(adapter),
    fundingRate: adapter.fundingRate?.bind(adapter),
    borrowRate: adapter.borrowRate?.bind(adapter),
    latencyGrade: adapter.latencyGrade?.bind(adapter),
  };
}
