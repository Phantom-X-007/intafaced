#!/usr/bin/env node
/**
 * Writes .artifacts/uiproof/PROOF.md from the matrix + screenshot inventory + playwright JSON.
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROUTES, VIEWPORTS, shotName } from './matrix.mjs';

const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();
const ARTIFACTS = join(REPO_ROOT, '.artifacts', 'uiproof');
const SHOTS = join(ARTIFACTS, 'shots');
const REPORT_JSON = join(ARTIFACTS, 'playwright-report.json');
const PROOF = join(ARTIFACTS, 'PROOF.md');

mkdirSync(ARTIFACTS, { recursive: true });

function loadPlaywright() {
  if (!existsSync(REPORT_JSON)) return null;
  try {
    return JSON.parse(readFileSync(REPORT_JSON, 'utf8'));
  } catch {
    return null;
  }
}

function findResult(pw, routeId, vpName) {
  if (!pw?.suites) return null;
  const needle = `${routeId} @ ${vpName}`;
  const stack = [...pw.suites];
  while (stack.length) {
    const s = stack.pop();
    if (s.suites) stack.push(...s.suites);
    for (const spec of s.specs || []) {
      if (String(spec.title).includes(needle)) {
        const ok = spec.ok === true || (spec.tests || []).every((t) => t.status === 'expected' || t.status === 'passed');
        // Playwright JSON: tests[].results[].status
        let status = 'unknown';
        for (const t of spec.tests || []) {
          for (const r of t.results || []) {
            status = r.status || status;
          }
        }
        if (spec.ok === true) status = 'passed';
        if (spec.ok === false) status = status === 'unknown' ? 'failed' : status;
        return { status, ok: spec.ok };
      }
    }
  }
  return null;
}

const pw = loadPlaywright();
const shotsOnDisk = existsSync(SHOTS)
  ? new Set(readdirSync(SHOTS).filter((f) => f.endsWith('.png')))
  : new Set();

const rows = [];
let allPass = true;

for (const route of ROUTES) {
  for (const vp of VIEWPORTS) {
    const name = shotName(route.id, vp.name);
    const hasShot = shotsOnDisk.has(name);
    const result = findResult(pw, route.id, vp.name);
    let status = 'FAIL';
    let detail = '';

    if (result?.ok === true || result?.status === 'passed' || result?.status === 'expected') {
      status = hasShot ? 'PASS' : 'FAIL';
      detail = hasShot ? 'ok' : 'missing screenshot';
    } else if (result?.status === 'failed' || result?.ok === false) {
      status = 'FAIL';
      detail = 'playwright failed';
    } else if (!pw) {
      status = hasShot ? 'PASS' : 'FAIL';
      detail = hasShot ? 'shot present (no playwright json)' : 'no report + no shot';
    } else {
      status = 'FAIL';
      detail = 'no matching test result';
    }

    if (status !== 'PASS') allPass = false;

    rows.push({
      route: route.path,
      id: route.id,
      viewport: vp.name,
      status,
      detail,
      shot: name,
      note: route.note || '',
    });
  }
}

const when = new Date().toISOString();
const lines = [
  '# PROOF.md — Stream A uiproof',
  '',
  `**Generated:** ${when}`,
  `**Base:** ${process.env.UIPROOF_BASE || `http://127.0.0.1:${process.env.PORT || 8090}`}`,
  `**Overall:** ${allPass ? 'PASS' : 'FAIL'}`,
  '',
  '| Route | Viewport | Status | Screenshot | Detail |',
  '| --- | --- | --- | --- | --- |',
];

for (const r of rows) {
  lines.push(`| \`${r.route}\` (${r.id}) | ${r.viewport} | **${r.status}** | \`${r.shot}\` | ${r.detail} |`);
}

lines.push('');
lines.push('## Notes');
lines.push('');
lines.push('- Backends-down is the intended fixture; network errors to `/uc`, `/market`, `/exchange`, `/otc`, `/api` are allowlisted.');
lines.push('- `/uc/account` proves login gate only — account empty-vs-error is **unproven** until Pass 3 auth fixture.');
lines.push('- Prices / S2 wait on market seed #109 — never fake.');
lines.push('- Coverage truth is `tooling/uiproof/matrix.mjs`, not this prose.');
lines.push('');
lines.push('## Matrix notes');
lines.push('');
for (const route of ROUTES) {
  lines.push(`- \`${route.path}\` — ${route.note || ''}`);
}
lines.push('');

writeFileSync(PROOF, lines.join('\n'));
console.log(`[ui:proof] wrote ${PROOF}`);
console.log(`[ui:proof] overall ${allPass ? 'PASS' : 'FAIL'} (${rows.length} cells)`);

if (!allPass) process.exit(1);
