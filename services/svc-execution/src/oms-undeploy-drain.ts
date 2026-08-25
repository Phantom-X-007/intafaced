/**
 * Cancel remaining children of one stopped parent, then undeploy.
 *
 * Reuses cancel-remaining then undeploy. Unknown cancel refuses — live
 * children stop or UNKNOWN, never silent success. Paper / not stopped /
 * missing parent refuse before any cancel. This door never invents a
 * canceled order and does not touch matching.
 */
import type { VenueKind } from '@intafaced/venue-adapter';
import { cancelRemainingParentChildren, type OmsCancelRemainingRefuse } from './oms-cancel-remaining.js';
import type { OmsCancelFn } from './oms-cancel.js';
import type { OmsDrainChild, OmsDrainResidual } from './oms-drain.js';
import type { EmsOrderStore } from './oms-ems-store.js';
import type { AlgoKind, ApprovedAlgoParentStore, RetainedAlgoSchedule } from './oms-start.js';
import { undeployStoppedAlgoParent, type OmsUndeployRefuse } from './oms-undeploy.js';

export type OmsUndeployDrainInput = {
  readonly parentClientOrderId?: string;
  readonly executionGroupId?: string;
  readonly parentStore?: ApprovedAlgoParentStore;
  readonly emsStore?: EmsOrderStore;
  readonly cancelByVenue?: Readonly<Record<string, OmsCancelFn>>;
  readonly kindsByVenue?: Readonly<Record<string, VenueKind>>;
};

export type OmsUndeployDrainOk = {
  readonly ok: true;
  readonly parent: { readonly parentClientOrderId: string; readonly kind: AlgoKind };
  readonly undeployed: true;
  readonly status: 'undeployed';
  readonly schedule: RetainedAlgoSchedule;
  readonly children: readonly OmsDrainChild[];
  readonly residual: OmsDrainResidual;
};

export type OmsUndeployDrainRefuse =
  | OmsUndeployRefuse
  | OmsCancelRemainingRefuse
  | {
      readonly ok: false;
      readonly reason: 'unknown_cancel';
      readonly detail: string;
      readonly children: readonly OmsDrainChild[];
      readonly residual: OmsDrainResidual;
    };

export type OmsUndeployDrainResult = OmsUndeployDrainOk | OmsUndeployDrainRefuse;

function refuse(reason: Exclude<OmsUndeployRefuse['reason'], 'live_children'>, detail: string): OmsUndeployDrainRefuse {
  return { ok: false, reason, detail };
}

export async function undeployDrainStoppedAlgoParent(input: OmsUndeployDrainInput): Promise<OmsUndeployDrainResult> {
  const executionGroupId = input.executionGroupId?.trim() ?? '';
  if (executionGroupId) {
    return refuse('parent_only', 'undeployDrain exactly one parentClientOrderId');
  }
  const parentClientOrderId = input.parentClientOrderId?.trim() ?? '';
  if (!parentClientOrderId) {
    return refuse('missing_parent', 'parentClientOrderId is required');
  }
  if (!input.parentStore) {
    return refuse('parent_store_unwired', 'approved algo parent store is required for undeployDrain');
  }

  const existing = input.parentStore.get(parentClientOrderId);
  if (!existing) {
    return refuse('not_found', `no approved algo parent for ${parentClientOrderId}`);
  }
  if (existing.status === 'undeployed') {
    return refuse('already_undeployed', `parent ${parentClientOrderId} is already undeployed`);
  }
  if (existing.status === 'paper') {
    return refuse('paper', `parent ${parentClientOrderId} is paper — refusing to undeployDrain a paper parent`);
  }
  if (existing.status !== 'stopped') {
    return refuse('not_stopped', `parent ${parentClientOrderId} is not stopped`);
  }
  if (!input.emsStore || typeof input.emsStore.list !== 'function') {
    return refuse('ems_store_unwired', 'EMS evidence store is required for undeployDrain');
  }

  const cancelled = await cancelRemainingParentChildren({
    parentClientOrderId,
    cancelByVenue: input.cancelByVenue,
    emsStore: input.emsStore,
    kindsByVenue: input.kindsByVenue,
  });
  if (!cancelled.ok) {
    return cancelled;
  }

  const unknown = cancelled.children.filter((child) => child.outcome === 'unknown');
  if (unknown.length > 0 || cancelled.residual.remaining === null) {
    return {
      ok: false,
      reason: 'unknown_cancel',
      detail: `parent ${parentClientOrderId} cancel remaining outcome is unknown — refusing undeploy`,
      children: cancelled.children,
      residual: cancelled.residual,
    };
  }

  const undeployed = undeployStoppedAlgoParent({
    parentClientOrderId,
    parentStore: input.parentStore,
    emsStore: input.emsStore,
  });
  if (!undeployed.ok) {
    return undeployed;
  }

  return {
    ok: true,
    parent: undeployed.parent,
    undeployed: true,
    status: 'undeployed',
    schedule: undeployed.schedule,
    children: cancelled.children,
    residual: cancelled.residual,
  };
}
