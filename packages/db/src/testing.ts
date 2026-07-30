import postgres from 'postgres';

/**
 * Test database harness (§1 Testing: "drizzle test DB").
 *
 * Each test run gets its own Postgres schema, created from the service's
 * migrations and dropped afterwards. Tests therefore run in parallel without
 * sharing state, and a test that corrupts a book cannot leak into the next one.
 */

/** Static SQL, or a factory that rewrites fully-qualified names to the unique schema. */
export type TestMigration = string | ((schema: string) => string);

export interface TestDbOptions {
  /** The service under test, e.g. 'ledger'. */
  service: string;
  url?: string;
  /** Applied in order to build the schema. Usually the service's migrations. */
  migrations?: readonly TestMigration[];
}

export interface TestDb {
  readonly url: string;
  readonly schema: string;
  readonly sql: postgres.Sql;
  truncateAll(): Promise<void>;
  drop(): Promise<void>;
}

let counter = 0;

const SAFE_IDENT = /^[a-z][a-z0-9_]*$/i;

export async function createTestDb(options: TestDbOptions): Promise<TestDb> {
  const url = options.url ?? process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';

  const schema = `test_${options.service}_${process.pid}_${++counter}`;
  if (!SAFE_IDENT.test(schema)) {
    throw new Error(`Refusing to create test schema with unsafe name: ${schema}`);
  }

  const admin = postgres(url, { max: 1, onnotice: () => undefined });

  /**
   * Guard before the first DDL. `createTestDb` gives each run its own *schema*,
   * which isolates suites from each other — but it says nothing about which
   * *database* those schemas are created and dropped in. Pointed at the shared
   * `intafaced`, it happily creates and drops schemas inside the database the
   * running fleet uses. Schema isolation and database isolation are different
   * properties and only one of them was ever enforced here.
   */
  await assertTestDatabase(admin, `createTestDb(${options.service})`);

  await admin.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.unsafe(`CREATE SCHEMA "${schema}"`);

  const sql = postgres(url, {
    max: 4,
    connection: { search_path: `${schema},public`, application_name: schema },
    onnotice: () => undefined,
  });

  for (const migration of options.migrations ?? []) {
    const body = typeof migration === 'function' ? migration(schema) : migration;
    await sql.unsafe(body);
  }

  return {
    url,
    schema,
    sql,
    truncateAll: async () => {
      const tables = await sql<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_tables WHERE schemaname = ${schema}
      `;
      if (tables.length === 0) return;
      const list = tables.map((t) => `"${schema}"."${t.tablename}"`).join(', ');
      await sql.unsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
    },
    drop: async () => {
      await sql.end({ timeout: 5 });
      await admin.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end({ timeout: 5 });
    },
  };
}

/**
 * Rewrite a service migration that hardcodes `"service"` / `service.` into the
 * unique test schema name. Used so createTestDb isolation works when production
 * SQL is schema-qualified on purpose.
 */
export function rewriteSchemaSql(sql: string, fromSchema: string, toSchema: string): string {
  if (!SAFE_IDENT.test(fromSchema) || !SAFE_IDENT.test(toSchema)) {
    throw new Error(`Unsafe schema rewrite: ${fromSchema} → ${toSchema}`);
  }
  // Quoted identifiers first, then bare schema. prefixes (not inside other words).
  return sql.replaceAll(`"${fromSchema}"`, `"${toSchema}"`).replace(new RegExp(`\\b${fromSchema}\\.`, 'g'), `${toSchema}.`);
}

/**
 * True when CI (or REQUIRE_POSTGRES=1) demands a live database.
 * Residual #9: money suites must not silently `describe.skip` on CI.
 */
export function postgresRequired(): boolean {
  return process.env.CI === 'true' || process.env.CI === '1' || process.env.REQUIRE_POSTGRES === '1';
}

/**
 * Resolve a service test DB URL.
 * Prefers a service-specific env, then TEST_DATABASE_URL, then the local compose default.
 */
export function resolveTestDatabaseUrl(serviceEnvKey: string | undefined, localDefault: string): string {
  if (serviceEnvKey) {
    const specific = process.env[serviceEnvKey];
    if (specific && specific.trim() !== '') return specific;
  }
  const shared = process.env.TEST_DATABASE_URL;
  if (shared && shared.trim() !== '') return shared;
  return localDefault;
}

/**
 * THE GUARD. Refuse to run a destructive suite against a non-test database.
 *
 * Isolation that lives only in `.env` is aspirational: `.env` is gitignored, so
 * every developer's copy drifts, and a variable that is merely *absent* falls
 * back to whatever the code's default happens to be. That is not a hypothetical
 * — it is how the shared `intafaced` database on :5433 accumulated 307 pending
 * `identity.kyc_records`, how a branch's `loan_*` tables broke `main`'s custody
 * doctrine test from a different checkout entirely, and how svc-pay came to
 * `TRUNCATE pay.deposits` on a database with live rows in it.
 *
 * A test suite is allowed to be destructive — truncate, apply migrations, drop
 * schemas — precisely and only because it owns its database. This function is
 * what converts that sentence from a comment into an enforced precondition. It
 * asks Postgres itself (`current_database()`), not the connection string, so a
 * URL that lies, a `PGDATABASE` override, or a pooler that redirects elsewhere
 * are all caught. Call it BEFORE the first destructive statement.
 *
 * The rule is a suffix, not a fixed name: any database ending in `_test` is
 * fair game (`intafaced_test`, `intafaced_bank_loans_test`, a per-CI-job DB),
 * and everything else — above all the shared `intafaced` — is refused. A suffix
 * rule stays correct as services add dedicated databases; a hardcoded name
 * would have to be edited every time and would silently rot.
 *
 * Failing loudly here is the entire point. The alternative is what we had: a
 * green suite that quietly mutated the database the running fleet is using.
 */
export async function assertTestDatabase(sql: postgres.Sql, context: string): Promise<void> {
  const rows = await sql<Array<{ db: string; usr: string }>>`
    SELECT current_database() AS db, current_user AS usr
  `;
  const db = rows[0]?.db ?? '<unknown>';
  const usr = rows[0]?.usr ?? '<unknown>';

  if (db.endsWith('_test')) return;

  throw new Error(
    `REFUSING TO RUN ${context} against database "${db}" (as "${usr}").\n\n` +
      `This suite applies migrations and/or truncates tables. It may only run\n` +
      `against a dedicated test database — one whose name ends in "_test".\n` +
      `"${db}" is not one, and on a developer machine it is almost certainly the\n` +
      `SHARED database the local docker fleet and every other git worktree use.\n\n` +
      `Fix: set the suite's TEST_DATABASE_URL_* variable to a *_test database.\n` +
      `  cp .env.example .env   (it ships correct values for every service)\n` +
      `Compose creates and bootstraps intafaced_test via\n` +
      `tooling/infra/postgres-init/02-intafaced-test-db.sh — if it is missing,\n` +
      `run: docker compose down -v && docker compose up -d`,
  );
}

/**
 * True when a live Postgres is reachable — lets *local* suites skip rather than fail.
 * On CI / REQUIRE_POSTGRES, unreachable Postgres is a hard failure (no silent green).
 */
export async function postgresAvailable(url?: string): Promise<boolean> {
  const target = url ?? process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
  const sql = postgres(target, { max: 1, connect_timeout: 2, onnotice: () => undefined });
  try {
    await sql`SELECT 1`;
    return true;
  } catch (err) {
    if (postgresRequired()) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Postgres required in CI (residual #9) but unreachable at ${target}: ${msg}. ` +
          `Bootstrap service roles and set TEST_DATABASE_URL_* (see .github/workflows/ci.yml).`,
      );
    }
    return false;
  } finally {
    await sql.end({ timeout: 1 }).catch(() => undefined);
  }
}
