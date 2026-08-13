import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import { TradeError } from '../spot/types.js';
import { MemoryTwapParentStore } from './parent-store.js';
import { hydrateAlgoIfMissing, persistAlgoMutation } from './hydrate-on-mutate.js';
import { TwapEngine, type TwapEnginePorts } from './twap-engine.js';
import type { AlgoQuotedMark, CreateTwapInput } from './types.js';

const LOT = parseAmount('0.001');
const USER = '22222222-2222-4222-8222-222222222222';
const OTHER = '44444444-4444-4444-8444-444444444444';

function baseInput(): CreateTwapInput {
  return {
    marketId: '11111111-1111-4111-8111-111111111111',
    symbol: 'BTC/USDT',
    side: 'buy',
    totalQty: parseAmount('0.004'),
    durationMs: 8_000,
    sliceIntervalMs: 2_000,
    limitPrice: parseAmount('100'),
    subAccountId: null,
  };
}

function ports(): TwapEnginePorts {
  const t = 1_700_000_000_000;
  return {
    now: () => new Date(t),
    randomId: () => 'algo-restart-1',
    placeChild: async () => ({ orderId: 'order-0' }),
    cancelChild: async () => undefined,
    bestOpposingPrice: async () => parseAmount('50'),
    markFor: async (marketId): Promise<AlgoQuotedMark | null> => ({
      marketId,
      price: parseAmount('50'),
      asOf: new Date(t),
      quality: 'mid',
    }),
  };
}

describe('trade.algo — hydrate on mutate after restart', () => {
  it('pause after cold engine loads store and persists paused', async () => {
    const store = new MemoryTwapParentStore();
    const live = new TwapEngine(ports(), { onChange: (parent, plan) => store.save({ parent, plan }) });
    const parent = live.create(USER, baseInput(), LOT);
    await store.save({ parent, plan: live.planOf(parent.id) ?? [] });

    const cold = new TwapEngine(ports());
    expect(cold.get(parent.id)).toBeUndefined();

    await hydrateAlgoIfMissing(cold, store, USER, parent.id);
    const paused = await persistAlgoMutation(cold, store, cold.pause(USER, parent.id));
    expect(paused.status).toBe('paused');

    const loaded = await store.load(parent.id);
    expect(loaded?.parent.status).toBe('paused');
  });

  it('wrong owner after restart still 404s (does not hydrate stranger)', async () => {
    const store = new MemoryTwapParentStore();
    const live = new TwapEngine(ports());
    const parent = live.create(USER, baseInput(), LOT);
    await store.save({ parent, plan: live.planOf(parent.id) ?? [] });

    const cold = new TwapEngine(ports());
    await expect(hydrateAlgoIfMissing(cold, store, OTHER, parent.id)).rejects.toMatchObject({
      code: 'trade.algo_not_found',
    });
    expect(cold.get(parent.id)).toBeUndefined();
  });

  it('missing id throws TradeError not found', async () => {
    const store = new MemoryTwapParentStore();
    const cold = new TwapEngine(ports());
    await expect(hydrateAlgoIfMissing(cold, store, USER, 'missing')).rejects.toBeInstanceOf(TradeError);
  });
});
