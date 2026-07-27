import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

/**
 * Migration runner.
 *
 * Applies every `NNNN_*.sql` in order, tracked in `token.__migrations` so a
 * re-run is a no-op. Pass `--down` to apply reversals in reverse order — which
 * exists so CI can prove the migrations are reversible, not because anyone
 * should run it against an economy with real stakes in it.
 */

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'drizzle');
const down = process.argv.includes('--down');

/**
 * Migrations run as the schema's OWNER, not as an admin role. The dev database
 * grants each service its own schema and nothing else, so a migration that
 * strays outside `token` fails here rather than in production.
 */
const url = process.env.DATABASE_URL ?? 'postgres://svc_token:svc_token@localhost:5433/intafaced';
const sql = postgres(url, { max: 1, onnotice: () => undefined });

async function main() {
  // The schema comes from the database bootstrap, not from here — this role has
  // no database-level CREATE, by design.
  await sql`
    CREATE TABLE IF NOT EXISTS token.__migrations (
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
      await sql`DELETE FROM token.__migrations WHERE name = ${up}`;
    }
    console.log('✓ reversed');
    return;
  }

  const applied = new Set((await sql<Array<{ name: string }>>`SELECT name FROM token.__migrations`).map((r) => r.name));

  for (const file of ups) {
    if (applied.has(file)) {
      console.log(`· ${file} (already applied)`);
      continue;
    }
    console.log(`↑ ${file}`);
    await sql.unsafe(readFileSync(join(migrationsDir, file), 'utf8'));
    await sql`INSERT INTO token.__migrations (name) VALUES (${file})`;
  }

  console.log('✓ migrations up to date');
}

try {
  await main();
} finally {
  await sql.end({ timeout: 5 });
}
