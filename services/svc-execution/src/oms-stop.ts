/**
 * Stop one running TWAP/VWAP/POV parent.
 *
 * Marks a running parent `stopped` and pauses so children take no new.
 * Residual is reported from confirmed EMS fills via ledger-client.
 * Existing children stay as EMS recorded them. This door never
 * invents a canceled order and does not touch matching.
 */
import { add, formatAmount, ZERO, type Amount } from '@intafaced/ledger-client';
import type { EmsOrderEvidence, EmsOrderStore } from './oms-ems-store.js';
import type { AlgoPauseStore } from './oms-pause.js';
import type { AlgoKind, ApprovedAlgoParentStore, RetainedAlgoSchedule } from './oms-start.js';

export type OmsStopChildOutcome = 'live' | 'unknown' | 'already_stopped';

export type OmsStopChild = {
  readonly clientOrderId: string;
  readonly venueId: string;
  readonly outcome: OmsStopChildOutcome;
  readonly status?: string;
  readonly reason?: string;
};

export type OmsStopResidual = {
  readonly filled: string;
  readonly remaining: string | null;
};

export type OmsStopOk = {
  readonly ok: true;
  readonly parent: { readonly parentClientOrderId: string; readonly kind: AlgoKind };
  readonly stopped: true;
  readonly children: readonly OmsStopChild[];
  readonly residual: OmsStopResidual;
  readonly schedule: RetainedAlgoSchedule;
};

export type OmsStopRefuse =
  | { readonly ok: false; readonly reason: 'parent_only'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'missing_parent'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'parent_store_unwired'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'pause_store_unwired'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'ems_store_unwired'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_found'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_running'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'already_stopped'; readonly detail: string };

export type OmsStopResult = OmsStopOk | OmsStopRefuse;

function cloneSchedule(schedule: RetainedAlgoSchedule): RetainedAlgoSchedule {
  return {
    durationMs: schedule.durationMs,
    sliceIntervalMs: schedule.sliceIntervalMs,
    slicesPlanned: schedule.slicesPlanned,
    participationBps: schedule.participationBps,
  };
}

function alreadyStopped(row: EmsOrderEvidence): boolean {
  return row.state === 'REJECTED' || row.state === 'UNWIRED';
}

function childOutcome(row: EmsOrderEvidence): OmsStopChild {
  if (alreadyStopped(row)) {
    return {
      clientOrderId: row.clientOrderId,
      venueId: row.venueId,
      outcome: 'already_stopped',
      reason: row.state,
    };
  }
  if (row.state === 'SUBMIT_UNKNOWN' || row.state === 'OUTCOME_UNKNOWN' || row.execution === null) {
    return {
      clientOrderId: row.clientOrderId,
      venueId: row.venueId,
      outcome: 'unknown',
      reason: row.state ?? 'no_execution',
    };
  }
  return {
    clientOrderId: row.clientOrderId,
    venueId: row.venueId,
    outcome: 'live',
    status: row.execution.status,
  };
}

function residualFromEms(rows: readonly EmsOrderEvidence[]): OmsStopResidual {
  if (rows.length === 0) {
    return { filled: formatAmount(ZERO), remaining: null };
  }

  let filled: Amount = ZERO;
  let unknown = false;

  for (const row of rows) {
    if (alreadyStopped(row)) continue;
    if (row.state === 'SUBMIT_UNKNOWN' || row.state === 'OUTCOME_UNKNOWN' || row.execution === null) {
      unknown = true;
      continue;
    }
    if (row.execution.status === 'rejected') continue;
    if (row.execution.status === 'partial') unknown = true;
    filled = add(filled, row.execution.filledAmount);
  }

  return {
    filled: formatAmount(filled),
    remaining: unknown ? null : formatAmount(ZERO),
  };
}

function refuse(reason: OmsStopRefuse['reason'], detail: string): OmsStopRefuse {
  return { ok: false, reason, detail };
}

export function stopRunningAlgoParent(input: {
  parentClientOrderId?: string;
  executionGroupId?: string;
  parentStore?: ApprovedAlgoParentStore;
  pauseStore?: AlgoPauseStore;
  emsStore?: EmsOrderStore;
}): OmsStopResult {
  const executionGroupId = input.executionGroupId?.trim() ?? '';
  if (executionGroupId) {
    return refuse('parent_only', 'stop exactly one parentClientOrderId');
  }
  const parentClientOrderId = input.parentClientOrderId?.trim() ?? '';
  if (!parentClientOrderId) {
    return refuse('missing_parent', 'parentClientOrderId is required');
  }
  if (!input.parentStore) {
    return refuse('parent_store_unwired', 'approved algo parent store is required for stop');
  }
  if (!input.pauseStore) {
    return refuse('pause_store_unwired', 'pause store is required for stop');
  }
  if (!input.emsStore) {
    return refuse('ems_store_unwired', 'EMS evidence store is required for stop residual');
  }

  const existing = input.parentStore.get(parentClientOrderId);
  if (!existing) {
    return refuse('not_found', `no approved algo parent for ${parentClientOrderId}`);
  }
  if (existing.status === 'stopped') {
    return refuse('already_stopped', `parent ${parentClientOrderId} is already stopped`);
  }
  if (existing.status !== 'running') {
    return refuse('not_running', `parent ${parentClientOrderId} is not running`);
  }

  const stopped = input.parentStore.stop(parentClientOrderId);
  if (!stopped) {
    return refuse('not_running', `parent ${parentClientOrderId} is not running`);
  }

  input.pauseStore.pause({ kind: 'parent', id: parentClientOrderId });

  const rows = input.emsStore.list({ parentClientOrderId });

  return {
    ok: true,
    parent: { parentClientOrderId: stopped.parentClientOrderId, kind: stopped.kind },
    stopped: true,
    children: rows.map(childOutcome),
    residual: residualFromEms(rows),
    schedule: cloneSchedule(stopped.schedule),
  };
}
