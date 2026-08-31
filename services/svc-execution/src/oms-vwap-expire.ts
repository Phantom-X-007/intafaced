/**
 * Expire one live VWAP parent when its window ends.
 * Jobs off refuses. Residual leftover is a ledger amount and stays on the parent.
 * This door never invents expireAt from duration or the wall clock, never invents
 * leftover from duration, and does not touch matching. Not paper.
 */
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { matchingVenueHaltRefuse, type MatchingVenueHalt } from './oms-matching-venue-halt.js';
import type { AlgoJobsGate } from './oms-start.js';

export type OmsVwapExpireRefuseReason =
  | 'missing_parent'
  | 'not_live'
  | 'not_running'
  | 'already_expired'
  | 'already_stopped'
  | 'missing_expire_at'
  | 'missing_residual'
  | 'jobs_gate_unwired'
  | 'jobs_off'
  | 'venue_halted'
  | 'venue_halt_unavailable';

export type OmsVwapExpireRefusal = {
  readonly ok: false;
  readonly reason: OmsVwapExpireRefuseReason;
  readonly detail: string;
};

export type OmsVwapExpireOk = {
  readonly ok: true;
  readonly expired: true;
  readonly parent: {
    readonly parentClientOrderId: string;
    readonly kind: 'vwap';
  };
  readonly status: 'expired';
  readonly expireAt: string;
  readonly residual: { readonly remaining: string };
};

export type OmsVwapExpireResult = OmsVwapExpireOk | OmsVwapExpireRefusal;

function refuse(reason: OmsVwapExpireRefuseReason, detail: string): OmsVwapExpireRefusal {
  return { ok: false, reason, detail };
}

function retainedExpireAt(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return null;
  return trimmed;
}

function parseRetainedRemaining(
  raw: string | null | undefined,
): { ok: true; text: string } | OmsVwapExpireRefusal {
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
 * Expire a running live VWAP parent using expireAt already retained on the schedule.
 * Residual is not released or consumed. Jobs off refuses. Not paper.
 */
export function expireVwapParent(input: {
  parentClientOrderId?: string;
  kind?: string;
  status?: string;
  /** Retained schedule expireAt. Blank refuses — never invent from duration or the clock. */
  expireAt?: string | null;
  remaining?: string | null;
  jobs?: AlgoJobsGate;
  matchingVenueHalt?: MatchingVenueHalt | null;
  now?: Date;
}): OmsVwapExpireResult {
  const parentClientOrderId = input.parentClientOrderId?.trim() ?? '';
  if (!parentClientOrderId) {
    return refuse('missing_parent', 'parentClientOrderId is required');
  }
  if (!input.jobs) {
    return refuse('jobs_gate_unwired', 'algo jobs gate is required for expire');
  }
  if (input.jobs.enabled === false) {
    return refuse('jobs_off', 'EXECUTION_ALGO_JOBS_ENABLED is off — refusing to invent a live expire');
  }
  if (input.kind !== undefined && input.kind !== 'vwap') {
    return refuse('not_live', `kind ${String(input.kind)} is not vwap`);
  }
  const status = input.status?.trim() ?? '';
  if (status === 'expired') {
    return refuse('already_expired', `parent ${parentClientOrderId} is already expired`);
  }
  if (status === 'stopped') {
    return refuse('already_stopped', `parent ${parentClientOrderId} is already stopped`);
  }
  if (status !== 'running') {
    return refuse('not_running', `parent ${parentClientOrderId} is not running');
  }
  const expireAt = retainedExpireAt(input.expireAt);
  if (!expireAt) {
    return refuse(
      'missing_expire_at',
      'expireAt is missing — refusing to invent a schedule from duration or the clock',
    );
  }
  const leftover = parseRetainedRemaining(input.remaining);
  if (!leftover.ok) return leftover;
  const halt = matchingVenueHaltRefuse(input.matchingVenueHalt);
  if (halt) return halt;

  return {
    ok: true,
    expired: true,
    parent: { parentClientOrderId, kind: 'vwap' },
    status: 'expired',
    expireAt,
    residual: { remaining: leftover.text },
  };
}
