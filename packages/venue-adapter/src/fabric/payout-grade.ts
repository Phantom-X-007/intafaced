/**
 * PAYOUT-GRADE BOOKS — D26-P1-T8 / venue.aggregation.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * A BOOK THAT CANNOT BACK A PAYOUT MUST NOT LEAVE THE ADAPTER AS A BOOK
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `services/svc-trade`'s mark path already refuses a thin book
 * (`mark-from-depth.ts` / `mark-from-venue.ts`: a best level worth less than
 * `minBestLevelNotional` is read as ABSENT). That refusal lived one layer
 * ABOVE the fabric: adapters still returned dust levels as if they were
 * liquidity, and every consumer had to remember the gate.
 *
 * D26-P1-T8 moves the absolute floor into the fabric so an adapter that has
 * read a book too thin to authorise a payout REFUSES rather than handing it
 * downstream. The mark path's catch-all still maps the throw to `null` mid —
 * never invents — and every other consumer gets the same honesty without
 * re-implementing the check.
 *
 * ── Absolute floor only ────────────────────────────────────────────────────
 *
 * Adapters do not know which position (if any) a caller will price. The
 * size-relative limb in `mark-from-depth.ts` stays on the mark path, where
 * `authorisesSize` exists. Here we apply the same absolute quote-notional
 * floor the mark path uses for "public ticker / no position in scope" reads —
 * one number, one place for the owner's ruling to land. Duplicating a second
 * default would be a second unruled risk parameter, not a second decision.
 *
 * ── Refuse, do not empty ───────────────────────────────────────────────────
 *
 * Returning `bids: []` for a dust book would make "the venue has no liquidity"
 * indistinguishable from "the venue has dust we refused to serve". The typed
 * `no_depth` reason is the vocabulary §27 already uses for "live, fresh, and
 * nothing resting that the caller can use".
 */

import { parseAmount, type Amount } from '@intafaced/ledger-client/money';
import {
  VenueUnavailableError,
  type BookTop,
  type MarketDataAdapter,
  type PriceLevel,
  type VenueBookSnapshot,
} from '@intafaced/venue-contracts';

/**
 * MINIMUM RESTING NOTIONAL AT A BEST LEVEL, IN QUOTE-ASSET UNITS.
 *
 * Same placeholder as `DEFAULT_MIN_BEST_LEVEL_NOTIONAL` in svc-trade's
 * `mark-from-depth.ts`. Kept as a string here so the fabric does not import
 * the service (packages never depend upward). When the owner rules once, both
 * constants move together — do not invent a different number for venues.
 */
export const DEFAULT_PAYOUT_GRADE_MIN_BEST_LEVEL_NOTIONAL = '100';

export interface PayoutGradePolicy {
  /** Decimal string, quote-asset units. See `DEFAULT_PAYOUT_GRADE_MIN_BEST_LEVEL_NOTIONAL`. */
  readonly minBestLevelNotional: string;
}

export const DEFAULT_PAYOUT_GRADE_POLICY: PayoutGradePolicy = {
  minBestLevelNotional: DEFAULT_PAYOUT_GRADE_MIN_BEST_LEVEL_NOTIONAL,
};

const SCALE = 10n ** 18n;

export function payoutGradeMinNotional(policy: PayoutGradePolicy = DEFAULT_PAYOUT_GRADE_POLICY): Amount {
  try {
    return parseAmount(policy.minBestLevelNotional);
  } catch {
    return parseAmount(DEFAULT_PAYOUT_GRADE_MIN_BEST_LEVEL_NOTIONAL);
  }
}

/**
 * Is a single best level thick enough to stand behind a payout-grade quote?
 * `price` and `quantity` are 1e18-scaled bigints.
 */
export function bestLevelIsPayoutGrade(price: Amount, quantity: Amount, policy: PayoutGradePolicy = DEFAULT_PAYOUT_GRADE_POLICY): boolean {
  if (price <= 0n || quantity <= 0n) return false;
  return (price * quantity) / SCALE >= payoutGradeMinNotional(policy);
}

