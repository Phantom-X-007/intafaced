import { describe, expect, it } from 'vitest';
import { MemoryEventBus } from '@intafaced/events';
import { ZERO, formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import { flattenCloseOrder, netPositionOf } from './close-position.js';
import { MatchingEngine } from './engine.js';
import { MemoryJournal } from './journal.js';
import type { EngineOrder, EngineOrderType, OrderSide, TimeInForce } from './types.js';

/**
 * Flatten the net position on that book. Refuse if flat.
 * No invented mark — position is net fills. Fills come from the live book.
 */

const A = parseAmount;

const OPEN = '11111111-1111-4111-8111-111111111111';
const LIQ = '22222222-2222-4222-8222-222222222222';
const EXIT = '33333333-3333-4333-8333-333333333333';
const CLOSE = '55555555-5555-4555-8555-555555555555';
const AGAIN = '66666666-6666-4666-8666-666666666666';
const SHORT_OPEN = '77777777-7777-4777-8777-777777777777';

function order(spec: {
  id: string;
  account?: string;
  type?: EngineOrderType;
  side: OrderSide;
  qty: string;
  price?: string;
  tif?: TimeInForce;
  reduceOnly?: boolean;
}): EngineOrder {
  const type = spec.type ?? (spec.price === undefined ? 'market' : 'limit');
  return {
    orderId: spec.id,
    accountId: spec.account ?? 'desk',
    type,
    side: spec.side,
    qty: A(spec.qty),
    price: spec.price === undefined ? null : A(spec.price),
    stopPrice: null,
    tif: spec.tif ?? 'GTC',
    ...(spec.reduceOnly ? { reduceOnly: true } : {}),
  };
}

/** Desk buys 2 from mm at 100 — desk is long 2. Position is fills, not a mark. */
function openLong(book: OrderBook): void {
  book.submit(order({ id: LIQ, account: 'mm', side: 'sell', qty: '2', price: '100' }));
  const fill = book.submit(order({ id: OPEN, side: 'buy', qty: '2', price: '100' }));
  expect(fill.accepted).toBe(true);
  expect(fill.fills).toHaveLength(1);
  expect(netPositionOf(book, 'desk')).toBe(A('2'));
  expect(book.toState().positions).toEqual([
    { accountId: 'desk', qty: '2' },
    { accountId: 'mm', qty: '-2' },
  ]);
}

function build(overrides: Partial<ConstructorParameters<typeof MatchingEngine>[0]> = {}) {
  const journal = new MemoryJournal();
  const bus = new MemoryEventBus('svc-matching');
  const engine = new MatchingEngine({ journal, bus, snapshotEvery: 0, ...overrides });
  return { journal, bus, engine };
}

describe('close-position — flatten the net, refuse if flat', () => {
  it('long 2 vs resting ask — close sells 2 at the book price, desk goes flat', async () => {
    const { engine } = build();
    await engine.submit('BTC/USDT', order({ id: LIQ, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    await engine.submit('BTC/USDT', order({ id: OPEN, side: 'buy', qty: '2', price: '100' }));
    await engine.submit('BTC/USDT', order({ id: EXIT, account: 'liq', side: 'buy', qty: '2', price: '100' }));

    const result = await engine.closePosition('BTC/USDT', { orderId: CLOSE, accountId: 'desk' });

    expect(result.accepted).toBe(true);
    expect(result.fills).toHaveLength(1);
    expect(formatAmount(result.fills[0]!.qty)).toBe('2');
    expect(formatAmount(result.fills[0]!.price)).toBe('100');
    expect(result.fills[0]!.takerSide).toBe('sell');
    const book = engine.existingBook('BTC/USDT')!;
    expect(netPositionOf(book, 'desk')).toBe(ZERO);
    expect(book.toState().positions?.find((p) => p.accountId === 'desk')).toBeUndefined();
  });

  it('short — close buys the abs net against a resting ask', async () => {
    const { engine } = build();
    await engine.submit('BTC/USDT', order({ id: LIQ, account: 'mm', side: 'buy', qty: '2', price: '100' }));
    await engine.submit('BTC/USDT', order({ id: SHORT_OPEN, side: 'sell', qty: '2', price: '100' }));
    await engine.submit('BTC/USDT', order({ id: EXIT, account: 'liq', side: 'sell', qty: '2', price: '100' }));

    expect(netPositionOf(engine.existingBook('BTC/USDT')!, 'desk')).toBe(A('-2'));

    const result = await engine.closePosition('BTC/USDT', { orderId: CLOSE, accountId: 'desk' });

    expect(result.accepted).toBe(true);
    expect(result.fills).toHaveLength(1);
    expect(formatAmount(result.fills[0]!.qty)).toBe('2');
    expect(formatAmount(result.fills[0]!.price)).toBe('100');
    expect(result.fills[0]!.takerSide).toBe('buy');
    expect(netPositionOf(engine.existingBook('BTC/USDT')!, 'desk')).toBe(ZERO);
  });

  it('flat account on a never-traded market — position_flat, no book, sequence 0', async () => {
    const { journal, engine } = build();
    const result = await engine.closePosition('NEVER-TRADED', { orderId: CLOSE, accountId: 'desk' });

    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe('position_flat');
    expect(result.sequence).toBeNull();
    expect(engine.hasMarket('NEVER-TRADED')).toBe(false);
    expect(engine.markets).toEqual([]);
    expect(journal.length).toBe(0);
  });

  it('flat account on a live book — position_flat, nothing journalled', async () => {
    const { journal, engine } = build();
    await engine.submit('BTC/USDT', order({ id: LIQ, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    const before = journal.length;

    const result = await engine.closePosition('BTC/USDT', { orderId: CLOSE, accountId: 'stranger' });

    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe('position_flat');
    expect(result.sequence).toBeNull();
    expect(journal.length).toBe(before);
    expect(engine.existingBook('BTC/USDT')!.currentSequence).toBeGreaterThan(0);
  });

  it('second close after flatten refuses position_flat', async () => {
    const { journal, engine } = build();
    await engine.submit('BTC/USDT', order({ id: LIQ, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    await engine.submit('BTC/USDT', order({ id: OPEN, side: 'buy', qty: '2', price: '100' }));
    await engine.submit('BTC/USDT', order({ id: EXIT, account: 'liq', side: 'buy', qty: '2', price: '100' }));
    const first = await engine.closePosition('BTC/USDT', { orderId: CLOSE, accountId: 'desk' });
    expect(first.accepted).toBe(true);
    const after = journal.length;

    const second = await engine.closePosition('BTC/USDT', { orderId: AGAIN, accountId: 'desk' });

    expect(second.accepted).toBe(false);
    expect(second.rejected?.code).toBe('position_flat');
    expect(journal.length).toBe(after);
  });

  it('disabled engine refuses like submit — nothing journalled', async () => {
    const { journal, engine } = build({ enabled: false });
    const result = await engine.closePosition('BTC/USDT', { orderId: CLOSE, accountId: 'desk' });

    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe('engine_disabled');
    expect(journal.length).toBe(0);
    expect(engine.hasMarket('BTC/USDT')).toBe(false);
  });

  it('journal replay of a close after an open long matches live serialize()', async () => {
    const { journal, engine } = build();
    await engine.submit('BTC/USDT', order({ id: LIQ, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    await engine.submit('BTC/USDT', order({ id: OPEN, side: 'buy', qty: '2', price: '100' }));
    await engine.submit('BTC/USDT', order({ id: EXIT, account: 'liq', side: 'buy', qty: '2', price: '100' }));
    const closed = await engine.closePosition('BTC/USDT', { orderId: CLOSE, accountId: 'desk' });
    expect(closed.accepted).toBe(true);

    const live = engine.serialize();
    const recovered = new MatchingEngine({
      journal,
      bus: new MemoryEventBus('svc-matching'),
      snapshotEvery: 0,
    });
    recovered.recover();
    expect(recovered.serialize()).toBe(live);
    expect(netPositionOf(recovered.existingBook('BTC/USDT')!, 'desk')).toBe(ZERO);
  });

  it('flatten chooses side and qty from the signed net — no mark', () => {
    const book = new OrderBook('BTC/USDT');
    openLong(book);
    const net = netPositionOf(book, 'desk');
    const flatten = flattenCloseOrder({ orderId: CLOSE, accountId: 'desk' }, net);

    expect(flatten.type).toBe('market');
    expect(flatten.side).toBe('sell');
    expect(flatten.qty).toBe(A('2'));
    expect(flatten.price).toBeNull();
    expect(flatten.stopPrice).toBeNull();
    expect(flatten.tif).toBe('IOC');
    expect(flatten.reduceOnly).toBe(true);
  });
});
