import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { MemoryEventBus } from '@intafaced/events';
import { formatAmount, MemoryLedger, parseAmount as amt, recipes, userAvailable } from '@intafaced/ledger-client';
import { TradeService } from './trade-service.js';
import {
  installMarketDelistedPlace,
  matchingMarketDelistedRefuse,
  matchingSubmitMarketDelistedRefuse,
  MARKET_DELISTED,
} from './market-delisted-place.js';
import { READY_MARKET_LIFECYCLE, StubMatching, StubPerks, principalFor } from './testing.js';
import type { Market } from './types.js';
import type { Principal } from '@intafaced/auth';
import { toCcxtError } from '../ccxt-errors.js';
import { TradeError } from './types.js';
import type { EngineSubmitResult } from './matching-client.js';

installMarketDelistedPlace(TradeService);

describe('market-delisted place wrap (no swallowed fill)', () => {
  it('matching market_delisted wraps as trade.market_delisted; other codes do not', () => {
    expect(MARKET_DELISTED).toBe('market_delisted');
    expect(matchingMarketDelistedRefuse(null)).toBeNull();
    expect(matchingMarketDelistedRefuse(undefined)).toBeNull();
    expect(matchingMarketDelistedRefuse({ code: 'self_trade', message: 'own rest' })).toBeNull();
    expect(matchingMarketDelistedRefuse({ code: 'market_halted', message: 'halted' })).toBeNull();
    expect(matchingMarketDelistedRefuse({ code: 'venue_halted', message: 'all halted' })).toBeNull();
    expect(matchingMarketDelistedRefuse({ code: 'market_prelaunch', message: 'prelaunch' })).toBeNull();
    expect(matchingMarketDelistedRefuse({ code: 'market_expired', message: 'expired' })).toBeNull();
    expect(matchingMarketDelistedRefuse({ code: 'market_post_only', message: 'cross' })).toBeNull();
    expect(matchingMarketDelistedRefuse({ code: 'fok_unfillable', message: 'short' })).toBeNull();
    const refuse = matchingMarketDelistedRefuse({
      code: 'market_delisted',
      message: 'market BTC/USDT is delisted — new submits are refused',
    });
    expect(refuse).toMatchObject({ name: 'TradeError', code: 'trade.market_delisted' });
    expect(refuse?.message).toMatch(/delisted/);
  });

  it('submit reject market_delisted is a refuse; missing rejected still proceeds', () => {
    expect(matchingSubmitMarketDelistedRefuse(null)).toBeNull();
    expect(matchingSubmitMarketDelistedRefuse(undefined)).toBeNull();
    expect(matchingSubmitMarketDelistedRefuse({ rejected: null })).toBeNull();
    expect(matchingSubmitMarketDelistedRefuse({ rejected: { code: 'self_trade' } })).toBeNull();
    expect(matchingSubmitMarketDelistedRefuse({ rejected: { code: 'market_halted' } })).toBeNull();
    expect(matchingSubmitMarketDelistedRefuse({ rejected: { code: 'venue_halted' } })).toBeNull();
    expect(matchingSubmitMarketDelistedRefuse({ rejected: { code: 'market_prelaunch' } })).toBeNull();
    expect(matchingSubmitMarketDelistedRefuse({ rejected: { code: 'market_expired' } })).toBeNull();
    expect(matchingSubmitMarketDelistedRefuse({ rejected: { code: 'market_delisted' } })).toMatchObject({
      code: 'trade.market_delisted',
    });
  });

  it('place that returns matching market_delisted throws — no silent rest', async () => {
    class Door {
      async placeOrder(_principal: Principal, _input: unknown) {
        return { id: 'take', status: 'rejected', rejectCode: 'market_delisted' };
      }
    }
    installMarketDelistedPlace(Door as unknown as typeof TradeService);
    const door = new Door();
    await expect(door.placeOrder({} as Principal, {})).rejects.toMatchObject({ code: 'trade.market_delisted' });
  });

  it('delisted submit with fills is refused — not swallowed as a fill', async () => {
    class Door {
      async placeOrder(_principal: Principal, _input: unknown) {
        return { id: 'take', status: 'filled', rejectCode: null };
      }
      async applySubmitResult(_market: unknown, _orderId: unknown, result: EngineSubmitResult) {
        if (result.fills.length > 0) {
          throw new Error('should have been converted before orig apply saw a fill');
        }
        expect(result.accepted).toBe(false);
        expect(result.rejected?.code).toBe('market_delisted');
      }
    }
    installMarketDelistedPlace(Door as unknown as typeof TradeService);
    const door = new Door();
    const fill = {
      sequence: 1,
      makerOrderId: 'rest',
      makerAccountId: 'alice',
      takerOrderId: 'take',
      takerAccountId: 'bob',
      takerSide: 'buy' as const,
      price: '100',
      qty: '1',
    };
    await expect(
      door.applySubmitResult({}, 'take', {
        accepted: true,
        sequence: 1,
        fills: [fill],
        resting: null,
        rejected: { code: 'market_delisted', message: 'market is delisted — order take not processed' },
        cancellations: [],
        triggered: [],
      }),
    ).rejects.toMatchObject({ code: 'trade.market_delisted' });
  });

  it('maps trade.market_delisted as InvalidOrder — not a fill, not a dropped symbol', () => {
    const mapped = toCcxtError(new TradeError('market is delisted', 'trade.market_delisted'));
    expect(mapped).not.toBeNull();
    expect(mapped!.status).toBe(403);
    expect(mapped!.body.code).toBe('InvalidOrder');
    expect(mapped!.body.intafacedCode).toBe('trade.market_delisted');
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
  describe.skip('market-delisted place (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'trade', url: URL, migrations });
  const sql = db.sql;
  afterAll(async () => {
    await db.drop();
  });

  describe('matching market_delisted through place', () => {
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

    it('matching reject market_delisted throws trade.market_delisted — no rest, hold released, rest stays', async () => {
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

      matching.scriptRejection('market_delisted', 'market is delisted — new submits are refused');

      await expect(
        trade.placeOrder(principalFor(ALICE), {
          marketId: btcusdt.id,
          side: 'buy',
          type: 'limit',
          qty: amt('1'),
          price: amt('100'),
          clientOrderId: 'alice-take',
        }),
      ).rejects.toMatchObject({ code: 'trade.market_delisted' });

      const take = await sql<Array<{ status: string; reject_code: string | null }>>`
        SELECT status, reject_code FROM trade.orders WHERE client_order_id = 'alice-take'
      `;
      expect(take).toHaveLength(1);
      expect(take[0]?.status).toBe('rejected');
      expect(take[0]?.reject_code).toBe('market_delisted');

      const still = await trade.getOrder(principalFor(ALICE, ['trade:read']), resting.id);
      expect(still.status).toBe('open');
      expect(still.filledQty).toBe(0n);

      const fills = await sql`SELECT id FROM trade.fills`;
      expect(fills).toHaveLength(0);

      expect(await avail(ALICE, 'USDT')).toBe('2000');
      expect(await avail(ALICE, 'BTC')).toBe('9');
    });

    it('cancel still works while matching would refuse a new submit', async () => {
      await fund(ALICE, 'BTC', '10');

      const resting = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'sell',
        type: 'limit',
        qty: amt('1'),
        price: amt('100'),
        clientOrderId: 'alice-cancel-rest',
      });
      expect(resting.status).toBe('open');

      matching.scriptRejection('market_delisted', 'market is delisted — new submits are refused');

      await expect(
        trade.placeOrder(principalFor(ALICE), {
          marketId: btcusdt.id,
          side: 'buy',
          type: 'limit',
          qty: amt('1'),
          price: amt('100'),
          clientOrderId: 'alice-cancel-take',
        }),
      ).rejects.toMatchObject({ code: 'trade.market_delisted' });

      const cancelled = await trade.cancelOrder(principalFor(ALICE), resting.id);
      expect(cancelled.status).toBe('cancelled');
      expect(matching.cancelledOrders).toContain(resting.id);
      expect(await avail(ALICE, 'BTC')).toBe('10');
    });

    it('place against a different account still fills when matching is not delisted', async () => {
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
      expect(take.rejectCode).not.toBe('market_delisted');
      expect(take.status).toBe('filled');

      const fills = await sql`SELECT id FROM trade.fills`;
      expect(fills.length).toBeGreaterThan(0);
    });
  });
}
