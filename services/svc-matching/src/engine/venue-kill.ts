/**
 * Operator halt of ALL markets. New submits refuse. Cancels stay.
 * Resume-all is a second explicit door. No duration, no SLO.
 * Distinct from one-market halt — that door still owns per-market state.
 * Missing operator cannot apply — the engine does not invent a caller.
 */
import type { AmendResult, RejectReason, SubmitResult } from './types.js';
import { MISSING_OPERATOR } from './halt.js';

export const VENUE_HALTED = 'venue_halted' as const;

export type VenueKillRefuse = typeof VENUE_HALTED | typeof MISSING_OPERATOR;

export function venueHaltedRefuse(): RejectReason {
  return {
    code: VENUE_HALTED,
    message: 'all markets are halted — new submits are refused',
  };
}

export function venueHaltedSubmitResult(orderId: string): SubmitResult {
  return {
    accepted: false,
    sequence: null,
    fills: [],
    resting: null,
    rejected: { ...venueHaltedRefuse(), message: `all markets are halted — order ${orderId} not processed` },
    cancellations: [],
    triggered: [],
  };
}

export function venueHaltedAmendResult(orderId: string): AmendResult {
  return {
    accepted: false,
    orderId,
    sequence: null,
    version: null,
    priority: null,
    fills: [],
    resting: null,
    rejected: { ...venueHaltedRefuse(), message: `all markets are halted — order ${orderId} not processed` },
    cancellations: [],
    triggered: [],
  };
}

/** Last halt-all / resume-all wins. Not a book — replay does not invent markets. */
export function replayVenueHalted(records: readonly { readonly kind: string }[]): boolean {
  let halted = false;
  for (const record of records) {
    if (record.kind === 'halt_all') halted = true;
    else if (record.kind === 'resume_all') halted = false;
  }
  return halted;
}
