/**
 * Position open/close against real trade schema + MemoryLedger.
 * Skips when TEST_DATABASE_URL_TRADE / default test DB unreachable.
 */
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import {
  MemoryLedger,
  formatAmount,
  houseFees,
  parseAmount as amt,
  positionCollateralAccount,
  recipes,
  userAvailable,
} from '@intafaced/ledger-client';
import { MemoryEventBus } from '@intafaced/events';
import { PositionService } from './position-service.js';
import { memoryMarkBook } from './mark-source.js';
import { formatAccountRef, profitSourceFromConfig, recipeProfitFundingAccount } from './profit-source.js';

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
/** Someone else entirely — used only to route seed value into the house pot. */
const BOB = '22222222-2222-4222-8222-222222222222';

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
  let marks: ReturnType<typeof memoryMarkBook>;

  /**
   * THE MARK FEED THE CALLER CANNOT REACH.
   *
   * Every price in this suite is set here, on the feed, and never passed to
   * `open()` or `close()` — because after
   * `docs/adr/2026-08-05-futures-risk-and-mark-law.md` neither method takes one.
   * A test that wants a different exit price moves the FEED, which is exactly
   * the distinction the ADR draws.
   */
  const NOW = new Date('2026-08-06T12:00:00.000Z');
  const MARKET = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  function feed(price: string, quality: 'index' | 'mid' | 'last' = 'mid', at: Date = NOW) {
    marks.set({ marketId: MARKET, price, quality, asOfMs: at.getTime() });
  }

  /** The pot realised profit is paid from — named, never defaulted. */
  const PROFIT_SOURCE = formatAccountRef(recipeProfitFundingAccount('USDT'));

  function build() {
    return new PositionService(sql, ledger, {
      marks: marks.source(),
      profitSource: profitSourceFromConfig(PROFIT_SOURCE),
      bus,
      now: () => NOW,
    });
  }

  /**
   * Fund the profit pot the way it actually fills: somebody else's realised
   * loss, drawn from margin they had really locked. Three real recipes, no
   * fixture poking a balance into place — so the ceiling these tests assert
   * against is a balance the ledger agrees exists.
   */
  async function fundProfitSource(amount: string) {
    const seedPosition = `pot-seed-${randomUUID()}`;
    await ledger.post(recipes.deposit({ userId: BOB, assetId: 'USDT', amount: amt(amount), rail: 'test', railRef: `pot-${randomUUID()}` }));
    await ledger.post(recipes.futuresMarginLock({ positionId: seedPosition, userId: BOB, assetId: 'USDT', amount: amt(amount) }));
    await ledger.post(
      recipes.futuresRealizeLoss({
        positionId: seedPosition,
        userId: BOB,
        assetId: 'USDT',
        fromMargin: amt(amount),
        fromInsurance: 0n,
        lossId: seedPosition,
      }),
    );
  }

  const profitPot = () => houseFees('trade', 'USDT');

  beforeEach(async () => {
    await sql`TRUNCATE trade.positions, trade.fills, trade.orders, trade.markets RESTART IDENTITY CASCADE`;
    ledger = new MemoryLedger();
    bus = new MemoryEventBus('svc-trade');
    marks = memoryMarkBook();
    positions = build();
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

  it('open prices from the feed, locks margin, and listOpen returns the row', async () => {
    feed('50000');
    const pos = await positions.open({
      userId: ALICE,
      symbol: 'BTC/USDT-PERP',
      side: 'long',
      size: amt('1'),
      leverage: amt('10'),
    });
    expect(pos.side).toBe('long');
    expect(pos.contracts).toBe('1');
    // The entry price came from the FEED, and it sized the margin.
    expect(pos.entryPrice).toBe('50000');
    expect(pos.initialMargin).toBe('5000');
    expect(formatAmount((await ledger.balance(userAvailable(ALICE, 'USDT'))).amount)).toBe('95000');
    expect(formatAmount((await ledger.balance(positionCollateralAccount(ALICE, 'USDT', pos.id!))).amount)).toBe('5000');

    const listed = await positions.listOpen(ALICE);
    expect(listed).toHaveLength(1);
    expect(listed[0]!.id).toBe(pos.id);
  });

  it('close releases margin and empties listOpen', async () => {
    feed('40000');
    const pos = await positions.open({
      userId: ALICE,
      symbol: 'BTC/USDT-PERP',
      side: 'short',
      size: amt('0.5'),
      leverage: amt('5'),
    });
    // margin = 0.5 * 40000 / 5 = 4000 — flat close, the feed has not moved.
    await positions.close(ALICE, pos.id!);
    expect(formatAmount((await ledger.balance(userAvailable(ALICE, 'USDT'))).amount)).toBe('100000');
    expect(await positions.listOpen(ALICE)).toEqual([]);
  });

  it('publishes positionUpdated on open and close (F4 private WS feed)', async () => {
    feed('50000');
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
      leverage: amt('10'),
    });
    await positions.close(ALICE, pos.id!);
    expect(seen).toEqual([
      { status: 'open', side: 'long' },
      { status: 'closed', side: 'long' },
    ]);
    // Also retained on the bus for idempotency inspection
    expect(bus.emitted('positionUpdated')).toHaveLength(2);
  });

  // ── D-S-01: a price that moves money is never supplied by the party it pays ──

  /**
   * The defect this branch closes, stated as a test.
   *
   * There is no longer any argument through which a caller can name their own
   * exit price, so the proof is that the PnL follows the feed and only the feed.
   * A trader who could name '60000' here would have taken 10000 USDT out of the
   * house pot; the feed says 50000, so they take nothing.
   */
  it('realised PnL follows the feed, and the caller has no argument to change it', async () => {
    feed('50000');
    const pos = await positions.open({
      userId: ALICE,
      symbol: 'BTC/USDT-PERP',
      side: 'long',
      size: amt('1'),
      leverage: amt('10'),
    });

    // `close` takes a user id and a position id. That is the whole signature.
    expect(positions.close.length).toBe(2);

    await positions.close(ALICE, pos.id!);
    // Flat: exactly the margin back, no profit conjured out of a named price.
    expect(formatAmount((await ledger.balance(userAvailable(ALICE, 'USDT'))).amount)).toBe('100000');
    expect(formatAmount((await ledger.balance(profitPot())).amount)).toBe('0');
  });

  it('a real move in the feed does pay out — the price is read, not ignored', async () => {
    feed('50000');
    await fundProfitSource('10000');
    const pos = await positions.open({
      userId: ALICE,
      symbol: 'BTC/USDT-PERP',
      side: 'long',
      size: amt('1'),
      leverage: amt('10'),
    });
    feed('51000');
    await positions.close(ALICE, pos.id!);
    // 100000 - 5000 margin + 5000 margin back + 1000 profit
    expect(formatAmount((await ledger.balance(userAvailable(ALICE, 'USDT'))).amount)).toBe('101000');
    expect(formatAmount((await ledger.balance(profitPot())).amount)).toBe('9000');
  });

  // ── D-S-07: a missing mark is not a zero mark ────────────────────────────────

  it('refuses to OPEN when the feed has no mark, and no margin is locked', async () => {
    const before = (await ledger.balance(userAvailable(ALICE, 'USDT'))).amount;
    await expect(
      positions.open({ userId: ALICE, symbol: 'BTC/USDT-PERP', side: 'long', size: amt('1'), leverage: amt('10') }),
    ).rejects.toMatchObject({ code: 'trade.mark_missing' });

    // Nothing moved, and no row was written.
    expect((await ledger.balance(userAvailable(ALICE, 'USDT'))).amount).toBe(before);
    expect(await positions.listOpen(ALICE)).toEqual([]);
  });

  /**
   * DONE BAR 4, the position half: a missing mark refuses to value, and the
   * position is still OPEN afterwards. A missing mark read as zero would have
   * valued this long at a total loss.
   */
  it('refuses to CLOSE when the feed goes dark, and the position survives untouched', async () => {
    feed('50000');
    const pos = await positions.open({
      userId: ALICE,
      symbol: 'BTC/USDT-PERP',
      side: 'long',
      size: amt('1'),
      leverage: amt('10'),
    });
    const afterOpen = (await ledger.balance(userAvailable(ALICE, 'USDT'))).amount;
    marks.clear(MARKET);

    await expect(positions.close(ALICE, pos.id!)).rejects.toMatchObject({ code: 'trade.mark_missing' });

    expect((await ledger.balance(userAvailable(ALICE, 'USDT'))).amount).toBe(afterOpen);
    expect(formatAmount((await ledger.balance(positionCollateralAccount(ALICE, 'USDT', pos.id!))).amount)).toBe('5000');
    const still = await positions.listOpen(ALICE);
    expect(still).toHaveLength(1);
    expect(still[0]!.id).toBe(pos.id);
  });

  it('refuses a mark stale past the marking limit rather than valuing on a memory', async () => {
    feed('50000');
    const pos = await positions.open({
      userId: ALICE,
      symbol: 'BTC/USDT-PERP',
      side: 'long',
      size: amt('1'),
      leverage: amt('10'),
    });
    feed('51000', 'mid', new Date(NOW.getTime() - 400_000));
    await expect(positions.close(ALICE, pos.id!)).rejects.toMatchObject({ code: 'trade.mark_unusable' });
    expect(await positions.listOpen(ALICE)).toHaveLength(1);
  });

  /**
   * The asymmetry, in the close path. A `last` mark is fine to show and not
   * fine to pay on — but it must not trap a trader in a losing position either.
   */
  it('refuses to pay PROFIT on a `last` mark, but still lets a losing position out on one', async () => {
    feed('50000');
    await fundProfitSource('10000');
    const winner = await positions.open({
      userId: ALICE,
      symbol: 'BTC/USDT-PERP',
      side: 'long',
      size: amt('1'),
      leverage: amt('10'),
    });

    feed('51000', 'last');
    await expect(positions.close(ALICE, winner.id!)).rejects.toMatchObject({ code: 'trade.mark_unusable' });
    expect(formatAmount((await ledger.balance(profitPot())).amount)).toBe('10000');
    expect(await positions.listOpen(ALICE)).toHaveLength(1);

    // The same mark quality, the other direction: the trader gets out.
    feed('49000', 'last');
    await positions.close(ALICE, winner.id!);
    expect(await positions.listOpen(ALICE)).toEqual([]);
    expect(formatAmount((await ledger.balance(userAvailable(ALICE, 'USDT'))).amount)).toBe('99000');
  });

  // ── The payout bound ─────────────────────────────────────────────────────────

  /**
   * A house account is not an insurance fund and a fee balance is not a risk
   * budget. The balance is the ceiling, and exceeding it refuses.
   */
  it('refuses a payout larger than the profit source, and nothing moves', async () => {
    feed('50000');
    await fundProfitSource('500');
    const pos = await positions.open({
      userId: ALICE,
      symbol: 'BTC/USDT-PERP',
      side: 'long',
      size: amt('1'),
      leverage: amt('10'),
    });
    const userBefore = (await ledger.balance(userAvailable(ALICE, 'USDT'))).amount;

    // +1000 of profit against a pot holding 500.
    feed('51000');
    await expect(positions.close(ALICE, pos.id!)).rejects.toMatchObject({ code: 'trade.profit_source_underfunded' });

    // THE BALANCES, not the exception. The pot is untouched, the trader's
    // available is untouched, the margin is still locked, the row is still open.
    expect(formatAmount((await ledger.balance(profitPot())).amount)).toBe('500');
    expect((await ledger.balance(userAvailable(ALICE, 'USDT'))).amount).toBe(userBefore);
    expect(formatAmount((await ledger.balance(positionCollateralAccount(ALICE, 'USDT', pos.id!))).amount)).toBe('5000');
    expect(await positions.listOpen(ALICE)).toHaveLength(1);
  });

  it('pays a profit exactly equal to the source balance — the bound is a ceiling, not a margin of safety', async () => {
    feed('50000');
    await fundProfitSource('1000');
    const pos = await positions.open({
      userId: ALICE,
      symbol: 'BTC/USDT-PERP',
      side: 'long',
      size: amt('1'),
      leverage: amt('10'),
    });
    feed('51000');
    await positions.close(ALICE, pos.id!);
    expect(formatAmount((await ledger.balance(profitPot())).amount)).toBe('0');
    expect(formatAmount((await ledger.balance(userAvailable(ALICE, 'USDT'))).amount)).toBe('101000');
  });

  it('the bound never blocks a losing close — a control that traps funds is not a control', async () => {
    feed('50000');
    const pos = await positions.open({
      userId: ALICE,
      symbol: 'BTC/USDT-PERP',
      side: 'long',
      size: amt('1'),
      leverage: amt('10'),
    });
    // Profit pot is empty. A loss does not draw on it.
    expect(formatAmount((await ledger.balance(profitPot())).amount)).toBe('0');
    feed('49000');
    await positions.close(ALICE, pos.id!);
    expect(formatAmount((await ledger.balance(userAvailable(ALICE, 'USDT'))).amount)).toBe('99000');
    expect(await positions.listOpen(ALICE)).toEqual([]);
  });

  /**
   * The second door. TypeScript already makes `'cross'` unrepresentable in
   * `OpenPositionInput`, so this test has to force it — which is the point: a
   * caller that is not TypeScript still cannot open a cross-margin position,
   * and no margin is locked on the way to finding that out.
   */
  it('refuses cross margin at the service, and locks nothing', async () => {
    feed('50000');
    const before = (await ledger.balance(userAvailable(ALICE, 'USDT'))).amount;
    await expect(
      positions.open({
        userId: ALICE,
        symbol: 'BTC/USDT-PERP',
        side: 'long',
        size: amt('1'),
        leverage: amt('10'),
        marginMode: 'cross' as unknown as 'isolated',
      }),
    ).rejects.toMatchObject({ code: 'trade.cross_margin_unsupported' });

    expect((await ledger.balance(userAvailable(ALICE, 'USDT'))).amount).toBe(before);
    expect(await positions.listOpen(ALICE)).toEqual([]);
  });

  it('opens isolated when the mode is omitted, and says so on the wire', async () => {
    feed('50000');
    const pos = await positions.open({ userId: ALICE, symbol: 'BTC/USDT-PERP', side: 'long', size: amt('1'), leverage: amt('10') });
    expect(pos.marginMode).toBe('isolated');
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
        leverage: amt('2'),
      }),
    ).rejects.toMatchObject({ code: 'trade.not_futures_market' });
  });
}
