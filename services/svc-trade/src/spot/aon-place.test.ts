import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { MemoryEventBus } from '@intafaced/events';
import { formatAmount, MemoryLedger, parseAmount as amt, recipes, userAvailable, orderHoldAccount } from '@intafaced/ledger-client';
import { TradeService, type PlaceOrderInput } from './trade-service.js';
import { aonIcebergRefuse, bindAon, installAonPlace, readAon } from './aon-place.js';
import { installIcebergPlace } from './iceberg-place.js';
import { READY_MARKET_LIFECYCLE, StubMatching, StubPerks, principalFor, PUBLISHED_TEST_FEE_SCHEDULE } from './testing.js';
import type { EngineSubmitRequest } from './matching-client.js';
import type { Market } from './types.js';
import type { Principal } from '@intafaced/auth';

installAonPlace(TradeService);
installIcebergPlace(TradeService);

describe('AON place (no invented fill)', () => {
  it('missing or false aon is not set', () => {
    expect(readAon({})).toBe(false);
    expect(readAon({ aon: null })).toBe(false);
    expect(readAon({ aon: false })).toBe(false);
    expect(readAon({ aon: true })).toBe(true);
  });

  it('iceberg plus AON refuses — matching already refuses aon_iceberg', () => {
    expect(aonIcebergRefuse(false, true)).toBeNull();
    expect(aonIcebergRefuse(true, false)).toBeNull();
    const refuse = aonIcebergRefuse(true, true);
    expect(refuse).toMatchObject({ code: 'trade.aon_iceberg' });
  });

  it('place with aon:true reaches matching; missing/false stay unset', async () => {
    class Door {
      async placeOrder(_principal: Principal, input: PlaceOrderInput) {
        return { id: 'order', status: 'open', input };
      }
      toEngineRequest(...args: unknown[]): EngineSubmitRequest {
        const input = args[2] as PlaceOrderInput & { aon?: boolean | null };
        return { orderId: 'order', accountId: 'alice', type: 'limit', side: 'buy', qty: formatAmount(input.qty), tif: 'GTC' };
      }
    }
    installAonPlace(Door as unknown as typeof TradeService);
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
        clientOrderId: 'aon-unit',
        aon: true,
      } as PlaceOrderInput & { aon: boolean },
    );
    const forwarded = door.toEngineRequest('order', 'alice', placed);
    expect(forwarded.aon).toBe(true);
    expect(forwarded.qty).toBe('10');

    await expect(
      door.placeOrder(
        {} as Principal,
        {
          side: 'buy',
          type: 'limit',
          qty: amt('10'),
          price: amt('100'),
          clientOrderId: 'aon-ice-unit',
          aon: true,
          iceberg: true,
          displayQty: amt('2'),
        } as PlaceOrderInput & { aon: boolean; iceberg: boolean; displayQty: ReturnType<typeof amt> },
      ),
    ).rejects.toMatchObject({ code: 'trade.aon_iceberg' });

    const falseBound = bindAon({
      side: 'buy',
      type: 'limit',
      qty: amt('1'),
      price: amt('100'),
      clientOrderId: 'aon-false-unit',
      aon: false,
    } as PlaceOrderInput & { aon: boolean });
    expect(door.toEngineRequest('order', 'alice', falseBound).aon).toBeUndefined();

    const plain = bindAon({
      side: 'buy',
      type: 'limit',
      qty: amt('1'),
      price: amt('100'),
      clientOrderId: 'gtc-plain-unit',
    });
    expect(door.toEngineRequest('order', 'alice', plain).aon).toBeUndefined();
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
  describe.skip('AON place (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'trade', url: URL, migrations });
  const sql = db.sql;
  afterAll(async () => {
    await db.close();
  });

  describe('AON place through matching', () => {
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

    it('place with aon:true — accepted, forwarded as true', async () => {
      await fund(ALICE, 'USDT', '2000');
      const order = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt('10'),
        price: amt('100'),
        clientOrderId: 'aon-rest',
        aon: true,
      } as Parameters<TradeService['placeOrder']>[1] & { aon: boolean });
      expect(order.status).toBe('open');
      expect(matching.submitted[0]?.request.aon).toBe(true);
      expect(matching.submitted[0]?.request.qty).toBe('10');
      expect(await heldFor(ALICE, 'USDT', order.id)).toBe('1000');
    });

    it('iceberg plus AON throws trade.aon_iceberg — no submit, no hold, no swallowed combo', async () => {
      await fund(ALICE, 'USDT', '2000');
      await expect(
        trade.placeOrder(principalFor(ALICE), {
          marketId: btcusdt.id,
          side: 'buy',
          type: 'limit',
          qty: amt('10'),
          price: amt('100'),
          clientOrderId: 'aon-ice',
          aon: true,
          iceberg: true,
          displayQty: amt('2'),
        } as Parameters<TradeService['placeOrder']>[1] & { aon: boolean; iceberg: boolean; displayQty: ReturnType<typeof amt> }),
      ).rejects.toMatchObject({ code: 'trade.aon_iceberg' });
      expect(matching.submitted).toHaveLength(0);
      expect(await avail(ALICE, 'USDT')).toBe('2000');
      expect(postsWithReason('order.hold')).toHaveLength(0);
    });

    it('aon:false is a normal place — not set on the request', async () => {
      await fund(ALICE, 'USDT', '2000');
      const order = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt('1'),
        price: amt('100'),
        clientOrderId: 'aon-false',
        aon: false,
      } as Parameters<TradeService['placeOrder']>[1] & { aon: boolean });
      expect(order.status).toBe('open');
      expect(matching.submitted[0]?.request.aon).toBeUndefined();
    });

    it('matching scriptRejection aon_iceberg rejects — hold released', async () => {
      await fund(ALICE, 'USDT', '2000');
      matching.scriptRejection('aon_iceberg', 'all-or-none cannot hide a stub behind a display; the engine does not invent a fill');
      const order = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt('10'),
        price: amt('100'),
        clientOrderId: 'aon-engine',
        aon: true,
      } as Parameters<TradeService['placeOrder']>[1] & { aon: boolean });
      expect(order.status).toBe('rejected');
      expect(order.rejectCode).toBe('aon_iceberg');
      expect(await heldFor(ALICE, 'USDT', order.id)).toBe('0');
      expect(await avail(ALICE, 'USDT')).toBe('2000');
    });

    it('plain GTC does not invent aon on the request', async () => {
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
      expect(matching.submitted[0]?.request.aon).toBeUndefined();
    });
  });
}
