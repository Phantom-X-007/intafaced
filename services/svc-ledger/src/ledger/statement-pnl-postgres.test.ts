import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, rewriteSchemaSql, type TestDb } from '@intafaced/db';
import { parseAmount, railBoundary, userAvailable } from '@intafaced/ledger-client';
import { PostgresLedger } from './postgres-ledger.js';
import { STATEMENT_LOTS_MISSING, STATEMENT_NAV_INPUTS_MISSING } from './statement-pnl.js';
import { handleStatementPnlFromBook } from './statement-pnl-book.js';

/**
 * B5 money proof: a real book with posted cash still refuses statement PnL.
 * Lots/marks/NAV are not on this book. History amounts are not cost basis.
 *
 * H8a PG-hard: this file never `describe.skip` / `postgresAvailable`. CI uses
 * TEST_DATABASE_URL (per-run schema via `createTestDb`). Local without that env
 * starts Testcontainers `postgres:16-alpine`. Docker/PG down is a failed suite,
 * not a green skip.
 */

const here = dirname(fileURLToPath(import.meta.url));
const drizzleDir = join(here, '..', '..', 'drizzle');

const migrations = readdirSync(drizzleDir)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzleDir, f), 'utf8'))
  .map((body) => (schema: string) => rewriteSchemaSql(body, 'ledger', schema));

const OWNER = '77777777-7777-4777-8777-777777777777';

const H8A_IMAGE = 'postgres:16-alpine';

async function openH8aAdmin(): Promise<{ url: string; stop: () => Promise<void> }> {
  const envUrl = process.env.TEST_DATABASE_URL?.trim();
  if (envUrl) {
    return { url: envUrl, stop: async () => undefined };
  }

  try {
    const container = await new PostgreSqlContainer(H8A_IMAGE)
      .withDatabase('intafaced_h8a_test')
      .withUsername('intafaced')
      .withPassword('intafaced')
      .start();
    return {
      url: container.getConnectionUri(),
      stop: async () => {
        await container.stop();
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `H8a: ledger statement PnL is PG-hard (no skip-green). ` +
        `TEST_DATABASE_URL unset and Testcontainers could not start ${H8A_IMAGE}: ${msg}`,
    );
  }
}

describe('CARD B5 statement PnL PG-hard (source)', () => {
  it('H8a money suite is not skip-green (no postgresAvailable / describe.skip)', () => {
    const src = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    expect(src).not.toMatch(/\bpostgresAvailable\s*\(/);
    expect(src).not.toMatch(/describe\.skip\s*\(/);
    expect(src).not.toMatch(/\bit\.skip\s*\(/);
  });
});

describe('CARD B5 statement PnL on a posted book', () => {
  let adminStop: () => Promise<void> = async () => undefined;
  let db: TestDb | undefined;
  let engine: PostgresLedger;

  beforeAll(async () => {
    const admin = await openH8aAdmin();
    adminStop = admin.stop;
    db = await createTestDb({ service: 'ledger_statement_pnl', url: admin.url, migrations });
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
  }, 120_000);

  afterAll(async () => {
    await db?.drop();
    await adminStop();
  }, 30_000);

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
