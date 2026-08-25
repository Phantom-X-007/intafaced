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
import { installNativeQtyUpAmend } from './qty-up-amend.js';
import { READY_MARKET_LIFECYCLE, StubMatching, StubPerks, principalFor } from './testing.js';
import type { Market } from './types.js';

installNativeQtyUpAmend(TradeService);

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
  describe.skip('native amend qty-up (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'trade', url: URL, migrations });
  const sql = db.sql;
  afterAll(async () => {
    await db.close();
  });

  describe('native amend qty-up', () => {
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
    async function rest(qty: string, price: string, clientOrderId: string) {
      return trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt(qty),
        price: amt(price),
        clientOrderId,
      });
    }

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

    it('takes extra ledger hold then PATCHes matching', async () => {
      await fund(ALICE, 'USDT', '1000');
      const original = await rest('2', '100', 'native-qty-up');
      const outcome = await trade.amendOrder(principalFor(ALICE), original.id, { qty: amt('3') });
      expect(outcome).toMatchObject({
        accepted: true,
        code: 'AMENDED',
        path: 'NATIVE_AMEND',
        reconciliationRequired: false,
      });
      expect(outcome.order.qty).toBe(amt('3'));
      expect(outcome.order.holdAmount).toBe(amt('300'));
      expect(matching.amended).toHaveLength(1);
      expect(matching.amended[0]?.request.qty).toBe('3');
      expect(await heldFor(ALICE, 'USDT', original.id)).toBe('300');
      expect(await avail(ALICE, 'USDT')).toBe('700');
      expect(postsWithReason('order.hold.amend')).toHaveLength(1);
    });

    it('refuses when the extra hold cannot be taken', async () => {
      await fund(ALICE, 'USDT', '200');
      const original = await rest('2', '100', 'native-qty-up-broke');
      const outcome = await trade.amendOrder(principalFor(ALICE), original.id, { qty: amt('3') });
      expect(outcome).toMatchObject({
        accepted: false,
        code: 'NOT_AMENDABLE',
        reasonCode: 'ledger.insufficient_funds',
        path: 'NATIVE_AMEND',
      });
      expect(matching.amended).toHaveLength(0);
      expect(await heldFor(ALICE, 'USDT', original.id)).toBe('200');
      expect(postsWithReason('order.hold.amend')).toHaveLength(0);
    });

    it('releases the extra hold when matching refuses', async () => {
      await fund(ALICE, 'USDT', '1000');
      const original = await rest('2', '100', 'native-qty-up-refuse');
      matching.amendScript = async () => ({
        accepted: false,
        orderId: original.id,
        sequence: null,
        version: 1,
        priority: null,
        fills: [],
        resting: null,
        rejected: { code: 'version_mismatch', message: 'stale' },
        cancellations: [],
        triggered: [],
      });
      const outcome = await trade.amendOrder(principalFor(ALICE), original.id, { qty: amt('3') });
      expect(outcome).toMatchObject({ accepted: false, code: 'VERSION_MISMATCH', path: 'NATIVE_AMEND' });
      expect(await heldFor(ALICE, 'USDT', original.id)).toBe('200');
      expect(await avail(ALICE, 'USDT')).toBe('800');
      expect(postsWithReason('order.hold.amend')).toHaveLength(1);
      expect(postsWithReason('order.hold.released')).toHaveLength(1);
    });
  });
}
