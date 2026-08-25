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
import { installGtdGttPlace } from './gtd-gtt-place.js';
import { READY_MARKET_LIFECYCLE, StubMatching, StubPerks, principalFor } from './testing.js';
import type { Market } from './types.js';

installGtdGttPlace(TradeService);

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const drizzle = join(here, '..', '..', 'drizzle');
const migrations = readdirSync(drizzle)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzle, f), 'utf8'));
const available = await postgresAvailable(URL);
const ALICE = '11111111-1111-4111-8111-111111111111';
const EXPIRE = '2026-08-25T18:00:00.000Z';

if (!available) {
  describe.skip('GTD/GTT place (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'trade', url: URL, migrations });
  const sql = db.sql;
  afterAll(async () => {
    await db.close();
  });

  describe('GTD/GTT place through the matching clock', () => {
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
    const postsWithReason = (reason: string) => ledger.journal().filter((tx) => tx.reason === reason);

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

    it('rests a GTD and forwards expireAt to matching — no invented expiry', async () => {
      await fund(ALICE, 'USDT', '500');
      const order = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt('1'),
        price: amt('100'),
        tif: 'GTD',
        expireAt: EXPIRE,
        clientOrderId: 'gtd-rest',
      } as Parameters<TradeService['placeOrder']>[1] & { expireAt: string });
      expect(order.status).toBe('open');
      expect(matching.submitted).toHaveLength(1);
      expect(matching.submitted[0]?.request.tif).toBe('GTD');
      expect(matching.submitted[0]?.request.expireAt).toBe(EXPIRE);
      expect(await heldFor(ALICE, 'USDT', order.id)).toBe('100');
      expect(await avail(ALICE, 'USDT')).toBe('400');
    });

    it('refuses GTT when expireAt is missing — no hold, no invented EOD', async () => {
      await fund(ALICE, 'USDT', '500');
      await expect(
        trade.placeOrder(principalFor(ALICE), {
          marketId: btcusdt.id,
          side: 'buy',
          type: 'limit',
          qty: amt('1'),
          price: amt('100'),
          tif: 'GTT',
          clientOrderId: 'gtt-no-expire',
        }),
      ).rejects.toMatchObject({ code: 'trade.missing_expire_at' });
      expect(matching.submitted).toHaveLength(0);
      expect(await avail(ALICE, 'USDT')).toBe('500');
      expect(postsWithReason('order.hold')).toHaveLength(0);
    });

    it('refuses when matching has no engine clock and releases the hold', async () => {
      await fund(ALICE, 'USDT', '500');
      matching.script1((request) => ({
        accepted: false,
        sequence: null,
        fills: [],
        resting: null,
        rejected: { code: 'engine_clock_missing', message: 'GTD/GTT expires on the engine clock' },
        cancellations: [],
        triggered: [],
      }));
      const order = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt('1'),
        price: amt('100'),
        tif: 'GTD',
        expireAt: EXPIRE,
        clientOrderId: 'gtd-no-clock',
      } as Parameters<TradeService['placeOrder']>[1] & { expireAt: string });
      expect(order.status).toBe('rejected');
      expect(order.rejectCode).toBe('engine_clock_missing');
      expect(await heldFor(ALICE, 'USDT', order.id)).toBe('0');
      expect(await avail(ALICE, 'USDT')).toBe('500');
      expect(postsWithReason('order.hold.released')).toHaveLength(1);
    });

    it('releases the hold through ledger-client when matching reports expired', async () => {
      await fund(ALICE, 'USDT', '500');
      const resting = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt('1'),
        price: amt('100'),
        tif: 'GTD',
        expireAt: EXPIRE,
        clientOrderId: 'gtd-then-expire',
      } as Parameters<TradeService['placeOrder']>[1] & { expireAt: string });
      expect(resting.status).toBe('open');
      expect(await heldFor(ALICE, 'USDT', resting.id)).toBe('100');

      matching.script1((request, next) => {
        const sequence = next();
        return {
          accepted: true,
          sequence,
          fills: [],
          resting: {
            kind: 'book' as const,
            orderId: request.orderId,
            accountId: request.accountId,
            side: request.side,
            price: request.price ?? '0',
            remaining: request.qty,
            sequence,
            version: 1,
          },
          rejected: null,
          cancellations: [
            {
              orderId: resting.id,
              accountId: ALICE,
              remainingQty: '1',
              sequence: next(),
              reason: 'expired',
            },
          ],
          triggered: [],
        };
      });

      await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt('1'),
        price: amt('99'),
        clientOrderId: 'later-clock',
      });

      const expired = await trade.getOrder(principalFor(ALICE), resting.id);
      expect(expired.status).toBe('expired');
      expect(await heldFor(ALICE, 'USDT', resting.id)).toBe('0');
      expect(await avail(ALICE, 'USDT')).toBe('401');
      expect(postsWithReason('order.hold.released')).toHaveLength(1);
    });
  });
}
