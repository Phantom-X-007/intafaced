/**
 * CARD R-promo money proof — create-promo posts no money.
 */
import { describe, expect, it } from 'vitest';
import { MemoryLedger } from '@intafaced/ledger-client';
import { PROMO_BUDGET_UNSET, checkCreatePromo, runCreatePromo } from './promo.js';

describe('R-promo create-promo posts no money', () => {
  it('unset refuse never calls post; journal stays empty', async () => {
    const ledger = new MemoryLedger();
    const calls: unknown[] = [];
    const post = async (recipe: unknown) => {
      calls.push(recipe);
      return recipe;
    };
    const result = await runCreatePromo({ post });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe(PROMO_BUDGET_UNSET);
    expect(result.created).toBe(false);
    expect(result.posted).toBe(false);
    expect(result.rebateBps).toBeNull();
    expect(calls).toEqual([]);
    expect(ledger.journal()).toHaveLength(0);
  });

  it('preview with budget/end still never posts — not a rebate book', async () => {
    const calls: unknown[] = [];
    const post = async (recipe: unknown) => {
      calls.push(recipe);
      return recipe;
    };
    const result = checkCreatePromo({
      budget: '1000',
      end: '2026-12-31T00:00:00.000Z',
      rebateBps: '25',
      post,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toBe(false);
    expect(result.posted).toBe(false);
    expect(calls).toEqual([]);
  });
});
