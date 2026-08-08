import { describe, expect, it } from 'vitest';
import { pickBestRoute } from './sovereign-quote.js';

describe('sovereign router quote pick (S-A5)', () => {
  const base = {
    amountIn: 1_000_000_000_000_000_000n,
    reserveIn: 100n * 10n ** 18n,
    reserveOut: 200n * 10n ** 18n,
    feeBps: 30,
  };

  it('uses pool when no book quote is supplied (does not invent book)', () => {
    const r = pickBestRoute({ ...base, bookAmountOut: null });
    expect(r.path).toBe('pool');
    if (r.path === 'pool') expect(r.amountOut > 0n).toBe(true);
  });

  it('picks book when book is strictly better', () => {
    const pool = pickBestRoute({ ...base, bookAmountOut: null });
    if (pool.path !== 'pool') throw new Error('expected pool');
    const r = pickBestRoute({ ...base, bookAmountOut: pool.amountOut + 1n });
    expect(r).toEqual({ path: 'book', amountOut: pool.amountOut + 1n, reason: 'book_better' });
  });

  it('refuses when neither path has liquidity', () => {
    const r = pickBestRoute({
      amountIn: 1n,
      reserveIn: 0n,
      reserveOut: 0n,
      feeBps: 30,
      bookAmountOut: null,
    });
    expect(r).toEqual({ path: 'refuse', reason: 'no_quotes' });
  });
});
