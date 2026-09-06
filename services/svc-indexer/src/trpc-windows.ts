/**
 * Owner-published tRPC book/tape/list windows. Blank / non-integer / out of cap
 * refuses. Never invent 50 (book/stream) or 100 (fills).
 *
 * Caps stay caps (book/stream/lists 200, fills 500) — never a default.
 * Markets/positions/stream-all-markets reuse the book/stream 1..200 window.
 */
export const INDEXER_BOOK_DEPTH_UNSET = 'indexer.book_depth_unset' as const;
export const INDEXER_FILLS_LIMIT_UNSET = 'indexer.fills_limit_unset' as const;
export const INDEXER_STREAM_DEPTH_UNSET = 'indexer.stream_depth_unset' as const;
export const INDEXER_MARKETS_LIST_LIMIT_UNSET = 'indexer.markets_list_limit_unset' as const;
export const INDEXER_POSITIONS_LIST_LIMIT_UNSET = 'indexer.positions_list_limit_unset' as const;
export const INDEXER_STREAM_MARKETS_LIMIT_UNSET = 'indexer.stream_markets_limit_unset' as const;

export const INDEXER_BOOK_DEPTH_MAX = 200;
export const INDEXER_FILLS_LIMIT_MAX = 500;

export function isPublishedBookDepth(depth: number | undefined | null): depth is number {
  return typeof depth === 'number' && Number.isInteger(depth) && depth >= 1 && depth <= INDEXER_BOOK_DEPTH_MAX;
}

export function isPublishedFillsLimit(limit: number | undefined | null): limit is number {
  return typeof limit === 'number' && Number.isInteger(limit) && limit >= 1 && limit <= INDEXER_FILLS_LIMIT_MAX;
}
