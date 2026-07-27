import { type Amount, ZERO, add, sub, min, mul, div, mulBps, formatAmount } from '@intafaced/ledger-client';
import { isRoutable, type LiquiditySource, type QuoteRequest, type VenueQuote } from './source.js';

/**
 * SMART ORDER ROUTER (§8.6: "internal book vs pool quote → best execution").
 *
 * Ranks every routable venue on the price a user actually gets, splits the
 * order across venues when one cannot fill it alone, and refuses to route into
 * prices that have drifted too far from the best available.
 */

export interface RouteLeg {
  readonly venueId: string;
  readonly amount: Amount;
  /** The venue's quoted price. */
  readonly price: Amount;
  /**
   * Price including that venue's taker fee — what the user actually pays or
   * receives per unit. This is the TRUE figure, never the internally-preferred
   * ranking figure. What we show is what happens.
   */
  readonly effectivePrice: Amount;
  readonly feeBps: number;
  readonly kind: string;
}

export interface RoutePlan {
  readonly symbol: string;
  readonly side: 'buy' | 'sell';
  readonly requestedAmount: Amount;
  readonly routedAmount: Amount;
  /** Requested minus routed — non-zero when the market could not fill it all. */
  readonly unfilledAmount: Amount;
  readonly legs: readonly RouteLeg[];
  /** Quantity-weighted average effective price across every leg. */
  readonly averageEffectivePrice: Amount;
  /** Total quote-asset value of the routed portion, fees included. */
  readonly totalCost: Amount;
  /**
   * Improvement in bps versus routing the whole order to the single best
   * venue. This is what splitting bought the user.
   */
  readonly improvementBps: number;
  readonly rejected: readonly RejectedVenue[];
}

export interface RejectedVenue {
  readonly venueId: string;
  readonly reason: 'unhealthy' | 'stale' | 'no_quote' | 'slippage' | 'venue_cap' | 'filled';
  readonly detail?: string;
}

export interface RouterOptions {
  /**
   * Bounded, explicit advantage given to the internal book AT RANKING TIME only
   * (docs/TERMINAL.md §4).
   *
   * Justified by what an internal fill is worth to both sides: the fee accrues
   * to the house and feeds the buyback (§4.3), settlement is a single atomic
   * ledger post rather than a third-party transfer, and no user value ends up
   * sitting at a venue we do not control.
   *
   * It is a tiebreak, not a cover for bad pricing: at the default 5 bps an
   * internal book that is genuinely worse loses, and the user is shown the real
   * effective price either way.
   */
  readonly internalPreferenceBps?: number;
  /** Legs worse than the best effective price by more than this are dropped. */
  readonly maxSlippageBps?: number;
  /** Cap on venues in one route — each leg costs latency and a settlement path. */
  readonly maxVenues?: number;
  readonly maxStalenessMs?: number;
  readonly now?: Date;
}

const DEFAULTS = {
  internalPreferenceBps: 5,
  maxSlippageBps: 50,
  maxVenues: 4,
  maxStalenessMs: 5_000,
} as const;

/**
 * What the user really pays (buy) or receives (sell) per unit.
 *
 * Fees round `ceil` so an estimate is never rosier than reality — a route that
 * under-promises and over-delivers is fine; the reverse is a broken quote.
 */
export function effectivePrice(price: Amount, feeBps: number, side: 'buy' | 'sell'): Amount {
  const fee = mulBps(price, feeBps, 'ceil');
  return side === 'buy' ? add(price, fee) : sub(price, fee);
}

/** Lower is better for a buy, higher for a sell. Normalised so callers sort ascending. */
function rankKey(effective: Amount, side: 'buy' | 'sell'): Amount {
  return side === 'buy' ? effective : -effective;
}

