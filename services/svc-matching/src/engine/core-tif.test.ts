import { describe, expect, it } from 'vitest';
import { ZERO, parseAmount } from '@intafaced/ledger-client/money';
import { MemoryEventBus } from '@intafaced/events';
import { MatchingEngine } from './engine.js';
import { MemoryJournal } from './journal.js';
import { flattenCloseOrder, netPositionOf } from './close-position.js';
import type { EngineOrder, OrderSide, TimeInForce } from './types.js';
import { CLIENT_ORDER_ID_REUSE, TIF_MISSING, installCoreTif } from './core-tif.js';

installCoreTif();

/**
 * CARD D-core-tif hitch. Missing TIF refuses tif_missing — never a GTC map.
 * GTD/GTT pass through the engine. Client-id uniqueness is account/environment domain.
 * Close-position stays IOC flatten.
 */

const MARKET = 'BTC/USDT';
const REST = '11111111-1111-4111-8111-111111111111';
const BLANK = '22222222-2222-4222-8222-222222222222';
const EMPTY = '33333333-3333-4333-8333-333333333333';
const GTD = '44444444-4444-4444-8444-444444444444';
const GTT = '55555555-5555-4555-8555-555555555555';
const CLID_FIRST = '66666666-6666-4666-8666-666666666666';
const CLID_AGAIN = '77777777-7777-4777-8777-777777777777';
const CLID_OTHER = '88888888-8888-4888-8888-888888888888';
const CLID_NONE = '99999999-9999-4999-8999-999999999999';
const LIQ = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OPEN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EXIT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CLOSE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const UNKNOWN = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const EXPIRE = '2026-08-25T12:00:00.000Z';
const BEFORE = new Date('2026-08-25T11:00:00.000Z');

function order(spec: {
  id: string;
  account?: string;
  side: OrderSide;
  qty: string;
  price?: string;
  tif?: TimeInForce;
  expireAt?: string;
  clientOrderId?: string | null;
  environment?: string | null;
  type?: EngineOrder['type'];
}): EngineOrder {
  const type = spec.type ?? (spec.price === undefined ? 'market' : 'limit');
  return {
    orderId: spec.id,
    accountId: spec.account ?? 'desk',
    type,
    side: spec.side,
    qty: parseAmount(spec.qty),
    price: spec.price === undefined ? null : parseAmount(spec.price),
    stopPrice: null,
    tif: spec.tif ?? 'GTC',
    ...(spec.expireAt ? { expireAt: spec.expireAt } : {}),
    ...(spec.clientOrderId !== undefined ? { clientOrderId: spec.clientOrderId } : {}),
    ...(spec.environment !== undefined ? { environment: spec.environment } : {}),
  };
}

function withoutTif(spec: Parameters<typeof order>[0]): EngineOrder {
  return { ...order({ ...spec, tif: 'GTC' }), tif: undefined as unknown as TimeInForce };
}

function withTif(spec: Parameters<typeof order>[0], tif: string): EngineOrder {
  return { ...order(spec), tif: tif as TimeInForce };
}

function build(clock?: () => Date) {
  const journal = new MemoryJournal();
  const bus = new MemoryEventBus('svc-matching');
  const engine = new MatchingEngine({
    journal,
    bus,
    snapshotEvery: 0,
    ...(clock ? { clock } : {}),
  });
  return { journal, bus, engine };
}

function liveIds(engine: MatchingEngine): string[] {
  return engine.restingOrders(MARKET).map((row) => row.orderId);
}

