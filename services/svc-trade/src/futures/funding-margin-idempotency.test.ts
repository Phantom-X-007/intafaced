/**
 * A FUNDING PERIOD MOVES A POSITION'S MARGIN EXACTLY ONCE.
 *
 * `runFundingTick` posts to the ledger, applies the margin nets, and only then
 * marks the period settled. The settle marker is written LAST, so a restart in
 * that gap leaves the period unsettled and the next tick re-runs everything
 * above it. The ledger dedupes on its own key and moves no money twice.
 * `margin_current` had no such key, and a bare decrement replayed is a trader's
 * margin charged twice for one funding period — liquidating early, releasing
 * short, and clamped at zero by GREATEST so nothing raised.
 *
 * This suite replays the applier against a real database and asserts the second
 * pass is a no-op. Against a mock it would only assert that statements were
 * issued, which is what the existing tick-stores suite does and why this needed
 * its own file.
 *
 * Skips when Postgres is unreachable; runs in CI.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { parseAmount as amt } from '@intafaced/ledger-client';
import { sqlFundingMarginApplier } from './tick-stores.js';

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const drizzle = join(here, '..', '..', 'drizzle');
const migrations = readdirSync(drizzle)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzle, f), 'utf8'));

const MARKET = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ALICE = '11111111-1111-4111-8111-111111111111';
const PERIOD = 'BTC/USDT-PERP:2026-08-08T00:00:00.000Z';

const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('funding margin idempotency (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  /**
   * `service: 'trade'` — the schema must be named `trade`, because every
   * statement in this service is schema-qualified (`trade.positions`) by §2
   * design. Isolation is at the DATABASE level: `createTestDatabase` mints a
   * uniquely named database per run and creates the schema under its real name
   * inside it, so two suites both asking for `trade` never meet.
   */
  const db: TestDatabase = await createTestDatabase({ service: 'trade', url: URL, migrations });
  const sql = db.sql;
  const applier = sqlFundingMarginApplier(sql);

  afterAll(async () => {
    await db.drop();
  });

  /** One open position with 100 margin, and nothing else. */
  async function openPosition(): Promise<string> {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO trade.positions (
        user_id, market_id, side, status, margin_mode, size, entry_price, leverage,
        margin_initial, margin_current, margin_asset, funding_paid
      ) VALUES (
        ${ALICE}, ${MARKET}, 'long', 'open', 'isolated', '1', '50000', '5',
        '100', '100', 'USDT', '0'
      )
      RETURNING id
    `;
    return row!.id;
  }

  async function readPosition(id: string) {
    const [row] = await sql<{ margin_current: string; funding_paid: string }[]>`
      SELECT margin_current, funding_paid FROM trade.positions WHERE id = ${id}
    `;
    return row!;
  }

  beforeEach(async () => {
    await sql`TRUNCATE trade.positions, trade.fills, trade.orders, trade.markets RESTART IDENTITY CASCADE`;
    await sql`
      INSERT INTO trade.markets (
        id, symbol, base_asset, quote_asset, kind, tick_size, lot_size, min_qty, min_notional,
        maker_bps, taker_bps, status, display_name, listed_at
      ) VALUES (
        ${MARKET}, 'BTC/USDT-PERP', 'BTC', 'USDT', 'futures',
        '0.01', '0.0001', '0.0001', '1', 10, 20, 'listed', 'BTC Perpetual', now()
      )
    `;
  });

  describe('a payer charged twice for one period', () => {
    it('THE DEFECT: replaying the same period does not charge margin again', async () => {
      const id = await openPosition();

      await applier.applyFundingNets([{ positionId: id, paid: amt('5') }], PERIOD);
      expect(Number((await readPosition(id)).margin_current)).toBe(95);

      // The restart. Period was never marked settled, so the tick runs again.
      await applier.applyFundingNets([{ positionId: id, paid: amt('5') }], PERIOD);

      const after = await readPosition(id);
      expect(Number(after.margin_current)).toBe(95);
      expect(Number(after.funding_paid)).toBe(5);
    });

    it('a genuinely new period still charges', async () => {
      const id = await openPosition();

      await applier.applyFundingNets([{ positionId: id, paid: amt('5') }], PERIOD);
      await applier.applyFundingNets([{ positionId: id, paid: amt('5') }], `${PERIOD}-next`);

      const after = await readPosition(id);
      expect(Number(after.margin_current)).toBe(90);
      expect(Number(after.funding_paid)).toBe(10);
    });

    it('records what was applied, signed, rather than leaving it to be inferred', async () => {
      const id = await openPosition();
      await applier.applyFundingNets([{ positionId: id, paid: amt('5') }], PERIOD);

      const rows = await sql<{ period_id: string; paid: string }[]>`
        SELECT period_id, paid FROM trade.position_funding_applied WHERE position_id = ${id}
      `;
      expect(rows).toHaveLength(1);
      expect(rows[0]!.period_id).toBe(PERIOD);
      expect(Number(rows[0]!.paid)).toBe(5);
    });
  });

  describe('a payee receiving funding', () => {
    it('does not double-credit on replay either', async () => {
      const id = await openPosition();

      await applier.applyFundingNets([{ positionId: id, paid: -amt('5') }], PERIOD);
      await applier.applyFundingNets([{ positionId: id, paid: -amt('5') }], PERIOD);

      const after = await readPosition(id);
      // Receipts go to available, not back into margin — margin is untouched.
      expect(Number(after.margin_current)).toBe(100);
      expect(Number(after.funding_paid)).toBe(-5);
    });

    it('records the receipt as negative', async () => {
      const id = await openPosition();
      await applier.applyFundingNets([{ positionId: id, paid: -amt('5') }], PERIOD);

      const [row] = await sql<{ paid: string }[]>`
        SELECT paid FROM trade.position_funding_applied WHERE position_id = ${id}
      `;
      expect(Number(row!.paid)).toBe(-5);
    });
  });

  describe('the edges the guard must not break', () => {
    it('a zero net writes nothing at all', async () => {
      const id = await openPosition();
      await applier.applyFundingNets([{ positionId: id, paid: 0n }], PERIOD);

      const rows = await sql`SELECT 1 FROM trade.position_funding_applied WHERE position_id = ${id}`;
      expect(rows).toHaveLength(0);
      expect(Number((await readPosition(id)).margin_current)).toBe(100);
    });

    it('two positions in one period are independent', async () => {
      const a = await openPosition();
      const b = await openPosition();

      await applier.applyFundingNets(
        [
          { positionId: a, paid: amt('5') },
          { positionId: b, paid: -amt('5') },
        ],
        PERIOD,
      );

      expect(Number((await readPosition(a)).margin_current)).toBe(95);
      expect(Number((await readPosition(b)).margin_current)).toBe(100);
      expect(Number((await readPosition(b)).funding_paid)).toBe(-5);
    });

    it('closing the position takes its funding trail with it', async () => {
      const id = await openPosition();
      await applier.applyFundingNets([{ positionId: id, paid: amt('5') }], PERIOD);

      await sql`DELETE FROM trade.positions WHERE id = ${id}`;
      const rows = await sql`SELECT 1 FROM trade.position_funding_applied WHERE position_id = ${id}`;
      expect(rows).toHaveLength(0);
    });
  });
}
