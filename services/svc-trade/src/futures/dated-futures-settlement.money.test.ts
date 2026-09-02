/**
 * CARD F3 money proof — dated futures settlement job (PTX-M10-R03).
 *
 * Hitch: runDatedFuturesSettlementJob wraps runDatedFuturesExpiryTick + planClose.
 * Owner decimal fixing settles via existing ledger-client recipes
 * (futuresRealizeProfit / futuresRealizeLoss / futuresMarginRelease). Blank
 * fixing refuses trade.dated_futures_settlement_price_unset with zero posts.
 * Never last trade / mark. Listing still refuses blank TRADE_FUTURES_SETTLEMENT_FIXING.
 * Does not recut router.ts, trade-service.ts, futures-jobs.ts.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import {
  MemoryLedger,
  formatAmount,
  parseAmount as amt,
  positionCollateralAccount,
  recipes,
  userAvailable,
} from '@intafaced/ledger-client';
import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { TradeError } from '../spot/types.js';
import { DATED_FUTURES_FIXING_UNCONFIGURED, resolveDatedFuturesListing } from './dated-futures.js';
import { DATED_FUTURES_SETTLEMENT_PRICE_UNSET, datedSettlementIdFor, runDatedFuturesSettlementJob } from './dated-futures-settlement.js';

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const drizzle = join(here, '..', '..', 'drizzle');
const migrations = readdirSync(drizzle)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzle, f), 'utf8'));

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const POS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MARKET = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EXPIRY = new Date('2026-12-26T08:00:00.000Z');
const AFTER = new Date('2026-12-26T08:00:01.000Z');

function longPosition() {
  return {
    positionId: POS,
    userId: ALICE,
    side: 'long' as const,
    size: amt('1'),
    entryPrice: amt('100'),
    margin: amt('20'),
    marginAsset: 'USDT',
  };
}

async function fund(ledger: MemoryLedger, userId: string, amount: string, railRef: string) {
  await ledger.post(recipes.deposit({ userId, assetId: 'USDT', amount: amt(amount), rail: 'test', railRef }));
}

async function seedMarginAndProfitPot(ledger: MemoryLedger) {
  await fund(ledger, ALICE, '1000', 'alice-usdt');
  await ledger.post(recipes.futuresMarginLock({ positionId: POS, userId: ALICE, assetId: 'USDT', amount: amt('20') }));
  await fund(ledger, BOB, '50', 'bob-profit-seed');
  await ledger.post(recipes.futuresMarginLock({ positionId: 'pot-seed', userId: BOB, assetId: 'USDT', amount: amt('50') }));
  await ledger.post(
    recipes.futuresRealizeLoss({
      positionId: 'pot-seed',
      userId: BOB,
      assetId: 'USDT',
      fromMargin: amt('50'),
      fromInsurance: 0n,
      lossId: 'pot-seed',
    }),
  );
}

describe('dated futures settlement hitch (source)', () => {
  it('router.ts has no dated-settlement recut', () => {
    const routerSrc = readFileSync(join(here, '..', 'router.ts'), 'utf8');
    expect(routerSrc).not.toMatch(/runDatedFuturesSettlementJob/);
    expect(routerSrc).not.toMatch(/dated-futures-settlement/);
    expect(routerSrc).not.toMatch(/datedSettlementIdFor/);
  });

  it('trade-service.ts is not recut for settlement posting', () => {
    const src = readFileSync(join(here, '..', 'spot', 'trade-service.ts'), 'utf8');
    expect(src).not.toMatch(/runDatedFuturesSettlementJob/);
    expect(src).not.toMatch(/datedSettlementIdFor/);
  });

  it('futures-jobs.ts is not recut as a wall-clock settlement cron', () => {
    const jobs = readFileSync(join(here, 'futures-jobs.ts'), 'utf8');
    expect(jobs).not.toMatch(/runDatedFuturesSettlementJob/);
    expect(jobs).not.toMatch(/dated-futures-settlement/);
    expect(jobs).toMatch(/export \{ runDatedFuturesExpiryTick \} from '\.\/dated-futures\.js'/);
  });

  it('job never assigns lastTrade or mark as settlement price', () => {
    const mill = readFileSync(join(here, 'dated-futures-settlement.ts'), 'utf8');
    expect(mill).toMatch(/void input\.lastTradePrice/);
    expect(mill).toMatch(/void input\.markPrice/);
    expect(mill).toMatch(/runDatedFuturesExpiryTick/);
    expect(mill).toMatch(/planClose/);
    expect(mill).toMatch(/dated-settle:/);
    expect(mill).not.toMatch(/ownerSettlementPrice\s*\?\?\s*.*lastTrade/);
    expect(mill).not.toMatch(/settlementPrice.*=.*lastTrade/);
    expect(mill).not.toMatch(/settlementPrice.*=.*markPrice/);
    expect(mill).toMatch(/source: 'owner_fixing'/);
    expect(mill).toMatch(/futuresRealizeProfit|planClose/);
  });

  it('listing still refuses blank TRADE_FUTURES_SETTLEMENT_FIXING', () => {
    try {
      resolveDatedFuturesListing({
        kind: 'futures',
        futuresContractStyle: 'dated',
        expiryAt: EXPIRY,
        settlementFixingConfigured: '',
      });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TradeError);
      expect((err as TradeError).code).toBe(DATED_FUTURES_FIXING_UNCONFIGURED);
      expect((err as Error).message).toContain('TRADE_FUTURES_SETTLEMENT_FIXING');
    }
  });
});

describe('dated futures settlement mill (hermetic)', () => {
  it('owner decimal fixing settles; ledger posts balanced planClose recipes', async () => {
    const ledger = new MemoryLedger();
    await seedMarginAndProfitPot(ledger);
    const before = ledger.journal().length;
    const result = await runDatedFuturesSettlementJob({
      style: 'dated',
      expiryAt: EXPIRY,
      now: AFTER,
      ownerSettlementPrice: '110',
      lastTradePrice: '99999.00',
      markPrice: '88888.00',
      positions: [longPosition()],
      ledger,
    });
    expect(result).toMatchObject({
      status: 'settled',
      settlementPrice: '110',
      source: 'owner_fixing',
      settlementIds: [datedSettlementIdFor(POS)],
    });
    expect(result.posts.map((p) => p.reason)).toEqual(['futures.profit.realized', 'futures.margin.release']);
    expect(result.posts[0]!.idempotencyKey).toBe(`futures.profit:${datedSettlementIdFor(POS)}:profit`);
    expect(result.posts[1]!.idempotencyKey).toBe(`futures.margin.release:${POS}:1`);
    expect(ledger.journal().length).toBe(before + 2);
    expect(formatAmount((await ledger.balance(positionCollateralAccount(ALICE, 'USDT', POS))).amount)).toBe('0');
    expect(formatAmount((await ledger.balance(userAvailable(ALICE, 'USDT'))).amount)).toBe('1010');
    expect(ledger.reconcile()).toEqual({ ok: true });
  });

  it('blank fixing refuses trade.dated_futures_settlement_price_unset; zero posts; never last-trade', async () => {
    const ledger = new MemoryLedger();
    await seedMarginAndProfitPot(ledger);
    const before = ledger.journal().length;
    const result = await runDatedFuturesSettlementJob({
      style: 'dated',
      expiryAt: EXPIRY,
      now: AFTER,
      ownerSettlementPrice: '',
      lastTradePrice: '99999.00',
      markPrice: '88888.00',
      positions: [longPosition()],
      ledger,
    });
    expect(result).toEqual({
      status: 'refused',
      reason: 'settlement_price_unset',
      code: DATED_FUTURES_SETTLEMENT_PRICE_UNSET,
      posts: [],
    });
    expect(ledger.journal()).toHaveLength(before);
    expect(formatAmount((await ledger.balance(positionCollateralAccount(ALICE, 'USDT', POS))).amount)).toBe('20');
    expect(ledger.reconcile()).toEqual({ ok: true });
  });

  it('replay is idempotent on settlement id', async () => {
    const ledger = new MemoryLedger();
    await seedMarginAndProfitPot(ledger);
    const input = {
      style: 'dated' as const,
      expiryAt: EXPIRY,
      now: AFTER,
      ownerSettlementPrice: '110',
      positions: [longPosition()],
      ledger,
    };
    const first = await runDatedFuturesSettlementJob(input);
    const afterFirst = ledger.journal().length;
    const second = await runDatedFuturesSettlementJob(input);
    expect(first.status).toBe('settled');
    expect(second.status).toBe('settled');
    expect(second.settlementIds).toEqual(first.settlementIds);
    expect(ledger.journal()).toHaveLength(afterFirst);
    expect(ledger.reconcile()).toEqual({ ok: true });
  });
});

const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('svc-trade dated futures settlement F3 money (Postgres unavailable — start docker compose)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'trade', url: URL, migrations });
  const sql = db.sql;

  describe('svc-trade dated futures settlement F3 money', () => {
    beforeEach(async () => {
      await sql`TRUNCATE trade.positions, trade.fills, trade.orders, trade.markets RESTART IDENTITY CASCADE`;
    });

    afterAll(async () => {
      await db.drop();
    }, 30_000);

    it('schema CHECK still refuses dated listing with blank futures_settlement_fixing', async () => {
      await expect(
        sql`
          INSERT INTO trade.markets (
            id, symbol, base_asset, quote_asset, kind, tick_size, lot_size, min_qty, min_notional,
            maker_bps, taker_bps, status, display_name, listed_at,
            futures_contract_style, futures_expiry_at, futures_settlement_fixing
          ) VALUES (
            ${MARKET}, 'BTC/USDT:USDT-251226', 'BTC', 'USDT', 'futures', '0.01', '0.0001', '0.0001', '1',
            10, 20, 'active', 'BTC dated', now(),
            'dated', ${EXPIRY}, ''
          )
        `,
      ).rejects.toThrow();
    });

    it('owner fixing settles an expired dated row; blank refuses with zero posts', async () => {
      await sql`
        INSERT INTO trade.markets (
          id, symbol, base_asset, quote_asset, kind, tick_size, lot_size, min_qty, min_notional,
          maker_bps, taker_bps, status, display_name, listed_at,
          futures_contract_style, futures_expiry_at, futures_settlement_fixing
        ) VALUES (
          ${MARKET}, 'BTC/USDT:USDT-251226', 'BTC', 'USDT', 'futures', '0.01', '0.0001', '0.0001', '1',
          10, 20, 'active', 'BTC dated', now(),
          'dated', ${EXPIRY}, 'owner-dated-fixing'
        )
      `;
      const inserted = await sql<{ id: string }[]>`
        INSERT INTO trade.positions (
          user_id, market_id, side, margin_mode, status,
          size, entry_price, leverage, margin_initial, margin_current, margin_asset, opened_at
        ) VALUES (
          ${ALICE}, ${MARKET}, 'long', 'isolated', 'open',
          '1', '100', 5, '20', '20', 'USDT', ${EXPIRY}
        )
        RETURNING id
      `;
      expect(inserted).toHaveLength(1);
      const positionId = inserted[0]!.id;

      const ledger = new MemoryLedger();
      await fund(ledger, ALICE, '1000', 'alice-pg');
      await ledger.post(recipes.futuresMarginLock({ positionId, userId: ALICE, assetId: 'USDT', amount: amt('20') }));
      await fund(ledger, BOB, '50', 'bob-pg');
      await ledger.post(recipes.futuresMarginLock({ positionId: 'pot-seed-pg', userId: BOB, assetId: 'USDT', amount: amt('50') }));
      await ledger.post(
        recipes.futuresRealizeLoss({
          positionId: 'pot-seed-pg',
          userId: BOB,
          assetId: 'USDT',
          fromMargin: amt('50'),
          fromInsurance: 0n,
          lossId: 'pot-seed-pg',
        }),
      );

      const blank = await runDatedFuturesSettlementJob({
        style: 'dated',
        expiryAt: EXPIRY,
        now: AFTER,
        ownerSettlementPrice: '   ',
        lastTradePrice: '99999',
        markPrice: '88888',
        positions: [{ ...longPosition(), positionId, margin: amt('20') }],
        ledger,
      });
      expect(blank).toMatchObject({
        status: 'refused',
        code: DATED_FUTURES_SETTLEMENT_PRICE_UNSET,
        posts: [],
      });
      const before = ledger.journal().length;

      const settled = await runDatedFuturesSettlementJob({
        style: 'dated',
        expiryAt: EXPIRY,
        now: AFTER,
        ownerSettlementPrice: '110',
        lastTradePrice: '99999',
        markPrice: '88888',
        positions: [{ ...longPosition(), positionId, margin: amt('20') }],
        ledger,
      });
      expect(settled.status).toBe('settled');
      if (settled.status !== 'settled') return;
      expect(settled.settlementPrice).toBe('110');
      expect(settled.source).toBe('owner_fixing');
      expect(settled.posts.map((p) => p.reason)).toEqual(['futures.profit.realized', 'futures.margin.release']);
      expect(settled.settlementIds).toEqual([datedSettlementIdFor(positionId)]);
      expect(ledger.journal().length).toBe(before + 2);
      expect(ledger.reconcile()).toEqual({ ok: true });
    });
  });
}
