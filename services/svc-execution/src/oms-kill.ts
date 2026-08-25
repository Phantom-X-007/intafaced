/**
 * Operator kill — stop in-flight execution for one account or one session.
 *
 * Children stop when the venue confirms cancel (or are already terminal).
 * Unconfirmed cancel is unknown. This door never invents a canceled order.
 * It does not touch the matching book and is not a new OMS.
 */
import type { VenueKind } from '@intafaced/venue-adapter';
import { cancelOmsOrder, type OmsCancelFn } from './oms-cancel.js';
import type { EmsOrderEvidence, EmsOrderStore } from './oms-ems-store.js';

export type OmsKillInput = {
  readonly account?: string;
  readonly session?: string;
  readonly cancelByVenue?: Readonly<Record<string, OmsCancelFn>>;
  readonly emsStore?: EmsOrderStore;
  /** Optional venue-kind map so internal children are refused without a cancel call. */
  readonly kindsByVenue?: Readonly<Record<string, VenueKind>>;
};

export type OmsKillChildOutcome = 'stopped' | 'unknown' | 'already_stopped';

export type OmsKillChild = {
  readonly clientOrderId: string;
  readonly venueId: string;
  readonly outcome: OmsKillChildOutcome;
  readonly status?: string;
  readonly reason?: string;
};

export type OmsKillOk = {
  readonly ok: true;
  readonly scope: { readonly account?: string; readonly session?: string };
  readonly children: readonly OmsKillChild[];
};

export type OmsKillRefuse =
  | { readonly ok: false; readonly reason: 'missing_scope'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'ambiguous_scope'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'ems_store_unwired'; readonly detail: string };

export type OmsKillResult = OmsKillOk | OmsKillRefuse;

const TERMINAL_STOPPED = new Set(['canceled', 'filled']);

function alreadyStopped(row: EmsOrderEvidence): boolean {
  return row.state === 'REJECTED' || row.state === 'UNWIRED';
}

function childKind(row: EmsOrderEvidence, kindsByVenue?: Readonly<Record<string, VenueKind>>): VenueKind | undefined {
  return kindsByVenue?.[row.venueId] ?? (row.venueId === 'internal' ? 'internal' : undefined);
}

export async function killInFlightExecution(input: OmsKillInput): Promise<OmsKillResult> {
  const account = input.account?.trim() ?? '';
  const session = input.session?.trim() ?? '';
  if (account && session) {
    return { ok: false, reason: 'ambiguous_scope', detail: 'kill exactly one account or one session' };
  }
  if (!account && !session) {
    return { ok: false, reason: 'missing_scope', detail: 'account or session is required' };
  }
  if (!input.emsStore) {
    return { ok: false, reason: 'ems_store_unwired', detail: 'EMS evidence store is required for operator kill' };
  }

  const rows = input.emsStore.list(account ? { account } : { session });
  const children: OmsKillChild[] = [];

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
      children.push({
        clientOrderId: row.clientOrderId,
        venueId: row.venueId,
        outcome: 'unknown',
        reason: cancelled.reason,
      });
      continue;
    }

    if (TERMINAL_STOPPED.has(cancelled.order.status)) {
      children.push({
        clientOrderId: row.clientOrderId,
        venueId: row.venueId,
        outcome: 'stopped',
        status: cancelled.order.status,
      });
      continue;
    }

    children.push({
      clientOrderId: row.clientOrderId,
      venueId: row.venueId,
      outcome: 'unknown',
      status: cancelled.order.status,
      reason: 'venue_status_unconfirmed',
    });
  }

  return {
    ok: true,
    scope: account ? { account } : { session },
    children,
  };
}
