#!/usr/bin/env node
/**
 * DOCTRINE GATES — one list, run by `pnpm verify` AND by CI.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * `AGENTS.md` and its sibling agent entry file both tell every human and every
 * agent the same thing: run `pnpm verify` before you claim done. That promise
 * is only worth something if `verify` runs what CI runs. Until this file it did
 * not, and the two lists lived in two places that knew nothing about each other:
 *
 *   · the `verify` script in package.json, and
 *   · the eleven hand-written steps in the `gates` job of ci.yml.
 *
 * Two gates had already drifted out of the local list — `scan:dual-book-door-paths`
 * and `scan:test-db` — so an engineer could run `pnpm verify` green, push, and
 * land red on a gate they had no local way of running. That is the exact failure
 * this file removes: CI and verify now consume the SAME array, so a gate cannot
 * be in one and missing from the other.
 *
 * It also removes a duplication. Six of these scans used to run twice per CI
 * run — once in the `gates` job and again inside `dod-gate.mjs` in the `dod`
 * job. `dod-gate.mjs` is now what its name says: the per-service §14 Definition
 * of Done. The repo-wide scans live here.
 *
 * THE THIRD DRIFT, and the one that actually bit
 * ─────────────────────────────────────────────
 * `i18n-scan.mjs` sat in `tooling/ci/` for weeks wired into nothing at all —
 * not verify, not CI. Nobody deleted it and nobody ran it. So this runner
 * asserts that EVERY `.mjs` in `tooling/ci/` is either in `GATES` below or in
 * `NOT_GATES` with a written reason. A new scan cannot be added and quietly
 * never run: the manifest check fails until someone says which it is.
 *
 * Usage:
 *   node tooling/ci/gates.mjs          run every gate, report all failures
 *   node tooling/ci/gates.mjs --list   print the gate ids, one per line
 */
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const CI_DIR = join(ROOT, 'tooling', 'ci');

/**
 * The gates. Ordered cheapest-and-most-structural first, so the fastest
 * feedback is the feedback you get first.
 *
 * `advisory: true` means the scan runs and prints but cannot fail the build —
 * used only where the scan is a reporter by design. It is NOT a way to silence
 * a gate that fails; see i18n below for the one case and why.
 */
