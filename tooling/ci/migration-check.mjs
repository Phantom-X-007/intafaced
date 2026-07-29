#!/usr/bin/env node
/**
 * MIGRATION CHECK — §14 DoD: "All schema migrations reversible and applied in CI."
 *
 * For every service with a drizzle output directory:
 *   1. Every `NNNN_name.sql` has a matching `NNNN_name.down.sql`.
 *   2. The journal is consistent with the files on disk.
 *   3. No migration silently drops a column or table without a marker comment —
 *      destructive changes are allowed, but they must be declared, because on a
 *      ledger a dropped column is a lost audit trail.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SERVICES = join(ROOT, 'services');

const DESTRUCTIVE = [/\bDROP\s+TABLE\b/i, /\bDROP\s+COLUMN\b/i, /\bTRUNCATE\b/i, /\bDROP\s+SCHEMA\b/i];
const ACKNOWLEDGEMENT = /--\s*intafaced:destructive\b/i;

const problems = [];
let migrationsChecked = 0;
let servicesChecked = 0;

if (!existsSync(SERVICES)) {
  console.log('✓ migration-check — no services yet');
  process.exit(0);
}

for (const service of readdirSync(SERVICES)) {
  const drizzleDir = join(SERVICES, service, 'drizzle');
  if (!existsSync(drizzleDir) || !statSync(drizzleDir).isDirectory()) continue;
  servicesChecked++;

  const files = readdirSync(drizzleDir).filter((f) => f.endsWith('.sql'));
  const ups = files.filter((f) => !f.endsWith('.down.sql'));
  const downs = new Set(files.filter((f) => f.endsWith('.down.sql')));

  for (const up of ups) {
    migrationsChecked++;
    const expectedDown = up.replace(/\.sql$/, '.down.sql');

    if (!downs.has(expectedDown)) {
      problems.push({
        service,
        file: relative(ROOT, join(drizzleDir, up)),
        problem: `missing reversal — write ${expectedDown}`,
      });
    }

    const sql = readFileSync(join(drizzleDir, up), 'utf8');
    const destructive = DESTRUCTIVE.find((p) => p.test(sql));
    if (destructive && !ACKNOWLEDGEMENT.test(sql)) {
      problems.push({
        service,
        file: relative(ROOT, join(drizzleDir, up)),
        problem:
          'destructive statement without acknowledgement — add "-- intafaced:destructive <reason>" ' + 'at the top if this is intended',
      });
    }
  }

  // Journal consistency.
  const journalPath = join(drizzleDir, 'meta', '_journal.json');
  if (existsSync(journalPath)) {
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
    const entries = journal.entries ?? [];
    for (const entry of entries) {
      const tag = `${entry.tag}.sql`;
      if (!ups.includes(tag)) {
        problems.push({ service, file: relative(ROOT, journalPath), problem: `journal references missing migration ${tag}` });
      }
    }
    if (entries.length !== ups.length) {
      problems.push({
        service,
        file: relative(ROOT, journalPath),
        problem: `journal has ${entries.length} entries but ${ups.length} migration files exist`,
      });
    }
  }
}

if (problems.length > 0) {
  console.error(`\n✖ MIGRATION CHECK FAILED — ${problems.length} problem(s) (§14 DoD)\n`);
  for (const p of problems) {
    console.error(`  [${p.service}] ${p.file}`);
    console.error(`    → ${p.problem}\n`);
  }
  process.exit(1);
}

console.log(`✓ migration-check clean — ${migrationsChecked} migration(s) across ${servicesChecked} service(s), all reversible`);
