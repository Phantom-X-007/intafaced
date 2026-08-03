/**
 * Position open/close against real trade schema + MemoryLedger.
 * Skips when TEST_DATABASE_URL_TRADE / default test DB unreachable.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import {
  MemoryLedger,
  formatAmount,
  parseAmount as amt,
  positionCollateralAccount,
  recipes,
  userAvailable,
} from '@intafaced/ledger-client';
import { MemoryEventBus } from '@intafaced/events';
import { PositionService } from './position-service.js';

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

const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('PositionService (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'trade', url: URL, migrations });
  const sql = db.sql;

  let ledger: MemoryLedger;
  let bus: MemoryEventBus;
  let positions: PositionService;

  beforeEach(async () => {
    await sql`TRUNCATE trade.positions, trade.fills, trade.orders, trade.markets RESTART IDENTITY CASCADE`;
    ledger = new MemoryLedger();
    bus = new MemoryEventBus('svc-trade');
    positions = new PositionService(sql, ledger, bus);
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

  /**
   * 30s, not vitest's default 10s. Dropping a DATABASE is heavier than closing a
   * pool, and when several suite files tear down at the same moment Postgres
   * serialises the drops. The work still finishes well inside this; the default
   * was sized for `sql.end()`, which is all this hook used to do.
   */
  afterAll(async () => {
    await db.drop();
  }, 30_000);

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
    // margin = 0.5 * 40000 / 5 = 4000 — flat close at entry (no invent PnL)
    await positions.close(ALICE, pos.id!, '40000');
    expect(formatAmount((await ledger.balance(userAvailable(ALICE, 'USDT'))).amount)).toBe('100000');
    expect(await positions.listOpen(ALICE)).toEqual([]);
  });

  it('refuses close without exitPrice (never invent)', async () => {
    const pos = await positions.open({
      userId: ALICE,
      symbol: 'BTC/USDT-PERP',
      side: 'long',
      size: amt('1'),
      entryPrice: amt('50000'),
      leverage: amt('10'),
    });
    await expect(positions.close(ALICE, pos.id!, '')).rejects.toMatchObject({
      code: 'trade.exit_price_required',
    });
  });

  it('publishes positionUpdated on open and close (F4 private WS feed)', async () => {
    const seen: Array<{ status: string; side: string }> = [];
    await bus.subscribe(
      'positionUpdated',
      async (payload) => {
        seen.push({ status: payload.status, side: payload.side });
      },
      { durable: 'test-position-updated' },
    );
    const pos = await positions.open({
      userId: ALICE,
      symbol: 'BTC/USDT-PERP',
      side: 'long',
      size: amt('1'),
      entryPrice: amt('50000'),
      leverage: amt('10'),
    });
    await positions.close(ALICE, pos.id!, '50000');
    expect(seen).toEqual([
      { status: 'open', side: 'long' },
      { status: 'closed', side: 'long' },
    ]);
    // Also retained on the bus for idempotency inspection
    expect(bus.emitted('positionUpdated')).toHaveLength(2);
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
