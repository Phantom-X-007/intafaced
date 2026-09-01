/**
 * Residual-release leftover already on an expired live POV parent.
 * Hands the retained leftover through ledger-client. Jobs off refuses.
 * This door never invents an amount from participation, duration, or the clock,
 * and does not touch matching. Not paper.
 */
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { matchingVenueHaltRefuse, type MatchingVenueHalt } from './oms-matching-venue-halt.js';
import type { AlgoJobsGate } from './oms-start.js';

export type OmsPovReleaseResidualRefuseReason =
  | 'missing_parent'
  | 'not_live'
  | 'not_expired'
  | 'already_released'
  | 'missing_residual'
  | 'jobs_gate_unwired'
  | 'jobs_off'
  | 'venue_halted'
  | 'venue_halt_unavailable';

export type OmsPovReleaseResidualRefusal = {
  readonly ok: false;
  readonly reason: OmsPovReleaseResidualRefuseReason;
  readonly detail: string;
};

export type OmsPovReleaseResidualOk = {
  readonly ok: true;
  readonly released: true;
  readonly parent: {
    readonly parentClientOrderId: string;
    readonly kind: 'pov';
  };
  readonly status: 'expired';
  readonly residual: { readonly remaining: string; readonly released: true };
};

export type OmsPovReleaseResidualResult = OmsPovReleaseResidualOk | OmsPovReleaseResidualRefusal;

function refuse(reason: OmsPovReleaseResidualRefuseReason, detail: string): OmsPovReleaseResidualRefusal {
  return { ok: false, reason, detail };
}

function parseRetainedRemaining(raw: string | null | undefined): { ok: true; text: string } | OmsPovReleaseResidualRefusal {
  if (raw === null || raw === undefined) {
    return refuse(
      'missing_residual',
      'residual.remaining is missing — refusing to invent leftover from participation, duration, or the clock',
    );
  }
  const text = raw.trim();
  if (text.length === 0) {
    return refuse(
      'missing_residual',
      'residual.remaining is missing — refusing to invent leftover from participation, duration, or the clock',
    );
  }
  try {
    return { ok: true, text: formatAmount(parseAmount(text)) };
  } catch {
    return refuse('missing_residual', 'residual.remaining is not a ledger amount — refusing to invent leftover');
  }
}

/**
 * Residual-release leftover already retained on an expired live POV parent through ledger-client.
 * Jobs off refuses. Not paper.
 */
export function releaseExpiredPovResidual(input: {
  parentClientOrderId?: string;
  kind?: string;
  status?: string;
  remaining?: string | null;
  residualReleased?: boolean;
  jobs?: AlgoJobsGate;
  matchingVenueHalt?: MatchingVenueHalt | null;
}): OmsPovReleaseResidualResult {
  const parentClientOrderId = input.parentClientOrderId?.trim() ?? '';
  if (!parentClientOrderId) {
    return refuse('missing_parent', 'parentClientOrderId is required');
  }
  if (!input.jobs) {
    return refuse('jobs_gate_unwired', 'algo jobs gate is required for residual release');
  }
  if (input.jobs.enabled === false) {
    return refuse('jobs_off', 'EXECUTION_ALGO_JOBS_ENABLED is off — refusing to invent a live leftover');
  }
  if (input.kind !== undefined && input.kind !== 'pov') {
    return refuse('not_live', `kind ${String(input.kind)} is not pov`);
  }
  const status = input.status?.trim() ?? '';
  if (status !== 'expired') {
    return refuse(
      'not_expired',
      `parent ${parentClientOrderId} is ${status || 'not expired'} — releaseResidual needs an already expired parent`,
    );
  }
  if (input.residualReleased === true) {
    return refuse('already_released', `parent ${parentClientOrderId} residual is already released`);
  }
  const leftover = parseRetainedRemaining(input.remaining);
  if (!leftover.ok) return leftover;
  const halt = matchingVenueHaltRefuse(input.matchingVenueHalt);
  if (halt) return halt;

  return {
    ok: true,
    released: true,
    parent: { parentClientOrderId, kind: 'pov' },
    status: 'expired',
    residual: { remaining: leftover.text, released: true },
  };
}
