/**
 * List live TWAP/VWAP/POV parents with no current execution owner.
 *
 * Desk dashboard door. Originator stays visible; this never invents an
 * owner, never places children, and does not touch matching.
 */
import type { AlgoKind, ApprovedAlgoParent, ApprovedAlgoParentStore } from './oms-start.js';

export type UnattendedLiveParent = {
  readonly parentClientOrderId: string;
  readonly kind: AlgoKind;
  readonly status: 'approved' | 'running';
  readonly executionOwner: null;
  readonly originator: string | null;
};

export type OmsUnattendedOk = {
  readonly ok: true;
  readonly parents: readonly UnattendedLiveParent[];
};

export type OmsUnattendedRefuse = {
  readonly ok: false;
  readonly reason: 'parent_store_unwired';
  readonly detail: string;
};

export type OmsUnattendedResult = OmsUnattendedOk | OmsUnattendedRefuse;

function isAlgoKind(kind: string): kind is AlgoKind {
  return kind === 'twap' || kind === 'vwap' || kind === 'pov';
}

function liveStatus(status: string): status is 'approved' | 'running' {
  return status === 'approved' || status === 'running';
}

function ownerOf(parent: ApprovedAlgoParent): string | null {
  const owner = parent.executionOwner?.trim() ?? '';
  return owner || null;
}

function originatorOf(parent: ApprovedAlgoParent): string | null {
  const originator = parent.originator?.trim() ?? '';
  return originator || null;
}

export function listUnattendedLiveParents(input: { parentStore?: ApprovedAlgoParentStore }): OmsUnattendedResult {
  if (!input.parentStore) {
    return {
      ok: false,
      reason: 'parent_store_unwired',
      detail: 'approved algo parent store is required for unattended list',
    };
  }
  if (typeof input.parentStore.list !== 'function') {
    return {
      ok: false,
      reason: 'parent_store_unwired',
      detail: 'approved algo parent store.list is required for unattended list',
    };
  }

  const parents: UnattendedLiveParent[] = [];
  for (const row of input.parentStore.list()) {
    if (!isAlgoKind(row.kind)) continue;
    if (row.status === 'paper') continue;
    if (!liveStatus(row.status)) continue;
    if (ownerOf(row)) continue;
    parents.push({
      parentClientOrderId: row.parentClientOrderId,
      kind: row.kind,
      status: row.status,
      executionOwner: null,
      originator: originatorOf(row),
    });
  }
  return { ok: true, parents };
}
