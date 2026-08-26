/**
 * Abandon one staged TWAP/VWAP/POV parent so it never goes live.
 *
 * Marks an already-staged parent `abandoned`. This door never invents
 * an operator, never invents a fill, never places a child, and does
 * not touch matching. Live / released parents refuse — use
 * undeployDrain for live.
 */
import type { AlgoKind, ApprovedAlgoParent, ApprovedAlgoParentStore } from './oms-start.js';

export type OmsAbandonOk = {
  readonly ok: true;
  readonly abandoned: true;
  readonly parent: { readonly parentClientOrderId: string; readonly kind: AlgoKind };
  readonly status: 'abandoned';
  readonly executionOwner: string;
  readonly children: readonly [];
};

export type OmsAbandonRefuse =
  | { readonly ok: false; readonly reason: 'missing_parent'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'parent_store_unwired'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_found'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'unsupported_kind'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'missing_operator'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'already_live'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_staged'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_owner'; readonly detail: string };

export type OmsAbandonResult = OmsAbandonOk | OmsAbandonRefuse;

function isAlgoKind(kind: string): kind is AlgoKind {
  return kind === 'twap' || kind === 'vwap' || kind === 'pov';
}

function refuse(reason: OmsAbandonRefuse['reason'], detail: string): OmsAbandonRefuse {
  return { ok: false, reason, detail };
}

function operatorOf(operatorId?: string): string {
  return operatorId?.trim() ?? '';
}

function ownerOf(parent: ApprovedAlgoParent): string | null {
  const owner = parent.executionOwner?.trim() ?? '';
  return owner || null;
}

export function abandonStagedParent(input: {
  parentClientOrderId?: string;
  operatorId?: string;
  parentStore?: ApprovedAlgoParentStore;
}): OmsAbandonResult {
  const parentClientOrderId = input.parentClientOrderId?.trim() ?? '';
  if (!parentClientOrderId) {
    return refuse('missing_parent', 'parentClientOrderId is required');
  }
  if (!input.parentStore) {
    return refuse('parent_store_unwired', 'approved algo parent store is required for abandon');
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
  if (existing.status === 'approved' || existing.status === 'running') {
    return refuse('already_live', `parent ${parentClientOrderId} is ${existing.status} — use undeployDrain for live`);
  }
  if (existing.status !== 'staged' && existing.status !== 'abandoned') {
    return refuse('not_staged', `parent ${parentClientOrderId} is ${existing.status} — abandon needs a staged parent`);
  }
  const current = ownerOf(existing);
  if (current && current !== operatorId) {
    return refuse('not_owner', `parent ${parentClientOrderId} is owned by ${current} — refusing steal`);
  }
  if (!input.parentStore.abandon) {
    return refuse('parent_store_unwired', 'approved algo parent store.abandon is required for abandon');
  }

  const abandoned = input.parentStore.abandon(parentClientOrderId, operatorId);
  if (!abandoned) {
    return refuse('not_owner', `parent ${parentClientOrderId} is not owned by this operator — refusing steal`);
  }
  const executionOwner = ownerOf(abandoned);
  if (!executionOwner) {
    return refuse('missing_operator', 'operator id is required — refusing to invent a user');
  }

  return {
    ok: true,
    abandoned: true,
    parent: { parentClientOrderId: abandoned.parentClientOrderId, kind: abandoned.kind },
    status: 'abandoned',
    executionOwner,
    children: [],
  };
}
