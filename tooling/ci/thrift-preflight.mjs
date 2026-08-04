#!/usr/bin/env node
/**
 * thrift-preflight — agent-enforced Actions spend brake (mechanical, not a banner).
 *
 * WHY: value-gate stops *stamp-mill docs titles*. It does NOT stop:
 *   - double-billing (CI on PR + again on main after merge)
 *   - push storms that cancel mid-matrix
 *   - opening more docs/code PRs while the 24h run meter is already red
 *
 * Agents MUST run this before `gh pr create` / force-push that restarts CI:
 *   pnpm thrift:check
 *
 * Defaults (override with env) — tightened 2026-08-04 for AFK thrift:
 *   THRIFT_SOFT_RUNS_24H=120   → WARN (exit 0, loud) — batch now
 *   THRIFT_HARD_RUNS_24H=220   → FAIL (exit 1) unless THRIFT_ALLOW=1
 *   THRIFT_HARD_DOCS_24H=120   → FAIL if Docs-format alone exceeds (stamp / docs thrash)
 *   THRIFT_HARD_CI_24H=80      → FAIL if CI alone exceeds (push-storm / micro-PR mill)
 *
 * Self-test: node tooling/ci/thrift-preflight.mjs --self-test
 * Dry metrics only: node tooling/ci/thrift-preflight.mjs --status
 *
 * Law: docs/GITHUB-CI-SPEND-CONTROL-2026-07-31.md · AGENTS.md thrift · SWARM-MANDATE
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SOFT = Number(process.env.THRIFT_SOFT_RUNS_24H || 120);
const HARD = Number(process.env.THRIFT_HARD_RUNS_24H || 220);
const HARD_DOCS = Number(process.env.THRIFT_HARD_DOCS_24H || 120);
const HARD_CI = Number(process.env.THRIFT_HARD_CI_24H || 80);
const ALLOW = process.env.THRIFT_ALLOW === '1';

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
  const level = overHard || overDocs || overCi ? 'hard' : overSoft ? 'soft' : 'ok';
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

export function formatThriftReport(ev) {
  const lines = [
    `thrift-preflight: level=${ev.level} total_24h=${ev.total} docs_24h=${ev.docsRuns} ci_24h=${ev.ciRuns}`,
    `  caps: soft≥${ev.soft} hard≥${ev.hard} docs_hard≥${ev.hardDocs} ci_hard≥${ev.hardCi}`,
  ];
  if (ev.level === 'ok') {
    lines.push('  OK — under soft cap. Batch path-disjoint work into fewer PRs; local verify first.');
  } else if (ev.level === 'soft') {
    lines.push('  WARN — soft cap. STOP micro-PRs; batch claims; no docs tip-bumps; no re-push until local green.');
  } else {
    lines.push('  FAIL — hard cap. Do NOT open/update PRs that start new Actions runs.');
    if (ev.overDocs) lines.push('  trip: Docs-format thrash');
    if (ev.overCi) lines.push('  trip: CI thrash (too many code PRs / push storms)');
    if (ev.overHard) lines.push('  trip: total 24h runs');
    lines.push('  Allowed: local work, residual-own notes, wait for 24h window to cool, or THRIFT_ALLOW=1 (emergency only).');
    lines.push('  Prefer: merge already-green Class N; batch next wave into 1–3 fat PRs not 20 thin ones.');
  }
  return lines.join('\n');
}

function countActionsRuns24h() {
  try {
    const runs = JSON.parse(
      execFileSync('gh', ['run', 'list', '--limit', '1000', '--json', 'createdAt,name'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
    const cut = Date.now() - 24 * 3600 * 1000;
    const last24 = runs.filter((r) => new Date(r.createdAt).getTime() >= cut);
    const byName = {};
    for (const r of last24) {
      const n = r.name || 'unknown';
      byName[n] = (byName[n] || 0) + 1;
    }
    return { total: last24.length, byName, capped: runs.length >= 1000, available: true };
  } catch (e) {
    return { total: 0, byName: {}, capped: false, available: false, error: String(e?.message || e) };
  }
}

function selfTest() {
  const fails = [];
  const assert = (c, m) => {
    if (!c) fails.push(m);
  };

  const ok = evaluateThrift({ total: 50, byName: { CI: 20, 'Docs format': 30 } }, { soft: 120, hard: 220, hardDocs: 120, hardCi: 80 });
  assert(ok.level === 'ok', 'low volume → ok');

  const soft = evaluateThrift({ total: 150, byName: { CI: 50, 'Docs format': 100 } }, { soft: 120, hard: 220, hardDocs: 120, hardCi: 80 });
  assert(soft.level === 'soft', 'mid volume → soft');

  const hard = evaluateThrift({ total: 300, byName: { CI: 50, 'Docs format': 250 } }, { soft: 120, hard: 220, hardDocs: 120, hardCi: 80 });
  assert(hard.level === 'hard', 'high total → hard');
  assert(hard.overDocs === true, 'docs hard trips');

  const docsOnlyHard = evaluateThrift(
    { total: 130, byName: { 'Docs format': 125, CI: 5 } },
    { soft: 120, hard: 220, hardDocs: 120, hardCi: 80 },
  );
  assert(docsOnlyHard.level === 'hard', 'docs-only thrash → hard even under total hard');

  const ciHard = evaluateThrift({ total: 100, byName: { CI: 90, 'Docs format': 10 } }, { soft: 120, hard: 220, hardDocs: 120, hardCi: 80 });
  assert(ciHard.level === 'hard' && ciHard.overCi, 'CI micro-PR thrash → hard');

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
    // Do not hard-fail sandboxes without gh — agents in CI would brick. Agents with GH_TOKEN must meter.
    if (process.env.THRIFT_REQUIRE_GH === '1') {
      console.error('thrift-preflight: FAIL — THRIFT_REQUIRE_GH=1 and gh meter missing');
      process.exit(1);
    }
    process.exit(0);
  }

  const ev = evaluateThrift(metrics);
  if (metrics.capped) {
    console.log('thrift-preflight: note — run list capped at 1000; true 24h total may be higher');
  }
  console.log(formatThriftReport(ev));

  if (ev.level === 'hard' && !ALLOW) {
    process.exit(1);
  }
  if (ALLOW && ev.level === 'hard') {
    console.log('thrift-preflight: THRIFT_ALLOW=1 — hard cap overridden (emergency)');
  }
  process.exit(0);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) main();
