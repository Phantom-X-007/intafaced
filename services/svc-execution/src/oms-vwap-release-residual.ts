/**
 * Residual-release leftover already on an expired live VWAP parent.
 * Hands the retained leftover through ledger-client. Jobs off refuses.
 * This door never invents an amount from duration or the clock, and does not
 * touch matching. Not paper.
 */
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { matchingVenueHaltRefuse, type MatchingVenueHalt } from './oms-matching-venue-halt.js';
import type { AlgoJobsGate } from './oms-start.js';

export type OmsVwapReleaseResidualRefuseReason =
  | 'missing_parent'
  | 'not_live'
  | 'not_expired'
  | 'already_released'
  | 'missing_residual'
  | 'jobs_gate_unwired'
  | 'jobs_off'
  | 'venue_halted'
  | 'venue_halt_unavailable';

export type OmsVwapReleaseResidualRefusal = {
  readonly ok: false;
  readonly reason: OmsVwapReleaseResidualRefuseReason;
  readonly detail: string;
};

export type OmsVwapReleaseResidualOk = {
  readonly ok: true;
  readonly released: true;
  readonly parent: {
    readonly parentClientOrderId: string;
    readonly kind: 'vwap';
  };
  readonly status: 'expired';
  readonly residual: { readonly remaining: string; readonly released: true };
};

export type OmsVwapReleaseResidualResult =
  | OmsVwapReleaseResidualOk
  | OmsVwapReleaseResidualRefusal;

function refuse(
  reason: OmsVwapReleaseResidualRefuseReason,
  detail: string,
): OmsVwapReleaseResidualRefusal {
  return { ok: false, reason, detail };
}

function parseRetainedRemaining(
  raw: string | null | undefined,
): { ok: true; text: string } | OmsVwapReleaseResidualRefusal {
  if (raw === null || raw === undefined) {
    return refuse(
      'missing_residual',
      'residual.remaining is missing — refusing to invent leftover from duration or the clock',
    );
  }
  const text = raw.trim();
  if (text.length === 0) {
    return refuse(
      'missing_residual',
      'residual.remaining is missing — refusing to invent leftover from duration or the clock',
    );
  }
  try {
    return { ok: true, text: formatAmount(parseAmount(text)) };
  } catch {
    return refuse(
      'missing_residual',
      'residual.remaining is not a ledger amount — refusing to invent leftover',
    );
  }
}

/**
 * Residual-release leftover already retained on an expired live VWAP parent through ledger-client.
 * Jobs off refuses. Not paper.
 */
export function releaseExpiredVwapResidual(input: {
  parentClientOrderId?: string;
  kind?: string;
  status?: string;
  remaining?: string | null;
  residualReleased?: boolean;
  jobs?: AlgoJobsGate;
  matchingVenueHalt?: MatchingVenueHalt | null;
}): OmsVwapReleaseResidualResult {
  const parentClientOrderId = input.parentClientOrderId?.trim() ?? '';
  if (!parentClientOrderId) {
    return refuse('missing_parent', 'parentClientOrderId is required');
  }
  if (!input.jobs) {
    return refuse('jobs_gate_unwired', 'algo jobs gate is required for residual release');
  }
  if (input.jobs.enabled === false) {
    return refuse(
      'jobs_off',
      'EXECUTION_ALGO_JOBS_ENABLED is off — refusing to invent a live leftover',
    );
  }
  if (input.kind !== undefined && input.kind !== 'vwap') {
    return refuse('not_live', `kind ${String(input.kind)} is not vwap`);
  }
  const status = input.status?.trim() ?? '';
  if (status !== 'expired') {
    return refuse(
      'not_expired',
      `parent ${parentClientOrderId} is ${status || 'not expired'} — releaseResidual needs an already expired parent`,
    );
  }
  if (input.residualReleased === true) {
    return refuse('already_released', `parent ${parentClientOrderId} residual is already released');
  }
  const leftover = parseRetainedRemaining(input.remaining);
  if (!leftover.ok) return leftover;
  const halt = matchingVenueHaltRefuse(input.matchingVenueHalt);
  if (halt) return halt;

  return {
    ok: true,
    released: true,
    parent: { parentClientOrderId, kind: 'vwap' },
    status: 'expired',
    residual: { remaining: leftover.text, released: true },
  };
}