export const GATES = [
  {
    id: 'agent-autoload',
    script: 'tooling/ci/agent-autoload-scan.mjs',
    doctrine: 'multi-dev law',
    why: 'coordination law must stay in the files a cold agent auto-loads',
  },
  {
    id: 'tracker',
    script: 'tooling/scripts/tracker.mjs',
    args: ['--check'],
    doctrine: 'tracker honesty',
    why: 'a tracker that drifts from the code is worse than no tracker',
  },
  {
    id: 'brand',
    script: 'tooling/ci/brand-scan.mjs',
    doctrine: '§0.7',
    why: 'a partner or model-vendor name in user-facing copy',
  },
  {
    id: 'custody',
    script: 'tooling/ci/custody-scan.mjs',
    doctrine: '§16.10',
    why: 'a Protocol Plane service importing a ledger write recipe. NOTE: walks 4 named services only — see the header of custody-scan.mjs',
  },
  {
    id: 'secrets',
    script: 'tooling/ci/secret-scan.mjs',
    doctrine: '§16',
    why: 'a committed credential is invisible in review — it reads as a config line',
  },
  {
    id: 'vendor-shell',
    script: 'tooling/ci/vendor-shell-scan.mjs',
    doctrine: 'vendor residue',
    why: 'mass-credit endpoints and CORS * inherited from the vendored shell',
  },
  {
    id: 'vendor-java-money',
    script: 'tooling/ci/vendor-java-money-scan.mjs',
    doctrine: 'dual-book Option B',
    why: 'a Java money mutator is a second book, and there is only one book',
  },
  {
    id: 'fabricated-money',
    script: 'tooling/ci/fabricated-money-scan.mjs',
    doctrine: '§0.6',
    why:
      'a money figure on a surface that no service supplied. Was `apps/web/src/testing/fabricated-money.ts`, which had two ' +
      'consumers and dies with that app; the shell replacing it has one unit spec and no root script that runs it. ' +
      'Enforcing, at a frozen baseline of 12 named findings that can only shrink — see BASELINE in the scan.',
  },
  {
    id: 'dual-book-door',
    script: 'tooling/ci/dual-book-door-scan.mjs',
    doctrine: 'Architect A1',
    why: 'the door-kill interceptor must be registered on every vendored app',
  },
  {
    id: 'dual-book-door-paths',
    script: 'tooling/ci/dual-book-door-path-unit.mjs',
    doctrine: 'Architect A1',
    why: 'proves the door-kill path fragments actually block what they claim, without a JVM',
  },
  {
    id: 'test-db',
    script: 'tooling/ci/test-db-scan.mjs',
    doctrine: 'test isolation',
    why: 'a suite pointed at the shared database is how someone else’s main goes red',
  },
  {
    id: 'killswitch',
    script: 'tooling/ci/killswitch-reachability.mjs',
    doctrine: '§14.6',
    why: 'every route killable, enforced at the door, failing closed',
  },
  {
    id: 'migrations',
    script: 'tooling/ci/migration-check.mjs',
    doctrine: '§14',
    why: 'every migration reversible, destructive statements declared',
  },
  {
    id: 'workspace',
    script: 'tooling/ci/workspace-sync.mjs',
    doctrine: 'fleet sync',
    why: 'a service that builds but never reaches the image or the fleet',
  },
  {
    id: 'event-wiring',
    script: 'tooling/ci/event-wiring.mjs',
    doctrine: '§10',
    why:
      'the same shape as workspace-sync, one layer in: a declared subject with no publisher, or no subscriber. ' +
      'The bus could not report silence — a subject nobody publishes and a subject nobody reads both looked ' +
      'exactly like a working one. Every unwired end is now an entry in WIRING_SOCKETS with a written reason, or red.',
  },
  {
    id: 'i18n-bypass',
    script: 'tooling/ci/i18n-bypass-scan.mjs',
    doctrine: '§9, §14.4',
    why:
      'landed on main AFTER this branch was written, and was in `verify` there but not in this list. ' +
      'A rebase that took this side wholesale would have silently dropped a gate main already runs — ' +
      'which is precisely the drift this file exists to make impossible, arriving through its own merge.',
  },
  {
    id: 'i18n',
    script: 'tooling/ci/i18n-scan.mjs',
    doctrine: '§9, §14.4',
    advisory: true,
    why:
      'runs in report mode, which is its default and its designed behaviour. Flipping it to --strict is a real decision, ' +
      'not a wiring change: the tree currently has hardcoded user-facing strings and strict mode would fail verify today. ' +
      'It is listed here rather than omitted so its findings are visible on every run instead of invisible for weeks.',
  },
];

/**
 * Scripts in `tooling/ci/` that are deliberately NOT gates. Each needs a
 * reason, because "it is not in the list" is exactly how i18n-scan went
 * unrun for weeks.
 */
export const NOT_GATES = {
  'gates.mjs': 'this runner — it is the list, so it cannot be an entry in itself.',
  'dod-gate.mjs':
    'run by `pnpm gate`, separately and last — it walks every service and is the §14 Definition of Done, not a repo-wide scan. verify runs it after build/typecheck/test; CI runs it in the `dod` job, which needs [gates, build, test].',
  'claim-check.mjs':
    'advisory, interactive, and needs a working `gh` + network to list open PRs. Run it by hand (`pnpm claim:check`) before starting work, not as a build gate.',
  'assert-test-db-env.mjs':
    'asserts the TEST_DATABASE_URL_* env the CI Tests job sets up. It is meaningless without that env, so it belongs to that job (residual #9) rather than to a laptop run.',
  'shell-i18n-scan.mjs':
    'Vue-shell companion to i18n-scan. Deliberately NOT a gate until a fresh keying pass: tip currently has 200+ hardcoded user-facing strings across the shell, so wiring it as blocking would red main. Run by hand via `pnpm scan:shell-i18n` to drive that pass; promote to GATES (blocking) once the count is zero. Not advisory-GATES either — the scan exits 1 by design and its header claims it blocks; keep that contract for the day it is wired.',
  'value-gate.mjs':
    'stamp-mill detector for docs-only near-duplicate commits. Lives on Docs format workflow (docs-format.yml), not pnpm gates — ci.yml paths-ignore means coordinator docs PRs never hit GATES. Advisory first; flip to strict in that workflow only.',
};

