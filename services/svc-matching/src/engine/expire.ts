/**
 * Operator expire or delist of one market. New submits refuse. Cancels stay.
 * Distinct from halt and prelaunch. No notice period — the engine does not invent one.
 * Missing operator cannot apply — the engine does not invent a caller.
 */
import type { AmendResult, MarketId, RejectReason, SubmitResult } from './types.js';

export const MARKET_EXPIRED = 'market_expired' as const;
export const MARKET_DELISTED = 'market_delisted' as const;

export type ExpireRefuse = typeof MARKET_EXPIRED;
export type DelistRefuse = typeof MARKET_DELISTED;

export function marketExpiredRefuse(marketId: MarketId): RejectReason {
  return {
    code: MARKET_EXPIRED,
    message: `market ${marketId} is expired — new submits are refused`,
  };
}

export function marketDelistedRefuse(marketId: MarketId): RejectReason {
  return {
    code: MARKET_DELISTED,
    message: `market ${marketId} is delisted — new submits are refused`,
  };
}

export function expiredSubmitResult(marketId: MarketId, orderId: string): SubmitResult {
  return {
    accepted: false,
    sequence: null,
    fills: [],
    resting: null,
    rejected: { ...marketExpiredRefuse(marketId), message: `market ${marketId} is expired — order ${orderId} not processed` },
    cancellations: [],
    triggered: [],
  };
}

export function delistedSubmitResult(marketId: MarketId, orderId: string): SubmitResult {
  return {
    accepted: false,
    sequence: null,
    fills: [],
    resting: null,
    rejected: { ...marketDelistedRefuse(marketId), message: `market ${marketId} is delisted — order ${orderId} not processed` },
    cancellations: [],
    triggered: [],
  };
}

export function expiredAmendResult(marketId: MarketId, orderId: string): AmendResult {
  return {
    accepted: false,
    orderId,
    sequence: null,
    version: null,
    priority: null,
    fills: [],
    resting: null,
    rejected: { ...marketExpiredRefuse(marketId), message: `market ${marketId} is expired — order ${orderId} not processed` },
    cancellations: [],
    triggered: [],
  };
}

export function delistedAmendResult(marketId: MarketId, orderId: string): AmendResult {
  return {
    accepted: false,
    orderId,
    sequence: null,
    version: null,
    priority: null,
    fills: [],
    resting: null,
    rejected: { ...marketDelistedRefuse(marketId), message: `market ${marketId} is delisted — order ${orderId} not processed` },
    cancellations: [],
    triggered: [],
  };
}

/** Last expire per market wins. Not a book — replay does not invent one. Halt/prelaunch are different doors. No reverse. */
export function replayExpiredMarkets(records: readonly { readonly kind: string; readonly marketId?: MarketId }[]): ReadonlySet<MarketId> {
  const expired = new Set<MarketId>();
  for (const record of records) {
    if (record.marketId === undefined) continue;
    if (record.kind === 'expire') expired.add(record.marketId);
  }
  return expired;
}

/** Last delist per market wins. Not a book — replay does not invent one. Halt/prelaunch/expire are different doors. No reverse. */
export function replayDelistedMarkets(records: readonly { readonly kind: string; readonly marketId?: MarketId }[]): ReadonlySet<MarketId> {
  const delisted = new Set<MarketId>();
  for (const record of records) {
    if (record.marketId === undefined) continue;
    if (record.kind === 'delist') delisted.add(record.marketId);
  }
  return delisted;
}
