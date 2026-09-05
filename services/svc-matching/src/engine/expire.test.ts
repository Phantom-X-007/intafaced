import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client/money';
import { MemoryEventBus } from '@intafaced/events';
import { MatchingEngine } from './engine.js';
import { MemoryJournal, replay } from './journal.js';
import { MARKET_HALTED, MISSING_OPERATOR } from './halt.js';
import { MARKET_PRELAUNCH } from './prelaunch.js';
import { MARKET_DELISTED, MARKET_EXPIRED, replayDelistedMarkets, replayExpiredMarkets } from './expire.js';
import type { EngineOrder, OrderSide } from './types.js';

/**
 * Operator expire/delist of one market. New submits refuse. Other markets stay.
 * Cancels stay. Distinct from halt and prelaunch. No notice period. Missing operator refuses.
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

describe('operator expire of one market', () => {
  it('refuses a new submit on the expired market and journals nothing for that submit', async () => {
    const { journal, engine } = build();
    await engine.submit(MARKET, order({ id: REST, side: 'sell', qty: '1', price: '100' }));
    const expired = await engine.expire(MARKET, { operatorId: 'ops-1' });

    expect(expired.accepted).toBe(true);
    expect(expired.expired).toBe(true);
    expect(expired.operatorId).toBe('ops-1');
    expect(engine.isExpired(MARKET)).toBe(true);
    expect(engine.isHalted(MARKET)).toBe(false);
    expect(engine.isPrelaunch(MARKET)).toBe(false);
    expect(engine.isDelisted(MARKET)).toBe(false);

    const before = journal.length;
    const result = await engine.submit(MARKET, order({ id: TAKER, side: 'buy', qty: '1', price: '100' }));

    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(MARKET_EXPIRED);
    expect(result.sequence).toBeNull();
    expect(result.fills).toEqual([]);
    expect(journal.length).toBe(before);
    expect(engine.book(MARKET).toState().asks[0]!.orders[0]!.orderId).toBe(REST);
  });

  it('leaves another market open', async () => {
    const { engine } = build();
    await engine.expire(MARKET, { operatorId: 'ops-1' });

    const result = await engine.submit(OTHER, order({ id: OTHER_REST, side: 'sell', qty: '1', price: '200' }));

    expect(result.accepted).toBe(true);
    expect(engine.isExpired(OTHER)).toBe(false);
    expect(engine.isExpired(MARKET)).toBe(true);
  });

  it('still cancels while expired', async () => {
    const { engine } = build();
    await engine.submit(MARKET, order({ id: REST, side: 'sell', qty: '1', price: '100' }));
    await engine.expire(MARKET, { operatorId: 'ops-1' });

    const cancelled = await engine.cancel(MARKET, REST);

    expect(cancelled.cancelled).toBe(true);
    expect(engine.book(MARKET).toState().asks).toEqual([]);
  });

  it('is not halt — resume of halt does not reopen an expired market', async () => {
    const { engine } = build();
    await engine.submit(MARKET, order({ id: REST, side: 'sell', qty: '1', price: '100' }));
    await engine.halt(MARKET, { operatorId: 'ops-1', confirmOperatorId: 'ops-2' });
    await engine.expire(MARKET, { operatorId: 'ops-1' });
    await engine.resume(MARKET, { operatorId: 'ops-2', confirmOperatorId: 'ops-3' });

    expect(engine.isHalted(MARKET)).toBe(false);
    expect(engine.isExpired(MARKET)).toBe(true);

    const blocked = await engine.submit(MARKET, order({ id: TAKER, side: 'buy', qty: '1', price: '100' }));
    expect(blocked.accepted).toBe(false);
    expect(blocked.rejected?.code).toBe(MARKET_EXPIRED);
  });

  it('is not prelaunch — open does not clear expire', async () => {
    const { engine } = build();
    await engine.prelaunch(MARKET, { operatorId: 'ops-1' });
    await engine.expire(MARKET, { operatorId: 'ops-1' });
    await engine.open(MARKET, { operatorId: 'ops-2' });

    expect(engine.isPrelaunch(MARKET)).toBe(false);
    expect(engine.isExpired(MARKET)).toBe(true);

    const blocked = await engine.submit(MARKET, order({ id: TAKER, side: 'buy', qty: '1', price: '100' }));
    expect(blocked.accepted).toBe(false);
    expect(blocked.rejected?.code).toBe(MARKET_EXPIRED);
    expect(blocked.rejected?.code).not.toBe(MARKET_PRELAUNCH);
    expect(blocked.rejected?.code).not.toBe(MARKET_HALTED);
  });

  it('refuses expire without an operator — does not invent a caller', async () => {
    const { journal, engine } = build();
    const expired = await engine.expire(MARKET, {});
    expect(expired.accepted).toBe(false);
    expect(expired.rejected?.code).toBe(MISSING_OPERATOR);
    expect(engine.isExpired(MARKET)).toBe(false);
    expect(journal.length).toBe(0);

    const blank = await engine.expire(MARKET, { operatorId: '   ' });
    expect(blank.accepted).toBe(false);
    expect(blank.rejected?.code).toBe(MISSING_OPERATOR);
  });

  it('does not disable the engine — the process kill-switch is a different door', async () => {
    const { engine } = build();
    await engine.expire(MARKET, { operatorId: 'ops-1' });
    expect(engine.isEnabled).toBe(true);
    expect(engine.isExpired(OTHER)).toBe(false);
  });

  it('replays expire so a recovered engine still refuses submits', async () => {
    const { journal, engine } = build();
    await engine.submit(MARKET, order({ id: REST, side: 'sell', qty: '1', price: '100' }));
    await engine.expire(MARKET, { operatorId: 'ops-1' });

    const recovered = new MatchingEngine({
      journal,
      bus: new MemoryEventBus('svc-matching'),
      snapshotEvery: 0,
    });
    recovered.recover();

    expect(recovered.isExpired(MARKET)).toBe(true);
    expect(replayExpiredMarkets(journal.read()).has(MARKET)).toBe(true);
    expect(replay(journal.read()).has(MARKET)).toBe(true);

    const result = await recovered.submit(MARKET, order({ id: TAKER, side: 'buy', qty: '1', price: '100' }));
    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(MARKET_EXPIRED);
  });

  it('refuses amend on an expired market without journaling', async () => {
    const { journal, engine } = build();
    const rest = await engine.submit(MARKET, order({ id: REST, side: 'sell', qty: '1', price: '100' }));
    expect(rest.accepted).toBe(true);
    await engine.expire(MARKET, { operatorId: 'ops-1' });
    const before = journal.length;

    const amended = await engine.amend(MARKET, { orderId: REST, expectedVersion: 1, qty: parseAmount('2') });

    expect(amended.accepted).toBe(false);
    expect(amended.rejected?.code).toBe(MARKET_EXPIRED);
    expect(journal.length).toBe(before);
  });
});

describe('operator delist of one market', () => {
  it('refuses a new submit on the delisted market and journals nothing for that submit', async () => {
    const { journal, engine } = build();
    await engine.submit(MARKET, order({ id: REST, side: 'sell', qty: '1', price: '100' }));
    const delisted = await engine.delist(MARKET, { operatorId: 'ops-1' });

    expect(delisted.accepted).toBe(true);
    expect(delisted.delisted).toBe(true);
    expect(delisted.operatorId).toBe('ops-1');
    expect(engine.isDelisted(MARKET)).toBe(true);
    expect(engine.isExpired(MARKET)).toBe(false);
    expect(engine.isHalted(MARKET)).toBe(false);

    const before = journal.length;
    const result = await engine.submit(MARKET, order({ id: TAKER, side: 'buy', qty: '1', price: '100' }));

    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(MARKET_DELISTED);
    expect(result.sequence).toBeNull();
    expect(journal.length).toBe(before);
  });

  it('still cancels while delisted', async () => {
    const { engine } = build();
    await engine.submit(MARKET, order({ id: REST, side: 'sell', qty: '1', price: '100' }));
    await engine.delist(MARKET, { operatorId: 'ops-1' });

    const cancelled = await engine.cancel(MARKET, REST);

    expect(cancelled.cancelled).toBe(true);
    expect(engine.book(MARKET).toState().asks).toEqual([]);
  });

  it('leaves another market open', async () => {
    const { engine } = build();
    await engine.delist(MARKET, { operatorId: 'ops-1' });

    const result = await engine.submit(OTHER, order({ id: OTHER_REST, side: 'sell', qty: '1', price: '200' }));
    expect(result.accepted).toBe(true);
    expect(engine.isDelisted(OTHER)).toBe(false);
  });

  it('is not expire — expire refuse code stays market_expired', async () => {
    const { engine } = build();
    await engine.expire(MARKET, { operatorId: 'ops-1' });

    const blocked = await engine.submit(MARKET, order({ id: TAKER, side: 'buy', qty: '1', price: '100' }));
    expect(blocked.rejected?.code).toBe(MARKET_EXPIRED);
    expect(blocked.rejected?.code).not.toBe(MARKET_DELISTED);
  });

  it('is not halt — resume of halt does not reopen a delisted market', async () => {
    const { engine } = build();
    await engine.halt(MARKET, { operatorId: 'ops-1', confirmOperatorId: 'ops-2' });
    await engine.delist(MARKET, { operatorId: 'ops-1' });
    await engine.resume(MARKET, { operatorId: 'ops-2', confirmOperatorId: 'ops-3' });

    const blocked = await engine.submit(MARKET, order({ id: AFTER, side: 'sell', qty: '1', price: '100' }));
    expect(blocked.accepted).toBe(false);
    expect(blocked.rejected?.code).toBe(MARKET_DELISTED);
  });

  it('refuses delist without an operator — does not invent a caller', async () => {
    const { journal, engine } = build();
    const delisted = await engine.delist(MARKET, {});
    expect(delisted.accepted).toBe(false);
    expect(delisted.rejected?.code).toBe(MISSING_OPERATOR);
    expect(engine.isDelisted(MARKET)).toBe(false);
    expect(journal.length).toBe(0);
  });

  it('replays delist so a recovered engine still refuses submits', async () => {
    const { journal, engine } = build();
    await engine.delist(MARKET, { operatorId: 'ops-1' });

    const recovered = new MatchingEngine({
      journal,
      bus: new MemoryEventBus('svc-matching'),
      snapshotEvery: 0,
    });
    recovered.recover();

    expect(recovered.isDelisted(MARKET)).toBe(true);
    expect(replayDelistedMarkets(journal.read()).has(MARKET)).toBe(true);

    const result = await recovered.submit(MARKET, order({ id: TAKER, side: 'buy', qty: '1', price: '100' }));
    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(MARKET_DELISTED);
  });

  it('refuses amend on a delisted market without journaling', async () => {
    const { journal, engine } = build();
    await engine.submit(MARKET, order({ id: REST, side: 'sell', qty: '1', price: '100' }));
    await engine.delist(MARKET, { operatorId: 'ops-1' });
    const before = journal.length;

    const amended = await engine.amend(MARKET, { orderId: REST, expectedVersion: 1, qty: parseAmount('2') });

    expect(amended.accepted).toBe(false);
    expect(amended.rejected?.code).toBe(MARKET_DELISTED);
    expect(journal.length).toBe(before);
  });
});
