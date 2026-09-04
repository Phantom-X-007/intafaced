/**
 * CARD R-quant money proof — paper and live-deploy never post.
 */
import { describe, expect, it } from 'vitest';
import { MemoryLedger } from '@intafaced/ledger-client';
import { QUANT_LIVE_DEPLOY_UNPINNED, QUANT_PAPER_CANNOT_LEDGER, checkQuantLiveDeploy, runQuantLiveDeploy } from './live-deploy.js';

describe('R-quant paper/live-deploy posts no money', () => {
  it('unpinned refuse never calls post; journal stays empty', async () => {
    const ledger = new MemoryLedger();
    const calls: unknown[] = [];
    const post = async (recipe: unknown) => {
      calls.push(recipe);
      return recipe;
    };
    const result = await runQuantLiveDeploy({ post });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe(QUANT_LIVE_DEPLOY_UNPINNED);
    expect(result.posted).toBe(false);
    expect(result.launched).toBe(false);
    expect(result.orders).toEqual([]);
    expect(calls).toEqual([]);
    expect(ledger.journal()).toHaveLength(0);
  });

  it('paper environment never posts even with a pin', async () => {
    const calls: unknown[] = [];
    const post = async (recipe: unknown) => {
      calls.push(recipe);
      return recipe;
    };
    const result = checkQuantLiveDeploy({
      environment: 'paper',
      pin: 'owner-eligibility-pin',
      post,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe(QUANT_PAPER_CANNOT_LEDGER);
    expect(result.posted).toBe(false);
    expect(calls).toEqual([]);
  });

  it('pin preview still never posts — not a live book', async () => {
    const calls: unknown[] = [];
    const post = async (recipe: unknown) => {
      calls.push(recipe);
      return recipe;
    };
    const result = checkQuantLiveDeploy({ pin: 'owner-eligibility-pin', post });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.executed).toBe(false);
    expect(result.launched).toBe(false);
    expect(result.posted).toBe(false);
    expect(result.orders).toEqual([]);
    expect(calls).toEqual([]);
  });
});
