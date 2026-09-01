/**
 * OMS plan door (D26-P1-X3) — wrap existing SOR, do not invent a second ranker.
 *
 * Caller supplies quotes + §28 cost terms. This module:
 *   · accepts the existing internal-book venue alongside external sources; the
 *     caller still supplies the quote and the execution adapter remains the
 *     only place that can submit a leg
 *   · always passes `costTermsByVenue` (missing terms refuse, never silent zeros)
 *   · unknown venue or missing best-ex evidence refuses the whole plan — never
 *     invent a fill or a mid, never silently drop an unscored venue
 *   · never calls `LiquiditySource.submit` (plan only; trading half stays not_ready)
 *   · does not invent letter→bps
 *
 * Leverage: `@intafaced/venue-adapter` `planRoute` + `buildExecutionReport`.
 */
import { parseAmount } from '@intafaced/ledger-client';
import type { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import {
  buildExecutionReport,
  planRoute,
  scoreSorCost,
  type ExecutionReport,
  type LiquiditySource,
  type QuoteRequest,
  type SorCostTerms,
  type VenueKind,
  type RestLatencyGrade,
} from '@intafaced/venue-adapter';

export type OmsPlanVenue = {
  readonly id: string;
  readonly kind: VenueKind;
  readonly price: string;
  readonly amount: string;
  readonly feeBps: number;
  readonly costTerms: SorCostTerms;
};

export type OmsPlanInput = {
  readonly symbol: string;
  readonly side: 'buy' | 'sell';
  readonly amount: string;
  readonly venues: readonly OmsPlanVenue[];
  readonly tenantId?: string;
  readonly actor?: string;
  readonly now?: Date;
};

export type OmsPlanOk = { readonly ok: true; readonly report: ExecutionReport };
export type OmsPlanRefuseReason =
  | 'internal_venue'
  | 'kill_switch'
  | 'unknown_tenant'
  | 'invalid_venue'
  | 'invalid_amount'
  | 'empty_venues'
  | 'unknown_venue'
  | 'missing_best_ex';
export type OmsPlanRefuse = {
  readonly ok: false;
  readonly reason: OmsPlanRefuseReason;
  readonly detail: string;
  readonly executions?: readonly [];
};
export type OmsPlanResult = OmsPlanOk | OmsPlanRefuse;

const KNOWN_VENUE_KINDS: readonly VenueKind[] = ['internal', 'external-cex', 'external-dex', 'amm', 'otc'];

function isKnownVenueKind(kind: string): kind is VenueKind {
  return (KNOWN_VENUE_KINDS as readonly string[]).includes(kind);
}

function refusePlan(reason: OmsPlanRefuseReason, detail: string): OmsPlanRefuse {
  return { ok: false, reason, detail, executions: [] };
}

/** Unknown venue or missing best-ex evidence refuses — never invent a fill or a mid. */
function bestExEvidenceRefuse(venues: readonly OmsPlanVenue[]): OmsPlanRefuse | null {
  for (const venue of venues) {
    const id = venue.id?.trim() ?? '';
    if (!id) {
      return refusePlan('unknown_venue', 'venue id is blank — refuse rather than invent a fill or a mid');
    }
    if (!isKnownVenueKind(venue.kind)) {
      return refusePlan('unknown_venue', `venue ${id} kind is unknown — refuse rather than invent a fill or a mid`);
    }
    let price;
    let amount;
    try {
      price = parseAmount(venue.price);
      amount = parseAmount(venue.amount);
    } catch {
      return refusePlan('missing_best_ex', `venue ${id} quote is not a ledger amount — refusing to invent a mid`);
    }
    if (price <= 0n || amount <= 0n) {
      return refusePlan('missing_best_ex', `venue ${id} quote is not a positive ledger amount — refusing to invent a mid`);
    }
    if (!venue.costTerms) {
      return refusePlan('missing_best_ex', `venue ${id} has no cost terms — refuse rather than claim best-ex`);
    }
    const scored = scoreSorCost(venue.costTerms);
    if (!scored.ok) {
      return refusePlan(
        'missing_best_ex',
        `venue ${id} ${scored.reason}: ${scored.detail} — refuse rather than claim best-ex or invent a mid`,
      );
    }
  }
  return null;
}

function quotedSource(venue: OmsPlanVenue, now: Date): LiquiditySource {
  const lastUpdate = now;
  return {
    id: venue.id,
    kind: venue.kind,
    capabilities: ['quote'],
    health: () => ({ healthy: true, latencyMs: 10, lastUpdate }),
    markets: async () => [],
    quote: async (req: QuoteRequest) => ({
      venueId: venue.id,
      symbol: req.symbol,
      side: req.side,
      amount: parseAmount(venue.amount),
      price: parseAmount(venue.price),
      feeBps: venue.feeBps,
      expiresAt: new Date(now.getTime() + 30_000),
    }),
    orderBook: async () => ({
      symbol: 'UNUSED',
      bids: [],
      asks: [],
      timestamp: now.getTime(),
      datetime: now.toISOString(),
      nonce: 0,
    }),
    submit: async () => {
      throw new Error('execution.oms_plan_does_not_submit');
    },
  };
}

export async function planOmsRoute(input: OmsPlanInput, registry?: SealedHouseTenantRegistry): Promise<OmsPlanResult> {
  if (input.venues.length === 0) {
    return refusePlan('empty_venues', 'OMS plan requires at least one venue quote');
  }

  const evidence = bestExEvidenceRefuse(input.venues);
  if (evidence) return evidence;

  let requested;
  try {
    requested = parseAmount(input.amount);
  } catch {
    return refusePlan('invalid_amount', `amount ${input.amount} is not a decimal string`);
  }
  if (requested <= 0n) {
    return refusePlan('invalid_amount', 'amount must be positive');
  }

  if (input.tenantId && registry) {
    const actor = input.actor ?? 'oms';
    for (const venue of input.venues) {
      // Internal-book execution is a house-ledger leg and has no external
      // credential namespace; the OMS adapter owns its settlement. The tenant
      // registry remains the kill-switch gate for every leg.
      const auth = registry.authorize(input.tenantId, { kind: 'external', venueId: venue.id }, actor);
      if (auth.ok === false) {
        return { ok: false, reason: auth.reason, detail: auth.detail };
      }
    }
  }

  const now = input.now ?? new Date();
  const costTermsByVenue: Record<string, SorCostTerms> = {};
  const sources: LiquiditySource[] = [];
  for (const venue of input.venues) {
    costTermsByVenue[venue.id] = venue.costTerms;
    sources.push(quotedSource(venue, now));
  }

  const plan = await planRoute({ symbol: input.symbol, side: input.side, amount: requested }, sources, { now, costTermsByVenue });

  return { ok: true, report: buildExecutionReport(plan) };
}

export function latencyGradeWire(venueId: string, over: Partial<RestLatencyGrade> = {}): RestLatencyGrade {
  return {
    venueId,
    measurement: 'rest-round-trip',
    grade: 'A',
    provisional: false,
    samples: 20,
    p50Ms: 30,
    p95Ms: 40,
    rejectRateBps: 0,
    errorRateBps: 0,
    staleMs: 0,
    reasons: [],
    ...over,
  };
}
