/**
 * OMS plan door (D26-P1-X3) — wrap existing SOR, do not invent a second ranker.
 *
 * Caller supplies quotes + §28 cost terms. This module:
 *   · refuses `kind: internal` at the door (P0-01 — house not pointed at our book)
 *   · always passes `costTermsByVenue` (missing terms refuse, never silent zeros)
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
  type ExecutionReport,
  type LiquiditySource,
  type QuoteRequest,
  type SorCostTerms,
  type VenueKind,
  type VenueLatencyGrade,
} from '@intafaced/venue-adapter';

const INTERNAL_KINDS = new Set<VenueKind>(['internal']);

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
export type OmsPlanRefuse = {
  readonly ok: false;
  readonly reason: 'internal_venue' | 'kill_switch' | 'unknown_tenant' | 'invalid_venue' | 'invalid_amount' | 'empty_venues';
  readonly detail: string;
};
export type OmsPlanResult = OmsPlanOk | OmsPlanRefuse;

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
    return { ok: false, reason: 'empty_venues', detail: 'OMS plan requires at least one venue quote' };
  }

  const internal = input.venues.find((v) => INTERNAL_KINDS.has(v.kind));
  if (internal) {
    return {
      ok: false,
      reason: 'internal_venue',
      detail: `venue ${internal.id} is ${internal.kind} — OMS v1 is external-only (P0-01)`,
    };
  }

  let requested;
  try {
    requested = parseAmount(input.amount);
  } catch {
    return { ok: false, reason: 'invalid_amount', detail: `amount ${input.amount} is not a decimal string` };
  }
  if (requested <= 0n) {
    return { ok: false, reason: 'invalid_amount', detail: 'amount must be positive' };
  }

  if (input.tenantId && registry) {
    const actor = input.actor ?? 'oms';
    for (const venue of input.venues) {
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

export function latencyGradeWire(venueId: string, over: Partial<VenueLatencyGrade> = {}): VenueLatencyGrade {
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
