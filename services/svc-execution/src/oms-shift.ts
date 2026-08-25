/**
 * Shift a live claimed TWAP/VWAP/POV parent to the incoming desk.
 *
 * Atomic: execution owner becomes the incoming operator in one write.
 * Originator stays the first claimer. The parent is never unowned.
 * This door never invents an operator, never steals, never places
 * children, and does not touch matching. Pass remains the offer/accept
 * path; shift is the night-desk move.
 */
import type { AlgoKind, ApprovedAlgoParent, ApprovedAlgoParentStore } from './oms-start.js';

export type OmsShiftOk = {
  readonly ok: true;
  readonly shifted: true;
  readonly parent: { readonly parentClientOrderId: string; readonly kind: AlgoKind };
  readonly originator: string;
  readonly executionOwner: string;
};

export type OmsShiftRefuse =
  | { readonly ok: false; readonly reason: 'missing_parent'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'parent_store_unwired'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_found'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'unsupported_kind'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'paper'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_live'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'missing_operator'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'missing_incoming'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'unowned'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_owner'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'self_shift'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'pass_pending'; readonly detail: string };

export type OmsShiftResult = OmsShiftOk | OmsShiftRefuse;

function isAlgoKind(kind: string): kind is AlgoKind {
  return kind === 'twap' || kind === 'vwap' || kind === 'pov';
}

function refuse(reason: OmsShiftRefuse['reason'], detail: string): OmsShiftRefuse {
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

function originatorOf(parent: ApprovedAlgoParent): string | null {
  const originator = parent.originator?.trim() ?? '';
  return originator || null;
}

function pendingOf(parent: ApprovedAlgoParent): string | null {
  const pending = parent.pendingPassTo?.trim() ?? '';
  return pending || null;
}

function locateLiveParent(input: {
  parentClientOrderId?: string;
  operatorId?: string;
  parentStore?: ApprovedAlgoParentStore;
}): { ok: true; parent: ApprovedAlgoParent; operatorId: string } | OmsShiftRefuse {
  const parentClientOrderId = input.parentClientOrderId?.trim() ?? '';
  if (!parentClientOrderId) {
    return refuse('missing_parent', 'parentClientOrderId is required');
  }
  if (!input.parentStore) {
    return refuse('parent_store_unwired', 'approved algo parent store is required for shift');
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
    return refuse('paper', `parent ${parentClientOrderId} is paper — refusing to shift a paper parent`);
  }
  if (!liveStatus(existing.status)) {
    return refuse('not_live', `parent ${parentClientOrderId} is ${existing.status} — shift needs a live (approved or running) parent`);
  }
  return { ok: true, parent: existing, operatorId };
}

export function shiftLiveAlgoParent(input: {
  parentClientOrderId?: string;
  operatorId?: string;
  incomingOperatorId?: string;
  parentStore?: ApprovedAlgoParentStore;
}): OmsShiftResult {
  const located = locateLiveParent(input);
  if (!located.ok) return located;
  const incomingOperatorId = operatorOf(input.incomingOperatorId);
  if (!incomingOperatorId) {
    return refuse('missing_incoming', 'incoming operator id is required — refusing to invent a user');
  }
  const current = ownerOf(located.parent);
  if (!current) {
    return refuse('unowned', `parent ${located.parent.parentClientOrderId} is unowned — claim it before shift`);
  }
  if (current !== located.operatorId) {
    return refuse('not_owner', `parent ${located.parent.parentClientOrderId} is claimed by ${current} — refusing steal`);
  }
  if (incomingOperatorId === current) {
    return refuse('self_shift', `parent ${located.parent.parentClientOrderId} is already owned by ${current}`);
  }
  const pending = pendingOf(located.parent);
  if (pending) {
    return refuse(
      'pass_pending',
      `parent ${located.parent.parentClientOrderId} has a pass pending to ${pending} — finish or timeout the pass before shift`,
    );
  }
  if (!input.parentStore?.shift) {
    return refuse('parent_store_unwired', 'approved algo parent store.shift is required for shift');
  }
  const shifted = input.parentStore.shift(located.parent.parentClientOrderId, located.operatorId, incomingOperatorId);
  if (!shifted) {
    return refuse('not_owner', `parent ${located.parent.parentClientOrderId} is not claimed by this operator`);
  }
  const executionOwner = ownerOf(shifted);
  const originator = originatorOf(shifted);
  if (!executionOwner || !originator) {
    return refuse('missing_operator', 'operator id is required — refusing to invent a user');
  }
  if (executionOwner === located.operatorId) {
    return refuse('not_owner', `parent ${located.parent.parentClientOrderId} did not transfer to the incoming operator`);
  }
  return {
    ok: true,
    shifted: true,
    parent: { parentClientOrderId: shifted.parentClientOrderId, kind: shifted.kind },
    originator,
    executionOwner,
  };
}
