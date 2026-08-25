/**
 * Pass, accept, or reject a live claimed TWAP/VWAP/POV parent.
 *
 * Current owner offers a named target. Until accept, the passer stays
 * the execution owner. Accept transfers ownership; reject leaves it
 * with the passer. This door never invents an operator, never steals,
 * never places children, and does not touch matching.
 */
import type { AlgoKind, ApprovedAlgoParent, ApprovedAlgoParentStore } from './oms-start.js';

export type OmsPassOk = {
  readonly ok: true;
  readonly passed: true;
  readonly parent: { readonly parentClientOrderId: string; readonly kind: AlgoKind };
  readonly executionOwner: string;
  readonly pendingPassTo: string;
};

export type OmsPassAcceptOk = {
  readonly ok: true;
  readonly accepted: true;
  readonly parent: { readonly parentClientOrderId: string; readonly kind: AlgoKind };
  readonly executionOwner: string;
  readonly pendingPassTo: null;
};

export type OmsPassRejectOk = {
  readonly ok: true;
  readonly rejected: true;
  readonly parent: { readonly parentClientOrderId: string; readonly kind: AlgoKind };
  readonly executionOwner: string;
  readonly pendingPassTo: null;
};

export type OmsPassRefuse =
  | { readonly ok: false; readonly reason: 'missing_parent'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'parent_store_unwired'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_found'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'unsupported_kind'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'paper'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_live'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'missing_operator'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'missing_target'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'unowned'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_owner'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'self_pass'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'already_passing'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'no_pass_pending'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_target'; readonly detail: string };

export type OmsPassResult = OmsPassOk | OmsPassRefuse;
export type OmsPassAcceptResult = OmsPassAcceptOk | OmsPassRefuse;
export type OmsPassRejectResult = OmsPassRejectOk | OmsPassRefuse;

function isAlgoKind(kind: string): kind is AlgoKind {
  return kind === 'twap' || kind === 'vwap' || kind === 'pov';
}

