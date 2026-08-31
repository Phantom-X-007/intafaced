/**
 * Kill one live TWAP/VWAP/POV parent.
 *
 * Attempts venue cancel of that parent's EMS children. `killed: true`
 * only when every child is known (stopped or already_stopped). An
 * unknown child cancel is not killed: true and does not stop the parent.
 * Residual is confirmed filled plus remaining when every child is known.
 * This door never invents a canceled order and does not touch matching.
 */
import type { VenueKind } from '@intafaced/venue-adapter';
import type { VenueOrder } from '@intafaced/venue-contracts';
import { add, formatAmount, ZERO, type Amount } from '@intafaced/ledger-client';
import { cancelOmsOrder, type OmsCancelFn } from './oms-cancel.js';
import type { EmsOrderEvidence, EmsOrderStore } from './oms-ems-store.js';
import type { AlgoKind, ApprovedAlgoParentStore } from './oms-start.js';

export type OmsKillLiveChildOutcome = 'stopped' | 'unknown' | 'already_stopped';

export type OmsKillLiveChild = {
  readonly clientOrderId: string;
  readonly venueId: string;
  readonly outcome: OmsKillLiveChildOutcome;
  readonly status?: string;
  readonly reason?: string;
};

export type OmsKillLiveResidual = {
  readonly filled: string;
  readonly remaining: string | null;
};

export type OmsKillLiveOk = {
  readonly ok: true;
  readonly killed: boolean;
  readonly parent: { readonly parentClientOrderId: string; readonly kind: AlgoKind };
  readonly children: readonly OmsKillLiveChild[];
  readonly residual: OmsKillLiveResidual;
};

export type OmsKillLiveRefuse =
  | { readonly ok: false; readonly reason: 'parent_only'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'missing_parent'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'parent_store_unwired'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'ems_store_unwired'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_found'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'unsupported_kind'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'already_stopped'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_live'; readonly detail: string };

export type OmsKillLiveResult = OmsKillLiveOk | OmsKillLiveRefuse;

const TERMINAL_STOPPED = new Set(['canceled', 'filled']);
const LIVE_STATUS = new Set(['approved', 'running']);

function isAlgoKind(kind: string): kind is AlgoKind {
  return kind === 'twap' || kind === 'vwap' || kind === 'pov';
}

function refuse(reason: OmsKillLiveRefuse['reason'], detail: string): OmsKillLiveRefuse {
  return { ok: false, reason, detail };
}

function alreadyStopped(row: EmsOrderEvidence): boolean {
  return row.state === 'REJECTED' || row.state === 'UNWIRED' || row.state === 'CANCELED';
}

function childKind(row: EmsOrderEvidence, kindsByVenue?: Readonly<Record<string, VenueKind>>): VenueKind | undefined {
  return kindsByVenue?.[row.venueId] ?? (row.venueId === 'internal' ? 'internal' : undefined);
}

function residualFromOrders(orders: readonly VenueOrder[], unknown: boolean): OmsKillLiveResidual {
  let filled: Amount = ZERO;
  let remaining: Amount = ZERO;
  for (const order of orders) {
    filled = add(filled, order.filled);
    remaining = add(remaining, order.remaining);
  }
  return {
    filled: formatAmount(filled),
    remaining: unknown ? null : formatAmount(remaining),
  };
}

function childrenKnown(children: readonly OmsKillLiveChild[]): boolean {
  return children.every((child) => child.outcome === 'stopped' || child.outcome === 'already_stopped');
}

