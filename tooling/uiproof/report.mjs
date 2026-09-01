#!/usr/bin/env node
/**
 * Writes .artifacts/uiproof/PROOF.md from the matrix + screenshot inventory + playwright JSON.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { PROOF_CASES, ROUTES, shotName } from './matrix.mjs';
import { evaluateCell, findResult } from './report-policy.mjs';

const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();
const ARTIFACTS = join(REPO_ROOT, '.artifacts', 'uiproof');
const SHOTS = join(ARTIFACTS, 'shots');
const REPORT_JSON = join(ARTIFACTS, 'playwright-report.json');
const PROOF = join(ARTIFACTS, 'PROOF.md');
const MANIFEST = join(ARTIFACTS, 'evidence-manifest.json');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

mkdirSync(ARTIFACTS, { recursive: true });

function loadPlaywright() {
  if (!existsSync(REPORT_JSON)) return null;
  try {
    const report = JSON.parse(readFileSync(REPORT_JSON, 'utf8'));
    // A report copied from an earlier checkout is not evidence for this one.
    if (report?.config?.metadata?.commit !== commit) return null;
    return report;
  } catch {
    return null;
  }
}

const pw = loadPlaywright();
const shotsOnDisk = existsSync(SHOTS) ? new Set(readdirSync(SHOTS).filter((f) => f.endsWith('.png'))) : new Set();

const rows = [];
let allPass = true;

for (const proofCase of PROOF_CASES) {
  const { route, viewport: vp, tier } = proofCase;
  const name = shotName(route.id, vp.name);
  const hasShot = shotsOnDisk.has(name);
  const result = findResult(pw, route.id, vp.name);
  const verdict = evaluateCell(pw, result, hasShot);
  const { status, detail } = verdict;

  if (status !== 'PASS') allPass = false;

  rows.push({
    route: route.path,
    id: route.id,
    viewport: vp.name,
    status,
    detail,
    shot: name,
    note: route.note || '',
    sourcePath: route.sourcePath,
    projects: result?.projects || [],
    tier,
  });
}

const when = new Date().toISOString();
const lines = [
  '# PROOF.md — Stream A uiproof',
  '',
  `**Generated:** ${when}`,
  `**Base:** ${process.env.UIPROOF_BASE || `http://127.0.0.1:${process.env.PORT || 8090}`}`,
  `**Overall:** ${allPass ? 'PASS' : 'FAIL'}`,
  '',
  '| Tier | Route | Viewport | Status | Screenshot | Detail |',
  '| --- | --- | --- | --- | --- | --- |',
];

for (const r of rows) {
  lines.push(`| ${r.tier} | \`${r.route}\` (${r.id}) | ${r.viewport} | **${r.status}** | \`${r.shot}\` | ${r.detail} |`);
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

const evidence = rows.map((row) => {
  const screenshotPath = join(SHOTS, row.shot);
  if (!existsSync(screenshotPath)) {
    return { ...row, sha256: null, bytes: null };
  }
  const bytes = readFileSync(screenshotPath);
  return {
    ...row,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: statSync(screenshotPath).size,
  };
});
writeFileSync(
  MANIFEST,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      generatedAt: when,
      commit,
      base: process.env.UIPROOF_BASE || `http://127.0.0.1:${process.env.PORT || 8090}`,
      playwrightVersion: pw?.config?.version || null,
      overall: allPass ? 'PASS' : 'FAIL',
      evidence,
    },
    null,
    2,
  )}\n`,
);
console.log(`[ui:proof] wrote ${PROOF}`);
console.log(`[ui:proof] wrote ${MANIFEST}`);
console.log(`[ui:proof] overall ${allPass ? 'PASS' : 'FAIL'} (${rows.length} cells)`);

if (!allPass) process.exit(1);