// ── Self-check: nothing in tooling/ci/ may be unaccounted for ───────────────
function manifestCheck() {
  const problems = [];
  const known = new Set(GATES.filter((g) => g.script.startsWith('tooling/ci/')).map((g) => basename(g.script)));

  for (const file of readdirSync(CI_DIR)) {
    if (!file.endsWith('.mjs')) continue;
    if (known.has(file) || file in NOT_GATES) continue;
    problems.push(
      `tooling/ci/${file} is in the gate directory but is in neither GATES nor NOT_GATES.\n` +
        '      Add it to GATES so verify and CI both run it, or to NOT_GATES with the reason it is not a gate.\n' +
        '      A scan nobody runs is worse than no scan: it reads as coverage that does not exist.',
    );
  }

  for (const [file, reason] of Object.entries(NOT_GATES)) {
    if (!existsSync(join(CI_DIR, file))) problems.push(`NOT_GATES lists tooling/ci/${file}, which does not exist. Remove the entry.`);
    else if (!reason || reason.length < 20) problems.push(`NOT_GATES['${file}'] needs a real reason, not a placeholder.`);
  }

  for (const gate of GATES) {
    if (!existsSync(join(ROOT, gate.script))) problems.push(`gate "${gate.id}" points at ${gate.script}, which does not exist.`);
  }

  // The other half of the drift: CI must consume THIS list, not its own copy.
  const workflow = join(ROOT, '.github', 'workflows', 'ci.yml');
  if (existsSync(workflow) && !/pnpm\s+gates\b/.test(readFileSync(workflow, 'utf8'))) {
    problems.push(
      '.github/workflows/ci.yml no longer runs `pnpm gates`.\n' +
        '      CI and verify are drifting apart again — that is how someone runs verify green and lands red.\n' +
        '      Put the `pnpm gates` step back, rather than re-listing individual scans as steps.',
    );
  }

  return problems;
}

// ── Run ────────────────────────────────────────────────────────────────────
if (process.argv.includes('--list')) {
  for (const gate of GATES) console.log(gate.id);
  process.exit(0);
}

const manifestProblems = manifestCheck();
if (manifestProblems.length > 0) {
  console.error('\n✖ GATE MANIFEST BROKEN\n');
  for (const p of manifestProblems) console.error(`  · ${p}\n`);
  process.exit(1);
}

console.log(`\n══ DOCTRINE GATES (${GATES.length}) ══\n`);

const failed = [];
const advisoryNoise = [];
let totalMs = 0;

for (const gate of GATES) {
  const started = process.hrtime.bigint();
  let ok = true;
  let output = '';

  try {
    output = execFileSync(process.execPath, [join(ROOT, gate.script), ...(gate.args ?? [])], {
      encoding: 'utf8',
      cwd: ROOT,
    });
  } catch (err) {
    ok = false;
    output = (err.stdout ?? '') + (err.stderr ?? '');
  }

  const ms = Number((process.hrtime.bigint() - started) / 1000000n);
  totalMs += ms;

  // Every gate is run. None is skipped because an earlier one failed — you
  // should see every broken gate in one run, not discover them one push apart.
  if (ok) {
    const summary = output.trim().split('\n').filter(Boolean).pop() ?? '(no output)';
    console.log(`  ✓ ${gate.id.padEnd(22)} ${String(ms).padStart(5)}ms  ${gate.doctrine}`);
    if (gate.advisory && output.includes('⚠')) {
      advisoryNoise.push({ gate, output });
      console.log(`      ⚠ advisory findings — printed below, not a failure`);
    } else {
      console.log(`      ${summary.trim()}`);
    }
  } else if (gate.advisory) {
    advisoryNoise.push({ gate, output });
    console.log(`  ⚠ ${gate.id.padEnd(22)} ${String(ms).padStart(5)}ms  ${gate.doctrine} (advisory)`);
  } else {
    failed.push({ gate, output });
    console.log(`  ✖ ${gate.id.padEnd(22)} ${String(ms).padStart(5)}ms  ${gate.doctrine}`);
  }
}

for (const { gate, output } of advisoryNoise) {
  console.log(`\n── ${gate.id} (advisory — does not fail the build) ──`);
  console.log(output.trimEnd());
}

if (failed.length > 0) {
  console.error(`\n✖ ${failed.length} of ${GATES.length} DOCTRINE GATE(S) FAILED\n`);
  for (const { gate, output } of failed) {
    console.error(`── ${gate.id} — ${gate.doctrine} ──`);
    console.error(`   why this gate exists: ${gate.why}`);
    console.error(output.trimEnd() + '\n');
  }
  console.error('  A red gate is not a discussion (AGENT_PROTOCOL §3).\n');
  process.exit(1);
}

console.log(`\n✓ all ${GATES.length} doctrine gates passed — ${totalMs}ms total\n`);
