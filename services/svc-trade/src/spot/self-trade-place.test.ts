import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { MemoryEventBus } from '@intafaced/events';
import { formatAmount, MemoryLedger, parseAmount as amt, recipes, userAvailable } from '@intafaced/ledger-client';
import { TradeService } from './trade-service.js';
import {
  installSelfTradePlace,
  matchingSelfFillRefuse,
  matchingSelfTradeRefuse,
  matchingSubmitSelfTradeRefuse,
  SELF_TRADE,
} from './self-trade-place.js';
import { installFokPlace } from './fok-place.js';
import { READY_MARKET_LIFECYCLE, StubMatching, StubPerks, principalFor, PUBLISHED_TEST_FEE_SCHEDULE } from './testing.js';
import type { Market } from './types.js';
import type { Principal } from '@intafaced/auth';
import { toCcxtError } from '../ccxt-errors.js';
import { TradeError } from './types.js';
import type { EngineSubmitResult } from './matching-client.js';

installSelfTradePlace(TradeService);
installFokPlace(TradeService);

describe('self-trade place wrap (no invented self-fill)', () => {
  it('matching self_trade wraps as trade.self_trade; other codes do not', () => {
    expect(SELF_TRADE).toBe('self_trade');
    expect(matchingSelfTradeRefuse(null)).toBeNull();
    expect(matchingSelfTradeRefuse(undefined)).toBeNull();
    expect(matchingSelfTradeRefuse({ code: 'post_only_would_cross', message: 'cross' })).toBeNull();
    expect(matchingSelfTradeRefuse({ code: 'self_trade_prevention', message: 'stp' })).toBeNull();
    expect(matchingSelfTradeRefuse({ code: 'fok_unfillable', message: 'short' })).toBeNull();
    const refuse = matchingSelfTradeRefuse({
      code: 'self_trade',
      message: 'incoming order would match the same account; the engine does not invent a self-fill',
    });
    expect(refuse).toMatchObject({ name: 'TradeError', code: 'trade.self_trade' });
    expect(refuse?.message).toMatch(/does not invent a self-fill/);
  });

  it('fillableQty/FOK same-account fill is self_trade; missing/false still fills', () => {
    expect(matchingSelfFillRefuse(null)).toBeNull();
    expect(matchingSelfFillRefuse(undefined)).toBeNull();
    expect(matchingSelfFillRefuse([])).toBeNull();
    expect(matchingSelfFillRefuse([{ makerAccountId: '', takerAccountId: '' }])).toBeNull();
    expect(matchingSelfFillRefuse([{ makerAccountId: '', takerAccountId: 'alice' }])).toBeNull();
    expect(matchingSelfFillRefuse([{ makerAccountId: 'alice', takerAccountId: 'bob' }])).toBeNull();
    expect(matchingSelfFillRefuse([{ makerAccountId: 'alice', takerAccountId: 'alice' }])).toMatchObject({
      code: 'trade.self_trade',
    });
    expect(
      matchingSubmitSelfTradeRefuse({
        rejected: null,
        fills: [{ makerAccountId: 'alice', takerAccountId: 'alice' }],
        triggered: [],
      }),
    ).toMatchObject({ code: 'trade.self_trade' });
    expect(
      matchingSubmitSelfTradeRefuse({
        rejected: { code: 'self_trade' },
        fills: [],
        triggered: [],
      }),
    ).toMatchObject({ code: 'trade.self_trade' });
    expect(
      matchingSubmitSelfTradeRefuse({
        rejected: null,
        fills: [{ makerAccountId: 'mm', takerAccountId: 'desk' }],
        triggered: [],
      }),
    ).toBeNull();
  });

  it('place that returns matching self_trade throws — no silent rest', async () => {
    class Door {
      async placeOrder(_principal: Principal, _input: unknown) {
        return { id: 'take', status: 'rejected', rejectCode: 'self_trade' };
      }
    }
    installSelfTradePlace(Door as unknown as typeof TradeService);
    const door = new Door();
    await expect(door.placeOrder({} as Principal, {})).rejects.toMatchObject({ code: 'trade.self_trade' });
  });

  it('FOK fill against own rest is refused — not swallowed as a fill', async () => {
    class Door {
      async placeOrder(_principal: Principal, _input: unknown) {
        return { id: 'take', status: 'filled', rejectCode: null };
      }
      async applySubmitResult(_market: unknown, _orderId: unknown, result: EngineSubmitResult) {
        if (result.fills.some((f) => f.makerAccountId === f.takerAccountId && f.makerAccountId.length > 0)) {
          throw new Error('should have been converted before orig apply saw a self-fill');
        }
      }
    }
    installSelfTradePlace(Door as unknown as typeof TradeService);
    const door = new Door();
    const selfFill = {
      sequence: 1,
      makerOrderId: 'rest',
      makerAccountId: 'alice',
      takerOrderId: 'take',
      takerAccountId: 'alice',
      takerSide: 'buy' as const,
      price: '100',
      qty: '1',
    };
    await expect(
      door.applySubmitResult({}, 'take', {
        accepted: true,
        sequence: 1,
        fills: [selfFill],
        resting: null,
        rejected: null,
        cancellations: [],
        triggered: [],
      }),
    ).rejects.toMatchObject({ code: 'trade.self_trade' });
  });

  it('maps trade.self_trade as InvalidOrder — not retryable', () => {
    const mapped = toCcxtError(new TradeError('incoming would self-fill', 'trade.self_trade'));
    expect(mapped).not.toBeNull();
    expect(mapped!.status).toBe(400);
    expect(mapped!.body.code).toBe('InvalidOrder');
    expect(mapped!.body.intafacedCode).toBe('trade.self_trade');
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
const BOB = '22222222-2222-4222-8222-222222222222';

if (!available) {
  describe.skip('self-trade place (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'trade', url: URL, migrations });
  const sql = db.sql;
  afterAll(async () => {
    await db.close();
  });

  describe('matching self_trade through place', () => {
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

    it('matching reject self_trade throws trade.self_trade — no rest, hold released, rest stays', async () => {
      await fund(ALICE, 'BTC', '10');
      await fund(ALICE, 'USDT', '2000');

      const resting = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'sell',
        type: 'limit',
        qty: amt('1'),
        price: amt('100'),
        clientOrderId: 'alice-rest',
      });
      expect(resting.status).toBe('open');

      matching.scriptRejection('self_trade', 'incoming order would match the same account; the engine does not invent a self-fill');

      await expect(
        trade.placeOrder(principalFor(ALICE), {
          marketId: btcusdt.id,
          side: 'buy',
          type: 'limit',
          qty: amt('1'),
          price: amt('100'),
          clientOrderId: 'alice-take',
        }),
      ).rejects.toMatchObject({ code: 'trade.self_trade' });

      const take = await sql<Array<{ status: string; reject_code: string | null }>>`
        SELECT status, reject_code FROM trade.orders WHERE client_order_id = 'alice-take'
      `;
      expect(take).toHaveLength(1);
      expect(take[0]?.status).toBe('rejected');
      expect(take[0]?.reject_code).toBe('self_trade');

      const still = await trade.getOrder(principalFor(ALICE, ['trade:read']), resting.id);
      expect(still.status).toBe('open');
      expect(still.filledQty).toBe(0n);
      expect(matching.cancelledOrders).toHaveLength(0);

      const fills = await sql`SELECT id FROM trade.fills`;
      expect(fills).toHaveLength(0);

      expect(await avail(ALICE, 'USDT')).toBe('2000');
      expect(await avail(ALICE, 'BTC')).toBe('9');
    });

    it('place against a different account still fills', async () => {
      await fund(ALICE, 'BTC', '10');
      await fund(BOB, 'USDT', '2000');

      const maker = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'sell',
        type: 'limit',
        qty: amt('1'),
        price: amt('100'),
        clientOrderId: 'alice-make',
      });
      expect(maker.status).toBe('open');

      matching.scriptFills([{ makerOrderId: maker.id, makerAccountId: ALICE, price: '100', qty: '1' }]);

      const take = await trade.placeOrder(principalFor(BOB), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt('1'),
        price: amt('100'),
        clientOrderId: 'bob-take',
      });
      expect(take.status).not.toBe('rejected');
      expect(take.rejectCode).not.toBe('self_trade');
      expect(take.status).toBe('filled');

      const fills = await sql`SELECT id FROM trade.fills`;
      expect(fills.length).toBeGreaterThan(0);
    });

    it('FOK matching reject self_trade throws — no invented fill, rest stays', async () => {
      await fund(ALICE, 'BTC', '10');
      await fund(ALICE, 'USDT', '2000');

      const resting = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'sell',
        type: 'limit',
        qty: amt('1'),
        price: amt('100'),
        clientOrderId: 'alice-fok-rest',
      });
      expect(resting.status).toBe('open');

      matching.scriptRejection('self_trade', 'incoming order would match the same account; fillableQty stops at own rest');

      await expect(
        trade.placeOrder(principalFor(ALICE), {
          marketId: btcusdt.id,
          side: 'buy',
          type: 'limit',
          qty: amt('1'),
          price: amt('100'),
          tif: 'FOK',
          clientOrderId: 'alice-fok-take',
        }),
      ).rejects.toMatchObject({ code: 'trade.self_trade' });

      expect(matching.submitted[1]?.request.tif).toBe('FOK');

      const take = await sql<Array<{ status: string; reject_code: string | null }>>`
        SELECT status, reject_code FROM trade.orders WHERE client_order_id = 'alice-fok-take'
      `;
      expect(take).toHaveLength(1);
      expect(take[0]?.status).toBe('rejected');
      expect(take[0]?.reject_code).toBe('self_trade');

      const still = await trade.getOrder(principalFor(ALICE, ['trade:read']), resting.id);
      expect(still.status).toBe('open');
      expect(still.filledQty).toBe(0n);
      expect(matching.cancelledOrders).toHaveLength(0);

      const fills = await sql`SELECT id FROM trade.fills`;
      expect(fills).toHaveLength(0);
      expect(await avail(ALICE, 'USDT')).toBe('2000');
      expect(await avail(ALICE, 'BTC')).toBe('9');
    });

    it('FOK fillableQty same-account fill is not swallowed — rest stays', async () => {
      await fund(ALICE, 'BTC', '10');
      await fund(ALICE, 'USDT', '2000');

      const resting = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'sell',
        type: 'limit',
        qty: amt('1'),
        price: amt('100'),
        clientOrderId: 'alice-fok-own-rest',
      });
      expect(resting.status).toBe('open');

      matching.scriptFills([{ makerOrderId: resting.id, makerAccountId: ALICE, price: '100', qty: '1' }]);

      await expect(
        trade.placeOrder(principalFor(ALICE), {
          marketId: btcusdt.id,
          side: 'buy',
          type: 'limit',
          qty: amt('1'),
          price: amt('100'),
          tif: 'FOK',
          clientOrderId: 'alice-fok-own-take',
        }),
      ).rejects.toMatchObject({ code: 'trade.self_trade' });

      const take = await sql<Array<{ status: string; reject_code: string | null }>>`
        SELECT status, reject_code FROM trade.orders WHERE client_order_id = 'alice-fok-own-take'
      `;
      expect(take[0]?.status).toBe('rejected');
      expect(take[0]?.reject_code).toBe('self_trade');

      const still = await trade.getOrder(principalFor(ALICE, ['trade:read']), resting.id);
      expect(still.status).toBe('open');
      expect(still.filledQty).toBe(0n);

      const fills = await sql`SELECT id FROM trade.fills`;
      expect(fills).toHaveLength(0);
      expect(await avail(ALICE, 'USDT')).toBe('2000');
      expect(await avail(ALICE, 'BTC')).toBe('9');
    });

    it('FOK against a different account still fills', async () => {
      await fund(ALICE, 'BTC', '10');
      await fund(BOB, 'USDT', '2000');

      const maker = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'sell',
        type: 'limit',
        qty: amt('1'),
        price: amt('100'),
        clientOrderId: 'alice-fok-make',
      });
      expect(maker.status).toBe('open');

      matching.scriptFills([{ makerOrderId: maker.id, makerAccountId: ALICE, price: '100', qty: '1' }]);

      const take = await trade.placeOrder(principalFor(BOB), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt('1'),
        price: amt('100'),
        tif: 'FOK',
        clientOrderId: 'bob-fok-take',
      });
      expect(take.status).toBe('filled');
      expect(take.rejectCode).not.toBe('self_trade');
      expect(matching.submitted[1]?.request.tif).toBe('FOK');

      const fills = await sql`SELECT id FROM trade.fills`;
      expect(fills.length).toBeGreaterThan(0);
    });
  });
}
