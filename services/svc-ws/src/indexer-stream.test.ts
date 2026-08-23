import { describe, expect, it } from 'vitest';
import { INDEXER_STREAM_UNWIRED, ingestIndexerStream } from './indexer-stream.js';

describe('ingestIndexerStream', () => {
  it('unwired frame applies nothing — not an empty live book', () => {
    const out = ingestIndexerStream({ status: 'unwired', code: INDEXER_STREAM_UNWIRED, deltas: [] });
    expect(out.books.size).toBe(0);
    expect(out.applied).toBe(0);
  });

  it('empty ok deltas stay empty', () => {
    const out = ingestIndexerStream({ status: 'ok', code: null, deltas: [] });
    expect(out.books.size).toBe(0);
    expect(out.applied).toBe(0);
  });

  it('gapped delta is refused — never a synthetic book', () => {
    const out = ingestIndexerStream({
      status: 'ok',
      code: null,
      deltas: [
        {
          type: 'delta',
          marketId: 'IFC-USD',
          fromSequence: 0,
          sequence: 1,
          bids: [['100', '5']],
          asks: [['101', '2']],
        },
      ],
    });
    expect(out.applied).toBe(0);
    expect(out.refused).toBe(1);
    expect(out.books.size).toBe(0);
  });
});
