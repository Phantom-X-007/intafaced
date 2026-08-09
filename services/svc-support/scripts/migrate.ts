import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

/**
 * Migration runner for support schema.
 *
 * Applies every `NNNN_*.sql` in order, tracked in `support.__migrations`.
 * Pass `--down` to reverse (CI reversibility, not for live desks with tickets).
 */

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'drizzle');
const down = process.argv.includes('--down');

const url = process.env.DATABASE_URL ?? 'postgres://svc_support:svc_support@localhost:5433/intafaced';
const sql = postgres(url, { max: 1, onnotice: () => undefined });

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS support.__migrations (
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
      await sql`DELETE FROM support.__migrations WHERE name = ${up}`;
    }
    console.log('✓ reversed');
    return;
  }

  const applied = new Set((await sql<Array<{ name: string }>>`SELECT name FROM support.__migrations`).map((r) => r.name));

  for (const file of ups) {
    if (applied.has(file)) {
      console.log(`· ${file} (already applied)`);
      continue;
    }
    console.log(`↑ ${file}`);
    await sql.unsafe(readFileSync(join(migrationsDir, file), 'utf8'));
    await sql`INSERT INTO support.__migrations (name) VALUES (${file})`;
  }

  console.log('✓ migrations up to date');
}

try {
  await main();
} finally {
  await sql.end({ timeout: 5 });
}
