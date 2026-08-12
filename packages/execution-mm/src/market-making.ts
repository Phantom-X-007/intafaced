import { type Amount, add, mulBps, sub } from '@intafaced/ledger-client';
import { allInEffectivePrice, costRefuseToRouteReason, scoreSorCost, type SorCostTerms, type VenueKind } from '@intafaced/venue-adapter';

/**
 * §28 MARKET-MAKING — EXTERNAL-ONLY ENGINE HALF (D26-P1-X5).
 *
 * Law §28:773 + D26-P0-01 (house desk fairness ADR):
 *   · Quoting models (spread / skew / inventory bands), cross-venue hedging,
 *     kill-switches on volatility and inventory breach — EXTERNAL venues only.
 *   · INTERNAL half (seeding / quoting our own books as the house) stays
 *     BLOCKED until a later explicit owner ruling. Calls with `kind: 'internal'`
 *     refuse with an honest reason — never silently no-op.
 *   · Spread, skew, and inventory-band magnitudes are OWNER numbers (D-S-14).
 *     This package does not invent them; callers supply them.
 *   · Never invents mids. Missing book mid / empty depth / unscored latency /
 *     incomplete SOR cost terms → refuse (weight 0 / incomplete_cost).
 *
 * Leverage: `@intafaced/venue-adapter` cost-model (D26-P1-X3 / #1673) and the
 * external-only door sealed with `@intafaced/execution-arb` (D26-P1-X4 / #1677).
 * Thin product path — not a second money book, not svc-execution, not CCXT.
 */

const INTERNAL_KINDS: ReadonlySet<VenueKind> = new Set(['internal']);

/** Venue kinds that are not house-internal (P0-01 external-only door). */
export function isExternalVenueKind(kind: VenueKind): boolean {
  return !INTERNAL_KINDS.has(kind);
}

/** Signed bps delta on a price. Positive increases; negative decreases. */
function bpsDelta(price: Amount, bps: number): Amount {
  if (!Number.isInteger(bps)) {
    throw new Error(`bps must be an integer, got ${bps}`);
  }
  if (bps === 0) return 0n;
  const mag = mulBps(price, Math.abs(bps), 'ceil');
  return bps > 0 ? mag : -mag;
}

// ── Kill-switches (ADR mechanism rule 5 — apply first) ─────────────────────

export type MmKillReason = 'admin_kill' | 'volatility_breach' | 'inventory_breach';

/**
 * Inventory bands are owner magnitudes (D-S-14). Position is signed base size
 * (positive = long). Bands are inclusive; outside → inventory_breach kill.
 */
export interface MmInventoryState {
  readonly position: Amount;
  readonly minPosition: Amount;
  readonly maxPosition: Amount;
}

/**
 * Realised / measured volatility in bps — caller-supplied observation.
 * Never invented here. `maxVolBps` is an owner kill threshold (D-S-14).
 */
export interface MmVolatilityState {
  readonly realizedVolBps: number | null;
  readonly maxVolBps: number;
}

export interface MmKillConfig {
  /** Global / admin halt for this MM tenant. */
  readonly adminKill: boolean;
  readonly inventory: MmInventoryState;
  readonly volatility: MmVolatilityState;
}

export interface MmKillClear {
  readonly killed: false;
}

export interface MmKillTripped {
  readonly killed: true;
  readonly reasons: readonly MmKillReason[];
  readonly detail: string;
}

export type MmKillEvaluation = MmKillClear | MmKillTripped;

/**
 * Evaluate MM kill-switches. Admin kill, volatility breach, and inventory
 * breach all halt quoting / hedging. Missing realised vol → volatility_breach
 * (refuse rather than assume calm).
 */
