import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { MemoryEventBus } from '@intafaced/events';
import { formatAmount, MemoryLedger, parseAmount as amt, recipes, userAvailable, orderHoldAccount } from '@intafaced/ledger-client';
import { TradeService, type PlaceOrderInput } from './trade-service.js';
import { bindMinQty, installMinQtyPlace, minQtyRefuse, readMinQty } from './min-qty-place.js';
import { READY_MARKET_LIFECYCLE, StubMatching, StubPerks, principalFor, PUBLISHED_TEST_FEE_SCHEDULE } from './testing.js';
import type { EngineSubmitRequest } from './matching-client.js';
import type { Market } from './types.js';
import type { Principal } from '@intafaced/auth';

installMinQtyPlace(TradeService);

describe('min qty place (no invented clip)', () => {
  it('missing or zero minQty is not set', () => {
    expect(readMinQty({})).toBeNull();
    expect(readMinQty({ minQty: null })).toBeNull();
    expect(readMinQty({ minQty: amt('0') })).toBeNull();
    expect(readMinQty({ minQty: amt('5') })).toBe(amt('5'));
  });

  it('minQty above qty refuses — trade does not invent a fill', () => {
    expect(minQtyRefuse(amt('10'), null)).toBeNull();
    expect(minQtyRefuse(amt('5'), amt('5'))).toBeNull();
    const refuse = minQtyRefuse(amt('2'), amt('5'));
    expect(refuse).toMatchObject({ code: 'trade.min_qty_exceeds_qty' });
  });

  it('place with minQty reaches matching as a decimal string; missing/zero stay unset', async () => {
    const submitted: EngineSubmitRequest[] = [];
    class Door {
      async placeOrder(_principal: Principal, input: PlaceOrderInput) {
        return { id: 'order', status: 'open', input };
      }
      toEngineRequest(...args: unknown[]): EngineSubmitRequest {
        const input = args[2] as PlaceOrderInput & { minQty?: ReturnType<typeof amt> | null };
        return { orderId: 'order', accountId: 'alice', type: 'limit', side: 'buy', qty: formatAmount(input.qty), tif: 'GTC' };
      }
    }
    installMinQtyPlace(Door as unknown as typeof TradeService);
    const door = new Door();
    const origPlace = Door.prototype.placeOrder;
    let placed: PlaceOrderInput | null = null;
    Door.prototype.placeOrder = async function (this: Door, principal: Principal, input: PlaceOrderInput) {
      placed = input;
      return origPlace.call(this, principal, input);
    };

    await door.placeOrder(
      {} as Principal,
      {
        side: 'buy',
        type: 'limit',
        qty: amt('10'),
        price: amt('100'),
        clientOrderId: 'mq-unit',
        minQty: amt('5'),
      } as PlaceOrderInput & { minQty: ReturnType<typeof amt> },
    );
    const forwarded = door.toEngineRequest('order', 'alice', placed);
    submitted.push(forwarded);
    expect(forwarded.minQty).toBe('5');
    expect(forwarded.qty).toBe('10');

    await expect(
      door.placeOrder(
        {} as Principal,
        {
          side: 'buy',
          type: 'limit',
          qty: amt('2'),
          price: amt('100'),
          clientOrderId: 'mq-over-unit',
          minQty: amt('5'),
        } as PlaceOrderInput & { minQty: ReturnType<typeof amt> },
      ),
    ).rejects.toMatchObject({ code: 'trade.min_qty_exceeds_qty' });

    const zeroBound = bindMinQty({
      side: 'buy',
      type: 'limit',
      qty: amt('1'),
      price: amt('100'),
      clientOrderId: 'mq-zero-unit',
      minQty: amt('0'),
    } as PlaceOrderInput & { minQty: ReturnType<typeof amt> });
    expect(door.toEngineRequest('order', 'alice', zeroBound).minQty).toBeUndefined();

    const plain = bindMinQty({
      side: 'buy',
      type: 'limit',
      qty: amt('1'),
      price: amt('100'),
      clientOrderId: 'gtc-plain-unit',
    });
    expect(door.toEngineRequest('order', 'alice', plain).minQty).toBeUndefined();
    expect(submitted).toHaveLength(1);
  });
});

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const drizzle = join(here, '..', '..', 'drizzle');
const migrations = readdirSync(drizzle)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzle, f), 'utf8'));
const available = await postgresAvailable(URL);
const ALICE = '11111111-1111-4111-8111-111111111111';

