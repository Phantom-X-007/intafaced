#!/usr/bin/env node
/**
 * thrift-preflight — meter + warn. Never a delivery gate.
 *
 * WHY (2026-08-05 local-first law):
 *   Hard-failing on run counts converted a *cost* problem into a *delivery*
 *   problem (freeImplementable idle; Denon blocked by others' docs thrash;
 *   stale worktrees keep old exit-1 forever). Stamp-mill protection is
 *   content-based (value-gate STRICT on Docs format). Re-push waste is a
 *   habit + loud WARN, not a pre-push exit 1.
 *
 *   Nitro asked for LESS GITHUB SPEND, never for LESS WORK. Numbers that
 *   stop shipping are false thrift.
 *
 * WHAT THIS DOES:
 *   · Prints level=ok|soft|warn + 24h meters (docs / CI / total).
 *   · Loud WARN when docs thrash, CI volume, total volume, or re-push
 *     waste on this branch is high.
 *   · Exit 0 always when gh is available (or missing — local-only OK).
 *   · THRIFT_ALLOW=1 / THRIFT_LOCAL_GREEN=1 still documented for agents
 *     who want to annotate a re-push; they do not change exit code.
 *
 * WHAT THIS DOES NOT DO:
 *   · Does not hard-fail on any run count.
 *   · Does not replace remote CI as merge seal.
 *   · Does not claim local verify is full-green when Docker is missing
 *     (see tooling/ci/verify.mjs INCOMPLETE verdict).
 *
 * Agents:
 *   pnpm thrift:check          # before push / gh pr create (warn only)
 *   Prefer: local work → one push when unit is done → never re-push to watch CI
 *
 * Self-test: node tooling/ci/thrift-preflight.mjs --self-test
 * Dry metrics: node tooling/ci/thrift-preflight.mjs --status
 *
 * Law: docs/GITHUB-CI-SPEND-CONTROL-2026-07-31.md · AGENTS.md thrift · SWARM-MANDATE
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SOFT = Number(process.env.THRIFT_SOFT_RUNS_24H || 120);
const HARD = Number(process.env.THRIFT_HARD_RUNS_24H || 220);
const HARD_DOCS = Number(process.env.THRIFT_HARD_DOCS_24H || 120);
/** Soft reference for CI volume (was hard-fail at 80 — fired on success). */
const HARD_CI = Number(process.env.THRIFT_HARD_CI_24H || 160);
/** ≥ this many CI runs on the same branch in 24h → re-push WARN (not exit 1). */
const MAX_CI_PER_BRANCH = Number(process.env.THRIFT_MAX_CI_PER_BRANCH || 2);
const ALLOW = process.env.THRIFT_ALLOW === '1';
const LOCAL_GREEN = process.env.THRIFT_LOCAL_GREEN === '1';

export function evaluateThrift({ total, byName }, { soft = SOFT, hard = HARD, hardDocs = HARD_DOCS, hardCi = HARD_CI } = {}) {
  let docsRuns = 0;
  let ciRuns = 0;
  for (const [k, v] of Object.entries(byName || {})) {
    if (/docs/i.test(k)) docsRuns += v;
    else if (k === 'CI' || /^CI\b/i.test(k)) ciRuns += v;
  }
  const overSoft = total >= soft;
  const overHard = total >= hard;
  const overDocs = docsRuns >= hardDocs;
  const overCi = ciRuns >= hardCi;
  // All volume signals are soft/warn. No run-count hard level that agents treat
  // as "stop shipping". Stamp mill = value-gate (content), not this meter.
  const level = overDocs || overHard || overCi || overSoft ? 'soft' : 'ok';
  return {
    level,
    total,
    docsRuns,
    ciRuns,
    soft,
    hard,
    hardDocs,
    hardCi,
    overSoft,
    overHard,
    overDocs,
    overCi,
  };
}

/**
 * Re-push waste signal. Never blocks (block is always false).
 * `warn: true` when this branch already used ≥ maxPerBranch CI runs and
 * neither local-green nor allow is set — print loud habit reminder.
 *
 * @param {{ branch: string, ciRunsOnBranch: number, maxPerBranch?: number, localGreen?: boolean, allow?: boolean }} input
 * @returns {{ block: boolean, warn: boolean, reason: string | null }}
 */
