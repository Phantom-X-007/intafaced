/**
 * Undeploy one stopped TWAP/VWAP/POV parent.
 *
 * Marks a stopped parent `undeployed` so start cannot run it until
 * something approves it again. This door never invents a schedule,
 * never cancels children, and does not touch matching.
 */
import type { AlgoKind, ApprovedAlgoParentStore, RetainedAlgoSchedule } from './oms-start.js';

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
  | { readonly ok: false; readonly reason: 'not_found'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_stopped'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'already_undeployed'; readonly detail: string };

export type OmsUndeployResult = OmsUndeployOk | OmsUndeployRefuse;

function cloneSchedule(schedule: RetainedAlgoSchedule): RetainedAlgoSchedule {
  return {
    durationMs: schedule.durationMs,
    sliceIntervalMs: schedule.sliceIntervalMs,
    slicesPlanned: schedule.slicesPlanned,
    participationBps: schedule.participationBps,
  };
}

function refuse(reason: OmsUndeployRefuse['reason'], detail: string): OmsUndeployRefuse {
  return { ok: false, reason, detail };
}

export function undeployStoppedAlgoParent(input: {
  parentClientOrderId?: string;
  executionGroupId?: string;
  parentStore?: ApprovedAlgoParentStore;
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
  if (existing.status !== 'stopped') {
    return refuse('not_stopped', `parent ${parentClientOrderId} is not stopped`);
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
