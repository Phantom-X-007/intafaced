#!/usr/bin/env node
/**
 * MUTATION TEST for `wallet-rpc-mainnet-scan.mjs` — specifically, for the part
 * of it that reports.
 *
 * ── WHY THIS ONE IS DIFFERENT FROM THE OTHER TWO ───────────────────────────
 *
 * `secret-scan.mutation.mjs` and `money-property.mutation.mjs` mutate the
 * SUBJECT: they plant a defect in a file and ask whether the checker notices.
 * That question is already answered inside the mainnet scan itself, on every
 * invocation, by RULE_PROBES — synthetic fixtures pushed through the real
 * matchers, which is the stronger arrangement because it runs in `pnpm gates`
 * rather than beside it.
 *
 * This file mutates the CHECKER, and it exists because the probe harness could
 * not see its own removal. Two summary numbers were read off source text rather
 * than off work, and both were reproduced before being fixed:
 *
 *   · Delete the probe loop and the scan exited 0, still printing
 *     "0 rule probe(s) executed across 0 rule id(s) (24 must fire, -24 must
 *     not)". The 24 came from `RULE_PROBES.filter(p => p.fires).length`, which
 *     is a property of the array, not of any assertion. A negative count is
 *     what a claim looks like when nothing established it.
 *   · Delete the occurrence-drift comparison and the scan exited 0, still
 *     printing "60 recorded occurrence(s), all still exactly as recorded …
 *     none gained a copy" — over a tree that had, in that same run, gained a
 *     third copy of a frozen `MainNetParams` constant. With the comparison
 *     present the identical tree went red naming it.
 *
 * That is the repo's named recurring defect — "checks that report on nothing
 * and get read as evidence" — one level up from where the scan's own walk guard
 * looks for it: not a rule that walked nothing, a SENTENCE that measured
 * nothing. The remedy is the claim register in the scan (`establish` / `claim` /
 * `reconcileClaims`): every clause of the summary is minted by the check that
 * establishes it and consumed by the summary, and the two are reconciled before
 * anything prints. This file is what proves the register is load-bearing rather
 * than decorative, because a register that has never been tested against a
 * deletion is exactly the kind of thing this gate keeps finding.
 *
 * ── HOW A MUTANT IS APPLIED ────────────────────────────────────────────────
 *
 * Each mutant names a region of the scan by two EXACT anchor strings — `from`
 * (inclusive) and `to` (exclusive) — and replaces it. The mutated copy is
 * written to a temp file and run with cwd set to the repo root, which is all
 * the scan needs: it imports nothing but node builtins and locates everything
 * from `process.cwd()`.
 *
 * An anchor that no longer matches is a HARD FAILURE, not a skip. A mutation
 * test whose mutants stop applying is a green suite that tests nothing — the
 * same failure mode, one more level up — so a refactor that moves these regions
 * has to come back here and say so.
 *
 * Usage:  pnpm scan:wallet-rpc-mainnet:mutate
 * Exit 0 = every deletion was detected, and the unmutated scan still passes.
 * Exit 1 = a deletion went unnoticed, or a mutant no longer applies.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCAN = resolve(HERE, 'wallet-rpc-mainnet-scan.mjs');
const REPO = resolve(HERE, '..', '..');

const SOURCE = readFileSync(SCAN, 'utf8');

/**
 * @typedef {object} Mutant
 * @property {string}  id
 * @property {string}  [from]    first anchor, inclusive. Omitted = the control.
 * @property {string}  [to]      second anchor, exclusive
 * @property {string}  [replace] text to put in the region's place (default: nothing)
 * @property {boolean} detected  true = the scan must exit non-zero on this mutant
 * @property {string}  why
 */

