import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import { MatchingEngine } from './engine.js';
import { OrderBook } from './book.js';
import { MemoryJournal, replay, toWire } from './journal.js';
import { MemoryEventBus } from '@intafaced/events';
import type { EngineOrder, EngineOrderType, OrderSide, TimeInForce } from './types.js';
import { SESSION_UNSUPPORTED, massCancelSessionRefuse, ownedOrderIds, readSessionId } from './mass-cancel.js';

/**
 * Mass-cancel by owner. Owner is accountId.
 * Same owner leaves the book. Other owners stay. Session refuses.
 * Missing owner cannot apply. No invented session.
 */

const A = parseAmount;

const ASK = '11111111-1111-4111-8111-111111111111';
const ASK2 = '22222222-2222-4222-8222-222222222222';
const BID = '33333333-3333-4333-8333-333333333333';
const STOP = '44444444-4444-4444-8444-444444444444';
const KEEP = '55555555-5555-4555-8555-555555555555';

function order(spec: {
  id: string;
  account?: string;
  type?: EngineOrderType;
  side: OrderSide;
  qty: string;
  price?: string;
  stopPrice?: string;
  tif?: TimeInForce;
}): EngineOrder {
  const type = spec.type ?? (spec.price === undefined ? 'market' : 'limit');
  return {
    orderId: spec.id,
    accountId: spec.account ?? 'desk',
    type,
    side: spec.side,
    qty: A(spec.qty),
    price: spec.price === undefined ? null : A(spec.price),
    stopPrice: spec.stopPrice === undefined ? null : A(spec.stopPrice),
    tif: spec.tif ?? 'GTC',
  };
}

function liveIds(book: OrderBook): string[] {
  const state = book.toState();
  return [
    ...state.bids.flatMap((l) => l.orders.map((o) => o.orderId)),
    ...state.asks.flatMap((l) => l.orders.map((o) => o.orderId)),
    ...state.stops.map((s) => s.orderId),
  ].sort();
}

