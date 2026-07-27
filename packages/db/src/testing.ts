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
  const url = options.url ?? process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced';

  const schema = `test_${options.service}_${process.pid}_${++counter}`;
  if (!SAFE_IDENT.test(schema)) {
    throw new Error(`Refusing to create test schema with unsafe name: ${schema}`);
  }

  const admin = postgres(url, { max: 1, onnotice: () => undefined });

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

/** True when a live Postgres is reachable — lets suites skip rather than fail. */
export async function postgresAvailable(url?: string): Promise<boolean> {
  const target = url ?? process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced';
  const sql = postgres(target, { max: 1, connect_timeout: 2, onnotice: () => undefined });
  try {
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await sql.end({ timeout: 1 }).catch(() => undefined);
  }
}
