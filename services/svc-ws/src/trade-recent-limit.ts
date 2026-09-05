/**
 * Owner-published public tape replay length. Blank / non-integer / out of 0..1000 refuses.
 * Never invent 50.
 */
export const WS_TRADE_RECENT_LIMIT_UNSET = 'ws.trade_recent_limit_unset' as const;

export function isPublishedTradeRecentLimit(limit: number | undefined): limit is number {
  return typeof limit === 'number' && Number.isInteger(limit) && limit >= 0 && limit <= 1_000;
}
