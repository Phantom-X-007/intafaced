import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { MemoryEventBus } from '@intafaced/events';
import { formatAmount, MemoryLedger, parseAmount as amt, recipes, userAvailable, orderHoldAccount } from '@intafaced/ledger-client';
import { TradeService } from './trade-service.js';
import {
  entryRefuse,
  installBracketPlace,
  stopLossRefuse,
  takeProfitRefuse,
  wantsBracket,
} from './bracket-place.js';
import { READY_MARKET_LIFECYCLE, StubMatching, StubPerks, principalFor } from './testing.js';
import type { Market } from './types.js';

installBracketPlace(TradeService);

describe('bracket place helpers', () => {
  it('gates only on bracket and refuses missing legs — no invented trigger', () => {
    expect(wantsBracket({})).toBe(false);
    expect(wantsBracket({ bracket: true })).toBe(true);
    expect(entryRefuse({ type: 'market' })).toBeNull();
    expect(entryRefuse({ type: 'limit' })?.code).toBe('trade.missing_price');
    expect(entryRefuse({ type: 'limit' })?.message).toContain('invent a trigger');
    expect(takeProfitRefuse(null)?.code).toBe('trade.missing_stop_price');
    expect(takeProfitRefuse(null)?.message).toContain('take-profit');
    expect(stopLossRefuse(null)?.code).toBe('trade.missing_stop_price');
    expect(stopLossRefuse(null)?.message).toContain('stop-loss');
    expect(takeProfitRefuse(amt('110'))).toBeNull();
    expect(stopLossRefuse(amt('90'))).toBeNull();
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
  describe.skip('bracket place (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'trade', url: URL, migrations });
  const sql = db.sql;
  afterAll(async () => {
    await db.close();
  });

  describe('linked bracket through matching', () => {
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

    it('places one linked bracket through matching — no invented trigger', async () => {
      await fund(ALICE, 'USDT', '200');
      const placed = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt('1'),
        price: amt('100'),
        clientOrderId: 'brkt-1',
        bracket: true,
        takeProfit: '110',
        stopLoss: '90',
      } as Parameters<TradeService['placeOrder']>[1]);
      expect(placed.status).toBe('open');
      expect(matching.submitted).toHaveLength(1);
      const req = matching.submitted[0]?.request as {
        bracket?: boolean;
        oco?: boolean;
        takeProfit?: string | null;
        stopLoss?: string | null;
      };
      expect(req?.bracket).toBe(true);
      expect(req?.oco).toBeUndefined();
      expect(req?.takeProfit).toBe('110');
      expect(req?.stopLoss).toBe('90');
      expect(await heldFor(ALICE, 'USDT', placed.id)).toBe('100');
      expect(await avail(ALICE, 'USDT')).toBe('100');
    });

    it('refuses a missing take-profit — no invented trigger', async () => {
      await fund(ALICE, 'USDT', '200');
      await expect(
        trade.placeOrder(principalFor(ALICE), {
          marketId: btcusdt.id,
          side: 'buy',
          type: 'limit',
          qty: amt('1'),
          price: amt('100'),
          clientOrderId: 'brkt-miss-tp',
          bracket: true,
          stopLoss: '90',
        } as Parameters<TradeService['placeOrder']>[1]),
      ).rejects.toMatchObject({ code: 'trade.missing_stop_price' });
      expect(matching.submitted).toHaveLength(0);
      expect(await avail(ALICE, 'USDT')).toBe('200');
    });

    it('refuses a missing stop-loss — no invented trigger', async () => {
      await fund(ALICE, 'USDT', '200');
      await expect(
        trade.placeOrder(principalFor(ALICE), {
          marketId: btcusdt.id,
          side: 'buy',
          type: 'limit',
          qty: amt('1'),
          price: amt('100'),
          clientOrderId: 'brkt-miss-sl',
          bracket: true,
          takeProfit: '110',
        } as Parameters<TradeService['placeOrder']>[1]),
      ).rejects.toMatchObject({ code: 'trade.missing_stop_price' });
      expect(matching.submitted).toHaveLength(0);
    });

    it('refuses a missing entry — last is not a trigger', async () => {
      await fund(ALICE, 'USDT', '200');
      await expect(
        trade.placeOrder(principalFor(ALICE), {
          marketId: btcusdt.id,
          side: 'buy',
          type: 'limit',
          qty: amt('1'),
          clientOrderId: 'brkt-miss-entry',
          bracket: true,
          takeProfit: '110',
          stopLoss: '90',
        } as Parameters<TradeService['placeOrder']>[1]),
      ).rejects.toMatchObject({ code: 'trade.missing_price' });
      expect(matching.submitted).toHaveLength(0);
    });

    it('plain GTC never sets a bracket', async () => {
      await fund(ALICE, 'USDT', '500');
      const order = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt('1'),
        price: amt('100'),
        clientOrderId: 'gtc-plain-brkt',
      });
      expect(order.status).toBe('open');
      expect(matching.submitted).toHaveLength(1);
      const req = matching.submitted[0]?.request as {
        bracket?: boolean;
        takeProfit?: string | null;
        stopLoss?: string | null;
      };
      expect(req?.bracket).toBeUndefined();
      expect(req?.takeProfit).toBeUndefined();
      expect(req?.stopLoss).toBeUndefined();
    });
  });
}
