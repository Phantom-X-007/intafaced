import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { MemoryEventBus } from '@intafaced/events';
import { formatAmount, MemoryLedger, parseAmount as amt, recipes, userAvailable, orderHoldAccount } from '@intafaced/ledger-client';
import { TradeService } from './trade-service.js';
import { installOcoPlace } from './oco-place.js';
import {
  installOcoCancel,
  matchingOcoCancelRefuse,
  ocoSiblingIds,
  ocoSiblingsLive,
} from './oco-cancel.js';
import { READY_MARKET_LIFECYCLE, StubMatching, StubPerks, principalFor } from './testing.js';
import type { Market } from './types.js';

installOcoPlace(TradeService);
installOcoCancel(TradeService);

describe('OCO cancel helpers', () => {
  it('treats live take-profit or stop-loss ids as a linked pair', () => {
    const [tp, sl] = ocoSiblingIds('parent');
    expect(tp).toBe('parent:tp');
    expect(sl).toBe('parent:sl');
    expect(ocoSiblingsLive([{ orderId: tp }], 'parent')).toBe(true);
    expect(ocoSiblingsLive([{ orderId: sl }], 'parent')).toBe(true);
    expect(ocoSiblingsLive([{ orderId: 'parent' }], 'parent')).toBe(false);
  });

  it('maps matching oco_sibling_terminal — no invented trigger', () => {
    const refuse = matchingOcoCancelRefuse({ code: 'oco_sibling_terminal' });
    expect(refuse?.code).toBe('trade.oco_sibling_terminal');
    expect(refuse?.message).toContain('invent a trigger');
    expect(matchingOcoCancelRefuse({ code: 'order_not_found' })).toBeNull();
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
  describe.skip('OCO cancel (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'trade', url: URL, migrations });
  const sql = db.sql;
  afterAll(async () => {
    await db.close();
  });

  describe('linked TP+SL (OCO) cancel through matching', () => {
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

    async function placeLinked(): Promise<{ id: string }> {
      await fund(ALICE, 'BTC', '2');
      return trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'sell',
        type: 'limit',
        qty: amt('1'),
        price: amt('110'),
        clientOrderId: `oco-${Math.random().toString(16).slice(2)}`,
        takeProfit: { price: '110', stopPrice: '110' },
        stopLoss: { stopPrice: '90' },
      } as Parameters<TradeService['placeOrder']>[1]);
    }

    it('cancels both siblings through matching — no invented trigger', async () => {
      const placed = await placeLinked();
      const [tp, sl] = ocoSiblingIds(placed.id);
      matching.scriptLive(tp, btcusdt.id);
      matching.scriptLive(sl, btcusdt.id);
      matching.script1((request, next) => {
        const sequence = next();
        return {
          accepted: true,
          sequence,
          fills: [],
          resting: null,
          rejected: null,
          cancellations: [
            { orderId: tp, accountId: ALICE, remainingQty: request.qty, sequence, reason: 'requested' },
            { orderId: sl, accountId: ALICE, remainingQty: request.qty, sequence: next(), reason: 'requested' },
          ],
          triggered: [],
        };
      });

      const cancelled = await trade.cancelOrder(principalFor(ALICE), placed.id);
      expect(cancelled.status).toBe('cancelled');
      const req = matching.submitted[1]?.request as {
        cancel?: boolean;
        oco?: boolean;
        mark?: string | null;
        takeProfit?: string | null;
        stopLoss?: string | null;
      };
      expect(req?.cancel).toBe(true);
      expect(req?.oco).toBe(true);
      expect(req?.mark).toBeUndefined();
      expect(req?.takeProfit).toBeUndefined();
      expect(req?.stopLoss).toBeUndefined();
      expect(await heldFor(ALICE, 'BTC', placed.id)).toBe('0');
      expect(await avail(ALICE, 'BTC')).toBe('2');
    });

    it('refuses when either sibling is already terminal — remaining hold stays', async () => {
      const placed = await placeLinked();
      const [tp] = ocoSiblingIds(placed.id);
      matching.scriptLive(tp, btcusdt.id);
      matching.scriptRejection('oco_sibling_terminal', 'an OCO sibling is already terminal; the engine does not invent a trigger');

      await expect(trade.cancelOrder(principalFor(ALICE), placed.id)).rejects.toMatchObject({
        code: 'trade.oco_sibling_terminal',
      });
      const [row] = await sql<Array<{ status: string }>>`SELECT status FROM trade.orders WHERE id = ${placed.id}`;
      expect(row?.status).toBe('open');
      expect(await heldFor(ALICE, 'BTC', placed.id)).toBe('1');
      expect(await avail(ALICE, 'BTC')).toBe('1');
    });

    it('GTC cancel never submits oco cancel', async () => {
      await fund(ALICE, 'USDT', '500');
      const order = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt('1'),
        price: amt('100'),
        clientOrderId: 'gtc-plain-cancel',
      });
      const cancelled = await trade.cancelOrder(principalFor(ALICE), order.id);
      expect(cancelled.status).toBe('cancelled');
      expect(matching.submitted).toHaveLength(1);
      expect(matching.cancelledOrders).toEqual([order.id]);
      const req = matching.submitted[0]?.request as { oco?: boolean; cancel?: boolean };
      expect(req?.oco).toBeUndefined();
      expect(req?.cancel).toBeUndefined();
    });
  });
}
