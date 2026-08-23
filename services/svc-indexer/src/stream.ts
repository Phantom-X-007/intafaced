/**
 * Projection stream — market-data absolute deltas, or a named refuse.
 *
 * Venue ABI is the existing `chain/evm/abi.ts`. This module does not invent
 * one. Zero venue / blank RPC → `indexer.stream_unwired`. Empty books stay
 * empty arrays — never a fabricated $0 book.
 *
 * Delta shape matches `@intafaced/market-data` DepthDelta (absolute totals).
 * svc-ws applies them via applyDelta — this service does not invent mids.
 */

export const INDEXER_STREAM_UNWIRED = 'indexer.stream_unwired' as const;
export const ZERO_VENUE = '0x0000000000000000000000000000000000000000';

export type StreamLevel = readonly [price: string, quantity: string];

export type StreamBook = {
  readonly market: string;
  readonly sequence: number;
  readonly bids: readonly StreamLevel[];
  readonly asks: readonly StreamLevel[];
};

export type StreamDelta = {
  readonly type: 'delta';
  readonly marketId: string;
  readonly fromSequence: number;
  readonly sequence: number;
  readonly bids: readonly StreamLevel[];
  readonly asks: readonly StreamLevel[];
};

export type StreamAssessment =
  | { readonly status: 'unwired'; readonly code: typeof INDEXER_STREAM_UNWIRED; readonly deltas: readonly [] }
  | { readonly status: 'ok'; readonly code: null; readonly deltas: readonly StreamDelta[] };

export function streamIsWired(venue?: string | null, rpcUrl?: string | null): boolean {
  const v = (venue ?? '').trim().toLowerCase();
  const r = (rpcUrl ?? '').trim();
  return r.length > 0 && /^0x[0-9a-f]{40}$/.test(v) && v !== ZERO_VENUE;
}

export function toDepthDelta(book: StreamBook): StreamDelta {
  const sequence = book.sequence < 0 ? 0 : book.sequence;
  const fromSequence = sequence === 0 ? 0 : sequence - 1;
  return {
    type: 'delta',
    marketId: book.market,
    fromSequence,
    sequence,
    bids: book.bids,
    asks: book.asks,
  };
}

export function assessProjectionStream(input: {
  readonly venue?: string | null;
  readonly rpcUrl?: string | null;
  readonly books?: readonly StreamBook[];
}): StreamAssessment {
  if (!streamIsWired(input.venue, input.rpcUrl)) {
    return { status: 'unwired', code: INDEXER_STREAM_UNWIRED, deltas: [] };
  }
  const books = input.books ?? [];
  return { status: 'ok', code: null, deltas: books.map(toDepthDelta) };
}
