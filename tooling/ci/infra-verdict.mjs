#!/usr/bin/env node
/**
 * INFRA VERDICT — the line that gets to disagree with "92 successful, 92 total".
 *
 * THE FAILURE THIS EXISTS TO PREVENT
 *
 * An agent ran `pnpm verify` three times. Run 2 printed `Tasks: 92 successful,
 * 92 total` and meant nothing: Postgres had saturated under parallel load, the
 * connect probe timed out, and fourteen database-backed suites took their
 * `describe.skip` branch. Turbo counted them as successes, because a vitest
 * process that asserted nothing and a vitest process that proved the ledger
 * balances both exit 0.
 *
 * That number was true. It was also the sentence a human reads and stops
 * reading. The asymmetry is what makes it dangerous: contention causes timeouts,
 * timeouts cause skips, skips cannot fail — so the run gets GREENER the more
 * loaded the machine is, and the agents most likely to be misled are the ones
 * running the most in parallel.
 *
 * WHAT THIS PRINTS
 *
 * Every probe for an external dependency journals its decision
 * (`packages/db/src/infra-journal.ts`). This reads that journal and prints, after
 * turbo's summary, either
 *
 *     ✓ COMPLETE — every infrastructure-backed suite executed.
 *
 * or a block naming each suite that did not run and saying in words that the run
 * is not green. "Passed" and "did not run" become different sentences in the one
 * place anyone actually looks.
 *
 * EXIT CODE — deliberately asymmetric
 *
 * A developer with no Docker must still be able to run `pnpm verify`. A gate that
 * makes it unrunnable locally gets reverted within a day, and then we have
 * neither the tests nor the honesty. So:
 *
 *   · locally, skips print loudly and exit 0 — honest, not obstructive;
 *   · under CI / REQUIRE_POSTGRES=1 / REQUIRE_EVM_CHAIN=1, a skip exits 1.
 *
 * On CI the probes themselves already throw, which turns the suite red first.
 * This is the backstop for what they cannot cover: a suite whose own required-
 * gate is narrower than the run's, or one that stopped probing altogether.
 *
 * `--json` prints the journal instead, for anything that wants to consume it.
 */
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { ALL_UNREPORTED } from './unreported-suites.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const require = createRequire(import.meta.url);

/**
 * Read the journal through the built package when it exists, and fall back to a
 * direct read of the same directory when it does not. `pnpm verify` prints the
 * verdict even when an earlier step failed — that is precisely when you want to
 * know how much of the run was real — so this must not itself depend on a
 * successful build.
 */
async function loadProbes() {
  try {
    const entry = require.resolve('@intafaced/db', { paths: [repoRoot] });
    const mod = await import(pathToFileURL(entry).href);
    if (typeof mod.readInfraProbes === 'function') return mod.readInfraProbes();
  } catch {
    /* fall through to the filesystem */
  }
  const { readdirSync, readFileSync } = await import('node:fs');
  const dir = process.env.INTAFACED_INFRA_JOURNAL || join(repoRoot, '.intafaced-run', 'infra');
  const runId = process.env.INTAFACED_RUN_ID;
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      const probe = JSON.parse(readFileSync(join(dir, name), 'utf8'));
      if (runId && probe.runId !== runId) continue;
      out.push(probe);
    } catch {
      /* a half-written record is not worth failing over */
    }
  }
  return out.sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

const LABEL = { postgres: 'postgres ', 'evm-chain': 'evm chain' };

const CAUSE_NOTE = {
  absent: 'nothing is listening — a machine without the local fleet running.',
  contended:
    'IT WAS THERE AND DID NOT ANSWER IN TIME. That is contention, not\n' +
    '              absence: the busier the machine, the more of the suite vanishes,\n' +
    '              and a skipped suite cannot fail. This is the false-green shape.',
  'refused-auth': 'it answered and refused the credentials — check TEST_DATABASE_URL_*.',
  other: 'the driver reported something else — see the reason above.',
  none: '',
};

function requiredRun() {
  return (
    process.env.CI === 'true' || process.env.CI === '1' || process.env.REQUIRE_POSTGRES === '1' || process.env.REQUIRE_EVM_CHAIN === '1'
  );
}

const probes = await loadProbes();

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(probes, null, 2));
  process.exit(0);
}

const RULE = '─'.repeat(78);

/**
 * Suites that cannot report either way — `tooling/ci/unreported-suites.mjs`.
 *
 * They never appear in the journal, so the counting above cannot see them, so
 * without this block the strongest sentence here ("every infrastructure-backed
 * suite executed") would be a claim about suites nobody measured. That is the
 * exact shape of the bug this file was written to expose, and it would have been
 * reintroduced by the verdict itself.
 */
function unreportedLines() {
  if (ALL_UNREPORTED.length === 0) return [];
  const out = ['', `  ${ALL_UNREPORTED.length} suite(s) CANNOT REPORT either way — not counted above, in either column:`, ''];
  for (const entry of ALL_UNREPORTED) {
    out.push(`    · ${entry.file}`);
    out.push(`        ${entry.dependency} · owner: ${entry.owner}`);
  }
  out.push('');
  out.push('    Their skip guard writes nothing to the journal, so this verdict does not');
  out.push('    know whether they ran. Reasons and owners: tooling/ci/unreported-suites.mjs');
  return out;
}

