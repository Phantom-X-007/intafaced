import { describe, expect, it } from 'vitest';
import { DEFAULT_MIN_BEST_LEVEL_NOTIONAL, bestFromDepth, markSourceFromDepth } from './mark-from-depth.js';
import type { EngineDepth } from '../spot/matching-client.js';

/** One wei. The smallest order the ledger's 18-decimal scale can express. */
const DUST = '0.000000000000000001';

describe('bestFromDepth', () => {
  it('reads top of book when the best levels carry real size', () => {
    const d: EngineDepth = { bids: [['99', '10']], asks: [['101', '20']], sequence: 1 };
    expect(bestFromDepth(d)).toEqual({ bestBid: '99', bestAsk: '101' });
  });

  it('empty book → null sides', () => {
    expect(bestFromDepth({ bids: [], asks: [], sequence: 0 })).toEqual({
      bestBid: null,
      bestAsk: null,
    });
    expect(bestFromDepth(null)).toEqual({ bestBid: null, bestAsk: null });
  });

  /**
   * THE DEFECT, AT THE LEVEL IT LIVED AT.
   *
   * `bestFromDepth` read index 0 of each level — the price — and discarded index
   * 1, the quantity. One wei at 1000 and one wei at 3000 therefore read as a
   * perfectly ordinary two-sided book.
   */
  it('a best level carrying dust is not a level', () => {
    const d: EngineDepth = { bids: [['1000', DUST]], asks: [['3000', DUST]], sequence: 1 };
    expect(bestFromDepth(d)).toEqual({ bestBid: null, bestAsk: null });
  });

  it('reads the QUANTITY, not just the price — same prices, different sizes, different answer', () => {
    const thin: EngineDepth = { bids: [['1000', '0.001']], asks: [['3000', '0.001']], sequence: 1 };
    const thick: EngineDepth = { bids: [['1000', '1']], asks: [['3000', '1']], sequence: 1 };
    expect(bestFromDepth(thin)).toEqual({ bestBid: null, bestAsk: null });
    expect(bestFromDepth(thick)).toEqual({ bestBid: '1000', bestAsk: '3000' });
  });

  it('one thin side is enough to make the book one-sided', () => {
    const d: EngineDepth = { bids: [['1000', '10']], asks: [['3000', DUST]], sequence: 1 };
    expect(bestFromDepth(d)).toEqual({ bestBid: '1000', bestAsk: null });
  });

  /** The threshold is a parameter, and the mechanism honours whatever it is set to. */
  it('honours a configured threshold in both directions', () => {
    const d: EngineDepth = { bids: [['100', '0.5']], asks: [['102', '0.5']], sequence: 1 };
    // 50 quote units a side: under the default 100, over a configured 10.
    expect(bestFromDepth(d)).toEqual({ bestBid: null, bestAsk: null });
    expect(bestFromDepth(d, { minBestLevelNotional: '10' })).toEqual({ bestBid: '100', bestAsk: '102' });
    expect(bestFromDepth(d, { minBestLevelNotional: '1000' })).toEqual({ bestBid: null, bestAsk: null });
  });

  /** The unsafe reading must not be the one you get by leaving an argument off. */
  it('applies the threshold by DEFAULT — omitting the policy does not disable it', () => {
    expect(DEFAULT_MIN_BEST_LEVEL_NOTIONAL).toBe('100');
    const d: EngineDepth = { bids: [['1000', DUST]], asks: [['3000', DUST]], sequence: 1 };
    expect(bestFromDepth(d).bestBid).toBeNull();
  });

  it('an unreadable threshold falls back to the default rather than to no check', () => {
    const d: EngineDepth = { bids: [['1000', DUST]], asks: [['3000', DUST]], sequence: 1 };
    expect(bestFromDepth(d, { minBestLevelNotional: 'not-a-number' })).toEqual({ bestBid: null, bestAsk: null });
  });

  it('a malformed or non-positive quantity is no size at all', () => {
    expect(bestFromDepth({ bids: [['1000', '0']], asks: [['3000', '99']], sequence: 1 }).bestBid).toBeNull();
    expect(bestFromDepth({ bids: [['1000', 'abc']], asks: [['3000', '99']], sequence: 1 }).bestBid).toBeNull();
    expect(bestFromDepth({ bids: [['1000', '']], asks: [['3000', '99']], sequence: 1 }).bestBid).toBeNull();
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
      bids: [['100', '5']],
      asks: [],
      sequence: 1,
    }));
    expect(await src.markPrice({ marketId: 'm1', at: new Date() })).toBeNull();
  });

  /**
   * THE WHOLE OF DEFECT B, IN ONE ASSERTION.
   *
   * Before the fix this returned '2000' — a payout-grade `mid`, quality and all,
   * minted from two orders worth about four femto-cents. Two dust orders and no
   * capital at risk was a price the platform would pay on.
   */
  it('refuses to mint a mid from two dust orders (it used to answer 2000)', async () => {
    const src = markSourceFromDepth(async () => ({
      bids: [['1000', DUST]],
      asks: [['3000', DUST]],
      sequence: 1,
    }));
    expect(await src.markPrice({ marketId: 'm1', at: new Date() })).toBeNull();
    expect(await src.quote({ marketId: 'm1', at: new Date() })).toBeNull();
  });

  /**
   * REFUSES, rather than downgrading to `last`. A downgraded quote would still
   * clear `acceptableForMarking` and reach margin-call arithmetic and a trader's
   * screen as though somebody had quoted it. There is no quote here at all.
   */
  it('a thin book yields no quote of any quality — not a downgraded one', async () => {
    const src = markSourceFromDepth(async () => ({
      bids: [['1000', DUST]],
      asks: [['3000', DUST]],
      sequence: 1,
    }));
    expect(await src.quote({ marketId: 'm1', at: new Date() })).toBeNull();
  });

  it('the same book with real size behind it still quotes normally', async () => {
    const src = markSourceFromDepth(async () => ({
      bids: [['1000', '1']],
      asks: [['3000', '1']],
      sequence: 1,
    }));
    expect(await src.markPrice({ marketId: 'm1', at: new Date() })).toBe('2000');
  });
});
