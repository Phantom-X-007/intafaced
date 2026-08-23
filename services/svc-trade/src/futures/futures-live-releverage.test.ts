/**
 * Unit card — live isolated re-leverage posts ledger for the IM delta
 * 1. Promise: in-cap setLeverage on an open position moves isolated margin
 * 2. Break: deleting setLeverage, remounting 501, or storing leverage as a number
 * 3. Done bar: leverage/collateral/available are decimal strings; ledger matches
 * 4. Class N
 * 5. Paths: futures/position-service.ts
 * 6. RED: setLeverage missing, or available stays 95000 after 10×→5×
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
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { TEST_MAX_LEVERAGE_AMOUNT } from './initial-margin.test-harness.js';
import { memoryMarkBook } from './mark-source.js';
import { FUTURES_HONEST_GAPS, futuresLiveReleverageMounted } from './mount-vs-tracker.js';
import { PositionService } from './position-service.js';
import { formatAccountRef, profitSourceFromConfig, recipeProfitFundingAccount } from './profit-source.js';

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const drizzle = join(here, '..', '..', 'drizzle');
const migrations = readdirSync(drizzle)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzle, f), 'utf8'));

const ALICE = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-08-06T12:00:00.000Z');
const MARKET = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PROFIT_SOURCE = formatAccountRef(recipeProfitFundingAccount('USDT'));

describe('live re-leverage fail-first pins', () => {
  it('501 helper is not mounted; live path is wired', () => {
    expect(futuresLiveReleverageMounted()).toBe(true);
    expect(FUTURES_HONEST_GAPS).toEqual([]);
  });
});

const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('live isolated re-leverage (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'trade', url: URL, migrations });
  const sql = db.sql;

  let ledger: MemoryLedger;
  let positions: PositionService;
  let marks: ReturnType<typeof memoryMarkBook>;

  function feed(price: string) {
    marks.set({ marketId: MARKET, price, quality: 'mid', asOfMs: NOW.getTime() });
  }

  beforeEach(async () => {
    await sql`TRUNCATE trade.positions, trade.fills, trade.orders, trade.markets RESTART IDENTITY CASCADE`;
    ledger = new MemoryLedger();
    marks = memoryMarkBook();
    positions = new PositionService(sql, ledger, {
      marks: marks.source(),
      profitSource: profitSourceFromConfig(PROFIT_SOURCE),
      maxLeverage: TEST_MAX_LEVERAGE_AMOUNT,
      now: () => NOW,
    });
    await sql`
      INSERT INTO trade.markets (
        id, symbol, base_asset, quote_asset, kind, tick_size, lot_size, min_qty, min_notional,
        maker_bps, taker_bps, status, display_name, listed_at
      ) VALUES (
        ${MARKET},
        'BTC/USDT-PERP',
        'BTC',
        'USDT',
        'futures',
        '0.01',
        '0.0001',
        '0.0001',
        '1',
        10,
        20,
        'active',
        'BTC perpetual',
        now()
      )
    `;
    await ledger.post(
      recipes.deposit({
        userId: ALICE,
        assetId: 'USDT',
        amount: amt('100000'),
        rail: 'test',
        railRef: `releverage-${Date.now()}`,
      }),
    );
  });

  afterAll(async () => {
    await db.drop();
  }, 30_000);

  describe('live isolated re-leverage money path', () => {
    it('in-cap 10×→5× posts extra isolated margin; wire amounts stay strings', async () => {
      feed('50000');
      const pos = await positions.open({
        clientOpenId: 't-live-releverage-in-cap',
        userId: ALICE,
        symbol: 'BTC/USDT-PERP',
        side: 'long',
        size: amt('1'),
        leverage: amt('10'),
      });
      expect(pos.leverage).toBe('10');
      expect(pos.initialMargin).toBe('5000');
      expect(formatAmount((await ledger.balance(userAvailable(ALICE, 'USDT'))).amount)).toBe('95000');

      const next = await positions.setLeverage({
        userId: ALICE,
        symbol: 'BTC/USDT-PERP',
        positionId: pos.id!,
        leverage: amt('5'),
        clientAdjustmentId: 'live-releverage-1',
      });
      expect(typeof next.leverage).toBe('string');
      expect(typeof next.initialMargin).toBe('string');
      expect(typeof next.collateral).toBe('string');
      expect(next.leverage).toBe('5');
      expect(next.initialMargin).toBe('10000');
      expect(next.collateral).toBe('10000');
      expect(formatAmount((await ledger.balance(userAvailable(ALICE, 'USDT'))).amount)).toBe('90000');
      expect(formatAmount((await ledger.balance(positionCollateralAccount(ALICE, 'USDT', pos.id!))).amount)).toBe('10000');
    });

    it('raising leverage toward the cap releases excess isolated margin', async () => {
      feed('50000');
      const pos = await positions.open({
        clientOpenId: 't-live-releverage-release',
        userId: ALICE,
        symbol: 'BTC/USDT-PERP',
        side: 'long',
        size: amt('1'),
        leverage: amt('5'),
      });
      expect(pos.initialMargin).toBe('10000');

      const next = await positions.setLeverage({
        userId: ALICE,
        symbol: 'BTC/USDT-PERP',
        positionId: pos.id!,
        leverage: amt('10'),
        clientAdjustmentId: 'live-releverage-release-1',
      });
      expect(next.leverage).toBe('10');
      expect(next.initialMargin).toBe('5000');
      expect(next.collateral).toBe('5000');
      expect(formatAmount((await ledger.balance(userAvailable(ALICE, 'USDT'))).amount)).toBe('95000');
      expect(formatAmount((await ledger.balance(positionCollateralAccount(ALICE, 'USDT', pos.id!))).amount)).toBe('5000');
    });
  });
}
