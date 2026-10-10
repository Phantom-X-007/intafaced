import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import postgres, { type Sql } from 'postgres';

/** Ops-owned migration journal; one transaction and advisory lock per deployment. */
export async function migrateOutreach(sql: Sql, direction: 'up' | 'down' = 'up'): Promise<void> {
  const source = await readFile(
    new URL(direction === 'down' ? '../../drizzle/0000_outreach_crm.down.sql' : '../../drizzle/0000_outreach_crm.sql', import.meta.url),
    'utf8',
  );
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext('ops.crm.migrations'))`;
    await tx`CREATE SCHEMA IF NOT EXISTS ops`;
    await tx`CREATE TABLE IF NOT EXISTS ops.crm_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
    const done = await tx`SELECT name FROM ops.crm_migrations WHERE name = '0000_outreach_crm'`;
    if (direction === 'down') {
      if (!done.length) return;
      await tx.unsafe(source);
      await tx`DELETE FROM ops.crm_migrations WHERE name = '0000_outreach_crm'`;
      return;
    }
    if (done.length) return;
    await tx.unsafe(source);
    await tx`INSERT INTO ops.crm_migrations(name) VALUES ('0000_outreach_crm')`;
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.DATABASE_URL) throw new Error('ops.crm.storage_unconfigured');
  const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => undefined });
  try {
    await migrateOutreach(sql, process.argv[2] === 'down' ? 'down' : 'up');
  } finally {
    await sql.end();
  }
}
