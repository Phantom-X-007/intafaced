/**
 * Indexer projection stream ingest for svc-ws.
 *
 * Uses packages/market-data `applyDelta` — absolute totals, refuse gap/stale.
 * `indexer.stream_unwired` is absence: do not apply, do not invent a book.
 */
import { applyDelta, emptyBook, type ApplyResult, type DepthBook, type DepthDelta } from '@intafaced/market-data';

export const INDEXER_STREAM_UNWIRED = 'indexer.stream_unwired' as const;

export type IndexerStreamFrame =
  | { readonly status: 'unwired'; readonly code: typeof INDEXER_STREAM_UNWIRED; readonly deltas: readonly [] }
  | { readonly status: 'ok'; readonly code: null; readonly deltas: readonly DepthDelta[] };

export function ingestIndexerStream(
  frame: IndexerStreamFrame,
  books: Map<string, DepthBook> = new Map(),
): { readonly books: Map<string, DepthBook>; readonly applied: number; readonly refused: number } {
  if (frame.status === 'unwired' || frame.code === INDEXER_STREAM_UNWIRED) {
    return { books, applied: 0, refused: 0 };
  }
  let applied = 0;
  let refused = 0;
  for (const delta of frame.deltas) {
    const current = books.get(delta.marketId) ?? emptyBook(delta.marketId);
    const result: ApplyResult = applyDelta(current, delta);
    if (result.ok) {
      books.set(delta.marketId, result.book);
      applied += 1;
    } else {
      refused += 1;
    }
  }
  return { books, applied, refused };
}
