import { describe, expect, it } from 'vitest';
import { bestFromDepth, markSourceFromDepth } from './mark-from-depth.js';
import type { EngineDepth } from '../spot/matching-client.js';

describe('bestFromDepth', () => {
  it('reads top of book', () => {
    const d: EngineDepth = { bids: [['99', '1']], asks: [['101', '2']], sequence: 1 };
    expect(bestFromDepth(d)).toEqual({ bestBid: '99', bestAsk: '101' });
  });

  it('empty book → null sides', () => {
    expect(bestFromDepth({ bids: [], asks: [], sequence: 0 })).toEqual({
      bestBid: null,
      bestAsk: null,
    });
    expect(bestFromDepth(null)).toEqual({ bestBid: null, bestAsk: null });
  });
});

describe('markSourceFromDepth', () => {
  it('mids two-sided book', async () => {
    const src = markSourceFromDepth(async () => ({
      bids: [['100', '5']],
      asks: [['102', '5']],
      sequence: 3,
    }));
    expect(await src.markPrice({ marketId: 'm1', at: new Date() })).toBe('101');
  });

  it('empty matching book → null (never invent)', async () => {
    const src = markSourceFromDepth(async () => ({ bids: [], asks: [], sequence: 0 }));
    expect(await src.markPrice({ marketId: 'm1', at: new Date() })).toBeNull();
  });

  it('null depth reader → null', async () => {
    const src = markSourceFromDepth(async () => null);
    expect(await src.markPrice({ marketId: 'm1', at: new Date() })).toBeNull();
  });

  it('one-sided book → null under default mid-only policy', async () => {
    const src = markSourceFromDepth(async () => ({
      bids: [['100', '1']],
      asks: [],
      sequence: 1,
    }));
    expect(await src.markPrice({ marketId: 'm1', at: new Date() })).toBeNull();
  });
});
