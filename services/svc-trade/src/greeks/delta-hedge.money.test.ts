/**
 * CARD R-E6 money proof — auto delta-hedge posts no money.
 */
import { describe, expect, it } from 'vitest';
import { MemoryLedger } from '@intafaced/ledger-client';
import { DELTA_HEDGE_TARGET_UNSET, checkAutoDeltaHedge, runAutoDeltaHedge } from './delta-hedge.js';

describe('R-E6 auto delta-hedge posts no money', () => {
  it('unset refuse never calls post; journal stays empty', async () => {
    const ledger = new MemoryLedger();
    const calls: unknown[] = [];
    const post = async (recipe: unknown) => {
      calls.push(recipe);
      return recipe;
    };
    const result = await runAutoDeltaHedge({ post });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe(DELTA_HEDGE_TARGET_UNSET);
    expect(result.executed).toBe(false);
    expect(result.orders).toEqual([]);
    expect(calls).toEqual([]);
    expect(ledger.journal()).toHaveLength(0);
  });

  it('preview with sockets still never posts — not a hedge book', async () => {
    const calls: unknown[] = [];
    const post = async (recipe: unknown) => {
      calls.push(recipe);
      return recipe;
    };
    const result = checkAutoDeltaHedge({
      target: '0',
      range: '0.05',
      instrument: 'BTC-PERP',
      post,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.executed).toBe(false);
    expect(result.orders).toEqual([]);
    expect(calls).toEqual([]);
  });
});