export function evaluateMmKillSwitches(config: MmKillConfig): MmKillEvaluation {
  const reasons: MmKillReason[] = [];
  const details: string[] = [];

  if (config.adminKill) {
    reasons.push('admin_kill');
    details.push('admin kill-switch engaged — house MM halted');
  }

  const vol = config.volatility;
  if (vol.realizedVolBps === null || Number.isNaN(vol.realizedVolBps)) {
    reasons.push('volatility_breach');
    details.push('realizedVolBps unknown — refuse rather than assume calm');
  } else if (!Number.isInteger(vol.maxVolBps) || vol.maxVolBps < 0) {
    reasons.push('volatility_breach');
    details.push('maxVolBps owner threshold missing or invalid — refuse');
  } else if (vol.realizedVolBps > vol.maxVolBps) {
    reasons.push('volatility_breach');
    details.push(`realizedVolBps ${vol.realizedVolBps} > maxVolBps ${vol.maxVolBps}`);
  }

  const inv = config.inventory;
  if (inv.position < inv.minPosition || inv.position > inv.maxPosition) {
    reasons.push('inventory_breach');
    details.push('position outside owner inventory bands — kill before quote');
  }

  if (reasons.length === 0) return { killed: false };
  return { killed: true, reasons, detail: details.join('; ') };
}

// ── Quoting model ──────────────────────────────────────────────────────────

export type MmRefuseReason =
  | 'internal_venue'
  | 'missing_mid'
  | 'missing_book'
  | 'insufficient_book'
  | 'incomplete_cost'
  | 'zero_weight'
  | 'invalid_owner_params'
  | 'crossed_quotes'
  | 'kill_switch'
  | 'missing_cost_terms'
  | 'same_venue'
  | 'hedge_not_required'
  | 'insufficient_hedge_size';

export interface MmRefusal {
  readonly ok: false;
  readonly reason: MmRefuseReason;
  readonly detail: string;
  readonly killReasons?: readonly MmKillReason[];
}

/** Caller-supplied top-of-book depth — sizes only; mid is separate and required. */
export interface MmBookDepth {
  readonly bidSize: Amount;
  readonly askSize: Amount;
}

export interface QuoteExternalMmInput {
  readonly symbol: string;
  readonly venueId: string;
  readonly kind: VenueKind;
  /**
   * Mid from a walked / graded external book. `null` → refuse `missing_mid`.
   * Never synthesised from thin or empty depth inside this package.
   */
  readonly mid: Amount | null;
  /** Resting depth available to support `quoteSize`. `null` → refuse. */
  readonly book: MmBookDepth | null;
  readonly quoteSize: Amount;
  /**
   * Owner half-spread in bps (D-S-14). Non-negative integer. Not invented here.
   */
  readonly halfSpreadBps: number;
  /**
   * Owner inventory skew in bps (D-S-14). Positive lowers both bid and ask
   * (lean sell when long); negative raises both (lean buy when short).
   */
  readonly inventorySkewBps: number;
  readonly costTerms: SorCostTerms;
  readonly kill: MmKillConfig;
}

export interface MmQuoteLeg {
  readonly side: 'bid' | 'ask';
  readonly price: Amount;
  /** All-in effective (fee + impact + transfer) for a would-be fill on this side. */
  readonly allIn: Amount;
  readonly size: Amount;
}

export interface MmQuoteAccepted {
  readonly ok: true;
  readonly symbol: string;
  readonly venueId: string;
  readonly kind: VenueKind;
  readonly mid: Amount;
  readonly bid: MmQuoteLeg;
  readonly ask: MmQuoteLeg;
  readonly totalCostBps: number;
  readonly halfSpreadBps: number;
  readonly inventorySkewBps: number;
}

export type QuoteExternalMmResult = MmQuoteAccepted | MmRefusal;

function scoreVenueCost(
  terms: SorCostTerms | undefined,
): { ok: true; totalCostBps: number } | { ok: false; reason: MmRefuseReason; detail: string } {
  if (!terms) {
    return {
      ok: false,
      reason: 'missing_cost_terms',
      detail: 'no SorCostTerms for venue — refuse rather than assume zeros',
    };
  }
  const scored = scoreSorCost(terms);
  if (!scored.ok) {
    const routeReason = costRefuseToRouteReason(scored.reason);
    return {
      ok: false,
      reason: routeReason === 'zero_weight' ? 'zero_weight' : 'incomplete_cost',
      detail: `${scored.reason}: ${scored.detail}`,
    };
  }
  return { ok: true, totalCostBps: scored.totalCostBps };
}