/** @type {Mutant[]} */
const MUTANTS = [
  {
    id: 'control',
    detected: false,
    why: 'the unmutated scan must pass, or every "detected" result below is just a broken file',
  },

  // ── defect 4a: the probe harness could not detect its own removal ────────
  {
    id: 'probe-harness-removed',
    from: 'function runRuleProbes() {',
    to: '\n// ── M11: the standing report',
    detected: true,
    why: 'THE REPRODUCED DEFECT. Removing the harness outright used to exit 0 with the tick still claiming probe coverage. The summary now consumes claim("probes"), which nothing minted',
  },
  {
    id: 'probe-loop-emptied',
    from: 'for (const probe of RULE_PROBES) {',
    to: '\n    const findings =',
    replace: 'for (const probe of []) {',
    detected: true,
    why: 'the subtler half: the array and the harness both survive, the loop body never runs. `executed` is raised by work and stays 0, so the reconciliation against RULE_PROBES.length fires',
  },
  {
    id: 'probe-assertion-uncounted',
    from: '    if (found) fired++;\n    else silent++;',
    to: '\n\n    // Verdict assertions',
    detected: true,
    why: 'probes execute and their fires/does-not-fire assertion still holds, but neither half of the sentence is raised. fired + silent no longer reconciles with executed — coverage claimed without an assertion counted',
  },
  {
    id: 'probe-claim-orphaned',
    from: "${claim('probes')} — proof-of-life for the rules the tree gives ",
    to: "'nothing to freeze.';",
    detected: true,
    why: 'the other direction: the harness runs and the summary stops reporting it. An orphaned claim is a check whose verdict reaches nobody, which is how a gate quietly stops saying what it still measures',
  },

  // ── defect 4b: the occurrence-drift check could not detect its own removal ─
  {
    id: 'occurrence-drift-removed',
    from: 'if (countDrift.length > 0) {',
    to: '\nif (barrierBreaks.length > 0) {',
    detected: true,
    why: 'THE REPRODUCED DEFECT. Removing the comparison used to exit 0 over a tree that had just gained a second copy of a frozen mainnet constant, with the tick still reading "none gained a copy"',
  },
  {
    id: 'occurrence-claim-orphaned',
    from: "; ${claim('occurrences')}",
    to: '. ` +',
    detected: true,
    why: 'the comparison runs and the summary stops reporting it',
  },

  // ── the register is general, not two special cases ───────────────────────
  {
    id: 'barrier-report-removed',
    from: 'if (barrierBreaks.length > 0) {',
    to: '\nif (problems.length > 0) {',
    detected: true,
    why: 'M5-M7 are the three absence assertions. Deleting their report leaves claim("barriers") unminted, so "none builds, composes or boots this tree" becomes impossible to print',
  },
  {
    id: 'walk-guard-removed',
    from: 'if (emptyWalks.length > 0) {',
    to: '\n// ── Walk guard, part 3',
    detected: true,
    why: 'the walk guard is the oldest check here and was the only one whose summary numbers were already honest. It is in the register anyway, so removing it cannot leave the file counts standing unattributed',
  },
  {
    id: 'm11-ratchet-report-removed',
    from: 'if (hexProblems.length === 0) {',
    to: '\n// ── The ratchet',
    detected: true,
    why: 'M11 keeps its own baseline and its own sentence. Deleting the mint leaves the width numbers with nothing that says they were reconciled against HEX_BASELINE',
  },

  // ── defect 1: the defaulted placeholder, reverted ────────────────────────
  {
    id: 'placeholder-default-ignored',
    from: 'function resolvePropertyValue(raw, hop = 0) {',
    to: '\n/**\n * An `*address` key does not always hold an address.',
    replace: [
      'function resolvePropertyValue(raw) {',
      '  const value = raw.trim();',
      '  return /^\\$\\{[^}]*\\}$/.test(value) ? null : { scan: value, defaulted: false };',
      '}',
      '',
    ].join('\n'),
    detected: true,
    why: 'the pre-fix predicate, restored verbatim: any whole-string ${…} is skipped before a rule runs, so `${VAR:0x…}` — which RESOLVES, and boots the service on the mainnet contract — reads clean. Killed by the four RULE_PROBES that push a defaulted placeholder through the real matchers',
  },
];

