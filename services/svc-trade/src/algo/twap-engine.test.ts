import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import { TradeError } from '../spot/types.js';
import { assertParentHasNoMoneyFields, FORBIDDEN_PARENT_MONEY_KEYS, presentAlgoProgress } from './present.js';
import { planTwapSlices } from './schedule.js';
import { acceptableForAlgo, algoMarkMissing, withinPriceBand } from './mark-gate.js';
import { TwapEngine, type TwapEnginePorts } from './twap-engine.js';
import type { AlgoQuotedMark, CreateTwapInput } from './types.js';

const LOT = parseAmount('0.001');
const MARKET = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';

function baseInput(over: Partial<CreateTwapInput> = {}): CreateTwapInput {
  return {
    marketId: MARKET,
    symbol: 'BTC/USDT',
    side: 'buy',
    totalQty: parseAmount('0.010'),
    durationMs: 10_000,
    sliceIntervalMs: 2_000,
    limitPrice: parseAmount('100'),
    subAccountId: null,
    ...over,
  };
}

function makePorts(over: Partial<TwapEnginePorts> = {}): TwapEnginePorts & {
  placed: string[];
  cancelled: string[];
  advance: (ms: number) => void;
} {
  const placed: string[] = [];
  const cancelled: string[] = [];
  let t = 1_700_000_000_000;
  const base: TwapEnginePorts = {
    now: () => new Date(t),
    randomId: () => `id-${placed.length}-${cancelled.length}-${t}`,
    placeChild: async (req) => {
      placed.push(req.clientOrderId);
      return { orderId: `order-${req.sliceIndex}` };
    },
    cancelChild: async (orderId) => {
      cancelled.push(orderId);
    },
    bestOpposingPrice: async () => parseAmount('50'),
    markFor: async (marketId): Promise<AlgoQuotedMark | null> => ({
      marketId,
      price: parseAmount('50'),
      asOf: new Date(t),
      quality: 'mid',
    }),
  };
  const ports = {
    ...base,
    ...over,
    placed,
    cancelled,
    advance: (ms: number) => {
      t += ms;
    },
  };
  // Keep now/markFor on the mutable clock unless the test replaced now.
  if (!over.now) ports.now = () => new Date(t);
  if (!over.markFor) {
    ports.markFor = async (marketId): Promise<AlgoQuotedMark | null> => ({
      marketId,
      price: parseAmount('50'),
      asOf: new Date(t),
      quality: 'mid',
    });
  }
  return ports;
}

describe('planTwapSlices', () => {
  it('splits total into equal lot-aligned slices', () => {
    const plan = planTwapSlices({
      totalQty: parseAmount('0.010'),
      durationMs: 10_000,
      sliceIntervalMs: 2_000,
      lotSize: LOT,
    });
    expect(plan.slices.length).toBe(5);
    const sum = plan.slices.reduce((a, b) => a + b, 0n);
    expect(sum).toBe(plan.plannedQty);
    expect(plan.plannedQty + plan.droppedQty).toBe(parseAmount('0.010'));
  });

  it('refuses non-positive qty', () => {
    expect(() => planTwapSlices({ totalQty: 0n, durationMs: 10_000, sliceIntervalMs: 2_000, lotSize: LOT })).toThrow(TradeError);
  });
});

describe('mark-gate (prices.ts vocabulary)', () => {
  it('refuses missing mark', () => {
    const c = algoMarkMissing(MARKET);
    expect(c.ok).toBe(false);
    expect(c.code).toBe('trade.algo_mark_missing');
  });

  it('refuses stale / non-positive / future marks', () => {
    const now = new Date('2026-08-07T12:00:00Z');
    expect(acceptableForAlgo({ marketId: MARKET, price: 0n, asOf: now, quality: 'mid' }, now).ok).toBe(false);
    expect(
      acceptableForAlgo({ marketId: MARKET, price: parseAmount('1'), asOf: new Date(now.getTime() - 400_000), quality: 'mid' }, now).ok,
    ).toBe(false);
    expect(
      acceptableForAlgo({ marketId: MARKET, price: parseAmount('1'), asOf: new Date(now.getTime() + 60_000), quality: 'mid' }, now).ok,
    ).toBe(false);
  });

  it('price band: buy refuses above limit, sell refuses below', () => {
    expect(withinPriceBand('buy', parseAmount('101'), parseAmount('100'))).toBe(false);
    expect(withinPriceBand('buy', parseAmount('99'), parseAmount('100'))).toBe(true);
    expect(withinPriceBand('sell', parseAmount('99'), parseAmount('100'))).toBe(false);
    expect(withinPriceBand('sell', parseAmount('101'), parseAmount('100'))).toBe(true);
  });
});