function levelIsPayoutGrade(level: PriceLevel | null | undefined, minNotional: Amount): boolean {
  if (!level) return false;
  const [price, quantity] = level;
  if (typeof price !== 'bigint' || typeof quantity !== 'bigint') return false;
  if (price <= 0n || quantity <= 0n) return false;
  return (price * quantity) / SCALE >= minNotional;
}

/**
 * A two-sided book whose best bid AND best ask each clear the absolute floor.
 * One-sided, empty, or dust on either side → not payout-grade.
 */
export function isPayoutGradeBook(
  snapshot: Pick<VenueBookSnapshot, 'bids' | 'asks'>,
  policy: PayoutGradePolicy = DEFAULT_PAYOUT_GRADE_POLICY,
): boolean {
  const minNotional = payoutGradeMinNotional(policy);
  return levelIsPayoutGrade(snapshot.bids[0], minNotional) && levelIsPayoutGrade(snapshot.asks[0], minNotional);
}

/** Same gate on an already-computed top-of-book (MaintainedBook / cross-check). */
export function isPayoutGradeTop(top: BookTop, policy: PayoutGradePolicy = DEFAULT_PAYOUT_GRADE_POLICY): boolean {
  if (top.bestBid == null || top.bestAsk == null || top.bestBidQty == null || top.bestAskQty == null) return false;
  return bestLevelIsPayoutGrade(top.bestBid, top.bestBidQty, policy) && bestLevelIsPayoutGrade(top.bestAsk, top.bestAskQty, policy);
}

/**
 * Refuse a snapshot that is not payout-grade. Returns the same snapshot when it
 * clears so call sites stay a one-liner: `return assertPayoutGradeBook(snap)`.
 */
export function assertPayoutGradeBook(
  snapshot: VenueBookSnapshot,
  policy: PayoutGradePolicy = DEFAULT_PAYOUT_GRADE_POLICY,
): VenueBookSnapshot {
  if (isPayoutGradeBook(snapshot, policy)) return snapshot;

  const min = policy.minBestLevelNotional || DEFAULT_PAYOUT_GRADE_MIN_BEST_LEVEL_NOTIONAL;
  throw new VenueUnavailableError(
    snapshot.venueId,
    'no_depth',
    `${snapshot.venueId}:${snapshot.symbol} book is not payout-grade — best bid and best ask must each ` +
      `carry at least ${min} quote-asset notional (D26-P1-T8). Thin / one-sided / empty books are refused ` +
      `rather than served as liquidity.`,
  );
}

/**
 * Wrap any `MarketDataAdapter` so `snapshotBook` refuses non-payout-grade books.
 * Concrete venues also call `assertPayoutGradeBook` directly; this exists so a
 * test double or a future venue cannot forget the gate by construction alone.
 */
export function withPayoutGradeRefuse(
  adapter: MarketDataAdapter,
  policy: PayoutGradePolicy = DEFAULT_PAYOUT_GRADE_POLICY,
): MarketDataAdapter {
  return {
    get venue() {
      return adapter.venue;
    },
    markets: () => adapter.markets(),
    snapshotBook: async (symbol, limit) => assertPayoutGradeBook(await adapter.snapshotBook(symbol, limit), policy),
    streamBook: (symbol) => adapter.streamBook(symbol),
    streamTrades: adapter.streamTrades ? (symbol) => adapter.streamTrades!(symbol) : undefined,
    fundingRate: adapter.fundingRate ? (symbol) => adapter.fundingRate!(symbol) : undefined,
    borrowRate: adapter.borrowRate ? (asset) => adapter.borrowRate!(asset) : undefined,
    latencyGrade: adapter.latencyGrade ? (now) => adapter.latencyGrade!(now) : undefined,
  };
}