// ── runner ───────────────────────────────────────────────────────────────────

const root = mkdtempSync(join(tmpdir(), 'wallet-rpc-mainnet-mutation-'));

/** @type {string[]} */
const inapplicable = [];

/** Apply one mutant to the scan source. Returns null and records why if its anchors are gone. */
function mutate(m) {
  if (m.from === undefined) return SOURCE;

  const start = SOURCE.indexOf(m.from);
  if (start === -1) {
    inapplicable.push(`[${m.id}] the \`from\` anchor is not in the scan any more:\n        ${m.from.split('\n')[0]}`);
    return null;
  }
  if (SOURCE.indexOf(m.from, start + 1) !== -1) {
    inapplicable.push(
      `[${m.id}] the \`from\` anchor appears more than once — it no longer names one region:\n        ${m.from.split('\n')[0]}`,
    );
    return null;
  }
  const end = SOURCE.indexOf(m.to, start + m.from.length);
  if (end === -1) {
    inapplicable.push(
      `[${m.id}] the \`to\` anchor is not after the \`from\` anchor any more:\n        ${m.to.split('\n').filter(Boolean)[0]}`,
    );
    return null;
  }
  return SOURCE.slice(0, start) + (m.replace ?? '') + SOURCE.slice(end);
}

/** Run a source text as the scan, from the repo root. Returns its exit code. */
function runScan(source, id) {
  const file = join(root, `${id}.mjs`);
  writeFileSync(file, source, 'utf8');
  const run = spawnSync(process.execPath, [file], { cwd: REPO, encoding: 'utf8' });
  return { code: run.status, out: `${run.stdout ?? ''}${run.stderr ?? ''}` };
}

const survivors = [];
const brokenControl = [];

try {
  for (const m of MUTANTS) {
    const source = mutate(m);
    if (source === null) continue;
    const { code, out } = runScan(source, m.id);
    const detected = code !== 0;
    if (detected === m.detected) continue;
    if (m.detected) survivors.push({ ...m, out });
    else brokenControl.push({ ...m, out });
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}

const scored = MUTANTS.filter((m) => m.detected);
const killed = scored.length - survivors.length;

if (inapplicable.length > 0) {
  console.error('\n  ✖ mutants that no longer apply — the anchors moved and these assertions ran on nothing:\n');
  for (const i of inapplicable) console.error(`      ${i}\n`);
  console.error('      A mutation test whose mutants stop applying is a green suite that tests nothing, which is the');
  console.error('      exact defect the scan under test exists to catch. Re-anchor them against the current source.\n');
}

if (brokenControl.length > 0) {
  console.error('\n  ✖ the unmutated scan does not pass — nothing below can be trusted:\n');
  for (const m of brokenControl) console.error(`      [${m.id}]\n${m.out}\n`);
}

if (survivors.length > 0) {
  console.error(`\n  ✖ ${survivors.length} deletion(s) went UNDETECTED — the scan still printed a verdict without them:\n`);
  for (const m of survivors) {
    console.error(`      [${m.id}]  ${m.why}`);
    console.error(`        the scan exited 0 and printed:\n        ${m.out.trim().split('\n').slice(-1)[0].slice(0, 240)}\n`);
  }
  console.error('      Every summary clause must be minted by the check that establishes it. A clause that survives');
  console.error('      the deletion of its check is a claim about work nobody did.\n');
}

if (inapplicable.length > 0 || brokenControl.length > 0 || survivors.length > 0) process.exit(1);

console.log(
  `✓ wallet-rpc-mainnet-scan mutation test — ${killed}/${scored.length} deletions detected ` +
    '(probe harness, probe loop, probe assertion counting, occurrence drift, barrier report, walk guard, M11 ratchet, ' +
    'both orphaned claims, and the defaulted-placeholder resolution), control run clean',
);
