/**
 * CARD H7 money proof — what-if posts no money.
 */
import { describe, expect, it } from 'vitest';
import { createGreeksAdapter, type NativeQuantLib } from '@intafaced/greeks-adapter';
import { GREEKS_NATIVE_UNLINKED, whatIfVanillaGreeks } from './what-if.js';

const vanilla = {
  right: 'call' as const,
  strike: '100',
  spot: '100',
  volatility: '0.2',
  timeToExpiry: '1',
  riskFreeRate: '0.01',
  dividendYield: '0',
};

describe('H7 what-if posts no money', () => {
  it('unlinked refuse never calls post', async () => {
    const calls: unknown[] = [];
    const post = async (recipe: unknown) => {
      calls.push(recipe);
      return recipe;
    };
    const result = whatIfVanillaGreeks(vanilla, { adapter: createGreeksAdapter({ native: null }), post });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe(GREEKS_NATIVE_UNLINKED);
    expect(calls).toEqual([]);
  });

  it('linked Greeks never call post either — what-if is not a book', async () => {
    const native: NativeQuantLib = {
      vanillaEuropean: () => ({ npv: 1, delta: 0.5, gamma: 0.02, vega: 0.4, theta: -0.03 }),
      yearFraction: () => 0.5,
    };
    const calls: unknown[] = [];
    const post = async (recipe: unknown) => {
      calls.push(recipe);
      return recipe;
    };
    const result = whatIfVanillaGreeks(vanilla, { adapter: createGreeksAdapter({ native }), post });
    expect(result.ok).toBe(true);
    expect(calls).toEqual([]);
  });
});
