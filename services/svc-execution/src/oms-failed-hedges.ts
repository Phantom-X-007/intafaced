/**
 * List failed EMS hedge children on a live TWAP/VWAP/POV parent.
 *
 * Desk dashboard door. Failure is the stored EMS `state` / `commandOutcome`
 * (and venue execution status when present) — no new failure enum. This
 * never invents a fill, never posts ledger, never touches matching, and
 * never auto-repairs. Repair is a separate door.
 */
import type { ExecutionCommandOutcome } from '@intafaced/exchange-contract';
import type { EmsOrderEvidence, EmsOrderState, EmsOrderStore } from './oms-ems-store.js';
import type { AlgoKind, ApprovedAlgoParent, ApprovedAlgoParentStore } from './oms-start.js';

export type FailedHedgeChild = {
  readonly clientOrderId: string;
  readonly venueId: string;
  readonly symbol: string;
  readonly side: 'buy' | 'sell';
  readonly state: EmsOrderState | null;
  readonly commandOutcome: ExecutionCommandOutcome | null;
  readonly executionStatus: NonNullable<EmsOrderEvidence['execution']>['status'] | null;
};

export type OmsFailedHedgesOk = {
  readonly ok: true;
  readonly parent: {
    readonly parentClientOrderId: string;
    readonly kind: AlgoKind;
    readonly status: 'approved' | 'running';
    readonly executionOwner: string | null;
    readonly originator: string | null;
  };
  readonly children: readonly FailedHedgeChild[];
};

export type OmsFailedHedgesRefuse =
  | { readonly ok: false; readonly reason: 'missing_parent'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'parent_store_unwired'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_found'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'unsupported_kind'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'paper'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_live'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'ems_store_unwired'; readonly detail: string };

export type OmsFailedHedgesResult = OmsFailedHedgesOk | OmsFailedHedgesRefuse;

function isAlgoKind(kind: string): kind is AlgoKind {
  return kind === 'twap' || kind === 'vwap' || kind === 'pov';
}

function liveStatus(status: string): status is 'approved' | 'running' {
  return status === 'approved' || status === 'running';
}

function refuse(reason: OmsFailedHedgesRefuse['reason'], detail: string): OmsFailedHedgesRefuse {
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

/** Listed failed set — REJECTED / UNWIRED / venue rejected / commandOutcome REFUSED. */
export function isFailedHedge(row: EmsOrderEvidence): boolean {
  if (row.state === 'REJECTED' || row.state === 'UNWIRED') return true;
  if (row.execution?.status === 'rejected') return true;
  return row.commandOutcome?.outcome === 'REFUSED';
}

function asChild(row: EmsOrderEvidence): FailedHedgeChild {
  return {
    clientOrderId: row.clientOrderId,
    venueId: row.venueId,
    symbol: row.symbol,
    side: row.side,
    state: row.state ?? null,
    commandOutcome: row.commandOutcome ?? null,
    executionStatus: row.execution?.status ?? null,
  };
}

export function listFailedHedgeChildren(input: {
  parentClientOrderId?: string;
  parentStore?: ApprovedAlgoParentStore;
  emsStore?: EmsOrderStore;
}): OmsFailedHedgesResult {
  const parentClientOrderId = input.parentClientOrderId?.trim() ?? '';
  if (!parentClientOrderId) {
    return refuse('missing_parent', 'parentClientOrderId is required');
  }
  if (!input.parentStore) {
    return refuse('parent_store_unwired', 'approved algo parent store is required for failed-hedge list');
  }
  const existing = input.parentStore.get(parentClientOrderId);
  if (!existing) {
    return refuse('not_found', `no approved algo parent for ${parentClientOrderId}`);
  }
  if (!isAlgoKind(existing.kind)) {
    return refuse('unsupported_kind', `kind ${String(existing.kind)} is not twap|vwap|pov`);
  }
  if (existing.status === 'paper') {
    return refuse('paper', `parent ${parentClientOrderId} is paper — refusing to list paper hedge children`);
  }
  if (!liveStatus(existing.status)) {
    return refuse(
      'not_live',
      `parent ${parentClientOrderId} is ${existing.status} — failed-hedge list needs a live (approved or running) parent`,
    );
  }
  if (!input.emsStore || typeof input.emsStore.list !== 'function') {
    return refuse('ems_store_unwired', 'EMS evidence store.list is required for failed-hedge list');
  }

  const children: FailedHedgeChild[] = [];
  for (const row of input.emsStore.list({ parentClientOrderId })) {
    const owner = row.parentClientOrderId?.trim() ?? '';
    if (owner !== parentClientOrderId) continue;
    if (!isFailedHedge(row)) continue;
    children.push(asChild(row));
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
