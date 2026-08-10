/**
 * pay.routing — refuse when geo / method / risk data is missing.
 *
 * SPEC-PAY-VERTICALS §5: optimise for success and cost only when we have real
 * inputs; DIRECTION §8 blanks (approval rates, invented costs) stay refuse-closed.
 *
 * Smart routing that needs a dimension and does not have it MUST refuse with a
 * named code — never invent a country, method, risk score, or approval %.
 *
 * Pure module: payment-service may call `assertRoutingInputsPresent` when a
 * profile opts into required dimensions. This file does not invent defaults.
 */

export type RoutingDimension = 'geo' | 'method' | 'risk';

/**
 * Optional signals a caller may supply for rail selection.
 * All absent-or-blank → treated as missing for any required dimension.
 */
export interface RoutingInputs {
  /** ISO-3166-1 alpha-2 (or longer merchant region tag). Not invented. */
  readonly geoCountry?: string | null;
  /** Payment method the merchant/payer actually selected. */
  readonly method?: string | null;
  /**
   * Opaque risk band or external score **as received** — never synthesised here.
   * Empty string / null / undefined = missing. We do not invent a default band.
   */
  readonly riskBand?: string | null;
}

export interface RoutingInputPolicy {
  /**
   * Dimensions this decision requires. Empty = preference-list only (today's
   * selectPublicCheckoutRail path) — no extra inputs demanded.
   */
  readonly required: readonly RoutingDimension[];
}

export type RoutingInputErrorCode = 'pay.routing_input_missing';

/**
 * Thrown when a required routing dimension has no honest data.
 * Kept local so this residual does not dual-edit payment-service's PayError union
 * while Denon #1625/#1627 touch that file.
 */
export class RoutingInputError extends Error {
  readonly code: RoutingInputErrorCode = 'pay.routing_input_missing';

  constructor(
    message: string,
    readonly missing: readonly RoutingDimension[],
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'RoutingInputError';
  }
}

function present(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Which required dimensions lack data for this decision. */
export function missingRoutingDimensions(policy: RoutingInputPolicy, inputs: RoutingInputs): RoutingDimension[] {
  const missing: RoutingDimension[] = [];
  for (const dim of policy.required) {
    if (dim === 'geo' && !present(inputs.geoCountry)) missing.push('geo');
    if (dim === 'method' && !present(inputs.method)) missing.push('method');
    if (dim === 'risk' && !present(inputs.riskBand)) missing.push('risk');
  }
  return missing;
}

/**
 * Refuse-closed gate for smart-routing inputs.
 *
 * - required=[] → always ok (no invent path opened).
 * - required dims with blank inputs → `pay.routing_input_missing`.
 * - Never returns fabricated geo/method/risk/approval values.
 */
export function assertRoutingInputsPresent(policy: RoutingInputPolicy, inputs: RoutingInputs): void {
  const missing = missingRoutingDimensions(policy, inputs);
  if (missing.length === 0) return;
  throw new RoutingInputError(`Smart routing needs ${missing.join(', ')} but that data is missing — refuse rather than invent`, missing, {
    required: [...policy.required],
    missing,
  });
}

/**
 * Structural pin: a routing decision object must never carry inventable score
 * fields. Used by tests and by callers assembling payment_events payloads.
 */
export const FORBIDDEN_ROUTING_SCORE_FIELDS = ['approvalRate', 'approval_rate', 'costBps', 'cost_bps'] as const;

export function assertNoInventedRoutingScores(decision: Record<string, unknown>): void {
  for (const key of FORBIDDEN_ROUTING_SCORE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(decision, key) && decision[key] !== undefined) {
      throw new Error(`pay.routing forbids invented field ${key}`);
    }
  }
}