describe('core TIF — hitch missing TIF, not a GTC map', () => {
  it('omitted tif refuses tif_missing; nothing rests; not GTC', async () => {
    const { journal, engine } = build();
    const result = await engine.submit(MARKET, withoutTif({ id: BLANK, side: 'buy', qty: '1', price: '100' }));

    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(TIF_MISSING);
    expect(result.rejected?.code).not.toBe('invalid_tif');
    expect(result.sequence).toBeNull();
    expect(result.resting).toBeNull();
    expect(result.fills).toHaveLength(0);
    expect(liveIds(engine)).toEqual([]);
    expect(journal.length).toBe(0);
    expect(engine.hasMarket(MARKET)).toBe(false);
  });

  it('empty/blank tif refuses tif_missing; unknown TIF is not mapped to GTC', async () => {
    const { journal, engine } = build();
    const empty = await engine.submit(MARKET, withTif({ id: EMPTY, side: 'buy', qty: '1', price: '100' }, ''));
    const blank = await engine.submit(MARKET, withTif({ id: BLANK, side: 'sell', qty: '1', price: '101' }, '   '));
    const unknown = await engine.submit(MARKET, withTif({ id: UNKNOWN, side: 'buy', qty: '1', price: '99' }, 'DAY'));

    expect(empty.rejected?.code).toBe(TIF_MISSING);
    expect(blank.rejected?.code).toBe(TIF_MISSING);
    expect(unknown.rejected?.code).toBe(TIF_MISSING);
    expect(empty.sequence).toBeNull();
    expect(blank.resting).toBeNull();
    expect(unknown.resting).toBeNull();
    expect(liveIds(engine)).toEqual([]);
    expect(journal.length).toBe(0);
  });

  it('present tif GTC still rests (control)', async () => {
    const { engine } = build();
    const result = await engine.submit(MARKET, order({ id: REST, side: 'sell', qty: '1', price: '100', tif: 'GTC' }));

    expect(result.accepted).toBe(true);
    expect(result.rejected).toBeUndefined();
    expect(result.resting?.orderId).toBe(REST);
    expect(liveIds(engine)).toEqual([REST]);
  });

  it('present GTC/IOC/FOK/PO/GTD/GTT with required fields are not tif_missing', async () => {
    const { engine } = build(() => BEFORE);
    const gtc = await engine.submit(MARKET, order({ id: REST, side: 'sell', qty: '1', price: '100', tif: 'GTC' }));
    const ioc = await engine.submit(
      MARKET,
      order({ id: EMPTY, account: 'ioc', side: 'buy', qty: '1', price: '99', tif: 'IOC' }),
    );
    const fok = await engine.submit(
      MARKET,
      order({ id: BLANK, account: 'fok', side: 'buy', qty: '1', price: '99', tif: 'FOK' }),
    );
    const po = await engine.submit(
      MARKET,
      order({ id: UNKNOWN, account: 'po', side: 'buy', qty: '1', price: '99', tif: 'PO' }),
    );
    const gtd = await engine.submit(
      MARKET,
      order({ id: GTD, account: 'gtd', side: 'buy', qty: '1', price: '98', tif: 'GTD', expireAt: EXPIRE }),
    );
    const gtt = await engine.submit(
      MARKET,
      order({ id: GTT, account: 'gtt', side: 'buy', qty: '1', price: '97', tif: 'GTT', expireAt: EXPIRE }),
    );

    expect([gtc, ioc, fok, po, gtd, gtt].map((row) => row.rejected?.code)).not.toContain(TIF_MISSING);
    expect(gtc.accepted).toBe(true);
    expect(gtd.accepted).toBe(true);
    expect(gtt.accepted).toBe(true);
    expect(gtd.resting?.orderId).toBe(GTD);
    expect(gtt.resting?.orderId).toBe(GTT);
  });

  it('engine.submit GTD with expireAt + clock rests; GTT missing expireAt refuses missing_expire_at', async () => {
    const { engine } = build(() => BEFORE);
    const gtd = await engine.submit(
      MARKET,
      order({ id: GTD, side: 'buy', qty: '1', price: '100', tif: 'GTD', expireAt: EXPIRE }),
    );
    const gtt = await engine.submit(MARKET, order({ id: GTT, side: 'sell', qty: '1', price: '101', tif: 'GTT' }));

    expect(gtd.accepted).toBe(true);
    expect(gtd.resting?.orderId).toBe(GTD);
    expect(gtd.rejected?.code).not.toBe(TIF_MISSING);
    expect(gtt.accepted).toBe(false);
    expect(gtt.rejected?.code).toBe('missing_expire_at');
    expect(gtt.rejected?.code).not.toBe(TIF_MISSING);
    expect(gtt.resting).toBeNull();
    expect(gtt.sequence).toBeNull();
    expect(liveIds(engine)).toEqual([GTD]);
  });

  it('clientOrderId reuse on same account after cancel refuses; different account may reuse', async () => {
    const { engine } = build();
    const first = await engine.submit(
      MARKET,
      order({ id: CLID_FIRST, side: 'sell', qty: '1', price: '100', clientOrderId: 'desk-1' }),
    );
    expect(first.accepted).toBe(true);
    const cancelled = await engine.cancel(MARKET, CLID_FIRST);
    expect(cancelled.cancelled).toBe(true);
    expect(liveIds(engine)).toEqual([]);

    const reuse = await engine.submit(
      MARKET,
      order({ id: CLID_AGAIN, side: 'sell', qty: '1', price: '100', clientOrderId: 'desk-1' }),
    );
    expect(reuse.accepted).toBe(false);
    expect(reuse.rejected?.code).toBe(CLIENT_ORDER_ID_REUSE);
    expect(reuse.sequence).toBeNull();
    expect(reuse.resting).toBeNull();
    expect(liveIds(engine)).toEqual([]);

    const other = await engine.submit(
      MARKET,
      order({ id: CLID_OTHER, account: 'mm', side: 'sell', qty: '1', price: '101', clientOrderId: 'desk-1' }),
    );
    expect(other.accepted).toBe(true);
    expect(other.resting?.orderId).toBe(CLID_OTHER);
    expect(liveIds(engine)).toEqual([CLID_OTHER]);
  });

  it('missing clientOrderId still accepts', async () => {
    const { engine } = build();
    const result = await engine.submit(MARKET, order({ id: CLID_NONE, side: 'buy', qty: '1', price: '100' }));

    expect(result.accepted).toBe(true);
    expect(result.rejected).toBeUndefined();
    expect(result.resting?.orderId).toBe(CLID_NONE);
    expect(liveIds(engine)).toEqual([CLID_NONE]);
  });

  it('closePosition flatten still works (IOC, not a GTC map)', async () => {
    const { engine } = build();
    await engine.submit(MARKET, order({ id: LIQ, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    await engine.submit(MARKET, order({ id: OPEN, side: 'buy', qty: '2', price: '100' }));
    await engine.submit(MARKET, order({ id: EXIT, account: 'liq', side: 'buy', qty: '2', price: '100' }));

    const book = engine.existingBook(MARKET)!;
    const net = netPositionOf(book, 'desk');
    const flatten = flattenCloseOrder({ orderId: CLOSE, accountId: 'desk' }, net);
    expect(flatten.tif).toBe('IOC');
    expect(flatten.tif).not.toBe('GTC');

    const result = await engine.closePosition(MARKET, { orderId: CLOSE, accountId: 'desk' });
    expect(result.accepted).toBe(true);
    expect(result.fills).toHaveLength(1);
    expect(result.rejected?.code).not.toBe(TIF_MISSING);
    expect(netPositionOf(engine.existingBook(MARKET)!, 'desk')).toBe(ZERO);
  });
});
