/**
 * Mass-cancel by owner. Owner is accountId — the field the book already has.
 * Optional side scopes to buy or sell (rests + stops). Missing/null is both.
 * Session is not on the book; a session id refuses rather than inventing one.
 * Missing account cannot apply — the caller refuses. The engine does not invent an owner.
 */
import type { AccountId, BookState, CancelledRef, OrderId, OrderSide } from './types.js';

export const SESSION_UNSUPPORTED = 'session_unsupported' as const;

export type MassCancelRefuse = typeof SESSION_UNSUPPORTED;

export interface LiveOwned {
  readonly orderId: OrderId;
  readonly accountId: AccountId;
  readonly sequence: number;
  readonly side: OrderSide;
}

export function readSessionId(cmd: { readonly sessionId?: string | null }): string | null {
  const raw = cmd.sessionId;
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function massCancelSessionRefuse(sessionId: string | null): { readonly code: MassCancelRefuse; readonly message: string } | null {
  if (sessionId === null) return null;
  return {
    code: SESSION_UNSUPPORTED,
    message: 'session mass-cancel is unsupported; the engine does not invent a session',
  };
}

/** Live ids for this account, oldest sequence first. Missing account matches nothing. Present side is that side only. */
export function ownedOrderIds(accountId: AccountId, live: readonly LiveOwned[], side?: OrderSide | null): readonly OrderId[] {
  if (accountId.length === 0) return [];
  const scoped = side ?? null;
  return live
    .filter((row) => row.accountId === accountId)
    .filter((row) => scoped === null || row.side === scoped)
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map((row) => row.orderId);
}

export function readMassCancelSide(cmd: { readonly side?: OrderSide | null }): OrderSide | null {
  const raw = cmd.side;
  if (raw === undefined || raw === null) return null;
  return raw;
}

export interface CancelFailure {
  readonly orderId: OrderId;
  readonly reason: string;
}

export function cancelFailureReason(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message.trim();
    if (msg.length > 0) return msg;
  }
  return 'cancel_failed';
}

/** Live rests + stops as owned rows. Bids are buy, asks are sell. Stops keep their side. */
export function liveOwnedFromState(state: BookState): readonly LiveOwned[] {
  const live: LiveOwned[] = [];
  for (const level of state.bids) {
    for (const o of level.orders) live.push({ orderId: o.orderId, accountId: o.accountId, sequence: o.sequence, side: 'buy' });
  }
  for (const level of state.asks) {
    for (const o of level.orders) live.push({ orderId: o.orderId, accountId: o.accountId, sequence: o.sequence, side: 'sell' });
  }
  for (const s of state.stops) live.push({ orderId: s.orderId, accountId: s.accountId, sequence: s.sequence, side: s.side });
  return live;
}

/**
 * Cancel each id independently. A throw or missing cancel on one id does not abort the rest.
 * Successes stay cancelled. Failures are named.
 */
export function cancelIdsIndependently(
  cancel: (orderId: OrderId) => { readonly cancellation: CancelledRef | null },
  ids: readonly OrderId[],
): { readonly cancellations: readonly CancelledRef[]; readonly failed: readonly CancelFailure[] } {
  const cancellations: CancelledRef[] = [];
  const failed: CancelFailure[] = [];
  for (const orderId of ids) {
    try {
      const result = cancel(orderId);
      if (result.cancellation) cancellations.push(result.cancellation);
      else failed.push({ orderId, reason: 'cancel_failed' });
    } catch (err) {
      failed.push({ orderId, reason: cancelFailureReason(err) });
    }
  }
  return { cancellations, failed };
}

import './cod-fence.js';
