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
import { installPostOnlyPlace } from './post-only-place.js';
import { READY_MARKET_LIFECYCLE, StubMatching, StubPerks, principalFor } from './testing.js';
import type { Market } from './types.js';

installPostOnlyPlace(TradeService);

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
  describe.skip('post-only place (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'trade', url: URL, migrations });
  const sql = db.sql;
  afterAll(async () => {
    await db.close();
  });

  describe('post-only place through matching', () => {
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

    it('tif PO + limit price rests — caller price, no invented price', async () => {
      await fund(ALICE, 'USDT', '500');
      const order = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt('1'),
        price: amt('100'),
        tif: 'PO',
        clientOrderId: 'po-rest',
      });
      expect(order.status).toBe('open');
      expect(matching.submitted).toHaveLength(1);
      expect(matching.submitted[0]?.request.tif).toBe('PO');
      expect(matching.submitted[0]?.request.price).toBe('100');
      expect(await heldFor(ALICE, 'USDT', order.id)).toBe('100');
      expect(await avail(ALICE, 'USDT')).toBe('400');
    });

    it('postOnly true binds to tif PO and forwards tif PO', async () => {
      await fund(ALICE, 'USDT', '500');
      const order = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt('1'),
        price: amt('100'),
        clientOrderId: 'po-flag',
        postOnly: true,
      } as Parameters<TradeService['placeOrder']>[1] & { postOnly: boolean });
      expect(order.status).toBe('open');
      expect(matching.submitted).toHaveLength(1);
      expect(matching.submitted[0]?.request.tif).toBe('PO');
      expect(matching.submitted[0]?.request.price).toBe('100');
    });

    it('matching post_only_would_cross rejects and releases the hold', async () => {
      await fund(ALICE, 'USDT', '500');
      matching.script1(() => ({
        accepted: false,
        sequence: null,
        fills: [],
        resting: null,
        rejected: { code: 'post_only_would_cross', message: 'post-only would take' },
        cancellations: [],
        triggered: [],
      }));
      const order = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt('1'),
        price: amt('100'),
        tif: 'PO',
        clientOrderId: 'po-cross',
      });
      expect(order.status).toBe('rejected');
      expect(order.rejectCode).toBe('post_only_would_cross');
      expect(matching.submitted[0]?.request.tif).toBe('PO');
      expect(await heldFor(ALICE, 'USDT', order.id)).toBe('0');
      expect(await avail(ALICE, 'USDT')).toBe('500');
      expect(postsWithReason('order.hold.released')).toHaveLength(1);
    });

    it('market + tif PO throws trade.invalid_tif — no submit, no hold', async () => {
      await fund(ALICE, 'USDT', '500');
      await expect(
        trade.placeOrder(principalFor(ALICE), {
          marketId: btcusdt.id,
          side: 'buy',
          type: 'market',
          qty: amt('1'),
          tif: 'PO',
          clientOrderId: 'po-market',
        }),
      ).rejects.toMatchObject({ code: 'trade.invalid_tif' });
      expect(matching.submitted).toHaveLength(0);
      expect(await avail(ALICE, 'USDT')).toBe('500');
      expect(postsWithReason('order.hold')).toHaveLength(0);
    });

    it('tif PO without price throws trade.invalid_tif — no submit, no hold', async () => {
      await fund(ALICE, 'USDT', '500');
      await expect(
        trade.placeOrder(principalFor(ALICE), {
          marketId: btcusdt.id,
          side: 'buy',
          type: 'limit',
          qty: amt('1'),
          tif: 'PO',
          clientOrderId: 'po-no-price',
        }),
      ).rejects.toMatchObject({ code: 'trade.invalid_tif' });
      expect(matching.submitted).toHaveLength(0);
      expect(await avail(ALICE, 'USDT')).toBe('500');
      expect(postsWithReason('order.hold')).toHaveLength(0);
    });

    it('plain GTC submitted tif is GTC not PO', async () => {
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
      expect(matching.submitted[0]?.request.tif).toBe('GTC');
      expect(matching.submitted[0]?.request.tif).not.toBe('PO');
    });
  });
}