/** The ranking-only adjustment. Never leaves this module. */
function preferenceAdjusted(effective: Amount, side: 'buy' | 'sell', isInternal: boolean, prefBps: number): Amount {
  if (!isInternal || prefBps === 0) return effective;
  const advantage = mulBps(effective < 0n ? -effective : effective, prefBps, 'floor');
  // Make the internal book *look* cheaper to buy from and richer to sell into.
  return side === 'buy' ? sub(effective, advantage) : add(effective, advantage);
}

interface Candidate {
  readonly source: LiquiditySource;
  readonly quote: VenueQuote;
  readonly effective: Amount;
  readonly ranking: Amount;
}

/**
 * Build a route. Pure given its quotes — every decision is inspectable, which
 * is what lets the terminal show the user exactly where their order goes and
 * why (docs/TERMINAL.md §3).
 */
export async function planRoute(
  request: QuoteRequest,
  sources: readonly LiquiditySource[],
  options: RouterOptions = {},
): Promise<RoutePlan> {
  const opts = { ...DEFAULTS, ...options };
  const now = opts.now ?? new Date();
  const rejected: RejectedVenue[] = [];
  const candidates: Candidate[] = [];

  // ── Gather ────────────────────────────────────────────────────────────────
  const settled = await Promise.allSettled(
    sources.map(async (source) => {
      if (!isRoutable(source, now, opts.maxStalenessMs)) {
        const health = source.health();
        return {
          source,
          rejection: {
            venueId: source.id,
            reason: health.healthy ? ('stale' as const) : ('unhealthy' as const),
            detail: health.reason ?? `last update ${now.getTime() - health.lastUpdate.getTime()}ms ago`,
          },
        };
      }
      const quote = await source.quote(request);
      return { source, quote };
    }),
  );

  for (const [i, result] of settled.entries()) {
    const source = sources[i]!;

    if (result.status === 'rejected') {
      // A venue that throws is a venue that is down. Route around it.
      rejected.push({ venueId: source.id, reason: 'no_quote', detail: String(result.reason) });
      continue;
    }

    const value = result.value;
    if ('rejection' in value && value.rejection) {
      rejected.push(value.rejection);
      continue;
    }

    const quote = 'quote' in value ? value.quote : null;
    if (!quote || quote.amount <= 0n) {
      rejected.push({ venueId: source.id, reason: 'no_quote' });
      continue;
    }
    if (quote.expiresAt.getTime() <= now.getTime()) {
      rejected.push({ venueId: source.id, reason: 'stale', detail: 'quote expired' });
      continue;
    }

    const effective = effectivePrice(quote.price, quote.feeBps, request.side);
    const adjusted = preferenceAdjusted(effective, request.side, source.kind === 'internal', opts.internalPreferenceBps);

    candidates.push({ source, quote, effective, ranking: rankKey(adjusted, request.side) });
  }

  if (candidates.length === 0) {
    return emptyPlan(request, rejected);
  }

  // ── Rank ──────────────────────────────────────────────────────────────────
  candidates.sort((a, b) => {
    if (a.ranking !== b.ranking) return a.ranking < b.ranking ? -1 : 1;
    // Equal price: prefer the internal book, then the faster venue.
    const aInternal = a.source.kind === 'internal' ? 0 : 1;
    const bInternal = b.source.kind === 'internal' ? 0 : 1;
    if (aInternal !== bInternal) return aInternal - bInternal;
    return a.source.health().latencyMs - b.source.health().latencyMs;
  });

  const best = candidates[0]!;
  const bestEffective = best.effective;

  // ── Fill ──────────────────────────────────────────────────────────────────
  const legs: RouteLeg[] = [];
  let remaining = request.amount;

  for (const candidate of candidates) {
    if (remaining <= 0n) {
      rejected.push({ venueId: candidate.source.id, reason: 'filled' });
      continue;
    }
    if (legs.length >= opts.maxVenues) {
      rejected.push({ venueId: candidate.source.id, reason: 'venue_cap' });
      continue;
    }

    // Slippage is measured against the best TRUE effective price, not the
    // preference-adjusted one — otherwise the thumb on the scale would widen
    // the tolerance for everyone else too.
    const drift = priceDriftBps(bestEffective, candidate.effective, request.side);
    if (drift > opts.maxSlippageBps) {
      rejected.push({ venueId: candidate.source.id, reason: 'slippage', detail: `${drift} bps worse than best` });
      continue;
    }

    const take = min(remaining, candidate.quote.amount);
    legs.push({
      venueId: candidate.source.id,
      amount: take,
      price: candidate.quote.price,
      effectivePrice: candidate.effective,
      feeBps: candidate.quote.feeBps,
      kind: candidate.source.kind,
    });
    remaining = sub(remaining, take);
  }

  const routedAmount = sub(request.amount, remaining);
  const totalCost = legs.reduce((sum, leg) => add(sum, mul(leg.effectivePrice, leg.amount)), ZERO);
  const averageEffectivePrice = routedAmount > 0n ? div(totalCost, routedAmount) : ZERO;

  return {
    symbol: request.symbol,
    side: request.side,
    requestedAmount: request.amount,
    routedAmount,
    unfilledAmount: remaining,
    legs,
    averageEffectivePrice,
    totalCost,
    improvementBps: improvementVersusSingleVenue(legs, bestEffective, averageEffectivePrice, request.side),
    rejected,
  };
}