function refuse(reason: OmsPassRefuse['reason'], detail: string): OmsPassRefuse {
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

function pendingOf(parent: ApprovedAlgoParent): string | null {
  const pending = parent.pendingPassTo?.trim() ?? '';
  return pending || null;
}

function locateLiveParent(input: {
  parentClientOrderId?: string;
  operatorId?: string;
  parentStore?: ApprovedAlgoParentStore;
}): { ok: true; parent: ApprovedAlgoParent; operatorId: string } | OmsPassRefuse {
  const parentClientOrderId = input.parentClientOrderId?.trim() ?? '';
  if (!parentClientOrderId) {
    return refuse('missing_parent', 'parentClientOrderId is required');
  }
  if (!input.parentStore) {
    return refuse('parent_store_unwired', 'approved algo parent store is required for pass');
  }
  const operatorId = operatorOf(input.operatorId);
  if (!operatorId) {
    return refuse('missing_operator', 'operator id is required — refusing to invent a user');
  }

  const existing = input.parentStore.get(parentClientOrderId);
  if (!existing) {
    return refuse('not_found', `no approved algo parent for ${parentClientOrderId}`);
  }
  if (!isAlgoKind(existing.kind)) {
    return refuse('unsupported_kind', `kind ${String(existing.kind)} is not twap|vwap|pov`);
  }
  if (existing.status === 'paper') {
    return refuse('paper', `parent ${parentClientOrderId} is paper — refusing to pass a paper parent`);
  }
  if (!liveStatus(existing.status)) {
    return refuse('not_live', `parent ${parentClientOrderId} is ${existing.status} — pass needs a live (approved or running) parent`);
  }
  return { ok: true, parent: existing, operatorId };
}

export function passLiveAlgoParent(input: {
  parentClientOrderId?: string;
  operatorId?: string;
  targetOperatorId?: string;
  parentStore?: ApprovedAlgoParentStore;
}): OmsPassResult {
  const located = locateLiveParent(input);
  if (!located.ok) return located;
  const targetOperatorId = operatorOf(input.targetOperatorId);
  if (!targetOperatorId) {
    return refuse('missing_target', 'target operator id is required — refusing to invent a user');
  }
  const current = ownerOf(located.parent);
  if (!current) {
    return refuse('unowned', `parent ${located.parent.parentClientOrderId} is unowned — claim it before pass`);
  }
  if (current !== located.operatorId) {
    return refuse('not_owner', `parent ${located.parent.parentClientOrderId} is claimed by ${current} — refusing steal`);
  }
  if (targetOperatorId === current) {
    return refuse('self_pass', `parent ${located.parent.parentClientOrderId} is already owned by ${current}`);
  }
  const pending = pendingOf(located.parent);
  if (pending && pending !== targetOperatorId) {
    return refuse('already_passing', `parent ${located.parent.parentClientOrderId} already has a pass pending to ${pending}`);
  }
  if (!input.parentStore?.offerPass) {
    return refuse('parent_store_unwired', 'approved algo parent store.offerPass is required for pass');
  }
  const offered = input.parentStore.offerPass(located.parent.parentClientOrderId, located.operatorId, targetOperatorId);
  if (!offered) {
    return refuse('not_owner', `parent ${located.parent.parentClientOrderId} is not claimed by this operator`);
  }
  const executionOwner = ownerOf(offered);
  const pendingPassTo = pendingOf(offered);
  if (!executionOwner || !pendingPassTo) {
    return refuse('missing_operator', 'operator id is required — refusing to invent a user');
  }
  return {
    ok: true,
    passed: true,
    parent: { parentClientOrderId: offered.parentClientOrderId, kind: offered.kind },
    executionOwner,
    pendingPassTo,
  };
}

export function acceptLiveAlgoParentPass(input: {
  parentClientOrderId?: string;
  operatorId?: string;
  parentStore?: ApprovedAlgoParentStore;
}): OmsPassAcceptResult {
  const located = locateLiveParent(input);
  if (!located.ok) return located;
  const pending = pendingOf(located.parent);
  if (!pending) {
    return refuse('no_pass_pending', `parent ${located.parent.parentClientOrderId} has no pass to accept`);
  }
  if (pending !== located.operatorId) {
    return refuse('not_target', `parent ${located.parent.parentClientOrderId} is offered to ${pending} — refusing steal`);
  }
  if (!input.parentStore?.acceptPass) {
    return refuse('parent_store_unwired', 'approved algo parent store.acceptPass is required for accept');
  }
  const accepted = input.parentStore.acceptPass(located.parent.parentClientOrderId, located.operatorId);
  if (!accepted) {
    return refuse('not_target', `parent ${located.parent.parentClientOrderId} is not offered to this operator`);
  }
  const executionOwner = ownerOf(accepted);
  if (!executionOwner) {
    return refuse('missing_operator', 'operator id is required — refusing to invent a user');
  }
  return {
    ok: true,
    accepted: true,
    parent: { parentClientOrderId: accepted.parentClientOrderId, kind: accepted.kind },
    executionOwner,
    pendingPassTo: null,
  };
}

export function rejectLiveAlgoParentPass(input: {
  parentClientOrderId?: string;
  operatorId?: string;
  parentStore?: ApprovedAlgoParentStore;
}): OmsPassRejectResult {
  const located = locateLiveParent(input);
  if (!located.ok) return located;
  const pending = pendingOf(located.parent);
  if (!pending) {
    return refuse('no_pass_pending', `parent ${located.parent.parentClientOrderId} has no pass to reject`);
  }
  if (pending !== located.operatorId) {
    return refuse('not_target', `parent ${located.parent.parentClientOrderId} is offered to ${pending} — refusing steal`);
  }
  if (!input.parentStore?.rejectPass) {
    return refuse('parent_store_unwired', 'approved algo parent store.rejectPass is required for reject');
  }
  const rejected = input.parentStore.rejectPass(located.parent.parentClientOrderId, located.operatorId);
  if (!rejected) {
    return refuse('not_target', `parent ${located.parent.parentClientOrderId} is not offered to this operator`);
  }
  const executionOwner = ownerOf(rejected);
  if (!executionOwner) {
    return refuse('missing_operator', 'operator id is required — refusing to invent a user');
  }
  return {
    ok: true,
    rejected: true,
    parent: { parentClientOrderId: rejected.parentClientOrderId, kind: rejected.kind },
    executionOwner,
    pendingPassTo: null,
  };
}
