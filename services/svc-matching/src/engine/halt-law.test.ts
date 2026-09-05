import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client/money';
import { MemoryEventBus } from '@intafaced/events';
import { MatchingEngine } from './engine.js';
import { MemoryJournal, replay } from './journal.js';
import { MARKET_HALTED } from './halt.js';
import { MARKET_REDUCE_ONLY } from './reduce-only-market.js';
import { MARKET_POST_ONLY } from './post-only-market.js';
import type { EngineOrder, MarketHaltResult, OrderSide } from './types.js';
import { HALT_RESTART_OPEN, haltIsNotPostOnly, haltIsNotReduceOnly, installHaltLaw } from './halt-law.js';

installHaltLaw();

/**
 * CARD D-halt hitch. Halt ≡ cancel-only. Restart cannot invent OPEN.
 * Reduce-only and post-only are distinct. Do not invent a flatten.
 */

const MARKET = 'BTC/USDT';
const REST = '11111111-1111-4111-8111-111111111111';
const TAKER = '22222222-2222-4222-8222-222222222222';
const AFTER = '44444444-4444-4444-8444-444444444444';
const PO = '55555555-5555-4555-8555-555555555555';
const RO = '66666666-6666-4666-8666-666666666666';

type HaltLawEngine = MatchingEngine & {
  restart(marketId: string): Promise<MarketHaltResult>;
};

function order(spec: {
  id: string;
  account?: string;
  side: OrderSide;
  qty: string;
  price: string;
  tif?: EngineOrder['tif'];
  reduceOnly?: boolean;
}): EngineOrder {
  return {
    orderId: spec.id,
    accountId: spec.account ?? 'desk',
    type: 'limit',
    side: spec.side,
    qty: parseAmount(spec.qty),
    price: parseAmount(spec.price),
    stopPrice: null,
    tif: spec.tif ?? 'GTC',
    ...(spec.reduceOnly ? { reduceOnly: true } : {}),
  };
}

function build() {
  const journal = new MemoryJournal();
  const bus = new MemoryEventBus('svc-matching');
  const engine = new MatchingEngine({ journal, bus, snapshotEvery: 0 }) as HaltLawEngine;
  return { journal, bus, engine };
}

function liveAskId(engine: MatchingEngine, marketId: string): string | undefined {
  return engine.book(marketId).toState().asks[0]?.orders[0]?.orderId;
}

