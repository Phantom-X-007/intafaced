import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { MemoryEventBus } from '@intafaced/events';
import { formatAmount, MemoryLedger, parseAmount as amt, recipes, userAvailable } from '@intafaced/ledger-client';
import { TradeService } from './trade-service.js';
import { installOptionPlace } from './option-place.js';
import { READY_MARKET_LIFECYCLE, StubMatching, StubPerks, principalFor, PUBLISHED_TEST_FEE_SCHEDULE } from './testing.js';
import type { Market } from './types.js';

installOptionPlace(TradeService);

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const drizzle = join(here, '..', '..', 'drizzle');
const migrations = readdirSync(drizzle)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzle, f), 'utf8'));
const available = await postgresAvailable(URL);
const ALICE = '11111111-1111-4111-8111-111111111111';
const EXPIRY = '2026-12-25T00:00:00.000Z';

if (!available) {
  describe.skip('option assign through matching (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'trade', url: URL, migrations });
  const sql = db.sql;
  afterAll(async () => {
    await db.close();
  });

  describe('option assign through matching', () => {
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

    it('exercise assigns the short through matching — strike + expiry, mark stripped', async () => {
      await fund(ALICE, 'USDT', '2000');
      const order = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt('10'),
        clientOrderId: 'opt-assign-ex',
        strike: amt('100'),
        expiry: EXPIRY,
        exercise: true,
        mark: '50',
      } as Parameters<TradeService['placeOrder']>[1] & {
        strike: ReturnType<typeof amt>;
        expiry: string;
        exercise: true;
        mark: string;
      });
      expect(order.status).toBe('open');
      expect(matching.submitted[0]?.request.exercise).toBe(true);
      expect(matching.submitted[0]?.request.assign).toBe(true);
      expect(matching.submitted[0]?.request.strike).toBe('100');
      expect(matching.submitted[0]?.request.expiry).toBe(EXPIRY);
      expect(matching.submitted[0]?.request.mark).toBeUndefined();
    });

    it('assign with strike + expiry — accepted, forwards assign true at strike', async () => {
      await fund(ALICE, 'USDT', '2000');
      const order = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt('10'),
        clientOrderId: 'opt-assign',
        strike: amt('100'),
        expiry: EXPIRY,
        assign: true,
        mark: '50',
      } as Parameters<TradeService['placeOrder']>[1] & {
        strike: ReturnType<typeof amt>;
        expiry: string;
        assign: true;
        mark: string;
      });
      expect(order.status).toBe('open');
      expect((matching.submitted[0]?.request as { assign?: boolean }).assign).toBe(true);
      expect(matching.submitted[0]?.request.exercise).toBe(true);
      expect(matching.submitted[0]?.request.strike).toBe('100');
      expect(matching.submitted[0]?.request.expiry).toBe(EXPIRY);
      expect(matching.submitted[0]?.request.mark).toBeUndefined();
    });

    it('assign missing strike throws trade.missing_strike — no submit, no hold', async () => {
      await fund(ALICE, 'USDT', '2000');
      await expect(
        trade.placeOrder(principalFor(ALICE), {
          marketId: btcusdt.id,
          side: 'buy',
          type: 'limit',
          qty: amt('10'),
          clientOrderId: 'opt-assign-miss-strike',
          expiry: EXPIRY,
          assign: true,
          mark: '50',
        } as Parameters<TradeService['placeOrder']>[1] & { expiry: string; assign: true; mark: string }),
      ).rejects.toMatchObject({ code: 'trade.missing_strike' });
      expect(matching.submitted).toHaveLength(0);
      expect(await avail(ALICE, 'USDT')).toBe('2000');
      expect(postsWithReason('order.hold')).toHaveLength(0);
    });

    it('assign missing expiry throws trade.missing_expiry — no submit, no hold', async () => {
      await fund(ALICE, 'USDT', '2000');
      await expect(
        trade.placeOrder(principalFor(ALICE), {
          marketId: btcusdt.id,
          side: 'buy',
          type: 'limit',
          qty: amt('10'),
          clientOrderId: 'opt-assign-miss-expiry',
          strike: amt('100'),
          assign: true,
          mark: '50',
        } as Parameters<TradeService['placeOrder']>[1] & {
          strike: ReturnType<typeof amt>;
          assign: true;
          mark: string;
        }),
      ).rejects.toMatchObject({ code: 'trade.missing_expiry' });
      expect(matching.submitted).toHaveLength(0);
      expect(await avail(ALICE, 'USDT')).toBe('2000');
      expect(postsWithReason('order.hold')).toHaveLength(0);
    });

    it('plain GTC does not set assign', async () => {
      await fund(ALICE, 'USDT', '2000');
      const order = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt('1'),
        price: amt('100'),
        clientOrderId: 'gtc-no-assign',
      });
      expect(order.status).toBe('open');
      expect((matching.submitted[0]?.request as { assign?: boolean }).assign).toBeUndefined();
      expect(matching.submitted[0]?.request.exercise).toBeUndefined();
    });
  });
}