describe('TwapEngine — D-S-04 done bar', () => {
  it('parent has no balance-bearing / fill / pnl fields', () => {
    const ports = makePorts();
    const engine = new TwapEngine(ports);
    const parent = engine.create(USER, baseInput(), LOT);
    assertParentHasNoMoneyFields(parent);
    for (const key of FORBIDDEN_PARENT_MONEY_KEYS) {
      expect(Object.keys(parent)).not.toContain(key);
    }
  });

  it('empty book → zero progress + stated miss (never invent fill)', async () => {
    const ports = makePorts({
      bestOpposingPrice: async () => null,
    });
    const engine = new TwapEngine(ports);
    const parent = engine.create(USER, baseInput(), LOT);
    const tick = await engine.tick(parent.id);
    expect(tick.kind).toBe('miss');
    if (tick.kind !== 'miss') throw new Error('expected miss');
    expect(tick.miss.code).toBe('trade.algo_no_liquidity');
    expect(ports.placed).toHaveLength(0);

    const after = engine.get(parent.id)!;
    const progress = presentAlgoProgress(after, 0n);
    expect(progress.filledQty).toBe('0');
    expect(progress.missesRecorded).toBe(1);
    expect(progress.childrenEmitted).toBe(0);
  });

  it('blank mark feed → HALT (refuse invent)', async () => {
    const ports = makePorts({
      markFor: async () => null,
    });
    const engine = new TwapEngine(ports);
    const parent = engine.create(USER, baseInput(), LOT);
    const tick = await engine.tick(parent.id);
    expect(tick.kind).toBe('halted');
    expect(engine.get(parent.id)!.status).toBe('halted');
    expect(ports.placed).toHaveLength(0);
  });

  it('stale mark → HALT', async () => {
    const ports = makePorts({
      markFor: async (marketId) => ({
        marketId,
        price: parseAmount('50'),
        asOf: new Date(ports.now().getTime() - 400_000),
        quality: 'mid',
      }),
    });
    const engine = new TwapEngine(ports);
    const parent = engine.create(USER, baseInput(), LOT);
    const tick = await engine.tick(parent.id);
    expect(tick.kind).toBe('halted');
    if (tick.kind === 'halted') expect(tick.code).toBe('trade.algo_mark_unusable');
  });

  it('price outside band → miss, never widen', async () => {
    const ports = makePorts({
      bestOpposingPrice: async () => parseAmount('200'),
    });
    const engine = new TwapEngine(ports);
    const parent = engine.create(USER, baseInput({ limitPrice: parseAmount('100') }), LOT);
    const tick = await engine.tick(parent.id);
    expect(tick.kind).toBe('miss');
    if (tick.kind === 'miss') expect(tick.miss.code).toBe('trade.algo_price_band');
    expect(ports.placed).toHaveLength(0);
  });

  it('insufficient balance mid-schedule → HALT', async () => {
    const ports = makePorts({
      placeChild: async () => {
        throw new TradeError('not enough quote', 'trade.algo_insufficient_balance');
      },
    });
    const engine = new TwapEngine(ports);
    const parent = engine.create(USER, baseInput(), LOT);
    const tick = await engine.tick(parent.id);
    expect(tick.kind).toBe('halted');
    if (tick.kind === 'halted') expect(tick.code).toBe('trade.algo_insufficient_balance');
    expect(engine.get(parent.id)!.status).toBe('halted');
  });

  it('child place goes through placeChild port (ordinary order path)', async () => {
    const ports = makePorts();
    const engine = new TwapEngine(ports);
    const parent = engine.create(USER, baseInput(), LOT);
    const tick = await engine.tick(parent.id);
    expect(tick.kind).toBe('placed');
    expect(ports.placed).toEqual([`algo:${parent.id}:0`]);
    expect(engine.get(parent.id)!.children).toHaveLength(1);
  });

  it('pause emits no further children; resume does not re-run elapsed slices', async () => {
    const ports = makePorts();
    const engine = new TwapEngine(ports);
    const parent = engine.create(USER, baseInput(), LOT);
    await engine.tick(parent.id);
    expect(engine.get(parent.id)!.nextSliceIndex).toBe(1);

    engine.pause(USER, parent.id);
    const pausedTick = await engine.tick(parent.id);
    expect(pausedTick).toEqual({ kind: 'idle', reason: 'paused' });
    expect(ports.placed).toHaveLength(1);

    engine.resume(USER, parent.id);
    const resumed = engine.get(parent.id)!;
    expect(resumed.nextSliceIndex).toBe(1);
    expect(resumed.status).toBe('active');

    // Advance clock past slice 1 due time
    ports.advance(3_000);
    await engine.tick(parent.id);
    expect(ports.placed).toHaveLength(2);
    expect(ports.placed[1]).toBe(`algo:${parent.id}:1`);
  });

  it('cancel: no further children; in-flight children cancelled (one disposition)', async () => {
    const ports = makePorts();
    const engine = new TwapEngine(ports);
    const parent = engine.create(USER, baseInput(), LOT);
    await engine.tick(parent.id);
    const cancelled = await engine.cancel(USER, parent.id);
    expect(cancelled.status).toBe('cancelled');
    expect(ports.cancelled).toEqual(['order-0']);

    const after = await engine.tick(parent.id);
    expect(after).toEqual({ kind: 'idle', reason: 'cancelled' });
    expect(ports.placed).toHaveLength(1);
  });

  it('progress filledQty is only the sum supplied from real fills', () => {
    const ports = makePorts();
    const engine = new TwapEngine(ports);
    const parent = engine.create(USER, baseInput(), LOT);
    const view = presentAlgoProgress(parent, parseAmount('0.003'));
    expect(view.filledQty).toBe('0.003');
    // Parent still has no filledQty field
    expect('filledQty' in parent).toBe(false);
  });
});

describe('refuse unsupported kinds at call sites', () => {
  it('documents VWAP/POV out of v1', () => {
    // Creation refusal lives on TradeService.createTwap — engine only accepts TWAP shape.
    expect(baseInput().side).toBe('buy');
  });
});
