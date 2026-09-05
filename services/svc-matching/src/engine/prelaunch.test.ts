import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client/money';
import { MemoryEventBus } from '@intafaced/events';
import { MatchingEngine } from './engine.js';
import { MemoryJournal, replay } from './journal.js';
import { MARKET_HALTED, MISSING_OPERATOR } from './halt.js';
import { MARKET_PRELAUNCH, replayPrelaunchMarkets } from './prelaunch.js';
import type { EngineOrder, OrderSide } from './types.js';

/**
 * Operator prelaunch of one market. Public submits refuse until OPEN.
 * Other markets stay. Cancel of nothing is a no-op. OPEN is explicit.
 * Not halt. Missing operator refuses.
 */

const MARKET = 'BTC/USDT';
const OTHER = 'ETH/USDT';
const REST = '11111111-1111-4111-8111-111111111111';
const TAKER = '22222222-2222-4222-8222-222222222222';
const OTHER_REST = '33333333-3333-4333-8333-333333333333';
const AFTER = '44444444-4444-4444-8444-444444444444';

function order(spec: { id: string; account?: string; side: OrderSide; qty: string; price: string }): EngineOrder {
  return {
    orderId: spec.id,
    accountId: spec.account ?? 'desk',
    type: 'limit',
    side: spec.side,
    qty: parseAmount(spec.qty),
    price: parseAmount(spec.price),
    stopPrice: null,
    tif: 'GTC',
  };
}

function build() {
  const journal = new MemoryJournal();
  const bus = new MemoryEventBus('svc-matching');
  const engine = new MatchingEngine({ journal, bus, snapshotEvery: 0 });
  return { journal, bus, engine };
}

