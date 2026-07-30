#!/usr/bin/env node
/**
 * TEST DB SCAN — no test may aim itself at the shared database.
 *
 * THE FAILURE THIS EXISTS TO PREVENT
 *
 * Test suites here connect to a real Postgres, apply migrations, and truncate
 * tables. That is legitimate — the interesting bugs in a money system live in
 * the database, not above it. It is legitimate *only* while each suite owns the
 * database it points at.
 *
 * For a long stretch it did not. Every service's fallback URL named `intafaced`
 * — the same database the local docker fleet serves and every git worktree on
 * the machine shares. A missing environment variable therefore did not fail; it
 * silently aimed a destructive suite at live data. In one day that produced:
 *
 *   · svc-identity's KYC queue test failing on `main` and unable to self-heal.
 *     `kyc_records` accumulated across every run by every worktree (307 pending
 *     rows). The queue is oldest-first under a LIMIT, so past that limit a
 *     record created *now* could never appear. It passed on fresh Postgres,
 *     so CI was green while `main` was red on every developer's machine.
 *   · svc-pay TRUNCATE-ing `pay.deposits` / `pay.withdrawals` — tables that had
 *     live rows in the running stack.
 *   · svc-bank's §0.6 custody test failing on `loan_*` tables that exist in no
 *     migration on `main`. An unmerged branch had applied them to the shared
 *     database from a different checkout, making `main` look like it violated
 *     custody doctrine. No clean checkout and no `git bisect` could have found
 *     that, because the cause was not in the history being bisected.
 *   · assorted flaky reds under parallel load, each costing an agent a wrong
 *     turn as they attributed it to their own diff.
 *
 * Three defences now exist, and this is the third:
 *   1. every suite's code default names a `*_test` database;
 *   2. `assertTestDatabase` (packages/db) asks Postgres for `current_database()`
 *      at runtime and refuses to proceed unless the name ends in `_test`;
 *   3. this scan, which catches a shared-database name at review time — before
 *      it is ever run, and without needing a Postgres to be up.
 *
 * (1) is a default, and defaults get overridden. (2) is the real enforcement,
 * but it only fires when the suite actually runs, which needs a database. This
 * check is cheap, runs in the `gates` job with no services attached, and puts
 * the explanation in the diff where the mistake is being made.
 *
 * WHAT COUNTS AS A VIOLATION
 *
 * A test file that (a) can actually open a Postgres connection and (b) names a
 * database that is not `*_test`. The scan reads the database name out of the
 * connection string, so `.../intafaced_test` is fine, `.../intafaced` is not,
 * and a future `.../intafaced_bank_loans_test` is fine without editing this file.
 *
 * Condition (a) matters. `packages/config/src/env.test.ts` contains the literal
 * `postgres://svc_ledger:svc_ledger@localhost:5432/intafaced` as a fixture for
 * env-schema validation; it imports no driver and connects to nothing. Flagging
 * it would be a false positive, and the practical fate of a gate that cries
 * wolf is that someone disables it — at which point it protects nothing. So a
 * connection string is only evidence of a connection when the file has some way
 * to make one.
 *
 * Exit 0 = every test file owns its database. Exit 1 = one of them does not.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();

/** Where test files live. `vendor/` is deliberately excluded — not our code. */
const ROOTS = ['services', 'packages', 'apps', 'tooling'];

/** Directories never worth walking into. */
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.next', '.turbo', 'coverage', '.git', 'vendor']);

const TEST_FILE = /\.(test|spec)\.(ts|tsx|mts|js|mjs)$/;

/**
 * A postgres connection string, captured far enough to read the database name.
 * Matches postgres:// and postgresql://, with or without credentials.
 */
const PG_URL = /\bpostgres(?:ql)?:\/\/[^\s'"`]+/g;

/**
 * Ways a test file can actually reach Postgres. Only files importing one of
 * these are capable of connecting, so only they can misdirect a connection.
 */
const CONNECTS = [
  /from\s+['"]postgres['"]/, // the `postgres` driver used by every service suite
  /from\s+['"]pg['"]/,
  /from\s+['"]@intafaced\/db(?:\/[a-z]+)?['"]/, // createTestDb / assertTestDatabase
  /from\s+['"]drizzle-orm[^'"]*['"]/,
];

/** @param {string} content */
function canConnect(content) {
  return CONNECTS.some((re) => re.test(content));
}

/**
 * Pull the database name out of a connection string.
 * Returns null when the string is too templated to read (e.g. `${base}/${db}`),
 * because guessing there would produce false positives and a gate that cries
 * wolf gets disabled.
 * @param {string} raw
 */
function databaseName(raw) {
  const withoutQuery = raw.split('?')[0];
  const afterHost = withoutQuery.replace(/^postgres(?:ql)?:\/\//, '');
  const slash = afterHost.indexOf('/');
  if (slash === -1) return null;
  const db = afterHost.slice(slash + 1).trim();
  if (db === '' || db.includes('${') || db.includes('{')) return null;
  return db;
}

/** @param {string} dir @param {string[]} out */
function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else if (TEST_FILE.test(entry)) out.push(full);
  }
  return out;
}

/** @type {string[]} */
const files = [];
for (const r of ROOTS) walk(join(ROOT, r), files);

/** @type {{file: string, line: number, db: string, snippet: string}[]} */
const violations = [];
/** Files holding a connection string but no way to connect — reported, not failed. */
const skipped = [];
let scanned = 0;

for (const file of files) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (!content.includes('postgres')) continue;
  if (!canConnect(content)) {
    skipped.push(relative(ROOT, file).replace(/\\/g, '/'));
    continue;
  }

  scanned++;
  const lines = content.split(/\r?\n/);
  lines.forEach((text, i) => {
    const matches = text.match(PG_URL);
    if (!matches) return;
    for (const raw of matches) {
      const db = databaseName(raw);
      if (db === null) continue;
      if (db.endsWith('_test')) continue;
      violations.push({
        file: relative(ROOT, file).replace(/\\/g, '/'),
        line: i + 1,
        db,
        snippet: text.trim().slice(0, 160),
      });
    }
  });
}

if (violations.length > 0) {
  console.error(`\n✖ TEST DB SCAN FAILED — ${violations.length} test file location(s) name a non-test database\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    → connects to database "${v.db}", which does not end in "_test"`);
    console.error(`      ${v.snippet}\n`);
  }
  console.error('  Test suites apply migrations and truncate tables. Pointed at the shared');
  console.error('  `intafaced` database they mutate the data the local fleet and every other');
  console.error('  worktree are using — which has broken `main` from a different checkout.\n');
  console.error('  Fix: name a dedicated database (conventionally `intafaced_test`) and read it');
  console.error("  from the service's TEST_DATABASE_URL_* variable. See .env.example.\n");
  process.exit(1);
}

const note = skipped.length > 0 ? ` (${skipped.length} with fixture-only URLs and no driver import: ${skipped.join(', ')})` : '';
console.log(`✓ test-db-scan clean — ${scanned} Postgres-capable test file(s) of ${files.length} scanned, all on *_test databases${note}`);
