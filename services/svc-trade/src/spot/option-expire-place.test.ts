import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { MemoryEventBus } from '@intafaced/events';
import { formatAmount, MemoryLedger, parseAmount as amt, recipes, userAvailable, orderHoldAccount } from '@intafaced/ledger-client';
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
const BEFORE = '2026-06-01T00:00:00.000Z';
const AFTER = '2027-01-01T00:00:00.000Z';

if (!available) {
  describe.skip('option expire through matching (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'trade', url: URL, migrations });
  const sql = db.sql;
  afterAll(async () => {
    await db.close();
  });

  describe('option expire through matching', () => {
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

    it('forwards now + expiry through matching — mark is not a clock', async () => {
      await fund(ALICE, 'USDT', '2000');
      const order = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'option',
        qty: amt('10'),
        price: amt('99'),
        clientOrderId: 'opt-now',
        strike: amt('100'),
        expiry: EXPIRY,
        now: BEFORE,
        mark: '50',
      } as Parameters<TradeService['placeOrder']>[1] & {
        type: 'option';
        strike: ReturnType<typeof amt>;
        expiry: string;
        now: string;
        mark: string;
      });
      expect(order.status).toBe('open');
      expect(matching.submitted[0]?.request.type).toBe('option');
      expect(matching.submitted[0]?.request.expiry).toBe(EXPIRY);
      expect((matching.submitted[0]?.request as { now?: string }).now).toBe(BEFORE);
      expect(matching.submitted[0]?.request.mark).toBeUndefined();
      expect(await heldFor(ALICE, 'USDT', order.id)).toBe('990');
    });

    it('refuses a missing expiry even with a mark and a clock — no submit, no hold', async () => {
      await fund(ALICE, 'USDT', '2000');
      await expect(
        trade.placeOrder(principalFor(ALICE), {
          marketId: btcusdt.id,
          side: 'buy',
          type: 'option',
          qty: amt('10'),
          price: amt('99'),
          clientOrderId: 'opt-miss-expiry-now',
          strike: amt('100'),
          now: AFTER,
          mark: '50',
        } as Parameters<TradeService['placeOrder']>[1] & {
          type: 'option';
          strike: ReturnType<typeof amt>;
          now: string;
          mark: string;
        }),
      ).rejects.toMatchObject({ code: 'trade.missing_expiry' });
      expect(matching.submitted).toHaveLength(0);
      expect(await avail(ALICE, 'USDT')).toBe('2000');
      expect(postsWithReason('order.hold')).toHaveLength(0);
    });

    it('unfilled remainder leaves when matching reports expired — hold released', async () => {
      await fund(ALICE, 'USDT', '2000');
      const resting = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'option',
        qty: amt('10'),
        price: amt('99'),
        clientOrderId: 'opt-then-expire',
        strike: amt('100'),
        expiry: EXPIRY,
        now: BEFORE,
      } as Parameters<TradeService['placeOrder']>[1] & {
        type: 'option';
        strike: ReturnType<typeof amt>;
        expiry: string;
        now: string;
      });
      expect(resting.status).toBe('open');
      expect(await heldFor(ALICE, 'USDT', resting.id)).toBe('990');

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
              remainingQty: '10',
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
        price: amt('90'),
        clientOrderId: 'later-clock',
        now: AFTER,
      } as Parameters<TradeService['placeOrder']>[1] & { now: string });

      expect((matching.submitted.at(-1)?.request as { now?: string }).now).toBe(AFTER);
      const expired = await trade.getOrder(principalFor(ALICE), resting.id);
      expect(expired.status).toBe('expired');
      expect(await heldFor(ALICE, 'USDT', resting.id)).toBe('0');
      expect(postsWithReason('order.hold.released')).toHaveLength(1);
    });

    it('a rest already past expiry leaves immediately — hold released', async () => {
      await fund(ALICE, 'USDT', '2000');
      matching.script1((request, next) => {
        const sequence = next();
        return {
          accepted: true,
          sequence,
          fills: [],
          resting: null,
          rejected: null,
          cancellations: [
            {
              orderId: request.orderId,
              accountId: request.accountId,
              remainingQty: request.qty,
              sequence: next(),
              reason: 'expired',
            },
          ],
          triggered: [],
        };
      });
      const order = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'option',
        qty: amt('10'),
        price: amt('99'),
        clientOrderId: 'opt-already-due',
        strike: amt('100'),
        expiry: EXPIRY,
        now: AFTER,
      } as Parameters<TradeService['placeOrder']>[1] & {
        type: 'option';
        strike: ReturnType<typeof amt>;
        expiry: string;
        now: string;
      });
      expect((matching.submitted[0]?.request as { now?: string }).now).toBe(AFTER);
      expect(matching.submitted[0]?.request.expiry).toBe(EXPIRY);
      expect(order.status).toBe('expired');
      expect(await heldFor(ALICE, 'USDT', order.id)).toBe('0');
      expect(await avail(ALICE, 'USDT')).toBe('2000');
      expect(postsWithReason('order.hold.released')).toHaveLength(1);
    });

    it('plain GTC does not invent a clock', async () => {
      await fund(ALICE, 'USDT', '2000');
      const order = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt('1'),
        price: amt('100'),
        clientOrderId: 'gtc-no-now',
      });
      expect(order.status).toBe('open');
      expect((matching.submitted[0]?.request as { now?: string }).now).toBeUndefined();
    });
  });
}
