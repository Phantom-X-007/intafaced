/**
 * In-flight mitigation (PTX-M03-R09).
 * While an amend or cancel is unconfirmed, the venue cannot rest a second live
 * order or emit a duplicate fill for that orderId. Unknown outcome refuses
 * further mutation — the engine does not invent a reconstructed book.
 */
import { ZERO, parseAmount, type Amount } from '@intafaced/ledger-client/money';
import type { AmendResult, CancelResult, MarketId, OrderId, SubmitResult } from './types.js';

export const IN_FLIGHT = 'in_flight' as const;
export const IN_FLIGHT_UNKNOWN = 'in_flight_unknown' as const;

export type IfmRefuse = typeof IN_FLIGHT | typeof IN_FLIGHT_UNKNOWN;
export type IfmMutation = 'amend' | 'cancel';
export type IfmStatus = 'open' | 'unknown';

export interface InFlightMark {
  readonly marketId: MarketId;
  readonly orderId: OrderId;
  readonly mutation: IfmMutation;
  readonly status: IfmStatus;
  /** Remaining qty snapshot. Evidence only — never used to rest a second live order. */
  readonly qty: Amount | null;
}

export function persistInFlight(record: { readonly inFlight?: unknown }): boolean {
  return record.inFlight === true;
}

export function persistIfmQty(record: { readonly qty?: unknown }): boolean {
  return record.qty !== undefined;
}

/** Caller remaining. Null/zero/negative is missing — never invented. */
export function readIfmQty(qty: Amount | null | undefined): Amount | null {
  if (qty === undefined || qty === null || qty <= ZERO) return null;
  return qty;
}

/** Wire remaining. Malformed/missing is null — never a reconstructed rest. */
export function parseIfmQty(qty: string | null | undefined): Amount | null {
  if (qty === undefined || qty === null) return null;
  try {
    return readIfmQty(parseAmount(qty));
  } catch {
    return null;
  }
}

export function inFlightRefuse(orderId: OrderId): { readonly code: typeof IN_FLIGHT; readonly message: string } {
  return {
    code: IN_FLIGHT,
    message: `order ${orderId} has an unconfirmed amend or cancel — a second live order or duplicate fill is refused`,
  };
}

export function unknownInFlightRefuse(orderId: OrderId): { readonly code: typeof IN_FLIGHT_UNKNOWN; readonly message: string } {
  return {
    code: IN_FLIGHT_UNKNOWN,
    message: `order ${orderId} in-flight outcome is unknown — further mutation is refused until reconstructed`,
  };
}

function refuseOf(orderId: OrderId, unknown: boolean): { readonly code: IfmRefuse; readonly message: string } {
  return unknown ? unknownInFlightRefuse(orderId) : inFlightRefuse(orderId);
}

export function inFlightSubmitResult(orderId: OrderId, unknown: boolean): SubmitResult {
  return {
    accepted: false,
    sequence: null,
    fills: [],
    resting: null,
    rejected: refuseOf(orderId, unknown),
    cancellations: [],
    triggered: [],
  };
}

export function inFlightAmendResult(orderId: OrderId, unknown: boolean): AmendResult {
  return {
    accepted: false,
    orderId,
    sequence: null,
    version: null,
    priority: null,
    fills: [],
    resting: null,
    rejected: refuseOf(orderId, unknown),
    cancellations: [],
    triggered: [],
  };
}

export function inFlightCancelResult(orderId: OrderId, unknown: boolean): CancelResult {
  return {
    cancelled: false,
    orderId,
    sequence: null,
    cancellation: null,
    rejected: refuseOf(orderId, unknown),
  };
}

export function replayInFlight(
  records: readonly {
    readonly kind: string;
    readonly marketId?: MarketId;
    readonly orderId?: OrderId;
    readonly mutation?: IfmMutation;
    readonly qty?: string | null;
  }[],
): ReadonlyMap<OrderId, InFlightMark> {
  const open = new Map<OrderId, InFlightMark>();
  for (const record of records) {
    if (record.kind === 'in_flight') {
      const orderId = record.orderId;
      if (orderId === undefined || record.marketId === undefined) continue;
      const mutation: IfmMutation = record.mutation === 'amend' ? 'amend' : 'cancel';
      open.set(orderId, {
        marketId: record.marketId,
        orderId,
        mutation,
        status: 'unknown',
        qty: parseIfmQty(record.qty),
      });
      continue;
    }
    if ((record.kind === 'amend' || record.kind === 'cancel') && record.orderId !== undefined) {
      open.delete(record.orderId);
    }
  }
  return open;
}
