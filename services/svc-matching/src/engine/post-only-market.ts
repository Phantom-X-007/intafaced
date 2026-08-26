/**
 * Operator post-only of one market. Non-post-only submits refuse.
 * Post-only that would take still refuses — existing PO law.
 * Cancels stay. Resume is a second explicit door.
 * No duration, no SLO, not halt — halt blocks every submit.
 * Missing operator cannot apply — the engine does not invent a caller.
 */
import type { EngineOrder, MarketId, RejectReason, SubmitResult } from './types.js';

export const MARKET_POST_ONLY = 'market_post_only' as const;

export type PostOnlyMarketRefuse = typeof MARKET_POST_ONLY;

/** True when this submit is already post-only. The engine does not invent a TIF. */
export function isPostOnlySubmit(order: Pick<EngineOrder, 'tif'>): boolean {
  return order.tif === 'PO';
}

export function marketPostOnlyRefuse(marketId: MarketId): RejectReason {
  return {
    code: MARKET_POST_ONLY,
    message: `market ${marketId} is post-only — non-post-only submits are refused`,
  };
}

export function postOnlyMarketSubmitResult(marketId: MarketId, orderId: string): SubmitResult {
  return {
    accepted: false,
    sequence: null,
    fills: [],
    resting: null,
    rejected: {
      ...marketPostOnlyRefuse(marketId),
      message: `market ${marketId} is post-only — order ${orderId} is not post-only`,
    },
    cancellations: [],
    triggered: [],
  };
}

/** Last post-only / resume per market wins. Not a book — replay does not invent one. */
export function replayPostOnlyMarkets(records: readonly { readonly kind: string; readonly marketId: MarketId }[]): ReadonlySet<MarketId> {
  const postOnly = new Set<MarketId>();
  for (const record of records) {
    if (record.kind === 'post_only') postOnly.add(record.marketId);
    else if (record.kind === 'resume_post_only') postOnly.delete(record.marketId);
  }
  return postOnly;
}
