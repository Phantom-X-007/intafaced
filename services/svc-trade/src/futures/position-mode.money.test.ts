/**
 * CARD F6 money proof — hedge / one-way position mode (PTX-M10-R07).
 *
 * Hitch: installPositionMode wraps open/place before futuresMarginLock / orderHold.
 * Live boot: ledger-client.ts loads the mill next to F5. No flatten. matching/
 * and router.ts not recut. Not a redo of F5/#3742.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { MemoryEventBus } from '@intafaced/events';
import { MemoryLedger, formatAmount, parseAmount as amt, recipes, userAvailable } from '@intafaced/ledger-client';
import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { TEST_MAX_LEVERAGE_AMOUNT } from './initial-margin.test-harness.js';
import { memoryMarkBook } from './mark-source.js';
import { PositionService, type OpenPositionInput } from './position-service.js';
import { formatAccountRef, profitSourceFromConfig, recipeProfitFundingAccount } from './profit-source.js';
import {
  POSITION_MODE_MIGRATION_BLOCKED,
  POSITION_MODE_UNSET,
  POSITION_MODE_UNSUPPORTED,
  POSITION_SIDE_UNSUPPORTED,
  checkOrderSideForPositionMode,
  checkPositionMode,
  checkPositionModeMigration,
  installPositionMode,
} from './position-mode.js';

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const drizzle = join(here, '..', '..', 'drizzle');
const matchingRoot = join(here, '..', '..', '..', 'svc-matching');
const migrations = readdirSync(drizzle)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzle, f), 'utf8'));

const ALICE = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-09-03T00:00:00.000Z');
const MARKET = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PROFIT_SOURCE = formatAccountRef(recipeProfitFundingAccount('USDT'));
const OWNER_PUBLISHED_F5 = { maxOrder: '3', maxPosition: '5', maxLoss: '8' } as const;

function setCreditEnv(): void {
  process.env.TRADE_MAX_ORDER = OWNER_PUBLISHED_F5.maxOrder;
  process.env.TRADE_MAX_POSITION = OWNER_PUBLISHED_F5.maxPosition;
  process.env.TRADE_MAX_LOSS = OWNER_PUBLISHED_F5.maxLoss;
}

installPositionMode();

describe('position-mode hitch (source) — no flatten, matching not recut', () => {
  it('position-mode.ts has no flatten and refuses unset', () => {
    const mill = readFileSync(join(here, 'position-mode.ts'), 'utf8');
    expect(mill).toMatch(/checkPositionMode/);
    expect(mill).toMatch(/checkPositionModeMigration/);
    expect(mill).toMatch(/checkOrderSideForPositionMode/);
    expect(mill).toMatch(/origOpen\.call/);
    expect(mill).toMatch(/origPlace\.call/);
    expect(mill).toMatch(/will not invent a flatten/);
    expect(mill).not.toMatch(/planClose/);
    expect(mill).not.toMatch(/closeAll/);
    expect(mill).not.toMatch(/cancelAll/);
    const openStart = mill.indexOf('export function installPositionModeOpen');
    const placeStart = mill.indexOf('export function installPositionModePlace');
    expect(openStart).toBeGreaterThan(-1);
    expect(placeStart).toBeGreaterThan(openStart);
    const openFn = mill.slice(openStart, placeStart);
    expect(openFn.indexOf('parsePositionMode')).toBeGreaterThan(-1);
    expect(openFn.indexOf('parsePositionMode')).toBeLessThan(openFn.indexOf('origOpen.call'));
  });

  it('router.ts / matching / position-service.ts / trade-service.ts / index.ts not recut', () => {
    const routerSrc = readFileSync(join(here, '..', 'router.ts'), 'utf8');
    const posSrc = readFileSync(join(here, 'position-service.ts'), 'utf8');
    const tradeSrc = readFileSync(join(here, '..', 'spot', 'trade-service.ts'), 'utf8');
    const indexSrc = readFileSync(join(here, '..', 'index.ts'), 'utf8');
    expect(routerSrc).not.toMatch(/position-mode/);
    expect(routerSrc).not.toMatch(/position_mode_unset/);
    expect(posSrc).not.toMatch(/position-mode/);
    expect(posSrc).not.toMatch(/position_mode_unset/);
    expect(tradeSrc).not.toMatch(/position-mode/);
    expect(tradeSrc).not.toMatch(/position_mode_unset/);
    expect(indexSrc).not.toMatch(/position-mode/);
    expect(indexSrc).not.toMatch(/installPositionMode/);
    const matchingFiles = readdirSync(matchingRoot, { recursive: true, encoding: 'utf8' }) as string[];
    expect(matchingFiles.some((f) => f.includes('position-mode'))).toBe(false);
  });

  it('live boot hitch next to F5; F5 mill not recut', () => {
    const indexSrc = readFileSync(join(here, '..', 'index.ts'), 'utf8');
    const boot = readFileSync(join(here, '..', 'ledger-client.ts'), 'utf8');
    const f5 = readFileSync(join(here, 'pretrade-credit.ts'), 'utf8');
    expect(indexSrc).toMatch(/ledger-client/);
    expect(boot).toMatch(/installPreTradeCredit/);
    expect(boot).toMatch(/installPositionMode/);
    expect(boot).toMatch(/position-mode/);
    expect(f5).not.toMatch(/position-mode/);
  });
});

describe('position-mode mill (hermetic)', () => {
  it('unset / blank refuse; unknown is unsupported', () => {
    expect(checkPositionMode(undefined)).toMatchObject({ ok: false, code: POSITION_MODE_UNSET });
    expect(checkPositionMode(null)).toMatchObject({ ok: false, code: POSITION_MODE_UNSET });
    expect(checkPositionMode('')).toMatchObject({ ok: false, code: POSITION_MODE_UNSET });
    expect(checkPositionMode('dual')).toMatchObject({ ok: false, code: POSITION_MODE_UNSUPPORTED });
    expect(checkPositionMode('one_way')).toEqual({ ok: true, mode: 'one_way' });
    expect(checkPositionMode('hedge')).toEqual({ ok: true, mode: 'hedge' });
  });

  it('migration with open orders or positions refuses; mill does not flatten', () => {
    expect(
      checkPositionModeMigration({
        from: 'one_way',
        to: 'hedge',
        openOrderCount: 1,
        openPositionCount: 0,
      }),
    ).toMatchObject({ ok: false, code: POSITION_MODE_MIGRATION_BLOCKED });
    expect(
      checkPositionModeMigration({
        from: 'hedge',
        to: 'one_way',
        openOrderCount: 0,
        openPositionCount: 2,
      }),
    ).toMatchObject({ ok: false, code: POSITION_MODE_MIGRATION_BLOCKED });
    expect(
      checkPositionModeMigration({
        from: 'one_way',
        to: undefined,
        openOrderCount: 0,
        openPositionCount: 0,
      }),
    ).toMatchObject({ ok: false, code: POSITION_MODE_UNSET });
    expect(
      checkPositionModeMigration({
        from: 'one_way',
        to: 'hedge',
        openOrderCount: 0,
        openPositionCount: 0,
      }),
    ).toEqual({ ok: true, mode: 'hedge' });
  });

  it('order-side: hedge requires positionSide; one_way omitted or matching net', () => {
    expect(checkOrderSideForPositionMode({ mode: 'hedge', side: 'buy' })).toMatchObject({
      ok: false,
      code: POSITION_SIDE_UNSUPPORTED,
    });
    expect(checkOrderSideForPositionMode({ mode: 'hedge', side: 'buy', positionSide: 'long' })).toEqual({
      ok: true,
      mode: 'hedge',
    });
    expect(checkOrderSideForPositionMode({ mode: 'hedge', side: 'sell', positionSide: 'short' })).toEqual({
      ok: true,
      mode: 'hedge',
    });
    expect(checkOrderSideForPositionMode({ mode: 'one_way', side: 'long' })).toEqual({ ok: true, mode: 'one_way' });
    expect(checkOrderSideForPositionMode({ mode: 'one_way', side: 'buy', positionSide: 'long' })).toEqual({
      ok: true,
      mode: 'one_way',
    });
    expect(checkOrderSideForPositionMode({ mode: 'one_way', side: 'buy', positionSide: 'short' })).toMatchObject({
      ok: false,
      code: POSITION_SIDE_UNSUPPORTED,
    });
    expect(checkOrderSideForPositionMode({ mode: 'one_way', side: 'buy', positionSide: 'both' })).toMatchObject({
      ok: false,
      code: POSITION_SIDE_UNSUPPORTED,
    });
  });
});

const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('svc-trade position-mode F6 money (Postgres unavailable — start docker compose)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'trade', url: URL, migrations });
  const sql = db.sql;

  describe('svc-trade position-mode F6 money', () => {
    let ledger: MemoryLedger;
    let bus: MemoryEventBus;
    let positions: PositionService;
    let marks: ReturnType<typeof memoryMarkBook>;

    const lockPosts = () => ledger.journal().filter((tx) => tx.reason === 'futures.margin.lock');
    const avail = async () => formatAmount((await ledger.balance(userAvailable(ALICE, 'USDT'))).amount);

    async function open(extra: Record<string, unknown> = {}) {
      const input = {
        clientOpenId: String(extra.clientOpenId ?? 'f6-open'),
        userId: ALICE,
        symbol: 'BTC/USDT-PERP',
        side: 'long' as const,
        size: amt('1'),
        leverage: amt('10'),
        ...extra,
      };
      return positions.open(input as OpenPositionInput);
    }

    beforeEach(async () => {
      setCreditEnv();
      await sql`TRUNCATE trade.positions, trade.fills, trade.orders, trade.markets RESTART IDENTITY CASCADE`;
      ledger = new MemoryLedger();
      bus = new MemoryEventBus('svc-trade');
      marks = memoryMarkBook();
      positions = new PositionService(sql, ledger, {
        marks: marks.source(),
        profitSource: profitSourceFromConfig(PROFIT_SOURCE),
        maxLeverage: TEST_MAX_LEVERAGE_AMOUNT,
        bus,
        now: () => NOW,
      });
      marks.set({ marketId: MARKET, price: '50000', quality: 'mid', asOfMs: NOW.getTime() });
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
          railRef: `f6-${Math.random()}`,
        }),
      );
    });

    afterAll(async () => {
      await db.drop();
    }, 30_000);

    it('unset position mode refuses open before futuresMarginLock; zero lock posts', async () => {
      await expect(open({ clientOpenId: 'f6-unset' })).rejects.toMatchObject({
        name: 'FuturesError',
        code: POSITION_MODE_UNSET,
        status: 400,
      });
      expect(lockPosts()).toHaveLength(0);
      expect(await sql`SELECT id FROM trade.positions`).toHaveLength(0);
      expect(await avail()).toBe('100000');
    });

    it('hedge without positionSide refuses; zero lock posts', async () => {
      await expect(open({ clientOpenId: 'f6-hedge-noside', positionMode: 'hedge' })).rejects.toMatchObject({
        name: 'FuturesError',
        code: POSITION_SIDE_UNSUPPORTED,
      });
      expect(lockPosts()).toHaveLength(0);
      expect(await sql`SELECT id FROM trade.positions`).toHaveLength(0);
    });

    it('explicit one_way admits open — no flatten', async () => {
      const pos = await open({ clientOpenId: 'f6-one-way', positionMode: 'one_way' });
      expect(pos.side).toBe('long');
      expect(lockPosts()).toHaveLength(1);
      expect(await sql`SELECT id FROM trade.positions`).toHaveLength(1);
    });
  });
}
