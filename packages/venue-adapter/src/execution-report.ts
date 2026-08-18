import { formatAmount, type Amount } from '@intafaced/ledger-client';
import type { RejectedVenue, RouteLeg, RoutePlan } from './router.js';

/**
 * §28 EXECUTION REPORTS (D26-P1-X3 / execution.sor residual).
 *
 * Law asks for implementation shortfall + venue attribution on every route.
 * This is the pure report shape over an already-built `RoutePlan` — no second
 * ranking rule, no invented fills, no house preference beyond what the plan
 * already disclosed.
 *
 * Leverage: existing `planRoute` / `RoutePlan` in this package.
 */

export type ExecutionShortfall =
  | { readonly kind: 'none'; readonly unfilled: '0' }
  | {
      readonly kind: 'unfilled';
      /** Decimal string — never a JSON number. */
      readonly unfilled: string;
      readonly requested: string;
      readonly routed: string;
    };

export interface VenueAttribution {
  readonly venueId: string;
  readonly kind: string;
  readonly amount: string;
  readonly price: string;
  readonly effectivePrice: string;
  readonly allInEffectivePrice: string;
  readonly feeBps: number;
  readonly expectedImpactBps?: number;
  readonly transferCostBps?: number;
}

export interface ExecutionReport {
  readonly symbol: string;
  readonly side: 'buy' | 'sell';
  readonly requestedAmount: string;
  readonly routedAmount: string;
  readonly averageEffectivePrice: string;
  readonly improvementBps: number;
  readonly shortfall: ExecutionShortfall;
  readonly venues: readonly VenueAttribution[];
  readonly rejected: readonly RejectedVenue[];
}

function amt(a: Amount): string {
  return formatAmount(a);
}

function legAttribution(leg: RouteLeg): VenueAttribution {
  return {
    venueId: leg.venueId,
    kind: leg.kind,
    amount: amt(leg.amount),
    price: amt(leg.price),
    effectivePrice: amt(leg.effectivePrice),
    allInEffectivePrice: amt(leg.allInEffectivePrice),
    feeBps: leg.feeBps,
    ...(leg.expectedImpactBps !== undefined ? { expectedImpactBps: leg.expectedImpactBps } : {}),
    ...(leg.transferCostBps !== undefined ? { transferCostBps: leg.transferCostBps } : {}),
  };
}

/**
 * Build an execution report from a route plan.
 *
 * Shortfall is derived only from `unfilledAmount` — never invented as a
 * synthetic fill. Venue attribution lists only legs that actually routed.
 */
export function buildExecutionReport(plan: RoutePlan): ExecutionReport {
  const shortfall: ExecutionShortfall =
    plan.unfilledAmount === 0n
      ? { kind: 'none', unfilled: '0' }
      : {
          kind: 'unfilled',
          unfilled: amt(plan.unfilledAmount),
          requested: amt(plan.requestedAmount),
          routed: amt(plan.routedAmount),
        };

  return {
    symbol: plan.symbol,
    side: plan.side,
    requestedAmount: amt(plan.requestedAmount),
    routedAmount: amt(plan.routedAmount),
    averageEffectivePrice: amt(plan.averageEffectivePrice),
    improvementBps: plan.improvementBps,
    shortfall,
    venues: plan.legs.map(legAttribution),
    rejected: plan.rejected,
  };
}
