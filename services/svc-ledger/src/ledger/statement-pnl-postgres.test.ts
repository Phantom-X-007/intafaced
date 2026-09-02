import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, postgresAvailable, rewriteSchemaSql, type TestDb } from '@intafaced/db';
import { parseAmount, railBoundary, userAvailable } from '@intafaced/ledger-client';
import { PostgresLedger } from './postgres-ledger.js';
import { STATEMENT_LOTS_MISSING, STATEMENT_NAV_INPUTS_MISSING } from './statement-pnl.js';
import { handleStatementPnlFromBook } from './statement-pnl-book.js';

/**
 * B5 money proof: a real book with posted cash still refuses statement PnL.
 * Lots/marks/NAV are not on this book. History amounts are not cost basis.
 */

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const drizzleDir = join(here, '..', '..', 'drizzle');

const migrations = readdirSync(drizzleDir)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzleDir, f), 'utf8'))
  .map((body) => (schema: string) => rewriteSchemaSql(body, 'ledger', schema));

const OWNER = '77777777-7777-4777-8777-777777777777';

const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('CARD B5 statement PnL (Postgres unavailable — start docker compose)', () => {
    it('skipped', () => undefined);
  });
} else {
  describe('CARD B5 statement PnL on a posted book', () => {
    let db: TestDb;
    let engine: PostgresLedger;

    beforeAll(async () => {
      db = await createTestDb({ service: 'ledger_statement_pnl', url: URL, migrations });
      engine = new PostgresLedger(db.sql);
      await engine.post({
        idempotencyKey: 'b5-deposit-1',
        module: 'bank',
        reason: 'bank.transfer.in',
        entries: [
          { account: userAvailable(OWNER, 'USDT'), direction: 'debit', amount: parseAmount('40.25') },
          { account: railBoundary('crypto-native', 'USDT'), direction: 'credit', amount: parseAmount('40.25') },
        ],
      });
    });

    afterAll(async () => {
      await db?.drop();
    });

    it('refuses missing lots/marks/NAV after a real deposit — never 0, never cash as NAV', async () => {
      const out = await handleStatementPnlFromBook(engine, {
        ownerType: 'user',
        ownerId: OWNER,
        reportingAssetId: 'USDT',
      });
      expect(out.status).toBe('refused');
      expect(out.codes).toContain(STATEMENT_LOTS_MISSING);
      expect(out.codes).toContain(STATEMENT_NAV_INPUTS_MISSING);
      expect(out.realized).toBeNull();
      expect(out.unrealized).toBeNull();
      expect(out.nav).toBeNull();
      expect(JSON.stringify(out)).not.toMatch(/"0"/);
      expect(JSON.stringify(out)).not.toMatch(/40\.25/);
    });
  });
}
