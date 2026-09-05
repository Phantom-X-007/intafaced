/**
 * Owner-published L2 top-N window. Blank / non-integer / out of 1..500 refuses.
 * Never invent 50.
 */
export const WS_DEPTH_LIMIT_UNSET = 'ws.depth_limit_unset' as const;

export function isPublishedDepthLimit(limit: number | undefined): limit is number {
  return typeof limit === 'number' && Number.isInteger(limit) && limit >= 1 && limit <= 500;
}