/** How much worse `price` is than `best`, in bps. Never negative. */
export function priceDriftBps(best: Amount, price: Amount, side: 'buy' | 'sell'): number {
  if (best === 0n) return 0;
  const worse = side === 'buy' ? sub(price, best) : sub(best, price);
  if (worse <= 0n) return 0;
  const magnitude = best < 0n ? -best : best;
  // (worse / best) * 10_000, computed in scaled space then reduced to a number.
  return Number(div(mul(worse, 10_000n * 10n ** 18n), magnitude) / 10n ** 18n);
}

function improvementVersusSingleVenue(
  legs: readonly RouteLeg[],
  bestEffective: Amount,
  averageEffective: Amount,
  side: 'buy' | 'sell',
): number {
  // Splitting can only ever be worse than the single best price (we take the
  // best venue first). Report honestly: the number is the cost of the split,
  // expressed as a negative improvement.
  if (legs.length <= 1 || bestEffective === 0n) return 0;
  return -priceDriftBps(bestEffective, averageEffective, side);
}

function emptyPlan(request: QuoteRequest, rejected: readonly RejectedVenue[]): RoutePlan {
  return {
    symbol: request.symbol,
    side: request.side,
    requestedAmount: request.amount,
    routedAmount: ZERO,
    unfilledAmount: request.amount,
    legs: [],
    averageEffectivePrice: ZERO,
    totalCost: ZERO,
    improvementBps: 0,
    rejected,
  };
}

/** Human-readable route explanation — what the terminal shows before you confirm. */
export function explainRoute(plan: RoutePlan): string {
  if (plan.legs.length === 0) {
    return `No route for ${formatAmount(plan.requestedAmount)} ${plan.symbol}: ${
      plan.rejected.map((r) => `${r.venueId} (${r.reason})`).join(', ') || 'no venues available'
    }`;
  }

  const lines = plan.legs.map(
    (leg) =>
      `  ${formatAmount(leg.amount)} @ ${formatAmount(leg.price)} on ${leg.venueId}` +
      ` (${leg.feeBps} bps → ${formatAmount(leg.effectivePrice)} effective)`,
  );

  if (plan.unfilledAmount > 0n) {
    lines.push(`  ${formatAmount(plan.unfilledAmount)} unfilled — insufficient depth`);
  }

  return (
    `${plan.side} ${formatAmount(plan.routedAmount)} ${plan.symbol} across ${plan.legs.length} venue(s)\n` +
    lines.join('\n') +
    `\n  average ${formatAmount(plan.averageEffectivePrice)}`
  );
}