export function evaluateRepush({ branch, ciRunsOnBranch, maxPerBranch = MAX_CI_PER_BRANCH, localGreen = LOCAL_GREEN, allow = ALLOW }) {
  if (!branch || branch === 'main' || branch === 'HEAD' || branch === 'detached') {
    return { block: false, warn: false, reason: null };
  }
  if (ciRunsOnBranch < maxPerBranch) {
    return { block: false, warn: false, reason: null };
  }
  if (allow || localGreen) {
    return { block: false, warn: false, reason: null };
  }
  return {
    block: false,
    warn: true,
    reason: `branch "${branch}" already has ${ciRunsOnBranch} CI run(s) in 24h (habit: max ${maxPerBranch} before local verify). Prefer pnpm verify locally, then one push — never re-push only to watch CI.`,
  };
}

export function formatThriftReport(ev, repush = null) {
  const lines = [
    `thrift-preflight: level=${ev.level} total_24h=${ev.total} docs_24h=${ev.docsRuns} ci_24h=${ev.ciRuns}`,
    `  caps (warn only): soft≥${ev.soft} total_ref≥${ev.hard} docs_warn≥${ev.hardDocs} ci_warn≥${ev.hardCi} max_ci_per_branch≥${MAX_CI_PER_BRANCH}`,
  ];
  if (ev.level === 'ok') {
    lines.push('  OK — under soft cap. Push once after local work; GitHub is the merge seal, not the workshop.');
  } else {
    lines.push('  WARN — volume high. NEW work still allowed (no exit 1). Prefer one push per unit; no coordination PRs.');
    if (ev.overDocs) lines.push(`  trip: Docs-format volume ≥${ev.hardDocs} (stamp mill → value-gate content, not a push block)`);
    if (ev.overCi) lines.push(`  trip: CI volume ≥${ev.hardCi} (soft — re-push habit is the real waste)`);
    if (ev.overHard) lines.push(`  trip: total 24h ≥${ev.hard} (soft for new opens)`);
    if (ev.overSoft && !ev.overHard && !ev.overCi && !ev.overDocs) {
      lines.push(`  trip: total 24h ≥${ev.soft}`);
    }
  }
  if (repush?.warn) {
    lines.push(`  WARN — re-push habit: ${repush.reason}`);
    lines.push('  Habit fix: finish unit locally, then one push. THRIFT_LOCAL_GREEN=1 is optional annotation only.');
  } else if (repush && repush.ciRunsOnBranch >= MAX_CI_PER_BRANCH) {
    lines.push(`  re-push: branch has ${repush.ciRunsOnBranch} CI run(s)/24h — local green or ALLOW annotated; push once.`);
  }
  lines.push('  Law: thrift meters and warns; it never blocks delivery. Integrity gates stay absolute.');
  return lines.join('\n');
}

