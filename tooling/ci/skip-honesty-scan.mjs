#!/usr/bin/env node
/**
 * SKIP HONESTY SCAN — a suite may skip itself, but not in private.
 *
 * THE FAILURE THIS EXISTS TO PREVENT
 *
 * `packages/db` has exactly one sanctioned Postgres probe, `postgresAvailable`.
 * It does two things a hand-rolled probe does not: it throws when `CI=true` or
 * `REQUIRE_POSTGRES=1`, so a missing database on CI is a red build rather than a
 * silent pass; and it journals its decision, so `pnpm verify` can name the suites
 * that did not run instead of letting turbo's "N successful" imply that they did.
 *
 * Five suites — svc-token, svc-pay, svc-p2p, svc-blueprint, svc-agents, all of
 * them money or identity paths — had instead copied the same eight-line helper:
 *
 *     async function reachable(): Promise<boolean> {
 *       const probe = postgres(URL, { max: 1, connect_timeout: 3, ... });
 *       try { await probe`SELECT 1`; return true; } catch { return false; }
 *       finally { await probe.end({ timeout: 2 }); }
 *     }
 *
 * `catch { return false }`. No `postgresRequired()`, no journal. On CI, where an
 * unreachable database is supposed to be a hard failure, those five suites would
 * have skipped in silence and been counted as passes. Nobody did that on purpose;
 * it is what copying the file next door produces, and it will happen again the
 * next time somebody adds a service.
 *
 * WHAT COUNTS AS A VIOLATION
 *
 * A test file that (a) decides whether to run based on something it probed, and
 * (b) does that probing itself instead of calling a shared, CI-aware, journalled
 * helper. Concretely: a `describe.skip` / `skipIf` / `runIf` / conditional
 * `describe` in a file that opens its own `postgres(...)` connection or its own
 * `createPublicClient(...)`, without importing `postgresAvailable` or
 * `devChainReachable`.
 *
 * WHAT IS EXPLICITLY NOT A VIOLATION
 *
 *   · Skipping. Skip guards are correct — a laptop without Docker must still be
 *     able to run the suite. The problem was never that suites skip; it is that
 *     they used to do it invisibly.
 *   · Building connections for the test body. A suite that has decided to run and
 *     then opens twenty clients is not deciding anything.
 *   · `it.skip` for a genuinely pending test. That is a to-do, not an outage.
 *
 * Exit 0 = every conditional skip is visible to the verdict. Exit 1 = one is not.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { PRIVATE_PROBE as KNOWN_PRIVATE_PROBE } from './unreported-suites.mjs';

const ROOT = process.cwd();
const ROOTS = ['services', 'packages', 'apps', 'tooling'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.next', '.turbo', 'coverage', '.git', 'vendor']);
const TEST_FILE = /\.(test|spec)\.(ts|tsx|mts|js|mjs)$/;

/** The file decides, at suite level, whether to execute. */
const CONDITIONAL_SKIP = [
  /describe\.skipIf\s*\(/,
  /describe\.runIf\s*\(/,
  /\bit\.runIf\s*\(/,
  /\btest\.runIf\s*\(/,
  /describe\.skip\s*\(/,
  /=\s*[a-zA-Z]+\s*\?\s*describe\s*:\s*describe\.skip/,
  /=\s*[^;\n]*\?\s*describe\.skip\s*:\s*describe/,
];

/** The file opens its own connection to the thing it is deciding about. */
const PRIVATE_PROBE_SHAPES = [
  { re: /\bpostgres\s*\(\s*[^)]*connect_timeout/, what: 'its own Postgres connection with a connect timeout' },
  { re: /createPublicClient\s*\(/, what: 'its own JSON-RPC client' },
  // A NATS probe was invisible here until a suite wrote one. The gate knew the
  // two shapes that had already been written and nothing else, so the first
  // hand-rolled probe against a third dependency passed unnoticed — which is
  // the failure this gate exists to prevent, one dependency over.
  { re: /\bconnect\s*\(\s*\{[^}]*servers\s*:/, what: 'its own NATS connection' },
];

/** The sanctioned, CI-aware, journalled probes. */
const SANCTIONED = [/\bpostgresAvailable\b/, /\bdevChainReachable\b/, /\brecordInfraProbe\b/];

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

/**
 * The register of offenders this change was not permitted to fix — see
 * `tooling/ci/unreported-suites.mjs`. They do not fail the gate. They are also
 * not invisible: they print on every clean run, and both directions are checked
 * below — the list cannot grow, and it cannot outlive the problem it describes.
 */
const known = new Map(KNOWN_PRIVATE_PROBE.map((e) => [e.file, e]));

/** @type {{file: string, what: string}[]} */
const violations = [];
/** @type {{file: string, what: string, owner: string}[]} */
const tolerated = [];
let conditional = 0;

for (const file of files) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (!CONDITIONAL_SKIP.some((re) => re.test(content))) continue;
  conditional++;
  if (SANCTIONED.some((re) => re.test(content))) continue;

  const rel = relative(ROOT, file).replace(/\\/g, '/');
  for (const probe of PRIVATE_PROBE_SHAPES) {
    if (probe.re.test(content)) {
      const entry = known.get(rel);
      if (entry) tolerated.push({ file: rel, what: probe.what, owner: entry.owner });
      else violations.push({ file: rel, what: probe.what });
      break;
    }
  }
}

/**
 * The other direction, and the one that matters in a year. An exemption whose
 * reason has gone stays forever by default and quietly covers the next offender
 * to land on that path. So: an entry that no longer violates, or names a file
 * that no longer exists, is itself a failure.
 */
const stale = [];
const seen = new Set(tolerated.map((t) => t.file));
for (const entry of KNOWN_PRIVATE_PROBE) {
  if (seen.has(entry.file)) continue;
  stale.push(
    existsSync(join(ROOT, entry.file))
      ? `${entry.file} no longer skips on a private probe — it has been fixed.`
      : `${entry.file} does not exist any more.`,
  );
}

if (stale.length > 0) {
  console.error(`\n✖ SKIP HONESTY SCAN FAILED — ${stale.length} stale entr(ies) in tooling/ci/unreported-suites.mjs\n`);
  for (const s of stale) console.error(`  · ${s}`);
  console.error('\n  Delete the entry from PRIVATE_PROBE. A tolerated-offender list that is not');
  console.error('  pruned stops being a record of debt and becomes blanket cover for whatever');
  console.error('  lands on that path next — which is the same invisibility this gate exists');
  console.error('  to remove, one level up.\n');
  process.exit(1);
}

if (violations.length > 0) {
  console.error(`\n✖ SKIP HONESTY SCAN FAILED — ${violations.length} suite(s) skip on a probe nobody can see\n`);
  for (const v of violations) {
    console.error(`  ${v.file}`);
    console.error(`    → decides whether to run using ${v.what}, and never calls a shared probe\n`);
  }
  console.error('  A private probe swallows its error and returns false regardless of CI or');
  console.error('  REQUIRE_POSTGRES=1, so the suite skips silently on CI and is counted as a');
  console.error('  pass. It also writes nothing to the infra journal, so `pnpm verify` cannot');
  console.error('  tell anyone the suite did not run.\n');
  console.error('  Fix: import the shared probe, which hard-fails when required and journals');
  console.error('  either way. Do NOT delete the skip guard — skipping is fine, invisible');
  console.error('  skipping is not.\n');
  console.error("    import { postgresAvailable } from '@intafaced/db';");
  console.error('    const available = await postgresAvailable(URL);\n');
  console.error("  Chain suites: `devChainReachable` from the service's scripts/dev-chain.ts.\n");
  console.error('  Genuinely cannot fix it — a CODEOWNERS line you are not on, an open PR that');
  console.error('  edits the same file, or an infra decision that is not yours? Add it to');
  console.error('  PRIVATE_PROBE in tooling/ci/unreported-suites.mjs with an owner and a reason.');
  console.error('  Name a hold that exists and say what lifts it; a hold citing a rule nobody');
  console.error('  can find is not a reason (docs/adr/2026-08-04-class-m-hold-language.md).');
  console.error('  That does not make the skip fine; it makes it counted.\n');
  process.exit(1);
}

if (tolerated.length > 0) {
  console.log(`\n⚠ ${tolerated.length} suite(s) STILL skip on a private probe, on the register and not fixed here:\n`);
  for (const t of tolerated) {
    console.log(`  ${t.file}`);
    console.log(`    → ${t.what} — owner: ${t.owner}`);
  }
  console.log('\n  These skip on CI counted as passes, today. They are listed in');
  console.log('  tooling/ci/unreported-suites.mjs and named in the `pnpm verify` verdict,');
  console.log('  which will not print COMPLETE while they stand.\n');
}

console.log(
  `✓ skip-honesty-scan clean — ${conditional} conditionally-skipping suite(s) of ${files.length} test file(s), ` +
    `${conditional - tolerated.length} on shared journalled probes, ${tolerated.length} on the unreported register`,
);
