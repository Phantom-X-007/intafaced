/**
 * pay.routing — geo / method / risk smart rail selection (D26-P1-P3).
 *
 * SPEC-PAY-VERTICALS §5: optimise for success then cost, log why each rail was
 * chosen or skipped, never route on undisclosed rail-side incentives, skip a
 * rail that cannot honestly accept rather than try-and-fail, and refuse rather
 * than invent missing signals (DIRECTION §8 — no fabricated approval rates /
 * cost weights).
 *
 * This module is the product path that replaces preference-only
 * `selectPublicCheckoutRail` when smart dimensions are in play. It always
 * demands geo + method + risk. Blank dims → `pay.routing_input_missing`.
 * Rails without an explicit eligibility profile for a dim → skipped with a
 * named reason (never assumed worldwide / any-method / any-risk).
 *
 * Money does not move here. Callers that charge must still pass the chosen
 * rail through posture value-movement gates and ledger recipes.
 */

import { isUsable, type RailAdapter } from '../rails/rail-adapter.js';
import type { RailRegistry } from '../rails/registry.js';
import {
  assertRailMayAcceptPublicPayment,
  PUBLIC_CHECKOUT_CAPABILITIES,
  type RailSkipReason,
  type ValueMovementPolicy,
} from '../rails/posture.js';
import { assertNoInventedRoutingScores, assertRoutingInputsPresent, type RoutingInputs } from '../routing-inputs.js';

/** Why a candidate was skipped during smart routing (extends posture taxonomy). */
export type SmartRoutingSkipReason =
  RailSkipReason | 'profile-missing' | 'method-mismatch' | 'method-unset' | 'geo-mismatch' | 'geo-unset' | 'risk-mismatch' | 'risk-unset';

export interface SmartRailDecisionEntry {
  readonly railId: string;
  readonly outcome: 'chosen' | 'skipped';
  readonly reason?: SmartRoutingSkipReason;
}

/**
 * Operator-declared eligibility for one rail. Every smart dimension that the
 * engine requires must be declared here — omission means "we do not honestly
 * know", which is a skip, not a free pass.
 *
 * `'*'` in countries / riskBands is an explicit operator declaration of
 * worldwide / any-band coverage — never inferred.
 */
export interface RailRoutingProfile {
  readonly railId: string;
  /** Methods this rail accepts (e.g. `card`, `crypto`). Empty/omit → method-unset. */
  readonly methods?: readonly string[];
  /** ISO-3166-1 alpha-2 countries, or `'*'` for explicit worldwide. */
  readonly countries?: readonly string[];
  /** Opaque risk-band labels the rail may accept, or `'*'` for any configured band. */
  readonly riskBands?: readonly string[];
}

export interface SmartRoutingRequest {
  readonly inputs: RoutingInputs;
  /** Ordered candidate rail ids (operator preference — never a payer-named rail). */
  readonly preference: readonly string[];
  /** Eligibility profiles keyed by rail id (at most one profile per railId). */
  readonly profiles: readonly RailRoutingProfile[];
  readonly rails: RailRegistry;
  readonly policy: ValueMovementPolicy;
  readonly now?: Date;
}

/** Present, trimmed inputs after the refuse-missing gate. */
export interface PresentRoutingInputs {
  readonly geoCountry: string;
  readonly method: string;
  readonly riskBand: string;
}

export interface SmartRoutingDecision {
  readonly adapter: RailAdapter;
  readonly chosenRailId: string;
  readonly considered: readonly SmartRailDecisionEntry[];
  readonly inputs: PresentRoutingInputs;
}

export type SmartRoutingErrorCode = 'pay.routing_no_rail' | 'pay.routing_input_missing';

/**
 * No candidate accepted after geo/method/risk + posture filters.
 * Distinct from input-missing — inputs were present; rails could not serve them.
 */
export class SmartRoutingNoRailError extends Error {
  readonly code: SmartRoutingErrorCode = 'pay.routing_no_rail';

  constructor(
    message: string,
    readonly considered: readonly SmartRailDecisionEntry[],
    readonly inputs: PresentRoutingInputs,
  ) {
    super(message);
    this.name = 'SmartRoutingNoRailError';
  }
}

function norm(value: string): string {
  return value.trim().toLowerCase();
}

function normCountry(value: string): string {
  return value.trim().toUpperCase();
}

function profileMap(profiles: readonly RailRoutingProfile[]): Map<string, RailRoutingProfile> {
  const map = new Map<string, RailRoutingProfile>();
  for (const p of profiles) {
    map.set(p.railId, p);
  }
  return map;
}

function methodMatches(profile: RailRoutingProfile, method: string): SmartRoutingSkipReason | null {
  if (!profile.methods || profile.methods.length === 0) return 'method-unset';
  const want = norm(method);
  if (profile.methods.some((m) => norm(m) === want)) return null;
  return 'method-mismatch';
}

function geoMatches(profile: RailRoutingProfile, geoCountry: string): SmartRoutingSkipReason | null {
  if (!profile.countries || profile.countries.length === 0) return 'geo-unset';
  if (profile.countries.some((c) => c.trim() === '*')) return null;
  const want = normCountry(geoCountry);
  if (profile.countries.some((c) => normCountry(c) === want)) return null;
  return 'geo-mismatch';
}

