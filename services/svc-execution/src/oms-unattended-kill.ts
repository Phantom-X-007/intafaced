/**
 * Kill/drain one unattended live TWAP/VWAP/POV parent.
 *
 * Night-desk door. Children stop or the outcome is unknown. Parent is
 * marked stopped so the unattended list no longer shows it. This never
 * claims an owner, never steals a claimed parent (handoff is pass/shift),
 * never invents a canceled order, and does not touch matching.
 */
import type { VenueKind } from '@intafaced/venue-adapter';
import type { OmsCancelFn } from './oms-cancel.js';
import { drainInFlightAlgo, type OmsDrainChild, type OmsDrainResidual } from './oms-drain.js';
import type { EmsOrderStore } from './oms-ems-store.js';
import type { AlgoPauseStore } from './oms-pause.js';
import type { AlgoKind, ApprovedAlgoParent, ApprovedAlgoParentStore } from './oms-start.js';

export type OmsUnattendedKillOk = {
  readonly ok: true;
  readonly killed: true;
  readonly parent: { readonly parentClientOrderId: string; readonly kind: AlgoKind };
  readonly children: readonly OmsDrainChild[];
  readonly residual: OmsDrainResidual;
};

export type OmsUnattendedKillRefuse =
  | { readonly ok: false; readonly reason: 'missing_parent'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'parent_store_unwired'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'pause_store_unwired'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'ems_store_unwired'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_found'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'unsupported_kind'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'paper'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_live'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'missing_operator'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'already_claimed'; readonly detail: string };

export type OmsUnattendedKillResult = OmsUnattendedKillOk | OmsUnattendedKillRefuse;

function isAlgoKind(kind: string): kind is AlgoKind {
  return kind === 'twap' || kind === 'vwap' || kind === 'pov';
}

function refuse(reason: OmsUnattendedKillRefuse['reason'], detail: string): OmsUnattendedKillRefuse {
  return { ok: false, reason, detail };
}

function liveStatus(status: string): boolean {
  return status === 'approved' || status === 'running';
}

function operatorOf(operatorId?: string): string {
  return operatorId?.trim() ?? '';
}

function ownerOf(parent: ApprovedAlgoParent): string | null {
  const owner = parent.executionOwner?.trim() ?? '';
  return owner || null;
}

export async function killUnattendedLiveParent(input: {
  parentClientOrderId?: string;
  operatorId?: string;
  parentStore?: ApprovedAlgoParentStore;
  pauseStore?: AlgoPauseStore;
  emsStore?: EmsOrderStore;
  cancelByVenue?: Readonly<Record<string, OmsCancelFn>>;
  kindsByVenue?: Readonly<Record<string, VenueKind>>;
}): Promise<OmsUnattendedKillResult> {
  const parentClientOrderId = input.parentClientOrderId?.trim() ?? '';
  if (!parentClientOrderId) {
    return refuse('missing_parent', 'parentClientOrderId is required');
  }
  if (!input.parentStore) {
    return refuse('parent_store_unwired', 'approved algo parent store is required for unattended kill');
  }
  const operatorId = operatorOf(input.operatorId);
  if (!operatorId) {
    return refuse('missing_operator', 'operator id is required — refusing to invent a user');
  }
  if (!input.pauseStore) {
    return refuse('pause_store_unwired', 'pause store is required for unattended kill');
  }
  if (!input.emsStore) {
    return refuse('ems_store_unwired', 'EMS evidence store is required for unattended kill');
  }

  const existing = input.parentStore.get(parentClientOrderId);
  if (!existing) {
    return refuse('not_found', `no approved algo parent for ${parentClientOrderId}`);
  }
  if (!isAlgoKind(existing.kind)) {
    return refuse('unsupported_kind', `kind ${String(existing.kind)} is not twap|vwap|pov`);
  }
  if (existing.status === 'paper') {
    return refuse('paper', `parent ${parentClientOrderId} is paper — refusing to kill a paper parent`);
  }
  if (!liveStatus(existing.status)) {
    return refuse('not_live', `parent ${parentClientOrderId} is ${existing.status} — kill needs a live (approved or running) parent`);
  }
  const current = ownerOf(existing);
  if (current) {
    return refuse(
      'already_claimed',
      `parent ${parentClientOrderId} is claimed by ${current} — refusing steal (pass/accept/reject is the handoff)`,
    );
  }
  if (existing.status === 'approved' && typeof input.parentStore.kill !== 'function') {
    return refuse('parent_store_unwired', 'approved algo parent store.kill is required to stop an unattended approved parent');
  }

  const drained = await drainInFlightAlgo({
    parentClientOrderId,
    cancelByVenue: input.cancelByVenue,
    emsStore: input.emsStore,
    kindsByVenue: input.kindsByVenue,
  });
  if (!drained.ok) {
    if (drained.reason === 'ems_store_unwired') {
      return refuse('ems_store_unwired', drained.detail);
    }
    return refuse('missing_parent', drained.detail);
  }

  input.pauseStore.pause({ kind: 'parent', id: parentClientOrderId });

  const killed =
    typeof input.parentStore.kill === 'function'
      ? input.parentStore.kill(parentClientOrderId)
      : input.parentStore.stop(parentClientOrderId);
  if (!killed) {
    return refuse('not_live', `parent ${parentClientOrderId} could not be stopped`);
  }

  return {
    ok: true,
    killed: true,
    parent: { parentClientOrderId: killed.parentClientOrderId, kind: killed.kind },
    children: drained.children,
    residual: drained.residual,
  };
}
