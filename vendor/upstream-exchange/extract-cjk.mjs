#!/usr/bin/env node
/**
 * Pull every distinct CJK fragment out of the front-end so it can be
 * translated once and applied everywhere. Most of the 500-odd Chinese lines
 * are the same few dozen strings — "confirm", "please enter", "insufficient
 * balance" — repeated across screens.
 *
 * Emits JSON: { "中文": { count, files: [...] } } sorted by frequency.
 *
 * Run: node extract-cjk.mjs > cjk-strings.json
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Target subdir: first non-flag argument, defaulting to the trading front end. */
const TARGET = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '05_Web_Front/src';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), TARGET);
const EXTS = new Set(['.vue', '.js']);
const SKIP = new Set(['node_modules', 'charting_library', '.git', 'lang']);

// A run of CJK plus the ASCII punctuation/digits that belong inside a phrase.
const FRAGMENT = /[一-鿿　-〿＀-￯][一-鿿　-〿＀-￯0-9a-zA-Z ()（）%,.:：、！？+\-/]*/g;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (EXTS.has(extname(path))) out.push(path);
  }
  return out;
}

const found = new Map();

for (const file of walk(ROOT)) {
  const rel = file.slice(ROOT.length + 1);
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    // Skip comment-only lines; those are a separate pass.
    const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, '');
    for (const raw of code.match(FRAGMENT) ?? []) {
      const text = raw.trim();
      if (!text) continue;
      const entry = found.get(text) ?? { count: 0, files: new Set() };
      entry.count++;
      entry.files.add(rel);
      found.set(text, entry);
    }
  }
}

const sorted = [...found.entries()].sort((a, b) => b[1].count - a[1].count);
const out = {};
for (const [text, e] of sorted) out[text] = { count: e.count, files: [...e.files].slice(0, 4) };

console.log(JSON.stringify(out, null, 2));
console.error(`${sorted.length} distinct fragment(s)`);
