/**
 * D26-P1-T4 ledger door — TWAP never invents fills.
 *
 * Promise: algo create / pause / resume / empty-book miss post nothing that
 * looks like a fill. Child place may `order.hold` (ordinary order path).
 * Progress `filledQty` moves only after a real `trade.fill` recipe posts, and
 * only by the sum of those fill qtys — never by schedule qty or childrenEmitted.
 *
 * Leverage: MemoryLedger + recipes.orderHold / recipes.tradeFill (Phase A).
 * Path: services/svc-trade/src/algo/** only (disjoint from OTC + T9).
 */
import { describe, expect, it } from 'vitest';
import { formatAmount, MemoryLedger, parseAmount, recipes, userAvailable, type Amount } from '@intafaced/ledger-client';
import { presentAlgoProgress, sumChildFillQtys, assertParentHasNoMoneyFields } from './present.js';
import { TwapEngine, type TwapEnginePorts } from './twap-engine.js';
import type { AlgoQuotedMark, CreateTwapInput } from './types.js';

const LOT = parseAmount('0.001');
const MARKET = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const MAKER = '33333333-3333-4333-8333-333333333333';
const QUOTE = 'USDT';
const BASE = 'BTC';

type ChildFill = { readonly qty: Amount };

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

function makePorts(
  over: Partial<TwapEnginePorts> = {},
): TwapEnginePorts & { placed: string[]; advance: (ms: number) => void; nowMs: () => number } {
  const placed: string[] = [];
  let t = 1_700_000_000_000;
  const base: TwapEnginePorts = {
    now: () => new Date(t),
    randomId: () => `id-${placed.length}-${t}`,
    placeChild: async (req) => {
      placed.push(req.clientOrderId);
      return { orderId: `order-${req.sliceIndex}` };
    },
    cancelChild: async () => undefined,
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
    advance: (ms: number) => {
      t += ms;
    },
    nowMs: () => t,
  };
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

/** Same aggregation TradeService.algoProgress uses — fills table / ledger only. */
function progressFromFillBook(parent: ReturnType<TwapEngine['get']> & object, fillsByOrder: Map<string, ChildFill[]>) {
  const fills: ChildFill[] = [];
  for (const child of parent.children) {
    for (const f of fillsByOrder.get(child.orderId) ?? []) fills.push(f);
  }
  return presentAlgoProgress(parent, sumChildFillQtys(fills));
}

describe('D26-P1-T4 ledger — TWAP no invent fills', () => {
  it('create / pause / resume post nothing to the ledger', async () => {
    const ledger = new MemoryLedger();
    await ledger.post(
      recipes.deposit({
        userId: USER,
        assetId: QUOTE,
        amount: parseAmount('1000'),
        rail: 'test',
        railRef: 'twap-fund-create',
      }),
    );
    const before = ledger.journal().length;

    const ports = makePorts();
    const engine = new TwapEngine(ports);
    const parent = engine.create(USER, baseInput({ clientAlgoId: 'ledger-create' }), LOT);
    assertParentHasNoMoneyFields(parent);
    engine.pause(USER, parent.id);
    ports.advance(2_000);
    engine.resume(USER, parent.id);

    expect(ledger.journal().length).toBe(before);
    expect(ledger.journal().some((tx) => tx.reason === 'trade.fill')).toBe(false);
    expect(ledger.journal().some((tx) => tx.reason === 'order.hold')).toBe(false);

    const progress = progressFromFillBook(engine.get(parent.id)!, new Map());
    expect(progress.filledQty).toBe('0');
    expect(progress.childrenEmitted).toBe(0);
  });

  it('empty-book miss: no child, no hold, no fill, filledQty stays 0', async () => {
    const ledger = new MemoryLedger();
    await ledger.post(
      recipes.deposit({
        userId: USER,
        assetId: QUOTE,
        amount: parseAmount('1000'),
        rail: 'test',
        railRef: 'twap-fund-miss',
      }),
    );
    const availBefore = (await ledger.balance(userAvailable(USER, QUOTE))).amount;
    const before = ledger.journal().length;

    const ports = makePorts({
      bestOpposingPrice: async () => null,
    });
    const engine = new TwapEngine(ports);
    const parent = engine.create(USER, baseInput({ clientAlgoId: 'ledger-miss' }), LOT);
    const tick = await engine.tick(parent.id);
    expect(tick.kind).toBe('miss');
    expect(ports.placed).toHaveLength(0);

    expect(ledger.journal().length).toBe(before);
    expect((await ledger.balance(userAvailable(USER, QUOTE))).amount).toBe(availBefore);

    const progress = progressFromFillBook(engine.get(parent.id)!, new Map());
    expect(progress.filledQty).toBe('0');
    expect(progress.missesRecorded).toBe(1);
    expect(progress.childrenEmitted).toBe(0);
  });

  it('child place may order.hold; progress filledQty stays 0 until trade.fill', async () => {
    const ledger = new MemoryLedger();
    await ledger.post(
      recipes.deposit({
        userId: USER,
        assetId: QUOTE,
        amount: parseAmount('1000'),
        rail: 'test',
        railRef: 'twap-fund-hold',
      }),
    );
    await ledger.post(
      recipes.deposit({
        userId: MAKER,
        assetId: BASE,
        amount: parseAmount('1'),
        rail: 'test',
        railRef: 'twap-maker-btc',
      }),
    );

    const fillsByOrder = new Map<string, ChildFill[]>();
    const placedIds: string[] = [];
    const ports = makePorts({
      placeChild: async (req) => {
        const orderId = `order-${req.sliceIndex}`;
        // Ordinary child path: reserve quote for a buy. Not a fill.
        const notional = parseAmount('50'); // 1 slice * ~50 quote (test scale)
        await ledger.post(
          recipes.orderHold({
            orderId,
            userId: USER,
            assetId: QUOTE,
            amount: notional,
          }),
        );
        placedIds.push(req.clientOrderId);
        return { orderId };
      },
    });

    const engine = new TwapEngine(ports);
    const parent = engine.create(USER, baseInput({ clientAlgoId: 'ledger-hold' }), LOT);
    const tick = await engine.tick(parent.id);
    expect(tick.kind).toBe('placed');
    expect(placedIds).toHaveLength(1);

    const after = engine.get(parent.id)!;
    expect(after.children).toHaveLength(1);
    const holdProgress = progressFromFillBook(after, fillsByOrder);
    expect(holdProgress.childrenEmitted).toBe(1);
    expect(holdProgress.filledQty).toBe('0');
    expect(ledger.journal().some((tx) => tx.reason === 'order.hold')).toBe(true);
    expect(ledger.journal().some((tx) => tx.reason === 'trade.fill')).toBe(false);

    // Inventing progress from schedule qty must not be how callers present.
    const scheduleQty = after.totalQty;
    expect(formatAmount(scheduleQty)).not.toBe('0');
    expect(holdProgress.filledQty).not.toBe(formatAmount(scheduleQty));

    // Real fill via ledger recipe — only then does filledQty move.
    const childOrderId = after.children[0]!.orderId;
    const fillQty = after.children[0]!.qty;
    const makerOrderId = 'maker-resting-1';
    await ledger.post(
      recipes.orderHold({
        orderId: makerOrderId,
        userId: MAKER,
        assetId: BASE,
        amount: fillQty,
      }),
    );
    await ledger.post(
      recipes.tradeFill({
        fillId: 'fill-twap-1',
        takerId: USER,
        makerId: MAKER,
        takerOrderId: childOrderId,
        makerOrderId,
        takerSide: 'buy',
        baseAsset: BASE,
        quoteAsset: QUOTE,
        qty: fillQty,
        quoteAmount: parseAmount('50'),
        makerFeeBps: 0,
        takerFeeBps: 0,
      }),
    );
    fillsByOrder.set(childOrderId, [{ qty: fillQty }]);

    const filledProgress = progressFromFillBook(engine.get(parent.id)!, fillsByOrder);
    expect(filledProgress.filledQty).toBe(formatAmount(fillQty));
    expect(filledProgress.filledQty).not.toBe(formatAmount(after.totalQty));
    expect(ledger.journal().filter((tx) => tx.reason === 'trade.fill')).toHaveLength(1);
  });

  it('overdue resume re-spaces without fabricating fills or ledger posts', async () => {
    const ledger = new MemoryLedger();
    await ledger.post(
      recipes.deposit({
        userId: USER,
        assetId: QUOTE,
        amount: parseAmount('1000'),
        rail: 'test',
        railRef: 'twap-fund-overdue',
      }),
    );

    const INTERVAL = 60_000;
    const ports = makePorts();
    const engine = new TwapEngine(ports);
    const parent = engine.create(
      USER,
      baseInput({
        clientAlgoId: 'ledger-overdue',
        durationMs: 600_000,
        sliceIntervalMs: INTERVAL,
        totalQty: parseAmount('0.010'),
      }),
      LOT,
    );
    const originalEnd = parent.projectedEndsAt.getTime();

    expect((await engine.tick(parent.id)).kind).toBe('placed');
    engine.pause(USER, parent.id);
    ports.advance(5 * INTERVAL);
    const resumed = engine.resume(USER, parent.id);
    expect(resumed.scheduleStretchReason).toBe('user_pause');
    expect(resumed.projectedEndsAt.getTime()).toBeGreaterThan(originalEnd);

    // Burst window: many sub-interval ticks → at most one additional child.
    for (let i = 0; i < 20; i++) {
      await engine.tick(parent.id);
      ports.advance(400);
    }
    expect(ports.placed).toHaveLength(2);

    const children = engine.get(parent.id)!.children;
    for (let i = 1; i < children.length; i++) {
      const gap = children[i]!.placedAt.getTime() - children[i - 1]!.placedAt.getTime();
      expect(gap).toBeGreaterThanOrEqual(INTERVAL);
    }

    // No trade.fill invented by pause/resume/overdue catch-up.
    expect(ledger.journal().some((tx) => tx.reason === 'trade.fill')).toBe(false);
    const progress = progressFromFillBook(engine.get(parent.id)!, new Map());
    expect(progress.childrenEmitted).toBe(2);
    expect(progress.filledQty).toBe('0');
  });

  it('sumChildFillQtys refuses to treat childrenEmitted as filled qty', () => {
    const ports = makePorts();
    const engine = new TwapEngine(ports);
    const parent = engine.create(USER, baseInput({ clientAlgoId: 'sum-check' }), LOT);
    // Simulate two emitted children with zero ledger fills.
    const fakeParent = {
      ...parent,
      children: [
        {
          sliceIndex: 0,
          orderId: 'o0',
          clientOrderId: 'c0',
          qty: parseAmount('0.002'),
          placedAt: ports.now(),
        },
        {
          sliceIndex: 1,
          orderId: 'o1',
          clientOrderId: 'c1',
          qty: parseAmount('0.002'),
          placedAt: ports.now(),
        },
      ],
      nextSliceIndex: 2,
    };
    const summed = sumChildFillQtys([]);
    expect(summed).toBe(0n);
    const view = presentAlgoProgress(fakeParent, summed);
    expect(view.childrenEmitted).toBe(2);
    expect(view.filledQty).toBe('0');
  });
});
