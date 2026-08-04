#!/usr/bin/env node
/**
 * Apply zh-en.json across the front-end.
 *
 * Longest key first, always. Chinese has no word boundaries, so a short key
 * applied early corrupts a longer phrase that contains it — 分 inside 分钟
 * would turn "30 minutes" into "30 " — and the damage is silent.
 *
 * Run: node translate.mjs [--dry]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
/** Target subdir: first non-flag argument, defaulting to the trading front end. */
const TARGET = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '05_Web_Front/src';
const ROOT = join(HERE, TARGET);
const DRY = process.argv.includes('--dry');
const EXTS = new Set(['.vue', '.js']);
const SKIP = new Set(['node_modules', 'charting_library', '.git', 'lang']);

const dict = JSON.parse(readFileSync(join(HERE, 'zh-en.json'), 'utf8'));
const pairs = Object.entries(dict)
  .filter(([k]) => !k.startsWith('_'))
  .sort((a, b) => b[0].length - a[0].length);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (EXTS.has(extname(path))) out.push(path);
  }
  return out;
}

let changed = 0;
let applied = 0;
const unused = new Set(pairs.map(([k]) => k));

for (const file of walk(ROOT)) {
  const before = readFileSync(file, 'utf8');
  let after = before;
  for (const [zh, en] of pairs) {
    if (!after.includes(zh)) continue;
    applied += after.split(zh).length - 1;
    unused.delete(zh);
    after = after.split(zh).join(en);
  }
  if (after !== before) {
    changed++;
    if (!DRY) writeFileSync(file, after, 'utf8');
  }
}

console.log(`${DRY ? '[dry run] ' : ''}${applied} replacement(s) in ${changed} file(s)`);
if (unused.size) console.log(`  ${unused.size} dictionary key(s) never matched: ${[...unused].slice(0, 12).join(' · ')}`);
