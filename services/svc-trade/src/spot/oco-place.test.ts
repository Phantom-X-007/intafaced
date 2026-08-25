import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { MemoryEventBus } from '@intafaced/events';
import {
  formatAmount,
  MemoryLedger,
  parseAmount as amt,
  recipes,
  userAvailable,
  orderHoldAccount,
} from '@intafaced/ledger-client';
import { TradeService } from './trade-service.js';
import { installOcoPlace } from './oco-place.js';
import { orderIdFor } from './ids.js';
import { READY_MARKET_LIFECYCLE, StubMatching, StubPerks, principalFor } from './testing.js';
import type { Market } from './types.js';

installOcoPlace(TradeService);

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
  describe.skip('OCO place (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'trade', url: URL, migrations });
  const sql = db.sql;
  afterAll(async () => {
    await db.close();
  });

  describe('linked TP+SL (OCO) through matching', () => {
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
    const avail = async (userId: string, assetId: string) =>
      formatAmount((await ledger.balance(userAvailable(userId, assetId))).amount);
    const heldFor = async (userId: string, assetId: string, orderId: string) =>
      formatAmount((await ledger.balance(orderHoldAccount(userId, assetId, orderId))).amount);

    beforeEach(async () => {
      await sql`TRUNCATE trade.order_replace_requests, trade.fills, trade.orders, trade.markets RESTART IDENTITY CASCADE`;
      ledger = new MemoryLedger();
      matching = new StubMatching();
      trade = new TradeService(sql, ledger, matching, new StubPerks(), new MemoryEventBus('svc-trade'), {
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

    it('rests both legs as one user move — no invented trigger', async () => {
      await fund(ALICE, 'BTC', '2');
      const slId = orderIdFor(ALICE, btcusdt.id, 'oco-1:sl');
      const placed = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'sell',
        type: 'limit',
        qty: amt('1'),
        price: amt('110'),
        clientOrderId: 'oco-1',
        takeProfit: { price: '110', stopPrice: '110' },
        stopLoss: { stopPrice: '90' },
      } as Parameters<TradeService['placeOrder']>[1]);
      expect(placed.status).toBe('open');
      expect(matching.submitted).toHaveLength(2);
      const tp = matching.submitted[0]?.request;
      const sl = matching.submitted[1]?.request;
      expect(tp?.type).toBe('stop_limit');
      expect(tp?.stopPrice).toBe('110');
      expect(tp?.ocoSiblingId).toBe(slId);
      expect(sl?.type).toBe('stop');
      expect(sl?.stopPrice).toBe('90');
      expect(sl?.ocoSiblingId).toBe(placed.id);
      expect(tp?.stopPrice).not.toBeNull();
      expect(sl?.stopPrice).not.toBeNull();
      expect(await heldFor(ALICE, 'BTC', placed.id)).toBe('1');
      expect(await heldFor(ALICE, 'BTC', slId)).toBe('1');
      expect(await avail(ALICE, 'BTC')).toBe('0');
    });

    it('refuses a missing trigger — no invented stopPrice', async () => {
      await fund(ALICE, 'BTC', '2');
      await expect(
        trade.placeOrder(principalFor(ALICE), {
          marketId: btcusdt.id,
          side: 'sell',
          type: 'limit',
          qty: amt('1'),
          price: amt('110'),
          clientOrderId: 'oco-blank',
          takeProfit: { price: '110', stopPrice: '110' },
          stopLoss: { stopPrice: '' },
        } as Parameters<TradeService['placeOrder']>[1]),
      ).rejects.toMatchObject({ code: 'trade.missing_oco_trigger' });
      expect(matching.submitted).toHaveLength(0);
    });

    it('GTC never grows an ocoSiblingId', async () => {
      await fund(ALICE, 'USDT', '500');
      const order = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt('1'),
        price: amt('100'),
        clientOrderId: 'gtc-plain',
      });
      expect(order.status).toBe('open');
      expect(matching.submitted).toHaveLength(1);
      expect(matching.submitted[0]?.request.ocoSiblingId).toBeUndefined();
      expect(matching.submitted[0]?.request.stopPrice).toBeNull();
    });
  });
}
