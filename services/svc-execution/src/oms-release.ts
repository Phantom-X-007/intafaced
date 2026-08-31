/**
 * Release one staged TWAP/VWAP/POV parent to live.
 *
 * Marks an already-staged parent `approved`. This door never invents an
 * operator, never invents a fill, never places a child, and does not
 * touch matching. Matching halt-all (`venueHalted`) refuses — missing halt
 * source refuses; never invent live.
 */
import { matchingVenueHaltRefuse, type MatchingVenueHalt } from './oms-matching-venue-halt.js';
import type { AlgoKind, ApprovedAlgoParent, ApprovedAlgoParentStore } from './oms-start.js';

export type OmsReleaseOk = {
  readonly ok: true;
  readonly released: true;
  readonly parent: { readonly parentClientOrderId: string; readonly kind: AlgoKind };
  readonly status: 'approved';
  readonly executionOwner: string;
};

export type OmsReleaseRefuse =
  | { readonly ok: false; readonly reason: 'missing_parent'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'parent_store_unwired'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_found'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'unsupported_kind'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'missing_operator'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_staged'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_owner'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'venue_halted'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'venue_halt_unavailable'; readonly detail: string };

export type OmsReleaseResult = OmsReleaseOk | OmsReleaseRefuse;

function isAlgoKind(kind: string): kind is AlgoKind {
  return kind === 'twap' || kind === 'vwap' || kind === 'pov';
}

function refuse(reason: OmsReleaseRefuse['reason'], detail: string): OmsReleaseRefuse {
  return { ok: false, reason, detail };
}

function operatorOf(operatorId?: string): string {
  return operatorId?.trim() ?? '';
}

function ownerOf(parent: ApprovedAlgoParent): string | null {
  const owner = parent.executionOwner?.trim() ?? '';
  return owner || null;
}

export function releaseStagedParentToLive(input: {
  parentClientOrderId?: string;
  operatorId?: string;
  parentStore?: ApprovedAlgoParentStore;
  matchingVenueHalt?: MatchingVenueHalt | null;
}): OmsReleaseResult {
  const parentClientOrderId = input.parentClientOrderId?.trim() ?? '';
  if (!parentClientOrderId) {
    return refuse('missing_parent', 'parentClientOrderId is required');
  }
  if (!input.parentStore) {
    return refuse('parent_store_unwired', 'approved algo parent store is required for release');
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
  if (existing.status !== 'staged') {
    return refuse('not_staged', `parent ${parentClientOrderId} is ${existing.status} — release needs a staged parent`);
  }
  const current = ownerOf(existing);
  if (current && current !== operatorId) {
    return refuse('not_owner', `parent ${parentClientOrderId} is owned by ${current} — refusing steal`);
  }
  if (!input.parentStore.release) {
    return refuse('parent_store_unwired', 'approved algo parent store.release is required for release');
  }
  const halt = matchingVenueHaltRefuse(input.matchingVenueHalt);
  if (halt) return halt;

  const released = input.parentStore.release(parentClientOrderId, operatorId);
  if (!released) {
    return refuse('not_owner', `parent ${parentClientOrderId} is not owned by this operator — refusing steal`);
  }
  const executionOwner = ownerOf(released);
  if (!executionOwner) {
    return refuse('missing_operator', 'operator id is required — refusing to invent a user');
  }

  return {
    ok: true,
    released: true,
    parent: { parentClientOrderId: released.parentClientOrderId, kind: released.kind },
    status: 'approved',
    executionOwner,
  };
}
