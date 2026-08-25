/**
 * Claim or unclaim a live TWAP/VWAP/POV parent.
 *
 * Sets the visible current execution owner on the existing parent store.
 * This door never invents an operator, never steals a claimed parent
 * (handoff is explicit pass/accept/reject), never places children, and
 * does not touch matching.
 */
import type { AlgoKind, ApprovedAlgoParent, ApprovedAlgoParentStore } from './oms-start.js';

export type OmsClaimOk = {
  readonly ok: true;
  readonly claimed: true;
  readonly parent: { readonly parentClientOrderId: string; readonly kind: AlgoKind };
  readonly executionOwner: string;
};

export type OmsUnclaimOk = {
  readonly ok: true;
  readonly claimed: false;
  readonly parent: { readonly parentClientOrderId: string; readonly kind: AlgoKind };
  readonly executionOwner: null;
};

export type OmsOwnershipOk = {
  readonly ok: true;
  readonly parent: { readonly parentClientOrderId: string; readonly kind: AlgoKind };
  readonly claimed: boolean;
  readonly executionOwner: string | null;
  readonly pendingPassTo: string | null;
  readonly pendingPassExpireAt: string | null;
  readonly status: ApprovedAlgoParent['status'];
};

export type OmsClaimRefuse =
  | { readonly ok: false; readonly reason: 'missing_parent'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'parent_store_unwired'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_found'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'unsupported_kind'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'paper'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_live'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'missing_operator'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'already_claimed'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_owner'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'unowned'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'pass_pending'; readonly detail: string };

export type OmsClaimResult = OmsClaimOk | OmsClaimRefuse;
export type OmsUnclaimResult = OmsUnclaimOk | OmsClaimRefuse;
export type OmsOwnershipResult = OmsOwnershipOk | OmsClaimRefuse;

function isAlgoKind(kind: string): kind is AlgoKind {
  return kind === 'twap' || kind === 'vwap' || kind === 'pov';
}

function refuse(reason: OmsClaimRefuse['reason'], detail: string): OmsClaimRefuse {
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

function pendingExpireAtOf(parent: ApprovedAlgoParent): string | null {
  const raw = parent.pendingPassExpireAt?.trim() ?? '';
  return raw || null;
}

function locateLiveParent(input: {
  parentClientOrderId?: string;
  operatorId?: string;
  parentStore?: ApprovedAlgoParentStore;
  requireOperator: boolean;
}): { ok: true; parent: ApprovedAlgoParent; operatorId: string } | OmsClaimRefuse {
  const parentClientOrderId = input.parentClientOrderId?.trim() ?? '';
  if (!parentClientOrderId) {
    return refuse('missing_parent', 'parentClientOrderId is required');
  }
  if (!input.parentStore) {
    return refuse('parent_store_unwired', 'approved algo parent store is required for claim');
  }
  const operatorId = operatorOf(input.operatorId);
  if (input.requireOperator && !operatorId) {
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
    return refuse('paper', `parent ${parentClientOrderId} is paper — refusing to claim a paper parent`);
  }
  if (!liveStatus(existing.status)) {
    return refuse('not_live', `parent ${parentClientOrderId} is ${existing.status} — claim needs a live (approved or running) parent`);
  }
  return { ok: true, parent: existing, operatorId };
}

export function readLiveAlgoParentOwnership(input: {
  parentClientOrderId?: string;
  parentStore?: ApprovedAlgoParentStore;
}): OmsOwnershipResult {
  const located = locateLiveParent({
    parentClientOrderId: input.parentClientOrderId,
    parentStore: input.parentStore,
    requireOperator: false,
  });
  if (!located.ok) return located;
  const executionOwner = ownerOf(located.parent);
  return {
    ok: true,
    parent: { parentClientOrderId: located.parent.parentClientOrderId, kind: located.parent.kind },
    claimed: executionOwner !== null,
    executionOwner,
    pendingPassTo: pendingOf(located.parent),
    pendingPassExpireAt: pendingExpireAtOf(located.parent),
    status: located.parent.status,
  };
}

export function claimLiveAlgoParent(input: {
  parentClientOrderId?: string;
  operatorId?: string;
  parentStore?: ApprovedAlgoParentStore;
}): OmsClaimResult {
  const located = locateLiveParent({ ...input, requireOperator: true });
  if (!located.ok) return located;
  const current = ownerOf(located.parent);
  if (current && current !== located.operatorId) {
    return refuse(
      'already_claimed',
      `parent ${located.parent.parentClientOrderId} is claimed by ${current} — refusing steal (pass/accept/reject is the handoff)`,
    );
  }
  if (!input.parentStore?.claim) {
    return refuse('parent_store_unwired', 'approved algo parent store.claim is required for claim');
  }
  const claimed = input.parentStore.claim(located.parent.parentClientOrderId, located.operatorId);
  if (!claimed) {
    return refuse(
      'already_claimed',
      `parent ${located.parent.parentClientOrderId} is already claimed — refusing steal (pass/accept/reject is the handoff)`,
    );
  }
  const executionOwner = ownerOf(claimed);
  if (!executionOwner) {
    return refuse('missing_operator', 'operator id is required — refusing to invent a user');
  }
  return {
    ok: true,
    claimed: true,
    parent: { parentClientOrderId: claimed.parentClientOrderId, kind: claimed.kind },
    executionOwner,
  };
}

export function unclaimLiveAlgoParent(input: {
  parentClientOrderId?: string;
  operatorId?: string;
  parentStore?: ApprovedAlgoParentStore;
}): OmsUnclaimResult {
  const located = locateLiveParent({ ...input, requireOperator: true });
  if (!located.ok) return located;
  const current = ownerOf(located.parent);
  if (!current) {
    return refuse('unowned', `parent ${located.parent.parentClientOrderId} is unowned — nothing to unclaim`);
  }
  if (current !== located.operatorId) {
    return refuse(
      'not_owner',
      `parent ${located.parent.parentClientOrderId} is claimed by ${current} — refusing steal (pass/accept/reject is the handoff)`,
    );
  }
  const pending = pendingOf(located.parent);
  if (pending) {
    return refuse(
      'pass_pending',
      `parent ${located.parent.parentClientOrderId} has a pass pending to ${pending} — unclaim would leave the live parent unowned during handoff`,
    );
  }
  if (!input.parentStore?.unclaim) {
    return refuse('parent_store_unwired', 'approved algo parent store.unclaim is required for unclaim');
  }
  const released = input.parentStore.unclaim(located.parent.parentClientOrderId, located.operatorId);
  if (!released) {
    return refuse('not_owner', `parent ${located.parent.parentClientOrderId} is not claimed by this operator`);
  }
  return {
    ok: true,
    claimed: false,
    parent: { parentClientOrderId: released.parentClientOrderId, kind: released.kind },
    executionOwner: null,
  };
}