export async function killLiveAlgoParent(input: {
  parentClientOrderId?: string;
  executionGroupId?: string;
  parentStore?: ApprovedAlgoParentStore;
  emsStore?: EmsOrderStore;
  cancelByVenue?: Readonly<Record<string, OmsCancelFn>>;
  kindsByVenue?: Readonly<Record<string, VenueKind>>;
}): Promise<OmsKillLiveResult> {
  const executionGroupId = input.executionGroupId?.trim() ?? '';
  if (executionGroupId) {
    return refuse('parent_only', 'kill exactly one parentClientOrderId');
  }
  const parentClientOrderId = input.parentClientOrderId?.trim() ?? '';
  if (!parentClientOrderId) {
    return refuse('missing_parent', 'parentClientOrderId is required');
  }
  if (!input.parentStore || typeof input.parentStore.kill !== 'function') {
    return refuse('parent_store_unwired', 'approved algo parent store.kill is required for live parent kill');
  }
  if (!input.emsStore) {
    return refuse('ems_store_unwired', 'EMS evidence store is required for live parent kill');
  }

  const existing = input.parentStore.get(parentClientOrderId);
  if (!existing) {
    return refuse('not_found', `no approved algo parent for ${parentClientOrderId}`);
  }
  if (!isAlgoKind(existing.kind)) {
    return refuse('unsupported_kind', `kind ${String(existing.kind)} is not twap|vwap|pov`);
  }
  if (existing.status === 'stopped') {
    return refuse('already_stopped', `parent ${parentClientOrderId} is already stopped`);
  }
  if (!LIVE_STATUS.has(existing.status)) {
    return refuse('not_live', `parent ${parentClientOrderId} is ${existing.status} — kill needs a live (approved or running) parent`);
  }

  const rows = input.emsStore.list({ parentClientOrderId });
  const children: OmsKillLiveChild[] = [];
  const confirmed: VenueOrder[] = [];
  let unknown = false;

  for (const row of rows) {
    if (alreadyStopped(row)) {
      children.push({
        clientOrderId: row.clientOrderId,
        venueId: row.venueId,
        outcome: 'already_stopped',
        reason: row.state,
      });
      continue;
    }

    const kind = childKind(row, input.kindsByVenue);
    if (kind === 'internal') {
      unknown = true;
      children.push({
        clientOrderId: row.clientOrderId,
        venueId: row.venueId,
        outcome: 'unknown',
        reason: 'internal_venue',
      });
      continue;
    }

    const cancelled = await cancelOmsOrder({
      venueId: row.venueId,
      symbol: row.symbol,
      clientOrderId: row.clientOrderId,
      kind,
      cancelByVenue: input.cancelByVenue,
      emsStore: input.emsStore,
    });

    if (!cancelled.ok) {
      unknown = true;
      children.push({
        clientOrderId: row.clientOrderId,
        venueId: row.venueId,
        outcome: 'unknown',
        reason: cancelled.reason,
      });
      continue;
    }

    if (TERMINAL_STOPPED.has(cancelled.order.status)) {
      confirmed.push(cancelled.order);
      if (cancelled.order.status === 'canceled') {
        const evidence = input.emsStore.get(row.clientOrderId);
        if (evidence) {
          input.emsStore.record({ ...evidence, state: 'CANCELED' });
        }
      }
      children.push({
        clientOrderId: row.clientOrderId,
        venueId: row.venueId,
        outcome: 'stopped',
        status: cancelled.order.status,
      });
      continue;
    }

    unknown = true;
    children.push({
      clientOrderId: row.clientOrderId,
      venueId: row.venueId,
      outcome: 'unknown',
      status: cancelled.order.status,
      reason: 'venue_status_unconfirmed',
    });
  }

  const killed = childrenKnown(children) && !unknown;
  if (killed) {
    const stopped = input.parentStore.kill(parentClientOrderId);
    if (!stopped) {
      return refuse('not_live', `parent ${parentClientOrderId} could not be stopped`);
    }
    return {
      ok: true,
      killed: true,
      parent: { parentClientOrderId: stopped.parentClientOrderId, kind: stopped.kind },
      children,
      residual: residualFromOrders(confirmed, false),
    };
  }

  return {
    ok: true,
    killed: false,
    parent: { parentClientOrderId: existing.parentClientOrderId, kind: existing.kind },
    children,
    residual: residualFromOrders(confirmed, true),
  };
}