describe('operator prelaunch of one market', () => {
  it('refuses a public submit until open and journals nothing for that submit', async () => {
    const { journal, engine } = build();
    const mode = await engine.prelaunch(MARKET, { operatorId: 'ops-1' });

    expect(mode.accepted).toBe(true);
    expect(mode.prelaunch).toBe(true);
    expect(mode.operatorId).toBe('ops-1');
    expect(engine.isPrelaunch(MARKET)).toBe(true);
    expect(engine.isHalted(MARKET)).toBe(false);

    const before = journal.length;
    const result = await engine.submit(MARKET, order({ id: TAKER, side: 'buy', qty: '1', price: '100' }));

    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(MARKET_PRELAUNCH);
    expect(result.sequence).toBeNull();
    expect(result.fills).toEqual([]);
    expect(journal.length).toBe(before);
    expect(engine.hasMarket(MARKET)).toBe(false);
  });

  it('leaves another market open', async () => {
    const { engine } = build();
    await engine.prelaunch(MARKET, { operatorId: 'ops-1' });

    const result = await engine.submit(OTHER, order({ id: OTHER_REST, side: 'sell', qty: '1', price: '200' }));

    expect(result.accepted).toBe(true);
    expect(engine.isPrelaunch(OTHER)).toBe(false);
    expect(engine.isPrelaunch(MARKET)).toBe(true);
  });

  it('cancel of nothing is a no-op — does not invent a market or journal', async () => {
    const { journal, engine } = build();
    await engine.prelaunch(MARKET, { operatorId: 'ops-1' });
    const before = journal.length;

    const cancelled = await engine.cancel(MARKET, REST);

    expect(cancelled.cancelled).toBe(false);
    expect(cancelled.sequence).toBeNull();
    expect(engine.hasMarket(MARKET)).toBe(false);
    expect(journal.length).toBe(before);
  });

  it('mass-cancel of nothing is empty, not an error', async () => {
    const { journal, engine } = build();
    await engine.prelaunch(MARKET, { operatorId: 'ops-1' });
    const before = journal.length;

    const result = await engine.massCancel(MARKET, { accountId: 'desk' });

    expect(result.accepted).toBe(true);
    expect(result.cancellations).toEqual([]);
    expect(engine.hasMarket(MARKET)).toBe(false);
    expect(journal.length).toBe(before);
  });

  it('opens only after an explicit open — prelaunch never expires', async () => {
    const { engine } = build();
    await engine.prelaunch(MARKET, { operatorId: 'ops-1' });
    const blocked = await engine.submit(MARKET, order({ id: TAKER, side: 'buy', qty: '1', price: '100' }));
    expect(blocked.accepted).toBe(false);

    const opened = await engine.open(MARKET, { operatorId: 'ops-2' });
    expect(opened.accepted).toBe(true);
    expect(opened.prelaunch).toBe(false);
    expect(engine.isPrelaunch(MARKET)).toBe(false);

    const result = await engine.submit(MARKET, order({ id: AFTER, side: 'sell', qty: '1', price: '100' }));
    expect(result.accepted).toBe(true);
  });

  it('is not halt — halt still uses market_halted and open does not clear it', async () => {
    const { engine } = build();
    await engine.submit(MARKET, order({ id: REST, side: 'sell', qty: '1', price: '100' }));
    await engine.halt(MARKET, { operatorId: 'ops-1', confirmOperatorId: 'ops-2' });
    await engine.prelaunch(MARKET, { operatorId: 'ops-1' });

    const blocked = await engine.submit(MARKET, order({ id: TAKER, side: 'buy', qty: '1', price: '100' }));
    expect(blocked.accepted).toBe(false);
    expect(blocked.rejected?.code).toBe(MARKET_HALTED);

    await engine.open(MARKET, { operatorId: 'ops-2' });
    expect(engine.isPrelaunch(MARKET)).toBe(false);
    expect(engine.isHalted(MARKET)).toBe(true);

    const still = await engine.submit(MARKET, order({ id: AFTER, side: 'buy', qty: '1', price: '100' }));
    expect(still.accepted).toBe(false);
    expect(still.rejected?.code).toBe(MARKET_HALTED);
  });

  it('resume of halt does not clear prelaunch', async () => {
    const { engine } = build();
    await engine.prelaunch(MARKET, { operatorId: 'ops-1' });
    await engine.halt(MARKET, { operatorId: 'ops-1', confirmOperatorId: 'ops-2' });
    await engine.resume(MARKET, { operatorId: 'ops-2', confirmOperatorId: 'ops-3' });

    expect(engine.isHalted(MARKET)).toBe(false);
    expect(engine.isPrelaunch(MARKET)).toBe(true);

    const blocked = await engine.submit(MARKET, order({ id: TAKER, side: 'buy', qty: '1', price: '100' }));
    expect(blocked.accepted).toBe(false);
    expect(blocked.rejected?.code).toBe(MARKET_PRELAUNCH);
  });

  it('refuses prelaunch and open without an operator — does not invent a caller', async () => {
    const { journal, engine } = build();
    const mode = await engine.prelaunch(MARKET, {});
    expect(mode.accepted).toBe(false);
    expect(mode.rejected?.code).toBe(MISSING_OPERATOR);
    expect(engine.isPrelaunch(MARKET)).toBe(false);
    expect(journal.length).toBe(0);

    const blank = await engine.prelaunch(MARKET, { operatorId: '   ' });
    expect(blank.accepted).toBe(false);
    expect(blank.rejected?.code).toBe(MISSING_OPERATOR);

    await engine.prelaunch(MARKET, { operatorId: 'ops-1' });
    const opened = await engine.open(MARKET, { operatorId: null });
    expect(opened.accepted).toBe(false);
    expect(opened.rejected?.code).toBe(MISSING_OPERATOR);
    expect(engine.isPrelaunch(MARKET)).toBe(true);
  });

  it('does not disable the engine — the process kill-switch is a different door', async () => {
    const { engine } = build();
    await engine.prelaunch(MARKET, { operatorId: 'ops-1' });
    expect(engine.isEnabled).toBe(true);
    expect(engine.isPrelaunch(OTHER)).toBe(false);
    expect(engine.isHalted(MARKET)).toBe(false);
  });

  it('replays prelaunch so a recovered engine still refuses public submits', async () => {
    const { journal, engine } = build();
    await engine.prelaunch(MARKET, { operatorId: 'ops-1' });

    const recovered = new MatchingEngine({
      journal,
      bus: new MemoryEventBus('svc-matching'),
      snapshotEvery: 0,
    });
    recovered.recover();

    expect(recovered.isPrelaunch(MARKET)).toBe(true);
    expect(replayPrelaunchMarkets(journal.read()).has(MARKET)).toBe(true);
    expect(replay(journal.read()).has(MARKET)).toBe(false);

    const result = await recovered.submit(MARKET, order({ id: TAKER, side: 'buy', qty: '1', price: '100' }));
    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(MARKET_PRELAUNCH);
  });

  it('refuses amend on a prelaunch market without journaling', async () => {
    const { journal, engine } = build();
    await engine.prelaunch(MARKET, { operatorId: 'ops-1' });
    const before = journal.length;

    const amended = await engine.amend(MARKET, { orderId: REST, expectedVersion: 1, qty: parseAmount('2') });

    expect(amended.accepted).toBe(false);
    expect(amended.rejected?.code).toBe(MARKET_PRELAUNCH);
    expect(journal.length).toBe(before);
    expect(engine.hasMarket(MARKET)).toBe(false);
  });

  it('replay of prelaunch then open leaves the market accepting public submits', async () => {
    const { journal, engine } = build();
    await engine.prelaunch(MARKET, { operatorId: 'ops-1' });
    await engine.open(MARKET, { operatorId: 'ops-2' });

    const recovered = new MatchingEngine({
      journal,
      bus: new MemoryEventBus('svc-matching'),
      snapshotEvery: 0,
    });
    recovered.recover();
    expect(recovered.isPrelaunch(MARKET)).toBe(false);

    const result = await recovered.submit(MARKET, order({ id: AFTER, side: 'sell', qty: '1', price: '100' }));
    expect(result.accepted).toBe(true);
  });
});
