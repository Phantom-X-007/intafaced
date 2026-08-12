import { formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client/money';
import type { OrderBook } from '@intafaced/exchange-contract';
import { VenueUnavailableError, type MarketDataAdapter, type PriceLevel, type VenueBookSnapshot } from '@intafaced/venue-contracts';

/**
 * PAYOUT-GRADE BOOKS — the absolute floor the fabric refuses to serve below.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS LIVES IN THE ADAPTER, NOT ONLY IN svc-trade
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `services/svc-trade/src/futures/mark-from-depth.ts` already treats a best
 * level worth less than this floor as ABSENT before minting a mid. That is the
 * right rule for a mark. It is not enough for the fabric: a dust book that
 * leaves the adapter looking like a real two-sided quote is still a dust book
 * for every other consumer — MM mid seed, cross-check, anything that mids
 * `snapshotBook` without re-running the trade gate.
 *
 * D26-P1-T8 closes that hole at the boundary. An adapter that has read both
 * sides and finds either best level below the floor REFUSES (`no_depth`) rather
 * than handing over a book that can mint a mid. Empty and one-sided books still
 * pass through unchanged — "no liquidity" is a fact, not a dust quote pretending
 * to be one.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ONE NUMBER, NOT A SECOND RULING
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `DEFAULT_MIN_BEST_LEVEL_NOTIONAL` is the SAME decimal string as
 * `mark-from-depth.ts` (`'100'` quote units). It is DIRECTION §8 item 8's
 * absolute floor — a placeholder awaiting the owner, not a considered risk
 * limit. A second default here would be a second unruled number. When the
 * owner rules, both call sites move together; until then the fabric and the
 * mark path refuse the same dust.
 *
 * Position-relative size (`DEFAULT_MIN_BEST_LEVEL_BPS_OF_NOTIONAL`) stays in
 * svc-trade: adapters do not know which position a mid would authorise.
 */

/** Absolute floor in quote-asset units. Must stay equal to mark-from-depth's. */
export const DEFAULT_MIN_BEST_LEVEL_NOTIONAL = '100';

const SCALE = 10n ** 18n;

export interface PayoutGradePolicy {
  /**
   * Decimal string, quote-asset units. Omitting applies
   * `DEFAULT_MIN_BEST_LEVEL_NOTIONAL`. An unreadable value falls back to that
   * default rather than skipping the check.
   */
  readonly minBestLevelNotional?: string;
}

/** Explicit default for callers (e.g. consolidateBook) that prefer a named policy object. */
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

/**
 * Quote notional of one level (`price × quantity`), both operands 1e18-scaled.
 * Returns `0n` for non-positive inputs rather than inventing a floor pass.
 */
export function levelNotional(price: Amount, quantity: Amount): Amount {
  if (price <= 0n || quantity <= 0n) return 0n;
  return (price * quantity) / SCALE;
}

export function minBestLevelNotional(policy: PayoutGradePolicy = {}): Amount {
  const raw = policy.minBestLevelNotional ?? DEFAULT_MIN_BEST_LEVEL_NOTIONAL;
  try {
    return parseAmount(raw);
  } catch {
    return parseAmount(DEFAULT_MIN_BEST_LEVEL_NOTIONAL);
  }
}

/** True when a resting best level clears the absolute payout-grade floor. */
export function bestLevelMeetsPayoutFloor(level: PriceLevel | undefined, policy: PayoutGradePolicy = {}): boolean {
  if (!level) return false;
  const [price, quantity] = level;
  return levelNotional(price, quantity) >= minBestLevelNotional(policy);
}

/**
 * Is this snapshot payout-grade for a two-sided mid?
 *
 * Empty / one-sided → `false` (no mid exists). Both sides present but either
 * best level below the floor → `false`. Both sides present and thick enough →
 * `true`.
 */
export function isPayoutGradeBook(snapshot: VenueBookSnapshot, policy: PayoutGradePolicy = {}): boolean {
  return bestLevelMeetsPayoutFloor(snapshot.bids[0], policy) && bestLevelMeetsPayoutFloor(snapshot.asks[0], policy);
}

/**
 * Refuse a dust two-sided book at the adapter boundary.
 *
 * Returns the snapshot unchanged when:
 *   · either side is empty (honest absence — caller decides whether to price), or
 *   · both best levels clear the absolute floor.
 *
 * Throws `VenueUnavailableError` with reason `no_depth` when both sides have a
 * best level and either fails the floor — the dust-book case that once minted
 * payout-grade mids off femto-cent depth.
 */
export function assertPayoutGradeBook(snapshot: VenueBookSnapshot, policy: PayoutGradePolicy = {}): VenueBookSnapshot {
  const bid = snapshot.bids[0];
  const ask = snapshot.asks[0];
  // No two-sided quote to defend. Empty and one-sided stay facts, not errors.
  if (!bid || !ask) return snapshot;

  const floor = minBestLevelNotional(policy);
  const bidOk = bestLevelMeetsPayoutFloor(bid, policy);
  const askOk = bestLevelMeetsPayoutFloor(ask, policy);
  if (bidOk && askOk) return snapshot;

  const bidN = formatAmount(levelNotional(bid[0], bid[1]));
  const askN = formatAmount(levelNotional(ask[0], ask[1]));
  throw new VenueUnavailableError(
    snapshot.venueId,
    'no_depth',
    `${snapshot.venueId} ${snapshot.symbol}: book is not payout-grade — best bid notional ${bidN}, ` +
      `best ask notional ${askN}, floor ${formatAmount(floor)} quote. Refusing rather than serving a dust book ` +
      'that could mint a mid (D26-P1-T8 / DEFAULT_MIN_BEST_LEVEL_NOTIONAL).',
  );
}

/**
 * Aggregation / LiquiditySource books use wire decimal strings. Empty and
 * one-sided refuse here — consolidateBook must not merge half a mid.
 * Adapter `assertPayoutGradeBook` stays looser (absence is a fact).
 */
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

/** Wire OrderBook (decimal strings) — used by consolidateBook. */
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

/** Fabric snapshot (scaled bigint levels) — verdict form for wrappers. */
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

/**
 * Wrap a MarketDataAdapter so `snapshotBook` refuses non-payout-grade depth
 * (including empty/one-sided). Prefer `assertPayoutGradeBook` at adapter
 * boundaries when absence must remain a fact rather than an error.
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
