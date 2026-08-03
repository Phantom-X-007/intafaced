import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import * as fc from 'fast-check';
import { MemoryEventBus } from '@intafaced/events';
import { MemoryLedger, formatAmount, parseAmount as amt, recipes } from '@intafaced/ledger-client';
import { TradeService } from './trade-service.js';
import type { Market } from './types.js';
import { StubMatching, StubPerks, principalFor } from './testing.js';

/**
 * Order-route property suite (Plan P1-2 · Spec CX-2, CX-3 · Landscape Tier A fast-check).
 *
 * Jepsen / TigerBeetle steal: operations = place-retry / fill-redeliver;
 * invariants = single hold, single settle, conservation, decimal-string amounts.
 */

/**
 * A PER-RUN DATABASE, created and dropped by this suite.
 *
 * trade's SQL is schema-qualified (`trade.…`) on purpose — §2 keeps a service
 * physically unable to reach outside its own schema. That is exactly why
 * `createTestDb`'s generated schema (`test_trade_4711_1`) cannot host it, and
 * why this suite used to share the one real `trade` schema in `intafaced_test`
 * with every other worktree on the machine — truncating their rows mid-test.
 *
 * `createTestDatabase` moves the isolation boundary from the schema to the
 * DATABASE and creates the schema under its real name inside it. Every
 * statement below, and every migration, is unchanged.
 *
 * The URL is the ADMIN one (`TEST_DATABASE_URL`), not `TEST_DATABASE_URL_TRADE`: creating a
 * database needs CREATEDB, which the per-service roles deliberately lack. It
 * must still name a `*_test` database — `assertTestDatabase` refuses anything
 * else, and asks the server rather than trusting the string.
 */
const URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const drizzle = join(here, '..', '..', 'drizzle');
const migrations = readdirSync(drizzle)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzle, f), 'utf8'));

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

const available = await postgresAvailable(URL);

describe('order-route properties — decimal string safety (no PG)', () => {
  it('property: formatAmount(parseAmount) stays a non-scientific decimal string', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), fc.integer({ min: 0, max: 6 }), (whole, scale) => {
        const s = scale === 0 ? String(whole) : `${whole}.${'0'.repeat(scale)}`;
        const parsed = amt(s);
        const out = formatAmount(parsed);
        expect(typeof out).toBe('string');
        expect(out).not.toMatch(/e/i);
        expect(Number.isNaN(Number(out))).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('property: parseAmount rejects non-decimal garbage (no silent number cast)', () => {
    fc.assert(
      fc.property(fc.constantFrom('1e18', 'NaN', 'Infinity', '0x10', '', '  ', '1.2.3'), (bad) => {
        expect(() => amt(bad)).toThrow();
      }),
      { numRuns: 20 },
    );
  });
});

if (!available) {
  describe.skip('order-route properties — hold/fill (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'trade', url: URL, migrations });
  const sql = db.sql;

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

  const held = async (userId: string, assetId: string) => {
    const all = await ledger.balances('user', userId);
    return formatAmount(
      all.filter((b) => b.account.kind === 'hold' && b.account.assetId === assetId).reduce((acc, b) => acc + b.amount, 0n),
    );
  };
  const postsWithReason = (reason: string) => ledger.journal().filter((tx) => tx.reason === reason);

  beforeEach(async () => {
    await sql`TRUNCATE trade.fills, trade.orders, trade.markets RESTART IDENTITY CASCADE`;
    ledger = new MemoryLedger();
    bus = new MemoryEventBus('svc-trade');
    matching = new StubMatching();
    perks = new StubPerks();
    trade = new TradeService(sql, ledger, matching, perks, bus, { spotEnabled: true, marketSlippageCapBps: 200 });
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
    await db.drop();
  });

  describe('order-route properties — CX-2 retry same clientOrderId', () => {
    it('property: N sequential retries → one order, one hold, one engine submit', async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 2, max: 10 }), async (n) => {
          // Fresh world per run — property isolation.
          await sql`TRUNCATE trade.fills, trade.orders, trade.markets RESTART IDENTITY CASCADE`;
          ledger = new MemoryLedger();
          bus = new MemoryEventBus('svc-trade');
          matching = new StubMatching();
          perks = new StubPerks();
          trade = new TradeService(sql, ledger, matching, perks, bus, { spotEnabled: true, marketSlippageCapBps: 200 });
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
          await fund(ALICE, 'USDT', '50000');

          const clientOrderId = `prop-${n}-${Date.now()}`;
          const ids: string[] = [];
          for (let i = 0; i < n; i++) {
            const o = await trade.placeOrder(principalFor(ALICE), {
              marketId: btcusdt.id,
              side: 'buy',
              type: 'limit',
              qty: amt('2'),
              price: amt('100'),
              clientOrderId,
            });
            ids.push(o.id);
          }
          expect(new Set(ids).size).toBe(1);
          expect(await sql`SELECT id FROM trade.orders`).toHaveLength(1);
          expect(matching.submitted).toHaveLength(1);
          expect(postsWithReason('order.hold')).toHaveLength(1);
          expect(await held(ALICE, 'USDT')).toBe('200');
          expect(ledger.reconcile()).toEqual({ ok: true });
        }),
        { numRuns: 8 },
      );
    });
  });

  describe('order-route properties — CX-3 fill redelivery', () => {
    it('property: R redeliveries never create a second trade.fill', async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1, max: 4 }), async (redelivers) => {
          await sql`TRUNCATE trade.fills, trade.orders, trade.markets RESTART IDENTITY CASCADE`;
          ledger = new MemoryLedger();
          bus = new MemoryEventBus('svc-trade');
          matching = new StubMatching();
          perks = new StubPerks();
          trade = new TradeService(sql, ledger, matching, perks, bus, { spotEnabled: true, marketSlippageCapBps: 200 });
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
          await fund(BOB, 'BTC', '20');
          await fund(ALICE, 'USDT', '5000');

          const maker = await trade.placeOrder(principalFor(BOB), {
            marketId: btcusdt.id,
            side: 'sell',
            type: 'limit',
            qty: amt('2'),
            price: amt('100'),
            clientOrderId: `bob-${redelivers}-${Date.now()}`,
          });
          matching.scriptFills([{ makerOrderId: maker.id, makerAccountId: BOB, price: '100', qty: '2' }]);
          const taker = await trade.placeOrder(principalFor(ALICE), {
            marketId: btcusdt.id,
            side: 'buy',
            type: 'limit',
            qty: amt('2'),
            price: amt('100'),
            clientOrderId: `alice-${redelivers}-${Date.now()}`,
          });

          const sequence = (await sql<Array<{ sequence: number }>>`SELECT sequence FROM trade.fills LIMIT 1`)[0]!.sequence;
          const fillsBefore = postsWithReason('trade.fill').length;

          for (let i = 0; i < redelivers; i++) {
            await trade.settleFillEvent({
              marketId: btcusdt.id,
              makerOrderId: maker.id,
              takerOrderId: taker.id,
              price: '100',
              qty: '2',
              sequence,
            });
          }

          expect(postsWithReason('trade.fill').length).toBe(fillsBefore);
          expect(ledger.totalsByAsset()).toEqual({ BTC: '0', USDT: '0' });
          expect(ledger.reconcile()).toEqual({ ok: true });
        }),
        { numRuns: 4 },
      );
    }, 20_000);
  });
}
