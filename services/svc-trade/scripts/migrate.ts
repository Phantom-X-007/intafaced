import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

/**
 * Migration runner.
 *
 * Applies every `NNNN_*.sql` in order, tracked in `trade.__migrations` so a
 * re-run is a no-op. Pass `--down` to apply reversals in reverse order — which
 * exists so CI can prove the migrations are reversible, not because anyone
 * should run it against a book with open orders in it (see the header of
 * `0000_trade_init.down.sql`).
 */

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'drizzle');
const down = process.argv.includes('--down');

/**
 * Migrations run as the schema's OWNER, not as an admin role. The dev database
 * grants each service its own schema and nothing else, so a migration that
 * strays outside `trade` fails here rather than in production.
 */
const url = process.env.DATABASE_URL ?? 'postgres://svc_trade:svc_trade@localhost:5433/intafaced';
const sql = postgres(url, { max: 1, onnotice: () => undefined });

async function main() {
  // The schema comes from the database bootstrap, not from here — this role has
  // no database-level CREATE, by design.
  await sql`
    CREATE TABLE IF NOT EXISTS trade.__migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const all = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
  const ups = all.filter((f) => !f.endsWith('.down.sql')).sort();

  if (down) {
    for (const up of [...ups].reverse()) {
      const downFile = up.replace(/\.sql$/, '.down.sql');
      console.log(`↓ ${downFile}`);
      await sql.unsafe(readFileSync(join(migrationsDir, downFile), 'utf8'));
      await sql`DELETE FROM trade.__migrations WHERE name = ${up}`;
    }
    console.log('✓ reversed');
    return;
  }

  const applied = new Set((await sql<Array<{ name: string }>>`SELECT name FROM trade.__migrations`).map((r) => r.name));

  for (const file of ups) {
    if (applied.has(file)) {
      console.log(`· ${file} (already applied)`);
      continue;
    }
    console.log(`↑ ${file}`);
    await sql.unsafe(readFileSync(join(migrationsDir, file), 'utf8'));
    await sql`INSERT INTO trade.__migrations (name) VALUES (${file})`;
  }

  console.log('✓ migrations up to date');
}

try {
  await main();
} finally {
  await sql.end({ timeout: 5 });
}