describe('mass-cancel — owner is accountId', () => {
  it('pulls every rest for that account and leaves other owners', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'desk', side: 'sell', qty: '1', price: '101' }));
    book.submit(order({ id: ASK2, account: 'desk', side: 'sell', qty: '2', price: '102' }));
    book.submit(order({ id: KEEP, account: 'mm', side: 'sell', qty: '3', price: '103' }));
    book.submit(order({ id: BID, account: 'desk', side: 'buy', qty: '1', price: '99' }));

    const pulled = book.cancelAccount('desk');

    expect(pulled.map((c) => c.orderId).sort()).toEqual([ASK, ASK2, BID].sort());
    expect(pulled.every((c) => c.reason === 'requested')).toBe(true);
    expect(pulled.every((c) => c.accountId === 'desk')).toBe(true);
    expect(liveIds(book)).toEqual([KEEP]);
    expect(book.toState().asks[0]!.orders[0]!.remaining).toBe('3');
  });

  it('pulls a stop for that account and leaves a stranger stop', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: STOP, account: 'desk', type: 'stop', side: 'buy', qty: '1', stopPrice: '110' }));
    book.submit(order({ id: KEEP, account: 'mm', type: 'stop', side: 'sell', qty: '1', stopPrice: '90' }));

    const pulled = book.cancelAccount('desk');

    expect(pulled.map((c) => c.orderId)).toEqual([STOP]);
    expect(liveIds(book)).toEqual([KEEP]);
  });

  it('unknown account is a no-op — no invented owner, book unchanged', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: KEEP, account: 'mm', side: 'sell', qty: '1', price: '100' }));
    const before = book.serialize();
    const pulled = book.cancelAccount('nobody');
    expect(pulled).toEqual([]);
    expect(book.serialize()).toBe(before);
    expect(liveIds(book)).toEqual([KEEP]);
  });

  it('empty account matches nothing — missing owner cannot apply', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: KEEP, account: 'mm', side: 'sell', qty: '1', price: '100' }));
    expect(book.cancelAccount('')).toEqual([]);
    expect(liveIds(book)).toEqual([KEEP]);
  });

  it('different owners still match after a mass-cancel', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'desk', side: 'sell', qty: '1', price: '100' }));
    book.submit(order({ id: KEEP, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    book.cancelAccount('desk');

    const take = book.submit(order({ id: BID, account: 'taker', side: 'buy', qty: '2', price: '100' }));
    expect(take.accepted).toBe(true);
    expect(take.fills).toHaveLength(1);
    expect(formatAmount(take.fills[0]!.qty)).toBe('2');
    expect(take.fills[0]!.makerAccountId).toBe('mm');
    expect(take.fills[0]!.takerAccountId).toBe('taker');
    expect(liveIds(book)).not.toContain(KEEP);
  });

  it('journal replay of a mass-cancel does not invent a rest', () => {
    const marketId = 'BTC/USDT';
    const journal = new MemoryJournal();
    const live = new OrderBook(marketId);
    const own = order({ id: ASK, account: 'desk', side: 'sell', qty: '1', price: '100' });
    const other = order({ id: KEEP, account: 'mm', side: 'sell', qty: '1', price: '101' });
    for (const o of [own, other]) {
      journal.append({ kind: 'submit', marketId, at: '2026-08-25T16:00:00.000Z', order: toWire(o) });
      live.submit(o);
    }
    journal.append({ kind: 'mass_cancel', marketId, at: '2026-08-25T16:00:01.000Z', accountId: 'desk' });
    live.cancelAccount('desk');

    const restored = replay(journal.read()).get(marketId)!;
    expect(restored.serialize()).toBe(live.serialize());
    expect(liveIds(restored)).toEqual([KEEP]);
  });

  it('engine massCancel journals once, emits each cancel, skips unknown markets', async () => {
    const journal = new MemoryJournal();
    const bus = new MemoryEventBus('svc-matching');
    const engine = new MatchingEngine({ journal, bus, snapshotEvery: 0, clock: () => new Date('2026-08-25T16:00:00.000Z') });

    await engine.submit('BTC/USDT', order({ id: ASK, account: 'desk', side: 'sell', qty: '1', price: '100' }));
    await engine.submit('BTC/USDT', order({ id: KEEP, account: 'mm', side: 'sell', qty: '1', price: '101' }));

    const ghost = await engine.massCancel('NEVER-TRADED', { accountId: 'desk' });
    expect(ghost.accepted).toBe(true);
    expect(ghost.cancellations).toEqual([]);
    expect(engine.hasMarket('NEVER-TRADED')).toBe(false);
    expect(journal.read().filter((r) => r.kind === 'mass_cancel')).toHaveLength(0);

    const result = await engine.massCancel('BTC/USDT', { accountId: 'desk' });
    expect(result.accepted).toBe(true);
    expect(result.cancellations).toHaveLength(1);
    expect(result.cancellations[0]!.orderId).toBe(ASK);
    expect(journal.read().filter((r) => r.kind === 'mass_cancel')).toHaveLength(1);
    expect(liveIds(engine.book('BTC/USDT'))).toEqual([KEEP]);
  });

  it('a session id refuses — the engine does not invent a session', async () => {
    const journal = new MemoryJournal();
    const bus = new MemoryEventBus('svc-matching');
    const engine = new MatchingEngine({ journal, bus, snapshotEvery: 0 });
    await engine.submit('BTC/USDT', order({ id: ASK, account: 'desk', side: 'sell', qty: '1', price: '100' }));
    const before = engine.serialize();

    const result = await engine.massCancel('BTC/USDT', { accountId: 'desk', sessionId: 'sess-1' });

    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(SESSION_UNSUPPORTED);
    expect(result.cancellations).toEqual([]);
    expect(engine.serialize()).toBe(before);
    expect(journal.read().map((r) => r.kind)).toEqual(['submit']);
  });

  it('ownedOrderIds is oldest sequence first; missing and false session is unset', () => {
    expect(ownedOrderIds('desk', [])).toEqual([]);
    expect(ownedOrderIds('', [{ orderId: ASK, accountId: 'desk', sequence: 1, side: 'sell' }])).toEqual([]);
    expect(
      ownedOrderIds('desk', [
        { orderId: ASK2, accountId: 'desk', sequence: 4, side: 'sell' },
        { orderId: KEEP, accountId: 'mm', sequence: 2, side: 'sell' },
        { orderId: ASK, accountId: 'desk', sequence: 1, side: 'sell' },
      ]),
    ).toEqual([ASK, ASK2]);
    expect(
      ownedOrderIds(
        'desk',
        [
          { orderId: ASK, accountId: 'desk', sequence: 1, side: 'sell' },
          { orderId: BID, accountId: 'desk', sequence: 2, side: 'buy' },
        ],
        'buy',
      ),
    ).toEqual([BID]);
    expect(
      ownedOrderIds(
        'desk',
        [
          { orderId: ASK, accountId: 'desk', sequence: 1, side: 'sell' },
          { orderId: BID, accountId: 'desk', sequence: 2, side: 'buy' },
        ],
        null,
      ),
    ).toEqual([ASK, BID]);
    expect(readSessionId({})).toBeNull();
    expect(readSessionId({ sessionId: null })).toBeNull();
    expect(readSessionId({ sessionId: '' })).toBeNull();
    expect(readSessionId({ sessionId: '  ' })).toBeNull();
    expect(readSessionId({ sessionId: 'sess-1' })).toBe('sess-1');
    expect(massCancelSessionRefuse(null)).toBeNull();
    expect(massCancelSessionRefuse('sess-1')?.code).toBe(SESSION_UNSUPPORTED);
  });

  it('buy-only pulls buys (rest + stop) and leaves sells', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'desk', side: 'sell', qty: '1', price: '101' }));
    book.submit(order({ id: BID, account: 'desk', side: 'buy', qty: '1', price: '99' }));
    book.submit(order({ id: STOP, account: 'desk', type: 'stop', side: 'buy', qty: '1', stopPrice: '110' }));
    book.submit(order({ id: KEEP, account: 'desk', type: 'stop', side: 'sell', qty: '1', stopPrice: '90' }));

    const pulled = book.cancelAccount('desk', 'buy');

    expect(pulled.map((c) => c.orderId).sort()).toEqual([BID, STOP].sort());
    expect(liveIds(book).sort()).toEqual([ASK, KEEP].sort());
  });

  it('sell-only pulls sells and leaves buys', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'desk', side: 'sell', qty: '1', price: '101' }));
    book.submit(order({ id: BID, account: 'desk', side: 'buy', qty: '1', price: '99' }));

    const pulled = book.cancelAccount('desk', 'sell');

    expect(pulled.map((c) => c.orderId)).toEqual([ASK]);
    expect(liveIds(book)).toEqual([BID]);
  });

  it('missing or null side still cancels both', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'desk', side: 'sell', qty: '1', price: '101' }));
    book.submit(order({ id: BID, account: 'desk', side: 'buy', qty: '1', price: '99' }));
    expect(
      book
        .cancelAccount('desk')
        .map((c) => c.orderId)
        .sort(),
    ).toEqual([ASK, BID].sort());

    const again = new OrderBook('BTC/USDT');
    again.submit(order({ id: ASK, account: 'desk', side: 'sell', qty: '1', price: '101' }));
    again.submit(order({ id: BID, account: 'desk', side: 'buy', qty: '1', price: '99' }));
    expect(
      again
        .cancelAccount('desk', null)
        .map((c) => c.orderId)
        .sort(),
    ).toEqual([ASK, BID].sort());
  });

  it('empty account with a side still matches nothing', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: KEEP, account: 'mm', side: 'buy', qty: '1', price: '99' }));
    expect(book.cancelAccount('', 'buy')).toEqual([]);
    expect(liveIds(book)).toEqual([KEEP]);
  });

  it('a session id with a side still refuses — no invented session', async () => {
    const journal = new MemoryJournal();
    const bus = new MemoryEventBus('svc-matching');
    const engine = new MatchingEngine({ journal, bus, snapshotEvery: 0 });
    await engine.submit('BTC/USDT', order({ id: ASK, account: 'desk', side: 'sell', qty: '1', price: '100' }));
    await engine.submit('BTC/USDT', order({ id: BID, account: 'desk', side: 'buy', qty: '1', price: '99' }));
    const before = engine.serialize();

    const result = await engine.massCancel('BTC/USDT', { accountId: 'desk', sessionId: 'sess-1', side: 'buy' });

    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(SESSION_UNSUPPORTED);
    expect(result.cancellations).toEqual([]);
    expect(engine.serialize()).toBe(before);
  });

  it('engine buy-only journals the side so replay does not wipe sells', async () => {
    const journal = new MemoryJournal();
    const bus = new MemoryEventBus('svc-matching');
    const engine = new MatchingEngine({ journal, bus, snapshotEvery: 0, clock: () => new Date('2026-08-25T16:00:00.000Z') });
    await engine.submit('BTC/USDT', order({ id: ASK, account: 'desk', side: 'sell', qty: '1', price: '101' }));
    await engine.submit('BTC/USDT', order({ id: BID, account: 'desk', side: 'buy', qty: '1', price: '99' }));

    const result = await engine.massCancel('BTC/USDT', { accountId: 'desk', side: 'buy' });
    expect(result.accepted).toBe(true);
    expect(result.cancellations.map((c) => c.orderId)).toEqual([BID]);
    expect(liveIds(engine.book('BTC/USDT'))).toEqual([ASK]);

    const record = journal.read().find((r) => r.kind === 'mass_cancel');
    expect(record).toMatchObject({ kind: 'mass_cancel', accountId: 'desk', side: 'buy' });

    const restored = replay(journal.read()).get('BTC/USDT')!;
    expect(liveIds(restored)).toEqual([ASK]);
  });
});
