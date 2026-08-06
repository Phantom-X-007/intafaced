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
    id: 'coverage',
    script: 'tooling/ci/coverage-check.mjs',
    doctrine: '§25:740',
    why:
      'the law names this gate by path. It answers, on every push, the question the 2026-08-03 audit had to ' +
      'answer by hand: is anything in the law absent from the board without someone having said so — and its ' +
      'mirror, is anything on the board claiming a law that does not say it. Ordered after tracker because it ' +
      'imports features.mjs, and a broken tracker should report as a broken tracker rather than as coverage drift. ' +
      'It was a hand-written step in ci.yml on this branch; it is an entry here instead, because a step that CI ' +
      'runs and `pnpm verify` does not is the exact drift gates.mjs exists to make impossible.',
  },
  {
    id: 'brand',
    script: 'tooling/ci/brand-scan.mjs',
    doctrine: '§0.7',
    why: 'a partner or model-vendor name in user-facing copy',
  },
  {
    id: 'shell-brand',
    script: 'tooling/ci/shell-brand-scan.mjs',
    doctrine: '§0.7',
    why:
      'the same rule as `brand` above, over the one tree `brand` has never opened. brand-scan carries `vendor` in ' +
      'SKIP_DIRS, so its "clean — N files" has never counted a single file of the product shell — which is now the ' +
      'sole product surface, and therefore the surface most likely to show a partner name to a user. It also has no ' +
      '`.vue` in EXTENSIONS, and the shell is 70 single-file components, so removing the skip would not have covered ' +
      'it either. Takes its forbidden names by parsing brand-scan.mjs rather than restating them, so the two cannot ' +
      'drift. Enforcing, at a frozen baseline of 8 named findings that can only shrink — see BASELINE in the scan.',
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
    id: 'wallet-rpc-auth',
    script: 'tooling/ci/wallet-rpc-auth-scan.mjs',
    doctrine: '§16 / A1.4',
    why: 'a wallet RPC module must authenticate /rpc/** — the guard on one module is not the guard on every classpath that can boot',
  },
  {
    id: 'wallet-rpc-mainnet',
    script: 'tooling/ci/wallet-rpc-mainnet-scan.mjs',
    doctrine: '§16 / ADR 2026-07-28',
    why:
      'the wallet RPC tree is barred from live value until the security review the vendored-exchange ADR makes a ' +
      'precondition of adoption has happened — and until this gate that bar existed only in prose. What stopped ' +
      'mainnet was incidental: no Dockerfile, no compose service, no CI job, and env placeholders that decide whether ' +
      'a service STARTS, not which chain it talks to. Supply the environment and every other gate here still printed ' +
      'clean. Ordered next to wallet-rpc-auth because they fence the same tree and answer different questions: auth ' +
      'asks whether a bootable module authenticates, this asks whether anything can boot one at all, and whether a ' +
      'new mainnet constant appeared. 38 existing constants are frozen by exact text AND by how many times each ' +
      'appears, so the baseline can only shrink — text alone left the gate blind to an unused mainnet import becoming ' +
      'a live selector, and to a deleted broadcast being pasted back. Rules that match nothing in the tree (the ' +
      'wss:// scheme, ChainId.NONE, RawTransactionManager, an EVM address under a non-address key) have no baseline ' +
      'to prove them alive, so 16 fixtures run through the real matchers on every invocation instead.',
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
    id: 'skip-honesty',
    script: 'tooling/ci/skip-honesty-scan.mjs',
    doctrine: '§14',
    why:
      'a test file that decides whether to run using a connection it opened itself can skip on CI ' +
      'without honouring REQUIRE_POSTGRES. Six money and identity suites had each copied such a probe, ' +
      'so a database hiccup skipped them silently and the build went green. Four are fixed; the two in ' +
      'svc-pay are under the M1–M7 human lock and sit in tooling/ci/unreported-suites.mjs, which the scan ' +
      'prints on every run and fails on if an entry goes stale.',
  },
  {
    id: 'compose-secret-parity',
    script: 'tooling/ci/compose-secret-parity.mjs',
    doctrine: '§14',
    why:
      'every secret a service refuses to boot without must actually be passed to its container. ' +
      'This class has bitten twice: svc-ledger crash-looped on JWT_ACCESS_SECRET (#431) and svc-academy was ' +
      'never created at all (#442). It is silent in BOTH directions — a running container keeps the environment ' +
      'it started with, and a container nobody started writes no logs. Run against the commit before #431, this ' +
      'gate reproduces that bug and emits the exact fix that was applied.',
  },
  {
    id: 'secret-scan-mutation',
    script: 'tooling/ci/secret-scan.mutation.mjs',
    doctrine: '§14',
    why:
      'the mutation proof for secret-scan, and it belongs beside it rather than in a doc nobody re-runs. ' +
      'A scanner that passes is indistinguishable from a scanner that is switched off — `process.exit(0)` on line 1 ' +
      'prints the same green tick. This is what tells the two apart: 13 planted credentials must be caught and ' +
      '15 credential-shaped-but-correct fixtures must NOT fire.',
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
  'verify.mjs':
    'the verify runner itself — it CALLS this list. Listing it as a gate would make it invoke itself. It exists so the infrastructure verdict prints even when turbo halts early, which a `&&` chain cannot do.',
  'infra-verdict.mjs':
    'a reporter, not a gate: it prints which infrastructure-backed suites actually executed. It never fails a clean run — it exits 2 for "incomplete but permitted", which verify reports without failing. Run by verify.mjs after the test step.',
  'unreported-suites.mjs':
    'data, not a scan — the register of suites that still skip invisibly and that this change was barred from fixing (M1–M7 human lock). It exports two lists and runs nothing. Both skip-honesty-scan.mjs and infra-verdict.mjs import it; the scan fails if an entry goes stale, so it cannot rot into blanket cover.',
  'assert-test-db-env.mjs':
    'asserts the TEST_DATABASE_URL_* env the CI Tests job sets up. It is meaningless without that env, so it belongs to that job (residual #9) rather than to a laptop run.',
  'shell-i18n-scan.mjs':
    'Vue-shell companion to i18n-scan. Deliberately NOT a gate until a fresh keying pass: tip currently has 200+ hardcoded user-facing strings across the shell, so wiring it as blocking would red main. Run by hand via `pnpm scan:shell-i18n` to drive that pass; promote to GATES (blocking) once the count is zero. Not advisory-GATES either — the scan exits 1 by design and its header claims it blocks; keep that contract for the day it is wired.',
  'value-gate.mjs':
    'stamp-mill detector for near-duplicate commits — the docs-only rule (Board-Delta trailer) AND, since 2026-08-06, the code rule (near-duplicate subject SERIES whose new symbols nothing outside them calls; Serial-Work trailer). Wired as an explicit STRICT step in BOTH workflows and in neither gate list: docs-format.yml, because ci.yml excludes docs/** and **/*.md so coordinator docs PRs never hit GATES; and the `gates` job of ci.yml, because docs-format only fires on markdown, so a code PR without a slice doc never met the gate at all — half of how #832–#876 landed. (ci.yml writes that exclusion as negated `paths:` rather than `paths-ignore`, because INTAFACED_DEFINITIVE_BUILD.md is law and coverage-check has to see it; the set of excluded docs is unchanged.) Still NOT a GATES entry: it needs a current `origin/main` plus >=11 ancestors, which a laptop `pnpm verify` cannot promise, and reddening a local verify over a stale fetch is how a gate gets deleted. Both checkouts now pin fetch-depth: 0 — under the actions/checkout default of 1 it compared an empty ancestor list against an empty ancestor list and printed OK. Local pre-flight: `pnpm value-gate:self-test` (20 fixtures).',
  'thrift-preflight.mjs':
    'Actions spend meter for agents (`pnpm thrift:check`) before gh pr create / push — WARN only on run counts (never exit-1). Needs live `gh` for live meters; missing gh is OK. Not a doctrine gate. Self-test via `pnpm thrift:self-test`; law in docs/GITHUB-CI-SPEND-CONTROL and AGENTS.md thrift (local-first 2026-08-05).',
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