function countActionsRuns24h() {
  try {
    const runs = JSON.parse(
      execFileSync('gh', ['run', 'list', '--limit', '1000', '--json', 'createdAt,name,headBranch'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
    const cut = Date.now() - 24 * 3600 * 1000;
    const last24 = runs.filter((r) => new Date(r.createdAt).getTime() >= cut);
    const byName = {};
    const byBranch = {};
    for (const r of last24) {
      const n = r.name || 'unknown';
      byName[n] = (byName[n] || 0) + 1;
      const b = r.headBranch || '';
      if (b && (n === 'CI' || /^CI\b/i.test(n))) {
        byBranch[b] = (byBranch[b] || 0) + 1;
      }
    }
    return { total: last24.length, byName, byBranch, capped: runs.length >= 1000, available: true };
  } catch (e) {
    return { total: 0, byName: {}, byBranch: {}, capped: false, available: false, error: String(e?.message || e) };
  }
}

function currentBranch() {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

function selfTest() {
  const fails = [];
  const assert = (c, m) => {
    if (!c) fails.push(m);
  };

  const ok = evaluateThrift({ total: 50, byName: { CI: 20, 'Docs format': 30 } }, { soft: 120, hard: 220, hardDocs: 120, hardCi: 160 });
  assert(ok.level === 'ok', 'low volume → ok');

  const ciWasHard = evaluateThrift(
    { total: 100, byName: { CI: 90, 'Docs format': 10 } },
    { soft: 120, hard: 220, hardDocs: 120, hardCi: 160 },
  );
  assert(ciWasHard.level === 'ok', 'CI 90 under soft total and under CI soft 160 → ok');
  assert(!ciWasHard.overCi, 'CI 90 not overCi at hardCi 160');

  const soft = evaluateThrift({ total: 150, byName: { CI: 50, 'Docs format': 100 } }, { soft: 120, hard: 220, hardDocs: 120, hardCi: 160 });
  assert(soft.level === 'soft', 'mid volume → soft (new work still allowed)');

  const softCi = evaluateThrift(
    { total: 180, byName: { CI: 170, 'Docs format': 10 } },
    { soft: 120, hard: 220, hardDocs: 120, hardCi: 160 },
  );
  assert(softCi.level === 'soft' && softCi.overCi, 'CI volume ≥160 → soft, not hard-block');

  const docsOnly = evaluateThrift(
    { total: 130, byName: { 'Docs format': 125, CI: 5 } },
    { soft: 120, hard: 220, hardDocs: 120, hardCi: 160 },
  );
  assert(docsOnly.level === 'soft' && docsOnly.overDocs, 'docs thrash → soft warn (never hard exit)');

  const totalHigh = evaluateThrift(
    { total: 300, byName: { CI: 100, 'Docs format': 50 } },
    { soft: 120, hard: 220, hardDocs: 120, hardCi: 160 },
  );
  assert(totalHigh.level === 'soft' && totalHigh.overHard, 'high total without docs thrash → soft only');

  const repushOk = evaluateRepush({ branch: 'feat/x', ciRunsOnBranch: 1, maxPerBranch: 2 });
  assert(!repushOk.block && !repushOk.warn, 'first/second-ish run free');

  const repushWarn = evaluateRepush({
    branch: 'feat/x',
    ciRunsOnBranch: 2,
    maxPerBranch: 2,
    localGreen: false,
    allow: false,
  });
  assert(!repushWarn.block && repushWarn.warn, '≥2 CI runs without local green → warn only, never block');

  const repushGreen = evaluateRepush({
    branch: 'feat/x',
    ciRunsOnBranch: 5,
    maxPerBranch: 2,
    localGreen: true,
    allow: false,
  });
  assert(!repushGreen.block && !repushGreen.warn, 'local green clears re-push warn');

  const repushAllow = evaluateRepush({
    branch: 'feat/x',
    ciRunsOnBranch: 5,
    maxPerBranch: 2,
    localGreen: false,
    allow: true,
  });
  assert(!repushAllow.block && !repushAllow.warn, 'THRIFT_ALLOW clears re-push warn');

  const mainSkip = evaluateRepush({ branch: 'main', ciRunsOnBranch: 99, maxPerBranch: 2 });
  assert(!mainSkip.block && !mainSkip.warn, 'main not gated by re-push');

  if (fails.length) {
    console.error('thrift-preflight --self-test FAIL:');
    for (const f of fails) console.error(`  · ${f}`);
    process.exit(1);
  }
  console.log('thrift-preflight --self-test OK');
  process.exit(0);
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();

  const metrics = countActionsRuns24h();
  if (!metrics.available) {
    console.log('thrift-preflight: gh unavailable — cannot meter Actions; proceeding (local-only).');
    console.log(`  detail: ${metrics.error || 'no gh'}`);
    // Never block delivery for a missing meter. THRIFT_REQUIRE_GH is retired.
    process.exit(0);
  }

  const ev = evaluateThrift(metrics);
  if (metrics.capped) {
    console.log('thrift-preflight: note — run list capped at 1000; true 24h total may be higher');
  }

  const branch = currentBranch();
  const ciOnBranch = (metrics.byBranch && branch && metrics.byBranch[branch]) || 0;
  const repush = evaluateRepush({
    branch,
    ciRunsOnBranch: ciOnBranch,
    maxPerBranch: MAX_CI_PER_BRANCH,
    localGreen: LOCAL_GREEN,
    allow: ALLOW,
  });
  repush.ciRunsOnBranch = ciOnBranch;

  console.log(formatThriftReport(ev, repush));

  if (ALLOW) {
    console.log('thrift-preflight: THRIFT_ALLOW=1 — annotation only (no hard exits remain)');
  }
  if (LOCAL_GREEN && ciOnBranch >= MAX_CI_PER_BRANCH) {
    console.log('thrift-preflight: THRIFT_LOCAL_GREEN=1 — re-push after local verify annotated');
  }
  // Always exit 0: thrift is a meter, never a delivery gate.
  process.exit(0);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) main();