/**
 * No records is not automatically good news: it means either the run contained
 * no infrastructure-backed suite (a filtered run, a docs change) or the journal
 * never got written. Say that it is unknown rather than print a tick nobody
 * earned — the whole point here is to stop manufacturing reassurance.
 */
if (probes.length === 0) {
  console.log(
    [
      '',
      RULE,
      '  WHAT ACTUALLY RAN — no infrastructure-backed suite reported in.',
      '  (Nothing in this run probed Postgres or a chain.)',
      ...unreportedLines(),
      RULE,
      '',
    ].join('\n'),
  );
  process.exit(0);
}

const byDependency = new Map();
for (const probe of probes) {
  const key = probe.dependency ?? 'unknown';
  if (!byDependency.has(key)) byDependency.set(key, { ran: new Set(), skipped: [], failed: [] });
  const bucket = byDependency.get(key);
  if (probe.outcome === 'ran') bucket.ran.add(probe.suite);
  else if (probe.outcome === 'required-failed') bucket.failed.push(probe);
  else bucket.skipped.push(probe);
}

const lines = ['', RULE, '  WHAT ACTUALLY RAN', RULE];

const missingSuites = new Set();
const causes = new Set();

for (const [dependency, bucket] of [...byDependency.entries()].sort()) {
  const label = LABEL[dependency] ?? dependency;
  if (bucket.ran.size > 0) lines.push(`  ${label}  ✓ reachable — ${bucket.ran.size} suite(s) ran`);

  for (const group of ['failed', 'skipped']) {
    const records = bucket[group];
    if (records.length === 0) continue;

    // Group by target + cause: ten suites blocked by one dead socket is ONE
    // fact, and ten copies of it is how a reader learns to scroll past the block.
    const byTarget = new Map();
    for (const record of records) {
      const key = JSON.stringify([record.target, record.cause, record.reason]);
      if (!byTarget.has(key)) {
        byTarget.set(key, { target: record.target, cause: record.cause, reason: record.reason, suites: new Set() });
      }
      byTarget.get(key).suites.add(record.suite);
    }

    for (const entry of byTarget.values()) {
      causes.add(entry.cause);
      for (const suite of entry.suites) missingSuites.add(`${dependency}:${suite}`);
      const verb = group === 'failed' ? '✖ REQUIRED AND UNREACHABLE' : '✗ UNREACHABLE';
      lines.push(`  ${label}  ${verb}  ${entry.target}`);
      const firstLine = String(entry.reason ?? '').split(/\r?\n/)[0];
      if (firstLine) lines.push(`              ${firstLine.slice(0, 120)}`);
      const note = CAUSE_NOTE[entry.cause];
      if (note) lines.push(`              ${note}`);
      lines.push('');
      lines.push(`              ${entry.suites.size} suite(s) DID NOT RUN:`);
      for (const suite of [...entry.suites].sort()) lines.push(`                · ${suite}`);
      lines.push('');
    }
  }
}

const missing = missingSuites.size;

if (missing === 0) {
  if (ALL_UNREPORTED.length === 0) {
    lines.push('', '  ✓ COMPLETE — every infrastructure-backed suite executed.', RULE, '');
    console.log(lines.join('\n'));
    process.exit(0);
  }
  // Everything that CAN report, did. Say exactly that, and no more: "COMPLETE"
  // here would be a sentence about suites this process never heard from.
  lines.push('', '  ✓ every suite that reports in, ran — and every one of them passed its probe.');
  lines.push(...unreportedLines());
  lines.push(
    '',
    '  So: complete EXCEPT for the suites above. Not the same sentence as COMPLETE,',
    '  and deliberately not printed as one.',
  );
  lines.push(RULE, '');
  console.log(lines.join('\n'));
  process.exit(0);
}

lines.push(...unreportedLines());
lines.push('');
lines.push(RULE);
lines.push('  ⚠  THIS RUN IS INCOMPLETE. IT IS NOT A GREEN RUN.');
lines.push('');
lines.push(`     ${missing} suite(s) did not execute, because the thing they exist to`);
lines.push('     test against was unreachable. Turbo\'s "Tasks: N successful" counts');
lines.push('     every one of them as a success. Not one of them is one.');
if (causes.has('contended')) {
  lines.push('');
  lines.push('     At least one dependency was PRESENT and merely too slow to answer.');
  lines.push('     Re-run on a quieter machine before believing anything about this.');
}
lines.push('');
lines.push('     Make the run mean something:   docker compose up -d');
lines.push('     Make a skip fail instead:      REQUIRE_POSTGRES=1 pnpm verify');
lines.push('                                    REQUIRE_EVM_CHAIN=1 pnpm verify');
lines.push(RULE);
lines.push('');

console.log(lines.join('\n'));

if (requiredRun()) {
  console.error(`✖ CI / REQUIRE_* is set and ${missing} suite(s) still did not run. That is a failure, not a pass.\n`);
  process.exit(1);
}

/**
 * Exit 2 = "incomplete, but you are allowed to carry on".
 *
 * Not 1: a developer without Docker must still be able to run `pnpm verify`, and
 * a non-zero exit is what makes a tool get worked around. Not 0 either, because
 * `verify` needs to know — otherwise it signs off with "every step passed" one
 * line under a block saying a third of the run did not happen, and a reader
 * believes whichever sentence they saw last. `verify.mjs` still exits 0 on a 2.
 */
process.exit(2);