if (!available) {
  describe.skip('min-qty place (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'trade', url: URL, migrations });
  const sql = db.sql;
  afterAll(async () => {
    await db.close();
  });

  describe('min qty place through matching', () => {
    let ledger: MemoryLedger;
    let matching: StubMatching;
    let trade: TradeService;
    let btcusdt: Market;

    async function fund(userId: string, assetId: string, amount: string) {
      await ledger.post(
        recipes.deposit({
          userId,
          assetId,
          amount: amt(amount),
          rail: 'test',
          railRef: `${userId}:${assetId}:${amount}:${Math.random()}`,
        }),
      );
    }
    const avail = async (userId: string, assetId: string) => formatAmount((await ledger.balance(userAvailable(userId, assetId))).amount);
    const heldFor = async (userId: string, assetId: string, orderId: string) =>
      formatAmount((await ledger.balance(orderHoldAccount(userId, assetId, orderId))).amount);
    const postsWithReason = (reason: string) => ledger.journal().filter((tx) => tx.reason === reason);

    beforeEach(async () => {
      await sql`TRUNCATE trade.order_replace_requests, trade.fills, trade.orders, trade.markets RESTART IDENTITY CASCADE`;
      ledger = new MemoryLedger();
      matching = new StubMatching();
      trade = new TradeService(sql, ledger, matching, new StubPerks(), new MemoryEventBus('svc-trade'), {
        feeSchedule: PUBLISHED_TEST_FEE_SCHEDULE,
        marketLifecycle: READY_MARKET_LIFECYCLE,
        spotEnabled: true,
        marketSlippageCapBps: 200,
      });
      btcusdt = await trade.listMarket({
        symbol: 'BTC/USDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        tickSize: amt('0.01'),
        lotSize: amt('0.0001'),
        minQty: amt('0.0001'),
        maxQty: amt('1000'),
        minNotional: amt('1'),
        makerBps: 10,
        takerBps: 20,
      });
    });

    it('place with minQty — accepted, forwarded as a decimal string', async () => {
      await fund(ALICE, 'USDT', '2000');
      const order = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt('10'),
        price: amt('100'),
        clientOrderId: 'mq-rest',
        minQty: amt('5'),
      } as Parameters<TradeService['placeOrder']>[1] & { minQty: ReturnType<typeof amt> });
      expect(order.status).toBe('open');
      expect(matching.submitted[0]?.request.minQty).toBe('5');
      expect(matching.submitted[0]?.request.qty).toBe('10');
      expect(await heldFor(ALICE, 'USDT', order.id)).toBe('1000');
    });

    it('minQty above qty throws trade.min_qty_exceeds_qty — no submit, no hold, no invented clip', async () => {
      await fund(ALICE, 'USDT', '2000');
      await expect(
        trade.placeOrder(principalFor(ALICE), {
          marketId: btcusdt.id,
          side: 'buy',
          type: 'limit',
          qty: amt('2'),
          price: amt('100'),
          clientOrderId: 'mq-over',
          minQty: amt('5'),
        } as Parameters<TradeService['placeOrder']>[1] & { minQty: ReturnType<typeof amt> }),
      ).rejects.toMatchObject({ code: 'trade.min_qty_exceeds_qty' });
      expect(matching.submitted).toHaveLength(0);
      expect(await avail(ALICE, 'USDT')).toBe('2000');
      expect(postsWithReason('order.hold')).toHaveLength(0);
    });

    it('zero minQty is a normal place — not set on the request', async () => {
      await fund(ALICE, 'USDT', '2000');
      const order = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt('1'),
        price: amt('100'),
        clientOrderId: 'mq-zero',
        minQty: amt('0'),
      } as Parameters<TradeService['placeOrder']>[1] & { minQty: ReturnType<typeof amt> });
      expect(order.status).toBe('open');
      expect(matching.submitted[0]?.request.minQty).toBeUndefined();
    });

    it('matching scriptRejection min_qty_exceeds_qty rejects — hold released', async () => {
      await fund(ALICE, 'USDT', '2000');
      matching.scriptRejection('min_qty_exceeds_qty', 'minQty must not exceed remaining qty; the engine does not invent a fill');
      const order = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt('10'),
        price: amt('100'),
        clientOrderId: 'mq-engine',
        minQty: amt('5'),
      } as Parameters<TradeService['placeOrder']>[1] & { minQty: ReturnType<typeof amt> });
      expect(order.status).toBe('rejected');
      expect(order.rejectCode).toBe('min_qty_exceeds_qty');
      expect(await heldFor(ALICE, 'USDT', order.id)).toBe('0');
      expect(await avail(ALICE, 'USDT')).toBe('2000');
    });

    it('plain GTC does not invent minQty on the request', async () => {
      await fund(ALICE, 'USDT', '2000');
      const order = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt('1'),
        price: amt('100'),
        clientOrderId: 'gtc-plain',
      });
      expect(order.status).toBe('open');
      expect(matching.submitted[0]?.request.minQty).toBeUndefined();
    });
  });
}