/**
 * Build an external-venue MM two-sided quote.
 *
 * Pure: mid, book, owner magnitudes, cost terms, and kill state are
 * caller-supplied. Internal venues always refuse (D26-P0-01).
 */
export function quoteExternalMm(input: QuoteExternalMmInput): QuoteExternalMmResult {
  if (!isExternalVenueKind(input.kind)) {
    return {
      ok: false,
      reason: 'internal_venue',
      detail:
        'D26-P0-01 external-only — internal house MM (seeding/quoting our own books) remains blocked until a later owner ruling',
    };
  }

  const kill = evaluateMmKillSwitches(input.kill);
  if (kill.killed) {
    return {
      ok: false,
      reason: 'kill_switch',
      detail: kill.detail,
      killReasons: kill.reasons,
    };
  }

  if (input.mid === null || input.mid <= 0n) {
    return {
      ok: false,
      reason: 'missing_mid',
      detail: 'mid absent or non-positive — refuse rather than invent a price',
    };
  }

  if (input.book === null) {
    return {
      ok: false,
      reason: 'missing_book',
      detail: 'book depth absent — refuse rather than invent size',
    };
  }

  if (input.book.bidSize < input.quoteSize || input.book.askSize < input.quoteSize) {
    return {
      ok: false,
      reason: 'insufficient_book',
      detail: 'resting depth below quoteSize — depth not invented',
    };
  }

  if (!Number.isInteger(input.halfSpreadBps) || input.halfSpreadBps < 0) {
    return {
      ok: false,
      reason: 'invalid_owner_params',
      detail: 'halfSpreadBps must be a non-negative integer owner magnitude (D-S-14)',
    };
  }
  if (!Number.isInteger(input.inventorySkewBps)) {
    return {
      ok: false,
      reason: 'invalid_owner_params',
      detail: 'inventorySkewBps must be an integer owner magnitude (D-S-14)',
    };
  }
  if (input.quoteSize <= 0n) {
    return {
      ok: false,
      reason: 'invalid_owner_params',
      detail: 'quoteSize must be positive',
    };
  }

  const cost = scoreVenueCost(input.costTerms);
  if (!cost.ok) {
    return { ok: false, reason: cost.reason, detail: cost.detail };
  }

  const half = bpsDelta(input.mid, input.halfSpreadBps);
  const skew = bpsDelta(input.mid, input.inventorySkewBps);
  const bidPrice = sub(sub(input.mid, half), skew);
  const askPrice = sub(add(input.mid, half), skew);

  if (bidPrice <= 0n || askPrice <= 0n || bidPrice >= askPrice) {
    return {
      ok: false,
      reason: 'crossed_quotes',
      detail: 'spread/skew produced non-positive or crossed bid/ask — refuse',
    };
  }

  // Bid is our buy (we pay all-in up); ask is our sell (we receive all-in down).
  const bidAllIn = allInEffectivePrice(bidPrice, cost.totalCostBps, 'buy');
  const askAllIn = allInEffectivePrice(askPrice, cost.totalCostBps, 'sell');

  return {
    ok: true,
    symbol: input.symbol,
    venueId: input.venueId,
    kind: input.kind,
    mid: input.mid,
    bid: { side: 'bid', price: bidPrice, allIn: bidAllIn, size: input.quoteSize },
    ask: { side: 'ask', price: askPrice, allIn: askAllIn, size: input.quoteSize },
    totalCostBps: cost.totalCostBps,
    halfSpreadBps: input.halfSpreadBps,
    inventorySkewBps: input.inventorySkewBps,
  };
}