function riskMatches(profile: RailRoutingProfile, riskBand: string): SmartRoutingSkipReason | null {
  if (!profile.riskBands || profile.riskBands.length === 0) return 'risk-unset';
  if (profile.riskBands.some((b) => b.trim() === '*')) return null;
  const want = norm(riskBand);
  if (profile.riskBands.some((b) => norm(b) === want)) return null;
  return 'risk-mismatch';
}

/**
 * Append-only decision record shape for `payment_events` (or operator logs).
 * Forbidden inventable score fields are stripped by assert before return.
 */
export function toRoutingDecisionRecord(decision: SmartRoutingDecision): Record<string, unknown> {
  const record: Record<string, unknown> = {
    kind: 'pay.routing.decision',
    chosenRailId: decision.chosenRailId,
    geoCountry: decision.inputs.geoCountry,
    method: decision.inputs.method,
    riskBand: decision.inputs.riskBand,
    considered: decision.considered.map((e) =>
      e.outcome === 'chosen' ? { railId: e.railId, outcome: e.outcome } : { railId: e.railId, outcome: e.outcome, reason: e.reason },
    ),
  };
  assertNoInventedRoutingScores(record);
  return record;
}

/**
 * Smart checkout rail selection — geo + method + risk required.
 *
 * Walks the preference list. For each entry: profile eligibility → posture
 * capability/health/sandbox gates. First honest accept wins. Full considered
 * log always returned (on success) or attached to `SmartRoutingNoRailError`.
 */
export function selectSmartCheckoutRail(request: SmartRoutingRequest): SmartRoutingDecision {
  // Smart routing always requires all three dims — never preference-only invent.
  assertRoutingInputsPresent({ required: ['geo', 'method', 'risk'] }, request.inputs);

  const present: PresentRoutingInputs = {
    geoCountry: request.inputs.geoCountry!.trim(),
    method: request.inputs.method!.trim(),
    riskBand: request.inputs.riskBand!.trim(),
  };

  const profiles = profileMap(request.profiles);
  const now = request.now ?? new Date();
  const considered: SmartRailDecisionEntry[] = [];

  for (const railId of request.preference) {
    const profile = profiles.get(railId);
    if (!profile) {
      considered.push({ railId, outcome: 'skipped', reason: 'profile-missing' });
      continue;
    }

    const methodSkip = methodMatches(profile, present.method);
    if (methodSkip) {
      considered.push({ railId, outcome: 'skipped', reason: methodSkip });
      continue;
    }
    const geoSkip = geoMatches(profile, present.geoCountry);
    if (geoSkip) {
      considered.push({ railId, outcome: 'skipped', reason: geoSkip });
      continue;
    }
    const riskSkip = riskMatches(profile, present.riskBand);
    if (riskSkip) {
      considered.push({ railId, outcome: 'skipped', reason: riskSkip });
      continue;
    }

    // Posture walk — same honesty as selectPublicCheckoutRailDetailed.
    if (!request.rails.has(railId)) {
      considered.push({ railId, outcome: 'skipped', reason: 'not-registered' });
      continue;
    }
    const adapter = request.rails.get(railId);
    if (!PUBLIC_CHECKOUT_CAPABILITIES.every((c) => adapter.capabilities.includes(c))) {
      considered.push({ railId, outcome: 'skipped', reason: 'missing-capability' });
      continue;
    }
    if (adapter.mode === 'absent') {
      considered.push({ railId, outcome: 'skipped', reason: 'absent' });
      continue;
    }
    if (!isUsable(adapter, now)) {
      considered.push({ railId, outcome: 'skipped', reason: 'unhealthy' });
      continue;
    }
    try {
      assertRailMayAcceptPublicPayment(adapter, request.policy);
    } catch {
      considered.push({ railId, outcome: 'skipped', reason: 'sandbox' });
      continue;
    }

    considered.push({ railId, outcome: 'chosen' });
    const decision: SmartRoutingDecision = {
      adapter,
      chosenRailId: railId,
      considered,
      inputs: present,
    };
    assertNoInventedRoutingScores(toRoutingDecisionRecord(decision));
    return decision;
  }

  throw new SmartRoutingNoRailError(
    'Smart routing found no rail that honestly accepts this geo/method/risk — refuse rather than invent a fallback',
    considered,
    present,
  );
}

/**
 * Reference profiles for the two v1 adapters. Operators pass these (or a
 * tightened subset) into `selectSmartCheckoutRail` — they are never applied
 * silently when the caller omitted profiles.
 *
 * - crypto-native: crypto method; explicit worldwide geo (`*`); low/external bands.
 * - card-sandbox: card method; explicit worldwide; low/medium only (sandbox refuse on live-only still applies).
 */
export const REFERENCE_RAIL_ROUTING_PROFILES: readonly RailRoutingProfile[] = [
  {
    railId: 'crypto-native',
    methods: ['crypto'],
    countries: ['*'],
    riskBands: ['low', 'external:ok'],
  },
  {
    railId: 'card-sandbox',
    methods: ['card'],
    countries: ['*'],
    riskBands: ['low', 'medium'],
  },
];
