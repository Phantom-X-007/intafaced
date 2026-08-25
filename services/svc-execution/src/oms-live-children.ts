/**
 * List live EMS children that block undeploy on a TWAP/VWAP/POV parent.
 *
 * Desk dashboard door. Live is the stored EMS `state` / venue execution
 * status already recorded (open/partial/acked/unknown) — the same set
 * undeploy refuses as `live_children`. Never invents a fill, never
 * cancels, never posts ledger, never touches matching.
 */
import type { EmsOrderEvidence, EmsOrderState, EmsOrderStore } from './oms-ems-store.js';
import type { AlgoKind, ApprovedAlgoParent, ApprovedAlgoParentStore } from './oms-start.js';

export type OmsLiveChild = {
  readonly clientOrderId: string;
  readonly venueId: string;
  readonly symbol: string;
  readonly side: 'buy' | 'sell';
  readonly state: EmsOrderState | null;
  readonly executionStatus: NonNullable<EmsOrderEvidence['execution']>['status'] | null;
  readonly reason?: string;
};

export type OmsUndeployLiveChild = {
  readonly clientOrderId: string;
  readonly venueId: string;
  readonly status?: string;
  readonly reason?: string;
};

export type OmsLiveChildrenOk = {
  readonly ok: true;
  readonly parent: {
    readonly parentClientOrderId: string;
    readonly kind: AlgoKind;
    readonly status: 'approved' | 'running' | 'stopped';
    readonly executionOwner: string | null;
    readonly originator: string | null;
  };
  readonly children: readonly OmsLiveChild[];
};

export type OmsLiveChildrenRefuse =
  | { readonly ok: false; readonly reason: 'missing_parent'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'parent_store_unwired'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_found'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'unsupported_kind'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'paper'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_listable'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'ems_store_unwired'; readonly detail: string };

export type OmsLiveChildrenResult = OmsLiveChildrenOk | OmsLiveChildrenRefuse;

function isAlgoKind(kind: string): kind is AlgoKind {
  return kind === 'twap' || kind === 'vwap' || kind === 'pov';
}

function listableStatus(status: string): status is 'approved' | 'running' | 'stopped' {
  return status === 'approved' || status === 'running' || status === 'stopped';
}

function refuse(reason: OmsLiveChildrenRefuse['reason'], detail: string): OmsLiveChildrenRefuse {
  return { ok: false, reason, detail };
}

function ownerOf(parent: ApprovedAlgoParent): string | null {
  const owner = parent.executionOwner?.trim() ?? '';
  return owner || null;
}

function originatorOf(parent: ApprovedAlgoParent): string | null {
  const originator = parent.originator?.trim() ?? '';
  return originator || null;
}

function alreadyStopped(row: EmsOrderEvidence): boolean {
  return row.state === 'REJECTED' || row.state === 'UNWIRED' || row.state === 'CANCELED';
}

/** Same live set undeploy refuses — filled/rejected/canceled stay off the list. */
export function asLiveEmsChild(row: EmsOrderEvidence): OmsLiveChild | null {
  if (alreadyStopped(row)) return null;
  if (row.state === 'SUBMIT_UNKNOWN' || row.state === 'OUTCOME_UNKNOWN' || row.execution === null) {
    return {
      clientOrderId: row.clientOrderId,
      venueId: row.venueId,
      symbol: row.symbol,
      side: row.side,
      state: row.state ?? null,
      executionStatus: null,
      reason: row.state ?? 'no_execution',
    };
  }
  if (row.execution.status === 'filled' || row.execution.status === 'rejected') return null;
  return {
    clientOrderId: row.clientOrderId,
    venueId: row.venueId,
    symbol: row.symbol,
    side: row.side,
    state: row.state ?? null,
    executionStatus: row.execution.status,
  };
}

export function asUndeployLiveChild(row: EmsOrderEvidence): OmsUndeployLiveChild | null {
  const live = asLiveEmsChild(row);
  if (!live) return null;
  if (live.executionStatus) {
    return { clientOrderId: live.clientOrderId, venueId: live.venueId, status: live.executionStatus };
  }
  return { clientOrderId: live.clientOrderId, venueId: live.venueId, reason: live.reason ?? 'no_execution' };
}

export function listLiveEmsChildren(input: {
  parentClientOrderId?: string;
  parentStore?: ApprovedAlgoParentStore;
  emsStore?: EmsOrderStore;
}): OmsLiveChildrenResult {
  const parentClientOrderId = input.parentClientOrderId?.trim() ?? '';
  if (!parentClientOrderId) {
    return refuse('missing_parent', 'parentClientOrderId is required');
  }
  if (!input.parentStore) {
    return refuse('parent_store_unwired', 'approved algo parent store is required for live-child list');
  }
  const existing = input.parentStore.get(parentClientOrderId);
  if (!existing) {
    return refuse('not_found', `no approved algo parent for ${parentClientOrderId}`);
  }
  if (!isAlgoKind(existing.kind)) {
    return refuse('unsupported_kind', `kind ${String(existing.kind)} is not twap|vwap|pov`);
  }
  if (existing.status === 'paper') {
    return refuse('paper', `parent ${parentClientOrderId} is paper — refusing to list paper live children`);
  }
  if (!listableStatus(existing.status)) {
    return refuse('not_listable', `parent ${parentClientOrderId} is ${existing.status} — live-child list needs a live or stopped parent`);
  }
  if (!input.emsStore || typeof input.emsStore.list !== 'function') {
    return refuse('ems_store_unwired', 'EMS evidence store.list is required for live-child list');
  }

  const children: OmsLiveChild[] = [];
  for (const row of input.emsStore.list({ parentClientOrderId })) {
    const owner = row.parentClientOrderId?.trim() ?? '';
    if (owner !== parentClientOrderId) continue;
    const child = asLiveEmsChild(row);
    if (child) children.push(child);
  }
  children.sort((a, b) => (a.clientOrderId < b.clientOrderId ? -1 : a.clientOrderId > b.clientOrderId ? 1 : 0));
  return {
    ok: true,
    parent: {
      parentClientOrderId: existing.parentClientOrderId,
      kind: existing.kind,
      status: existing.status,
      executionOwner: ownerOf(existing),
      originator: originatorOf(existing),
    },
    children,
  };
}
