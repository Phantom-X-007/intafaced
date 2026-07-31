/**
 * Position open/close against real trade schema + MemoryLedger.
 * Skips when TEST_DATABASE_URL_TRADE / default test DB unreachable.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { assertTestDatabase } from '@intafaced/db';
import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import {
  MemoryLedger,
  formatAmount,
  parseAmount as amt,
  positionCollateralAccount,
  recipes,
  userAvailable,
} from '@intafaced/ledger-client';
import { PositionService } from './position-service.js';

const URL = process.env.TEST_DATABASE_URL_TRADE ?? 'postgres://svc_trade:svc_trade@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const drizzle = join(here, '..', '..', 'drizzle');
const migrations = readdirSync(drizzle)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzle, f), 'utf8'));

const ALICE = '11111111-1111-4111-8111-111111111111';

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
  describe.skip('PositionService (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  const sql = postgres(URL, {
    max: 4,
    connection: { search_path: 'trade,public', application_name: 'svc-trade-futures-test' },
    onnotice: () => undefined,
  });
  await assertTestDatabase(sql, 'svc-trade');
  for (const migration of migrations) await sql.unsafe(migration);

  let ledger: MemoryLedger;
  let positions: PositionService;

  beforeEach(async () => {
    await sql`TRUNCATE trade.positions, trade.fills, trade.orders, trade.markets RESTART IDENTITY CASCADE`;
    ledger = new MemoryLedger();
    positions = new PositionService(sql, ledger);
    await sql`
      INSERT INTO trade.markets (
        id, symbol, base_asset, quote_asset, kind, tick_size, lot_size, min_qty, min_notional,
        maker_bps, taker_bps, status, display_name, listed_at
      ) VALUES (
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
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
        railRef: `fund-${Math.random()}`,
      }),
    );
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  it('open locks margin and listOpen returns the row', async () => {
    const pos = await positions.open({
      userId: ALICE,
      symbol: 'BTC/USDT-PERP',
      side: 'long',
      size: amt('1'),
      entryPrice: amt('50000'),
      leverage: amt('10'),
    });
    expect(pos.side).toBe('long');
    expect(pos.contracts).toBe('1');
    expect(pos.initialMargin).toBe('5000');
    expect(formatAmount((await ledger.balance(userAvailable(ALICE, 'USDT'))).amount)).toBe('95000');
    expect(formatAmount((await ledger.balance(positionCollateralAccount(ALICE, 'USDT', pos.id!))).amount)).toBe('5000');

    const listed = await positions.listOpen(ALICE);
    expect(listed).toHaveLength(1);
    expect(listed[0]!.id).toBe(pos.id);
  });

  it('close releases margin and empties listOpen', async () => {
    const pos = await positions.open({
      userId: ALICE,
      symbol: 'BTC/USDT-PERP',
      side: 'short',
      size: amt('0.5'),
      entryPrice: amt('40000'),
      leverage: amt('5'),
    });
    // margin = 0.5 * 40000 / 5 = 4000
    await positions.close(ALICE, pos.id!);
    expect(formatAmount((await ledger.balance(userAvailable(ALICE, 'USDT'))).amount)).toBe('100000');
    expect(await positions.listOpen(ALICE)).toEqual([]);
  });

  it('refuses spot market as futures open', async () => {
    await sql`
      INSERT INTO trade.markets (
        id, symbol, base_asset, quote_asset, kind, tick_size, lot_size, min_qty, min_notional,
        maker_bps, taker_bps, status, display_name, listed_at
      ) VALUES (
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        'ETH/USDT',
        'ETH',
        'USDT',
        'spot',
        '0.01',
        '0.0001',
        '0.0001',
        '1',
        10,
        20,
        'active',
        'ETH spot',
        now()
      )
    `;
    await expect(
      positions.open({
        userId: ALICE,
        symbol: 'ETH/USDT',
        side: 'long',
        size: amt('1'),
        entryPrice: amt('3000'),
        leverage: amt('2'),
      }),
    ).rejects.toMatchObject({ code: 'trade.not_futures_market' });
  });
}
