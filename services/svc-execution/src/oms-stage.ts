/**
 * Stage one approved TWAP/VWAP/POV parent so it is NOT live.
 *
 * Parks the existing parent as `staged`. This door never invents an
 * operator, never places a child, never invents a fill, and does not
 * touch matching.
 */
import type { AlgoKind, ApprovedAlgoParent, ApprovedAlgoParentStore } from './oms-start.js';

export type OmsStageOk = {
  readonly ok: true;
  readonly staged: true;
  readonly parent: { readonly parentClientOrderId: string; readonly kind: AlgoKind };
  readonly status: 'staged';
  readonly executionOwner: string;
  readonly children: readonly [];
};

export type OmsStageRefuse =
  | { readonly ok: false; readonly reason: 'missing_parent'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'parent_store_unwired'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_found'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'unsupported_kind'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'missing_operator'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'paper'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_approved'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'already_live'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_owner'; readonly detail: string };

export type OmsStageResult = OmsStageOk | OmsStageRefuse;

function isAlgoKind(kind: string): kind is AlgoKind {
  return kind === 'twap' || kind === 'vwap' || kind === 'pov';
}

function refuse(reason: OmsStageRefuse['reason'], detail: string): OmsStageRefuse {
  return { ok: false, reason, detail };
}

function operatorOf(operatorId?: string): string {
  return operatorId?.trim() ?? '';
}

function ownerOf(parent: ApprovedAlgoParent): string | null {
  const owner = parent.executionOwner?.trim() ?? '';
  return owner || null;
}

export function stageApprovedParent(input: {
  parentClientOrderId?: string;
  operatorId?: string;
  parentStore?: ApprovedAlgoParentStore;
}): OmsStageResult {
  const parentClientOrderId = input.parentClientOrderId?.trim() ?? '';
  if (!parentClientOrderId) {
    return refuse('missing_parent', 'parentClientOrderId is required');
  }
  if (!input.parentStore) {
    return refuse('parent_store_unwired', 'approved algo parent store is required for stage');
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
    return refuse('paper', `parent ${parentClientOrderId} is paper — refusing to stage a paper parent`);
  }
  if (existing.status === 'running') {
    return refuse('already_live', `parent ${parentClientOrderId} is running — refusing to stage a live working parent`);
  }
  if (existing.status !== 'approved' && existing.status !== 'staged') {
    return refuse('not_approved', `parent ${parentClientOrderId} is ${existing.status} — stage needs an approved parent`);
  }
  const current = ownerOf(existing);
  if (current && current !== operatorId) {
    return refuse('not_owner', `parent ${parentClientOrderId} is owned by ${current} — refusing steal`);
  }
  if (!input.parentStore.stage) {
    return refuse('parent_store_unwired', 'approved algo parent store.stage is required for stage');
  }

  const staged = input.parentStore.stage(parentClientOrderId, operatorId);
  if (!staged) {
    return refuse('not_owner', `parent ${parentClientOrderId} is not owned by this operator — refusing steal`);
  }
  const executionOwner = ownerOf(staged);
  if (!executionOwner) {
    return refuse('missing_operator', 'operator id is required — refusing to invent a user');
  }

  return {
    ok: true,
    staged: true,
    parent: { parentClientOrderId: staged.parentClientOrderId, kind: staged.kind },
    status: 'staged',
    executionOwner,
    children: [],
  };
}
