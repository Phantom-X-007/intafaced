/**
 * Owner-published drop-copy session replay length. Blank / non-integer / out of 0..1000 refuses.
 * Never invent 50. Not durable history.
 */
export const WS_DROP_COPY_RECENT_LIMIT_UNSET = 'ws.drop_copy_recent_limit_unset' as const;

export function isPublishedDropCopyRecentLimit(limit: number | undefined): limit is number {
  return typeof limit === 'number' && Number.isInteger(limit) && limit >= 0 && limit <= 1_000;
}
