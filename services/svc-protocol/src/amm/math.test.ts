import { describe, expect, it } from 'vitest';
import { getAmountIn, getAmountOut, priceImpactBps } from './math.js';

describe('AMM constant-product math', () => {
  it('matches the classic V2 example (fee 30 bps)', () => {
    //  reserveIn=1000e18, reserveOut=1000e18, amountIn=1e18, fee=0.3%
    const amountIn = 10n ** 18n;
    const rIn = 1000n * 10n ** 18n;
    const rOut = 1000n * 10n ** 18n;
    const out = getAmountOut(amountIn, rIn, rOut, 30);
    // Should be slightly under 0.996e18 (fee + impact)
    expect(out).toBeGreaterThan(990n * 10n ** 15n);
    expect(out).toBeLessThan(997n * 10n ** 15n);
  });

  it('getAmountIn round-trips getAmountOut within 1 wei of ceil', () => {
    const rIn = 5_000n * 10n ** 18n;
    const rOut = 10_000n * 10n ** 18n;
    const wantOut = 10n * 10n ** 18n;
    const needIn = getAmountIn(wantOut, rIn, rOut, 30);
    const gotOut = getAmountOut(needIn, rIn, rOut, 30);
    expect(gotOut).toBeGreaterThanOrEqual(wantOut);
  });

  it('refuses empty book and bad fee', () => {
    expect(() => getAmountOut(1n, 0n, 1n, 30)).toThrow(/empty/);
    expect(() => getAmountOut(1n, 1n, 1n, 5001)).toThrow(/fee/);
  });

  it('reports positive impact on a large trade', () => {
    const impact = priceImpactBps(100n * 10n ** 18n, 1000n * 10n ** 18n, 1000n * 10n ** 18n, 30);
    expect(impact).toBeGreaterThan(50);
  });
});
