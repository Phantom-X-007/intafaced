import { describe, expect, it } from 'vitest';
import { INDEXER_STREAM_UNWIRED, ZERO_VENUE, assessProjectionStream, streamIsWired, toDepthDelta } from './stream.js';

describe('assessProjectionStream', () => {
  it('refuses zero venue and blank RPC — indexer.stream_unwired', () => {
    expect(assessProjectionStream({})).toMatchObject({
      status: 'unwired',
      code: INDEXER_STREAM_UNWIRED,
      deltas: [],
    });
    expect(streamIsWired(ZERO_VENUE, 'http://127.0.0.1:8545')).toBe(false);
    expect(streamIsWired('0x1111111111111111111111111111111111111111', '')).toBe(false);
  });

  it('empty books stay empty — never a fabricated book', () => {
    const out = assessProjectionStream({
      venue: '0x1111111111111111111111111111111111111111',
      rpcUrl: 'http://127.0.0.1:8545',
      books: [],
    });
    expect(out).toEqual({ status: 'ok', code: null, deltas: [] });
  });

  it('wired books are absolute delta totals as decimal strings', () => {
    const delta = toDepthDelta({
      market: 'IFC-USD',
      sequence: 1,
      bids: [['100', '5']],
      asks: [['101', '2']],
    });
    expect(delta).toMatchObject({
      type: 'delta',
      marketId: 'IFC-USD',
      fromSequence: 0,
      sequence: 1,
    });
    expect(delta.bids[0]).toEqual(['100', '5']);
    expect(typeof delta.bids[0]![0]).toBe('string');
  });
});