/**
 * Explicit refuse path for the internal MM half. Always returns a refusal —
 * there is no success branch until a later owner ruling re-opens internal trading.
 */
export function refuseInternalMm(detail?: string): MmRefusal {
  return {
    ok: false,
    reason: 'internal_venue',
    detail:
      detail ??
      'D26-P0-01 — internal market-making half blocked (house desk external-only for v1); trade.mm-bot seeding stays separate until ruling',
  };
}

// ── Cross-venue hedge ──────────────────────────────────────────────────────

export interface MmHedgeVenue {
  readonly venueId: string;
  readonly kind: VenueKind;
  /** Mid on the hedge venue — null → refuse missing_mid. */
  readonly mid: Amount | null;
  readonly costTerms: SorCostTerms;
  /** Size available to hedge at mid. */
  readonly availableSize: Amount;
}

export interface PlanExternalMmHedgeInput {
  readonly symbol: string;
  /** Venue we are quoting / holding inventory on. */
  readonly quoteVenueId: string;
  readonly inventory: MmInventoryState;
  readonly hedge: MmHedgeVenue;
}

export interface MmHedgePlan {
  readonly ok: true;
  readonly symbol: string;
  readonly quoteVenueId: string;
  readonly hedgeVenueId: string;
  readonly hedgeKind: VenueKind;
  /** buy = cover short; sell = reduce long. */
  readonly side: 'buy' | 'sell';
  readonly amount: Amount;
  readonly mid: Amount;
  readonly allIn: Amount;
  readonly totalCostBps: number;
}

export type PlanExternalMmHedgeResult = MmHedgePlan | MmRefusal;

/**
 * Plan a cross-venue inventory hedge on an EXTERNAL venue.
 *
 * Sizes only the excess outside owner bands (never invents a hedge size).
 * Internal hedge venues refuse. Missing mid / cost / depth refuse honestly.
 */
export function planExternalMmHedge(input: PlanExternalMmHedgeInput): PlanExternalMmHedgeResult {
  if (!isExternalVenueKind(input.hedge.kind)) {
    return {
      ok: false,
      reason: 'internal_venue',
      detail: 'D26-P0-01 external-only — hedge may not target the internal house venue',
    };
  }

  if (input.hedge.venueId === input.quoteVenueId) {
    return {
      ok: false,
      reason: 'same_venue',
      detail: 'cross-venue hedge requires a distinct hedge venue',
    };
  }

  const inv = input.inventory;
  let side: 'buy' | 'sell';
  let amount: Amount;

  if (inv.position > inv.maxPosition) {
    side = 'sell';
    amount = inv.position - inv.maxPosition;
  } else if (inv.position < inv.minPosition) {
    side = 'buy';
    amount = inv.minPosition - inv.position;
  } else {
    return {
      ok: false,
      reason: 'hedge_not_required',
      detail: 'position inside owner inventory bands — no hedge sized',
    };
  }

  if (input.hedge.mid === null || input.hedge.mid <= 0n) {
    return {
      ok: false,
      reason: 'missing_mid',
      detail: 'hedge venue mid absent — refuse rather than invent',
    };
  }

  if (input.hedge.availableSize < amount) {
    return {
      ok: false,
      reason: 'insufficient_hedge_size',
      detail: 'hedge venue depth below required excess — depth not invented',
    };
  }

  const cost = scoreVenueCost(input.hedge.costTerms);
  if (!cost.ok) {
    return { ok: false, reason: cost.reason, detail: cost.detail };
  }

  const allIn = allInEffectivePrice(input.hedge.mid, cost.totalCostBps, side);

  return {
    ok: true,
    symbol: input.symbol,
    quoteVenueId: input.quoteVenueId,
    hedgeVenueId: input.hedge.venueId,
    hedgeKind: input.hedge.kind,
    side,
    amount,
    mid: input.hedge.mid,
    allIn,
    totalCostBps: cost.totalCostBps,
  };
}
