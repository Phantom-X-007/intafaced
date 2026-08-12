import { type Amount, sub } from '@intafaced/ledger-client';
import { allInEffectivePrice, costRefuseToRouteReason, scoreSorCost, type SorCostTerms, type VenueKind } from '@intafaced/venue-adapter';

/**
 * §28 ARBITRAGE — EXTERNAL-ONLY SCANNER (D26-P1-X4).
 *
 * Law §28:772 + D26-P0-01 (house desk fairness ADR):
 *   · Rides the ONE ranking / cost rule from `execution.sor` (`scoreSorCost` /
 *     all-in effective price). An arb leg gets no preference of its own.
 *   · v1 is EXTERNAL-ONLY — internal house venue legs are refused, not sized.
 *   · Inventory-based execution: both sides must be pre-positioned. A DEX↔CEX
 *     (or any) opportunity that needs a bridge completing inside the spread is
 *     refused as bridge fantasy — never sized on transfer latency hope.
 *   · Never invents fees, spreads, impact, or transfer. Missing cost terms →
 *     refuse (weight 0 / incomplete_cost). Unscored latency → weight 0.
 *
 * Leverage: `@intafaced/venue-adapter` cost-model (D26-P1-X3 / #1673). This
 * package is a thin scanner path — not a second money book or SOR.
 */

const INTERNAL_KINDS: ReadonlySet<VenueKind> = new Set(['internal']);

/** Venue kinds that are not house-internal (P0-01 external-only door). */
export function isExternalVenueKind(kind: VenueKind): boolean {
  return !INTERNAL_KINDS.has(kind);
}

/**
 * Cross-rail pairs that cannot close on a bridge fantasy: any leg that is
 * DEX/AMM against a CEX (or OTC) without pre-positioned inventory both sides.
 */
export function isCrossRailPair(a: VenueKind, b: VenueKind): boolean {
  const dexLike = (k: VenueKind) => k === 'external-dex' || k === 'amm';
  const cexLike = (k: VenueKind) => k === 'external-cex' || k === 'otc';
  return (dexLike(a) && cexLike(b)) || (cexLike(a) && dexLike(b));
}

/** One side of a contemplated cross-venue spot arb. Caller-supplied — no mid invent. */
export interface ArbVenueQuote {
  readonly venueId: string;
  readonly kind: VenueKind;
  /** Average fill price for `amount` on this venue (walked book or firm quote). */
  readonly price: Amount;
  /** Size available at `price`. */
  readonly amount: Amount;
}

/**
 * Pre-positioned inventory declaration. Missing / false on either leg of a
 * cross-rail (DEX↔CEX) pair → refuse. Same-rail CEX↔CEX still requires both
 * venues marked true so we never size on an implied transfer completing in-spread.
 */
export interface ArbInventory {
  readonly prePositionedByVenue: Readonly<Record<string, boolean>>;
}

export type ArbRefuseReason =
  | 'internal_venue'
  | 'incomplete_cost'
  | 'zero_weight'
  | 'bridge_fantasy'
  | 'inventory_missing'
  | 'missing_cost_terms'
  | 'same_venue'
  | 'no_edge'
  | 'insufficient_size';

export interface ArbRefusal {
  readonly ok: false;
  readonly buyVenueId: string;
  readonly sellVenueId: string;
  readonly reason: ArbRefuseReason;
  readonly detail: string;
}

export interface ArbOpportunity {
  readonly ok: true;
  readonly symbol: string;
  readonly buyVenueId: string;
  readonly sellVenueId: string;
  readonly buyKind: VenueKind;
  readonly sellKind: VenueKind;
  /** Size of the contemplated round-trip (min of both quotes). */
  readonly amount: Amount;
  /** All-in buy effective (fee + impact + transfer). */
  readonly buyAllIn: Amount;
  /** All-in sell effective (fee + impact + transfer). */
  readonly sellAllIn: Amount;
  /**
   * Gross edge per unit after all-in costs: sellAllIn − buyAllIn.
   * Positive only — non-positive pairs are refused as `no_edge`, not emitted.
   */
  readonly edgePerUnit: Amount;
  readonly buyCostBps: number;
  readonly sellCostBps: number;
}

export type ArbScanItem = ArbOpportunity | ArbRefusal;

export interface ScanExternalArbInput {
  readonly symbol: string;
  /**
   * Contemplated size. Each venue must quote at least this amount or that
   * pair refuses `insufficient_size` (we do not invent depth).
   */
  readonly amount: Amount;
  readonly quotes: readonly ArbVenueQuote[];
  /** §28 complete cost model — required; omit a venue → refuse that leg. */
  readonly costTermsByVenue: Readonly<Record<string, SorCostTerms>>;
  readonly inventory: ArbInventory;
}

export interface ScanExternalArbResult {
  readonly symbol: string;
  readonly opportunities: readonly ArbOpportunity[];
  readonly refused: readonly ArbRefusal[];
}

