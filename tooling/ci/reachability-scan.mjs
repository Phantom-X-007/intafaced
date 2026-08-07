#!/usr/bin/env node
/**
 * REACHABILITY GATE - a module nothing can reach is not shipped work.
 *
 * WHY THIS EXISTS
 * ---------------
 * Between #905 and #946 the L3 slice factory produced 151 modules that
 * re-declared a constant already defined elsewhere and asserted the copy
 * against a hardcoded literal. Every one passed doctrine gates, format,
 * typecheck, tests and CI. The stamp-mill gate led with `docsOnly`, so it never
 * looked at them (#884). 22k lines, zero reachable behaviour - and each copy
 * was a silent drift trap: change the real list and the copy disagrees while CI
 * stays green.
 *
 * THE RULE
 * --------
 * A non-test source module fails when BOTH are true:
 *   1. it imports nothing from this repo, and
 *   2. nothing outside its own test file imports it.
 *
 * Both halves matter. A real drift guard imports the live source it guards, so
 * it passes on (1) - that is exactly what separates the nine kept
 * `*-honesty.ts` files from the 151 deleted ones. A feature that is built but
 * not yet wired imports real code too, so it passes as well: this gate catches
 * MANUFACTURED code, not unfinished code. Law: docs/NITRO-L3-SLICE-FACTORY-LAW.md.
 *
 * ponytail: importer detection is a basename match over import specifiers, not
 * a module resolver. It errs toward finding an importer, so the failure mode is
 * a miss, never a false accusation. Swap in a real resolver if a miss costs us.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, basename, relative } from 'node:path';

/**
 * PARKED - built, specced, not yet wired. Each entry is a real Stage-1/Stage-2
 * module with a TRK spec and no caller yet. Parking them here is the point:
 * unwired work stays VISIBLE and owned instead of quietly collecting dust.
 *
 * This list may only SHRINK. When a parked module gains a caller the scan says
 * so and the row must be deleted - that is the whole mechanism. Adding a row is
 * a decision to owe the wiring, not a way to pass the gate.
 */
const PARKED = new Map([
  [
    'services/svc-academy/src/ambassadors/residency.ts',
    'Ambassador Stage-2 residency apply/review. Spec: docs/ops/trk/academy.ambassadors.md. Awaits the academy route that accepts applications.',
  ],
  [
    'services/svc-academy/src/paper/workbook-loop.ts',
    'Paper-trading Stage-2 drill loop (TRK-academy.paper-trading). Awaits the trade paper-market flag caller.',
  ],
  [
    'services/svc-agents/src/copy-intel/stats.ts',
    'Copy-Intel Stage-1 audited leader stats. Spec: docs/ops/trk/agents.copy-intel.md. Awaits the agent runtime that feeds it leader rows.',
  ],
  [
    'services/svc-agents/src/merchant/watch.ts',
    'Merchant agent Stage-1 approval-rate watch. Spec: docs/ops/trk/agents.merchant.md. Awaits the merchant agent runtime.',
  ],
  [
    'services/svc-agents/src/scanner/rank.ts',
    'Market Scanner Stage-1 rank. Spec: docs/ops/trk/agents.scanner.md. Awaits the scanner runtime.',
  ],
  [
    'services/svc-agents/src/support-agent/comment-draft.ts',
    'Support agent Stage-2 comment draft gate. Awaits the support ticket write path.',
  ],
]);

const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const ROOTS = ['services', 'packages'];
const SKIP_DIR = new Set(['node_modules', 'dist', 'build', '.turbo', 'coverage', 'fixtures', '__fixtures__']);
const SKIP_FILE = /(\.test\.ts|\.d\.ts)$/;
const ENTRY = new Set(['index.ts', 'main.ts', 'server.ts']);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SKIP_DIR.has(e.name)) walk(join(dir, e.name), out);
    } else if (e.isFile() && /\.(ts|tsx|vue|mjs)$/.test(e.name)) {
      out.push(join(dir, e.name));
    }
  }
  return out;
}

const all = ROOTS.flatMap((r) => walk(join(ROOT, r)));
const sources = all.filter((f) => f.includes('/src/') && f.endsWith('.ts') && !SKIP_FILE.test(f) && !ENTRY.has(basename(f)));

/** every (importer, specifier) pair written anywhere in the repo */
const pairs = [];
for (const f of all) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) pairs.push([f, m[1]]);
}

const failures = [];
for (const f of sources) {
  const text = readFileSync(f, 'utf8');
  const readsRepoCode = /from\s+['"]\.{1,2}\//.test(text) || /from\s+['"]@intafaced\//.test(text);
  if (readsRepoCode) continue;

  const stem = basename(f, '.ts');
  const ownTest = f.replace(/\.ts$/, '.test.ts');
  const imported = pairs.some(
    ([importer, spec]) => importer !== f && importer !== ownTest && (spec.endsWith(`/${stem}.js`) || spec.endsWith(`/${stem}`)),
  );
  if (!imported) failures.push(relative(ROOT, f));
}

/** a parked module that gained a caller: the row is now stale and must go */
const freed = [...PARKED.keys()].filter((p) => !failures.includes(p));
const unparked = failures.filter((f) => !PARKED.has(f));

if (freed.length) {
  console.error(`\n  x REACHABILITY - ${freed.length} PARKED module(s) now have a caller. Good - delete their rows:\n`);
  for (const f of freed) console.error(`      ${f}`);
  console.error('\n  Remove them from PARKED in tooling/ci/reachability-scan.mjs. The list may only shrink.\n');
  process.exit(1);
}

if (unparked.length) {
  const failures2 = unparked;
  failures.length = 0;
  failures.push(...failures2);
} else {
  console.log(`  reachability clean - ${sources.length} modules, 0 unreachable, ${PARKED.size} parked (built, specced, awaiting a caller)`);
  process.exit(0);
}

if (failures.length) {
  console.error(`\n  x REACHABILITY - ${failures.length} module(s) import nothing and are imported by nothing:\n`);
  for (const f of failures) console.error(`      ${f}`);
  console.error(
    [
      '',
      '  Each of these is unreachable: no code path leads to it, and it reads no',
      '  code either. A test asserting it is a test asserting itself.',
      '',
      '  Fix one of three ways:',
      '    - wire it: import it from the code that should use it;',
      '    - guard something real: import the live source it mirrors, assert on that;',
      '    - delete it.',
      '',
      '  Law: docs/NITRO-L3-SLICE-FACTORY-LAW.md, Reachability law',
      '',
    ].join('\n'),
  );
  process.exit(1);
}
console.log(`  reachability clean - ${sources.length} modules, 0 unreachable`);
