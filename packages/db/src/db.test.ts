import { describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzleConfig, MIGRATION_CONVENTION } from './migrate.js';
import { isSerializationFailure } from './connection.js';
import { createTestDatabase, postgresAvailable, rewriteSchemaSql, sweepStaleTestSchemas } from './testing.js';

describe('drizzleConfig', () => {
  it('confines a service to its own Postgres schema', () => {
    const config = drizzleConfig({ schema: 'ledger' });
    expect(config.schemaFilter).toEqual(['ledger']);
    expect(config.dialect).toBe('postgresql');
  });

  it('defaults to the service role rather than a superuser', () => {
    const config = drizzleConfig({ schema: 'trade', url: undefined });
    const url = (config.dbCredentials as { url: string }).url;
    // Only meaningful when DATABASE_URL is unset, which is the case in CI.
    if (!process.env.DATABASE_URL) {
      expect(url).toContain('svc_trade');
    }
  });

  it('lets a service override paths without touching schema isolation', () => {
    const config = drizzleConfig({ schema: 'pay', schemaPath: './src/db/tables.ts', out: './migrations' });
    expect(config.schema).toBe('./src/db/tables.ts');
    expect(config.out).toBe('./migrations');
    expect(config.schemaFilter).toEqual(['pay']);
  });

  it('declares the reversible-migration convention CI checks for', () => {
    expect(MIGRATION_CONVENTION.downSuffix).toBe('.down.sql');
  });
});

describe('rewriteSchemaSql', () => {
  it('rewrites quoted and bare schema qualifiers for isolated test schemas', () => {
    const src = `
      CREATE TABLE "ledger"."accounts" (...);
      SELECT * FROM ledger.accounts WHERE kind = 'hold'::ledger.account_kind;
    `;
    const out = rewriteSchemaSql(src, 'ledger', 'test_ledger_1_2');
    expect(out).toContain('"test_ledger_1_2"."accounts"');
    expect(out).toContain('FROM test_ledger_1_2.accounts');
    expect(out).toContain("'hold'::test_ledger_1_2.account_kind");
    expect(out).not.toContain('"ledger"');
    expect(out).not.toMatch(/\bledger\./);
  });

  it('refuses unsafe identifiers', () => {
    expect(() => rewriteSchemaSql('x', 'ledger;drop', 'y')).toThrow(/Unsafe/);
  });
});

/**
 * The claim `createTestDatabase` exists to make is that two runs of the SAME
 * suite cannot see each other. Asserting it here, rather than only observing
 * that svc-trade stopped flaking, is what keeps it true: a regression that
 * quietly reused one database would still pass every service suite run alone.
 */
const ADMIN = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
/** Resolved once, at module scope: `describe` callbacks are synchronous. */
const live = await postgresAvailable(ADMIN);

describe('createTestDatabase', () => {
  it('refuses a service name that is not a safe identifier', async () => {
    await expect(createTestDatabase({ service: 'trade; DROP SCHEMA public' })).rejects.toThrow(/unsafe/i);
  });

  it.runIf(live)('gives two concurrent runs of one service separate databases', async () => {
    const [a, b] = await Promise.all([
      createTestDatabase({ service: 'trade', url: ADMIN, migrations: ['CREATE TABLE trade.t (id int primary key)'] }),
      createTestDatabase({ service: 'trade', url: ADMIN, migrations: ['CREATE TABLE trade.t (id int primary key)'] }),
    ]);

    try {
      // The schema keeps its REAL name in both — that is the whole point, and it
      // is why schema-qualified production SQL runs unchanged.
      expect(a.schema).toBe('trade');
      expect(b.schema).toBe('trade');

      // The DATABASE is what differs, and both are quarantined by name.
      expect(a.database).not.toBe(b.database);
      for (const db of [a, b]) {
        expect(db.database).toMatch(/^itf_run_trade_\d+_\d+_[a-z0-9]+_test$/);
        expect(db.database.endsWith('_test')).toBe(true);
      }

      // The failure this replaces: A truncating B's rows mid-test.
      await a.sql`INSERT INTO trade.t (id) VALUES (1)`;
      await b.sql`INSERT INTO trade.t (id) VALUES (1)`; // same PK, no conflict
      await a.truncateAll();

      expect(await a.sql`SELECT id FROM trade.t`).toHaveLength(0);
      expect(await b.sql`SELECT id FROM trade.t`).toHaveLength(1);
    } finally {
      await Promise.all([a.drop(), b.drop()]);
    }
  });

  it.runIf(live)('drops its database on drop(), leaving nothing behind', async () => {
    const db = await createTestDatabase({ service: 'trade', url: ADMIN });
    const admin = postgres(ADMIN, { max: 1, onnotice: () => undefined });
    try {
      const before = await admin`SELECT 1 FROM pg_database WHERE datname = ${db.database}`;
      expect(before).toHaveLength(1);

      await db.drop();

      const after = await admin`SELECT 1 FROM pg_database WHERE datname = ${db.database}`;
      expect(after).toHaveLength(0);
    } finally {
      await admin.end({ timeout: 5 });
    }
  });

  it.runIf(live)('sweeps only what it can date — a fresh schema is never collected', async () => {
    const admin = postgres(ADMIN, { max: 1, onnotice: () => undefined });
    const unstamped = `test_sweepprobe_${process.pid}_1`;
    try {
      await admin.unsafe(`CREATE SCHEMA "${unstamped}"`);

      // staleAfterMs 0 makes EVERYTHING old enough; survival therefore proves the
      // stamp requirement, not merely that the clock has not advanced.
      const dropped = await sweepStaleTestSchemas(admin, 0);

      expect(dropped).not.toContain(unstamped);
      const still = await admin`SELECT 1 FROM pg_namespace WHERE nspname = ${unstamped}`;
      expect(still).toHaveLength(1);
    } finally {
      await admin.unsafe(`DROP SCHEMA IF EXISTS "${unstamped}" CASCADE`).catch(() => undefined);
      await admin.end({ timeout: 5 });
    }
  });
});

describe('serialization failures', () => {
  it('recognises the codes worth retrying', () => {
    expect(isSerializationFailure({ code: '40001' })).toBe(true); // serialization_failure
    expect(isSerializationFailure({ code: '40P01' })).toBe(true); // deadlock_detected
  });

  it('does not retry a genuine constraint violation', () => {
    expect(isSerializationFailure({ code: '23505' })).toBe(false); // unique_violation
    expect(isSerializationFailure({ code: '23514' })).toBe(false); // check_violation
    expect(isSerializationFailure(new Error('boom'))).toBe(false);
    expect(isSerializationFailure(null)).toBe(false);
    expect(isSerializationFailure(undefined)).toBe(false);
  });
});