function inventoryReady(inventory: ArbInventory, venueId: string): boolean {
  return inventory.prePositionedByVenue[venueId] === true;
}

function scoreVenue(
  venueId: string,
  costTermsByVenue: Readonly<Record<string, SorCostTerms>>,
): { ok: true; totalCostBps: number } | { ok: false; reason: ArbRefuseReason; detail: string } {
  const terms = costTermsByVenue[venueId];
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
 * Scan external-only cross-exchange spot arb pairs.
 *
 * Pure: quotes, cost terms, and inventory are caller-supplied. Returns every
 * pair evaluation (opportunity or refuse) so the terminal / OMS can show why
 * a pair was not sized.
 */
export function scanExternalCrossExchangeArb(input: ScanExternalArbInput): ScanExternalArbResult {
  const opportunities: ArbOpportunity[] = [];
  const refused: ArbRefusal[] = [];

  const quotes = input.quotes;
  for (let i = 0; i < quotes.length; i++) {
    for (let j = 0; j < quotes.length; j++) {
      if (i === j) continue;
      const buyQ = quotes[i]!;
      const sellQ = quotes[j]!;

      if (buyQ.venueId === sellQ.venueId) {
        refused.push({
          ok: false,
          buyVenueId: buyQ.venueId,
          sellVenueId: sellQ.venueId,
          reason: 'same_venue',
          detail: 'arb requires distinct venues',
        });
        continue;
      }

      if (!isExternalVenueKind(buyQ.kind) || !isExternalVenueKind(sellQ.kind)) {
        refused.push({
          ok: false,
          buyVenueId: buyQ.venueId,
          sellVenueId: sellQ.venueId,
          reason: 'internal_venue',
          detail: 'D26-P0-01 external-only — internal house venue legs refused',
        });
        continue;
      }

      const buyScore = scoreVenue(buyQ.venueId, input.costTermsByVenue);
      if (!buyScore.ok) {
        refused.push({
          ok: false,
          buyVenueId: buyQ.venueId,
          sellVenueId: sellQ.venueId,
          reason: buyScore.reason,
          detail: `buy leg: ${buyScore.detail}`,
        });
        continue;
      }
      const sellScore = scoreVenue(sellQ.venueId, input.costTermsByVenue);
      if (!sellScore.ok) {
        refused.push({
          ok: false,
          buyVenueId: buyQ.venueId,
          sellVenueId: sellQ.venueId,
          reason: sellScore.reason,
          detail: `sell leg: ${sellScore.detail}`,
        });
        continue;
      }

      const buyReady = inventoryReady(input.inventory, buyQ.venueId);
      const sellReady = inventoryReady(input.inventory, sellQ.venueId);
      if (!buyReady || !sellReady) {
        const crossRail = isCrossRailPair(buyQ.kind, sellQ.kind);
        refused.push({
          ok: false,
          buyVenueId: buyQ.venueId,
          sellVenueId: sellQ.venueId,
          reason: crossRail ? 'bridge_fantasy' : 'inventory_missing',
          detail: crossRail
            ? 'DEX↔CEX (or cross-rail) without pre-positioned inventory both sides — §28:772 refuse, not size'
            : 'pre-positioned inventory required on both venues — refuse rather than imply a transfer',
        });
        continue;
      }

      if (buyQ.amount < input.amount || sellQ.amount < input.amount) {
        refused.push({
          ok: false,
          buyVenueId: buyQ.venueId,
          sellVenueId: sellQ.venueId,
          reason: 'insufficient_size',
          detail: 'quoted size below contemplated amount — depth not invented',
        });
        continue;
      }

      const buyAllIn = allInEffectivePrice(buyQ.price, buyScore.totalCostBps, 'buy');
      const sellAllIn = allInEffectivePrice(sellQ.price, sellScore.totalCostBps, 'sell');
      const edgePerUnit = sub(sellAllIn, buyAllIn);

      if (edgePerUnit <= 0n) {
        refused.push({
          ok: false,
          buyVenueId: buyQ.venueId,
          sellVenueId: sellQ.venueId,
          reason: 'no_edge',
          detail: 'all-in sell ≤ all-in buy after fee+impact+transfer — no opportunity',
        });
        continue;
      }

      opportunities.push({
        ok: true,
        symbol: input.symbol,
        buyVenueId: buyQ.venueId,
        sellVenueId: sellQ.venueId,
        buyKind: buyQ.kind,
        sellKind: sellQ.kind,
        amount: input.amount,
        buyAllIn,
        sellAllIn,
        edgePerUnit,
        buyCostBps: buyScore.totalCostBps,
        sellCostBps: sellScore.totalCostBps,
      });
    }
  }

  // Stable order: largest edge first (honest ranking, no house thumb).
  opportunities.sort((a, b) => (a.edgePerUnit === b.edgePerUnit ? 0 : a.edgePerUnit > b.edgePerUnit ? -1 : 1));

  return { symbol: input.symbol, opportunities, refused };
}
