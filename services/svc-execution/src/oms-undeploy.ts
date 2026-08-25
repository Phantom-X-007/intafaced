/**
 * Undeploy one stopped TWAP/VWAP/POV parent.
 *
 * Marks a stopped parent `undeployed` so start cannot run it until
 * something approves it again. Refuses while EMS still has a live
 * (open/partial/unknown) child — operator must cancelRemaining first.
 * This door never invents a schedule, never cancels children, and
 * does not touch matching.
 */
import type { EmsOrderEvidence, EmsOrderStore } from './oms-ems-store.js';
import type { AlgoKind, ApprovedAlgoParentStore, RetainedAlgoSchedule } from './oms-start.js';

export type OmsUndeployLiveChild = {
  readonly clientOrderId: string;
  readonly venueId: string;
  readonly status?: string;
  readonly reason?: string;
};

export type OmsUndeployOk = {
  readonly ok: true;
  readonly parent: { readonly parentClientOrderId: string; readonly kind: AlgoKind };
  readonly undeployed: true;
  readonly status: 'undeployed';
  readonly schedule: RetainedAlgoSchedule;
};

export type OmsUndeployRefuse =
  | { readonly ok: false; readonly reason: 'parent_only'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'missing_parent'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'parent_store_unwired'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'ems_store_unwired'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_found'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'paper'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_stopped'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'already_undeployed'; readonly detail: string }
  | {
      readonly ok: false;
      readonly reason: 'live_children';
      readonly detail: string;
      readonly children: readonly OmsUndeployLiveChild[];
    };

export type OmsUndeployResult = OmsUndeployOk | OmsUndeployRefuse;

function cloneSchedule(schedule: RetainedAlgoSchedule): RetainedAlgoSchedule {
  return {
    durationMs: schedule.durationMs,
    sliceIntervalMs: schedule.sliceIntervalMs,
    slicesPlanned: schedule.slicesPlanned,
    participationBps: schedule.participationBps,
  };
}

function refuse(reason: Exclude<OmsUndeployRefuse['reason'], 'live_children'>, detail: string): OmsUndeployRefuse {
  return { ok: false, reason, detail };
}

function alreadyStopped(row: EmsOrderEvidence): boolean {
  return row.state === 'REJECTED' || row.state === 'UNWIRED' || row.state === 'CANCELED';
}

function liveChild(row: EmsOrderEvidence): OmsUndeployLiveChild | null {
  if (alreadyStopped(row)) return null;
  if (row.state === 'SUBMIT_UNKNOWN' || row.state === 'OUTCOME_UNKNOWN' || row.execution === null) {
    return {
      clientOrderId: row.clientOrderId,
      venueId: row.venueId,
      reason: row.state ?? 'no_execution',
    };
  }
  if (row.execution.status === 'filled' || row.execution.status === 'rejected') return null;
  return {
    clientOrderId: row.clientOrderId,
    venueId: row.venueId,
    status: row.execution.status,
  };
}

export function undeployStoppedAlgoParent(input: {
  parentClientOrderId?: string;
  executionGroupId?: string;
  parentStore?: ApprovedAlgoParentStore;
  emsStore?: EmsOrderStore;
}): OmsUndeployResult {
  const executionGroupId = input.executionGroupId?.trim() ?? '';
  if (executionGroupId) {
    return refuse('parent_only', 'undeploy exactly one parentClientOrderId');
  }
  const parentClientOrderId = input.parentClientOrderId?.trim() ?? '';
  if (!parentClientOrderId) {
    return refuse('missing_parent', 'parentClientOrderId is required');
  }
  if (!input.parentStore) {
    return refuse('parent_store_unwired', 'approved algo parent store is required for undeploy');
  }

  const existing = input.parentStore.get(parentClientOrderId);
  if (!existing) {
    return refuse('not_found', `no approved algo parent for ${parentClientOrderId}`);
  }
  if (existing.status === 'undeployed') {
    return refuse('already_undeployed', `parent ${parentClientOrderId} is already undeployed`);
  }
  if (existing.status === 'paper') {
    return refuse('paper', `parent ${parentClientOrderId} is paper — refusing to undeploy a paper parent`);
  }
  if (existing.status !== 'stopped') {
    return refuse('not_stopped', `parent ${parentClientOrderId} is not stopped`);
  }
  if (!input.emsStore || typeof input.emsStore.list !== 'function') {
    return refuse('ems_store_unwired', 'EMS evidence store is required for undeploy');
  }

  const live: OmsUndeployLiveChild[] = [];
  for (const row of input.emsStore.list({ parentClientOrderId })) {
    const child = liveChild(row);
    if (child) live.push(child);
  }
  if (live.length > 0) {
    return {
      ok: false,
      reason: 'live_children',
      detail: `parent ${parentClientOrderId} has live EMS children — cancelRemaining first`,
      children: live,
    };
  }

  const undeployed = input.parentStore.undeploy(parentClientOrderId);
  if (!undeployed) {
    return refuse('not_stopped', `parent ${parentClientOrderId} is not stopped`);
  }

  return {
    ok: true,
    parent: { parentClientOrderId: undeployed.parentClientOrderId, kind: undeployed.kind },
    undeployed: true,
    status: 'undeployed',
    schedule: cloneSchedule(undeployed.schedule),
  };
}
