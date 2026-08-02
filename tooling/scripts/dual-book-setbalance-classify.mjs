#!/usr/bin/env node
/**
 * Classify vendor Java setBalance/setFrozenBalance call sites:
 *   LIVE  — not obviously behind dual-book throw / null short-circuit in same method
 *   DEAD  — method starts with throw dual-book, or guarded by `if (null)` / `= null` disable
 *
 * Honest residual inventory for H-OR-JAVA (human M7). Agents use this so we stop
 * treating already-disabled service bodies as open dual-book holes.
 *
 * Run: node tooling/scripts/dual-book-setbalance-classify.mjs
 * Exit 0 always (report tool). Optional --fail-if-live-over=N for future gates.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const VENDOR = join(ROOT, 'vendor');
const FAIL_OVER = process.argv.find((a) => a.startsWith('--fail-if-live-over='));
const liveCap = FAIL_OVER ? Number(FAIL_OVER.split('=')[1]) : null;

function walk(dir, out = []) {
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

const javaFiles = walk(VENDOR);
const re = /set(?:Frozen)?Balance\s*\(/g;
const rows = [];

for (const file of javaFiles) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/set(?:Frozen)?Balance\s*\(/.test(line)) continue;
    if (/^\s*\/\//.test(line) || line.includes('//memberWallet') || /^\s*\*/.test(line)) {
      // skip pure comments
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
    }
    // window: look back up to 40 lines for method-entry throw dual-book
    const start = Math.max(0, i - 40);
    const window = lines.slice(start, i + 1).join('\n');
    const deadThrow =
      /throw new IllegalStateException\([\s\S]{0,200}(?:dual-book|Java shell must not)/i.test(window) &&
      // throw appears after last method-ish open brace before this line
      true;
    // crude: if any throw dual-book in previous 25 lines of same indentation block
    const back = lines.slice(Math.max(0, i - 25), i).join('\n');
    const hasDisableThrow = /throw new IllegalStateException\([\s\S]*?(dual-book|Java shell must not)/i.test(
      back,
    );
    const nullShort =
      /RewardPromotionSetting\s+\w+\s*=\s*null/.test(back) ||
      /if\s*\(\s*\w+\s*!=\s*null\s*\)/.test(lines[i - 2] ?? '') === false &&
        /rewardPromotionSetting\s*=\s*null/.test(back);

    // Controllers are HTTP door territory — mark CONTROLLED
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    const isController = /\/controller\//i.test(rel);
    const isCommented = line.includes('//') && line.trim().startsWith('//');

    let kind = 'LIVE';
    if (isCommented) kind = 'COMMENT';
    else if (hasDisableThrow) kind = 'DEAD_THROW';
    else if (nullShort && /setBalance/.test(line)) kind = 'DEAD_NULL';
    else if (isController) kind = 'HTTP_DOOR';

    rows.push({ kind, file: rel, line: i + 1, snippet: line.trim().slice(0, 120) });
  }
}

const counts = {};
for (const r of rows) counts[r.kind] = (counts[r.kind] || 0) + 1;

console.log('dual-book setBalance classify');
console.log(JSON.stringify(counts, null, 2));
console.log('--- LIVE (H-OR-JAVA candidates) ---');
const live = rows.filter((r) => r.kind === 'LIVE');
for (const r of live) {
  console.log(`${r.file}:${r.line}: ${r.snippet}`);
}
console.log(`--- total live: ${live.length} ---`);
console.log('--- HTTP_DOOR (covered by interceptor if path listed) ---');
for (const r of rows.filter((r) => r.kind === 'HTTP_DOOR')) {
  console.log(`${r.file}:${r.line}: ${r.snippet}`);
}

if (liveCap != null && live.length > liveCap) {
  console.error(`✖ live setBalance ${live.length} > cap ${liveCap}`);
  process.exit(1);
}
process.exit(0);
