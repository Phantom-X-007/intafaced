import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { assertTestDatabase } from '@intafaced/db';
import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { MemoryEventBus } from '@intafaced/events';
import { MemoryLedger, formatAmount, parseAmount as amt, recipes } from '@intafaced/ledger-client';
import { TradeService } from './trade-service.js';
import type { Market } from './types.js';
import { StubMatching, StubPerks, principalFor } from './testing.js';

/**
 * Seed / mm honesty (Spec SD-2, SD-3, SD-4 · Plan P4-2/P4-3 · chaos F8).
 */

const URL = process.env.TEST_DATABASE_URL_TRADE ?? 'postgres://svc_trade:svc_trade@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const drizzle = join(here, '..', '..', 'drizzle');
const migrations = readdirSync(drizzle)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzle, f), 'utf8'));

const ALICE = '11111111-1111-4111-8111-111111111111';
const SEED = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

async function reachable(): Promise<boolean> {
  const probe = postgres(URL, { max: 1, connect_timeout: 3, onnotice: () => undefined });
  try {
    await probe`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await probe.end({ timeout: 2 });
  }
}

const available = await reachable();

if (!available) {
  describe.skip('order-route seed honesty (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  const sql = postgres(URL, {
    max: 8,
    connection: { search_path: 'trade,public', application_name: 'svc-trade-seed' },
    onnotice: () => undefined,
  });

  await assertTestDatabase(sql, 'svc-trade-seed');
  for (const migration of migrations) await sql.unsafe(migration);

  let ledger: MemoryLedger;
  let bus: MemoryEventBus;
  let matching: StubMatching;
  let perks: StubPerks;
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

  beforeEach(async () => {
    await sql`TRUNCATE trade.fills, trade.orders, trade.markets RESTART IDENTITY CASCADE`;
    ledger = new MemoryLedger();
    bus = new MemoryEventBus('svc-trade');
    matching = new StubMatching();
    perks = new StubPerks();
    trade = new TradeService(sql, ledger, matching, perks, bus, {
      spotEnabled: true,
      seedPlaceEnabled: true,
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

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  describe('SD-2 seeded flag on order + API shape', () => {
    it('places a seeded order with seeded=true when seed path is enabled', async () => {
      await fund(SEED, 'BTC', '10');
      const order = await trade.placeOrder(principalFor(SEED), {
        marketId: btcusdt.id,
        side: 'sell',
        type: 'limit',
        qty: amt('2'),
        price: amt('100'),
        clientOrderId: 'seed-1',
        seeded: true,
      });
      expect(order.seeded).toBe(true);
      const row = await sql<Array<{ seeded: boolean }>>`SELECT seeded FROM trade.orders WHERE id = ${order.id}`;
      expect(row[0]!.seeded).toBe(true);
    });

    it('user orders default seeded=false', async () => {
      await fund(ALICE, 'USDT', '1000');
      const order = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt('2'),
        price: amt('100'),
        clientOrderId: 'user-1',
      });
      expect(order.seeded).toBe(false);
    });
  });

  describe('SD-4 seed kill-switch', () => {
    it('refuses seeded place when seedPlaceEnabled is off', async () => {
      const off = new TradeService(sql, ledger, matching, perks, bus, {
        spotEnabled: true,
        seedPlaceEnabled: false,
      });
      await fund(SEED, 'BTC', '10');
      await expect(
        off.placeOrder(principalFor(SEED), {
          marketId: btcusdt.id,
          side: 'sell',
          type: 'limit',
          qty: amt('2'),
          price: amt('100'),
          clientOrderId: 'seed-blocked',
          seeded: true,
        }),
      ).rejects.toMatchObject({ code: 'trade.seed_disabled' });
    });
  });

  describe('SD-5 unfair cross ban — seed is make-only', () => {
    it('refuses seeded market orders (would take liquidity)', async () => {
      await fund(SEED, 'BTC', '10');
      await expect(
        trade.placeOrder(principalFor(SEED), {
          marketId: btcusdt.id,
          side: 'sell',
          type: 'market',
          qty: amt('2'),
          clientOrderId: 'seed-mkt-ban',
          seeded: true,
        }),
      ).rejects.toMatchObject({ code: 'trade.seed_must_make' });
    });

    it('forces seeded limits to post-only so engine refuses crosses', async () => {
      await fund(SEED, 'USDT', '1000');
      // Rest a user sell at 100 so a seed buy at 100 would cross.
      await fund(ALICE, 'BTC', '5');
      await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'sell',
        type: 'limit',
        qty: amt('2'),
        price: amt('100'),
        clientOrderId: 'user-rest',
      });
      matching.scriptRejection('post_only_would_cross');
      const seed = await trade.placeOrder(principalFor(SEED), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt('2'),
        price: amt('100'),
        clientOrderId: 'seed-would-cross',
        seeded: true,
        // caller may pass GTC; service forces PO for seed
        tif: 'GTC',
      });
      // Engine rejected post-only cross → order rejected, no unfair fill.
      expect(seed.status).toBe('rejected');
      expect(seed.rejectCode).toBe('post_only_would_cross');
      expect(seed.seeded).toBe(true);
      expect(matching.submitted[matching.submitted.length - 1]!.request.tif).toBe('PO');
    });
  });

  describe('chaos F8 / SD-3 — seed volume excluded from public tape', () => {
    it('seed↔seed fill does not appear on publicTape; user↔user does', async () => {
      await fund(SEED, 'BTC', '20');
      await fund(SEED, 'USDT', '5000');
      await fund(ALICE, 'BTC', '20');
      await fund(ALICE, 'USDT', '5000');

      // Seed maker rest
      const seedMaker = await trade.placeOrder(principalFor(SEED), {
        marketId: btcusdt.id,
        side: 'sell',
        type: 'limit',
        qty: amt('2'),
        price: amt('100'),
        clientOrderId: 'seed-maker',
        seeded: true,
      });
      matching.scriptFills([{ makerOrderId: seedMaker.id, makerAccountId: SEED, price: '100', qty: '2' }]);
      await trade.placeOrder(principalFor(SEED), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt('2'),
        price: amt('100'),
        clientOrderId: 'seed-taker',
        seeded: true,
      });

      // User↔user real print
      const userMaker = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'sell',
        type: 'limit',
        qty: amt('1'),
        price: amt('101'),
        clientOrderId: 'user-maker',
      });
      matching.scriptFills([{ makerOrderId: userMaker.id, makerAccountId: ALICE, price: '101', qty: '1' }]);
      // Need another user for taker - use SEED as non-seeded user for counterparty? Use BOB-like second user
      const BOB = '22222222-2222-4222-8222-222222222222';
      await fund(BOB, 'USDT', '5000');
      await trade.placeOrder(principalFor(BOB), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt('1'),
        price: amt('101'),
        clientOrderId: 'user-taker',
      });

      const tape = await trade.publicTape(btcusdt.id, 50);
      // Only the user↔user print (qty 1 @ 101), not seed-involving fill.
      expect(tape).toHaveLength(1);
      expect(formatAmount(tape[0]!.qty)).toBe('1');
      expect(formatAmount(tape[0]!.price)).toBe('101');
    });
  });
}
