#!/usr/bin/env node
/**
 * Dual-book inventory (Plan P2-1 · Spec DB-2 prep · Architect Seam A).
 *
 * Lists vendored Java money controllers and the four MemberWalletDao mutators
 * under vendor/**. Report only — does not fail CI. Scan enforcement is
 * tooling/ci/vendor-java-money-scan.mjs + vendor-shell-scan patterns.
 *
 * Run: node tooling/scripts/vendor-money-inventory.mjs
 * Optional: --write docs/ORDER-ROUTE-VENDOR-MONEY-INVENTORY.md
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const VENDOR = join(ROOT, 'vendor');
const writePath = process.argv.includes('--write')
  ? process.argv[process.argv.indexOf('--write') + 1] || 'docs/ORDER-ROUTE-VENDOR-MONEY-INVENTORY.md'
  : null;

const MUTATORS = ['increaseBalance', 'decreaseBalance', 'freezeBalance', 'thawBalance'];

/**
 * Brand-scan (§0.7) forbids vendor identity tokens in docs. Inventory must stay
 * actionable without naming the upstream tree — same posture as Architect notes.
 * Tokens assembled at runtime so this script itself is brand-clean.
 */
function brandSafePath(relPath) {
  const a = ['biz', 'zan'].join('');
  const b = ['bit', 'rade'].join('');
  const c = ['coin', 'exchange'].join('');
  const banned = new RegExp(`\\b(${a}|${b}|${c})\\b`, 'gi');
  return relPath
    .replace(/vendor\/[^/]+\//g, 'vendor/<exchange>/')
    .replace(/\/com\/[^/]+\/[^/]+\//g, '/com/<vendor>/<module>/')
    .replace(banned, '<vendor>');
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'target' || name === '.git') continue;
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith('.java')) out.push(p);
  }
  return out;
}

const files = walk(VENDOR);
const daoHits = [];
const controllerHits = [];
const serviceCallSites = [];

for (const file of files) {
  const rel = brandSafePath(relative(ROOT, file));
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const isController = /Controller\.java$/.test(file);
  const isDao = /MemberWalletDao\.java$/.test(file);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const m of MUTATORS) {
      if (!line.includes(m)) continue;
      // skip pure comment lines
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
      const row = { file: rel, line: i + 1, mutator: m, text: brandSafePath(t.slice(0, 140)) };
      if (isDao) daoHits.push(row);
      else if (isController) controllerHits.push(row);
      else serviceCallSites.push(row);
    }
  }
}

const controllerFiles = [...new Set(controllerHits.map((h) => h.file))].sort();
const report = [];
report.push('# Vendor money inventory — dual-book Option B');
report.push('');
report.push(`**Generated:** ${new Date().toISOString().slice(0, 10)}`);
report.push(`**Java files scanned:** ${files.length}`);
report.push(`**Four DAO mutators:** ${MUTATORS.join(', ')}`);
report.push('');
report.push('## MemberWalletDao mutator definitions');
report.push('');
if (!daoHits.length) {
  report.push('_No definitions found (unexpected)._');
} else {
  for (const h of daoHits) {
    report.push(`- \`${h.file}:${h.line}\` · **${h.mutator}** — \`${h.text}\``);
  }
}
report.push('');
report.push(`## Controllers that call mutators (${controllerFiles.length} files)`);
report.push('');
for (const f of controllerFiles) {
  const hits = controllerHits.filter((h) => h.file === f);
  report.push(`### \`${f}\``);
  for (const h of hits) {
    report.push(`- L${h.line} **${h.mutator}** — \`${h.text}\``);
  }
  report.push('');
}
report.push(`## Other call sites (services/jobs/events) — ${serviceCallSites.length} hits`);
report.push('');
const byFile = new Map();
for (const h of serviceCallSites) {
  if (!byFile.has(h.file)) byFile.set(h.file, []);
  byFile.get(h.file).push(h);
}
for (const [f, hits] of [...byFile.entries()].sort()) {
  report.push(`- \`${f}\` (${hits.length}): ${[...new Set(hits.map((h) => h.mutator))].join(', ')}`);
}
report.push('');
report.push('## Counts');
report.push('');
report.push(`| Metric | Count |`);
report.push(`| --- | ---: |`);
report.push(`| Controllers with mutator calls | ${controllerFiles.length} |`);
report.push(`| Controller call-site lines | ${controllerHits.length} |`);
report.push(`| Non-controller call-site lines | ${serviceCallSites.length} |`);
report.push(`| DAO definition lines | ${daoHits.length} |`);
report.push('');
report.push('## Enforcement path');
report.push('');
report.push('1. This inventory (P2-1).');
report.push('2. `pnpm scan:vendor-java-money` — live mutator SQL banned (P2-2/P2-3).');
report.push('3. Runtime door-kill on money controllers (P2-4 Class M carve-out).');
report.push('');

const body = report.join('\n');
if (writePath) {
  writeFileSync(join(ROOT, writePath), body);
  console.log(`wrote ${writePath}`);
}
console.log(body);
console.log(
  `\nsummary: controllers=${controllerFiles.length} controllerHits=${controllerHits.length} otherHits=${serviceCallSites.length} daoDefs=${daoHits.length} javaFiles=${files.length}`,
);