describe('halt law — cancel-only, restart is not OPEN, not a flatten', () => {
  it('halt leaves a resting order live — journal has halt, not a cancel of that id', async () => {
    const { journal, engine } = build();
    await engine.submit(MARKET, order({ id: REST, side: 'sell', qty: '1', price: '100' }));
    const halt = await engine.halt(MARKET, { operatorId: 'ops-1', confirmOperatorId: 'ops-2' });

    expect(halt.accepted).toBe(true);
    expect(engine.isHalted(MARKET)).toBe(true);
    expect(liveAskId(engine, MARKET)).toBe(REST);
    expect(engine.restingOrders(MARKET).some((row) => row.orderId === REST)).toBe(true);

    const records = journal.read();
    expect(records.some((record) => record.kind === 'halt' && record.marketId === MARKET)).toBe(true);
    expect(records.some((record) => record.kind === 'cancel')).toBe(false);
    expect(replay(journal.read()).get(MARKET)?.toState().asks[0]?.orders[0]?.orderId).toBe(REST);
  });

  it('halt is not reduce-only or post-only; PO and GTC submits refuse market_halted', async () => {
    const { engine } = build();
    await engine.submit(MARKET, order({ id: REST, side: 'sell', qty: '1', price: '100' }));
    await engine.halt(MARKET, { operatorId: 'ops-1', confirmOperatorId: 'ops-2' });

    expect(engine.isHalted(MARKET)).toBe(true);
    expect(engine.isReduceOnly(MARKET)).toBe(false);
    expect(engine.isPostOnly(MARKET)).toBe(false);
    expect(haltIsNotReduceOnly(engine, MARKET)).toBe(true);
    expect(haltIsNotPostOnly(engine, MARKET)).toBe(true);

    const gtc = await engine.submit(MARKET, order({ id: TAKER, side: 'buy', qty: '1', price: '100' }));
    expect(gtc.accepted).toBe(false);
    expect(gtc.rejected?.code).toBe(MARKET_HALTED);
    expect(gtc.rejected?.code).not.toBe(MARKET_REDUCE_ONLY);
    expect(gtc.rejected?.code).not.toBe(MARKET_POST_ONLY);

    const po = await engine.submit(MARKET, order({ id: PO, side: 'buy', qty: '1', price: '99', tif: 'PO' }));
    expect(po.accepted).toBe(false);
    expect(po.rejected?.code).toBe(MARKET_HALTED);

    const reducing = await engine.submit(MARKET, order({ id: RO, side: 'sell', qty: '1', price: '101', reduceOnly: true }));
    expect(reducing.accepted).toBe(false);
    expect(reducing.rejected?.code).toBe(MARKET_HALTED);

    expect(liveAskId(engine, MARKET)).toBe(REST);
  });

  it('recover of a halted journal stays halted — does not invent OPEN', async () => {
    const { journal, engine } = build();
    await engine.submit(MARKET, order({ id: REST, side: 'sell', qty: '1', price: '100' }));
    await engine.halt(MARKET, { operatorId: 'ops-1', confirmOperatorId: 'ops-2' });

    const recovered = new MatchingEngine({
      journal,
      bus: new MemoryEventBus('svc-matching'),
      snapshotEvery: 0,
    }) as HaltLawEngine;
    recovered.recover();

    expect(recovered.isHalted(MARKET)).toBe(true);
    expect(liveAskId(recovered, MARKET)).toBe(REST);

    const blocked = await recovered.submit(MARKET, order({ id: TAKER, side: 'buy', qty: '1', price: '100' }));
    expect(blocked.accepted).toBe(false);
    expect(blocked.rejected?.code).toBe(MARKET_HALTED);
  });

  it('restart while halted refuses halt_restart_open; still halted; rest stays', async () => {
    const { journal, engine } = build();
    await engine.submit(MARKET, order({ id: REST, side: 'sell', qty: '1', price: '100' }));
    await engine.halt(MARKET, { operatorId: 'ops-1', confirmOperatorId: 'ops-2' });
    const before = journal.length;

    const refused = await engine.restart(MARKET);

    expect(refused.accepted).toBe(false);
    expect(refused.rejected?.code).toBe(HALT_RESTART_OPEN);
    expect(refused.halted).toBe(true);
    expect(engine.isHalted(MARKET)).toBe(true);
    expect(liveAskId(engine, MARKET)).toBe(REST);
    expect(journal.length).toBe(before);
    expect(journal.read().some((record) => record.kind === 'resume')).toBe(false);
    expect(journal.read().some((record) => record.kind === 'cancel')).toBe(false);
  });

  it('explicit resume is the only way back to live submits', async () => {
    const { engine } = build();
    await engine.submit(MARKET, order({ id: REST, side: 'sell', qty: '1', price: '100' }));
    await engine.halt(MARKET, { operatorId: 'ops-1', confirmOperatorId: 'ops-2' });

    await engine.restart(MARKET);
    expect(engine.isHalted(MARKET)).toBe(true);
    const blocked = await engine.submit(MARKET, order({ id: TAKER, side: 'buy', qty: '1', price: '100' }));
    expect(blocked.accepted).toBe(false);
    expect(blocked.rejected?.code).toBe(MARKET_HALTED);

    const resume = await engine.resume(MARKET, { operatorId: 'ops-2', confirmOperatorId: 'ops-3' });
    expect(resume.accepted).toBe(true);
    expect(engine.isHalted(MARKET)).toBe(false);

    const live = await engine.submit(MARKET, order({ id: AFTER, account: 'taker', side: 'buy', qty: '1', price: '100' }));
    expect(live.accepted).toBe(true);
    expect(live.fills).toHaveLength(1);
  });
});
