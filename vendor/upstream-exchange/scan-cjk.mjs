#!/usr/bin/env node
/**
 * Report every remaining CJK string in the front-end, split by where it lives:
 * template text and user-facing strings (what a user actually sees) versus
 * comments (what the team sees when they open the file).
 *
 * Run: node scan-cjk.mjs [subdir]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), process.argv[2] ?? '05_Web_Front/src');
const CJK = /[一-鿿　-〿＀-￯]/;
const EXTS = new Set(['.vue', '.js', '.html']);
const SKIP = new Set(['node_modules', 'charting_library', '.git', 'lang']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (EXTS.has(extname(name))) out.push(path);
  }
  return out;
}

let visible = 0;
let comments = 0;
const perFile = [];

for (const file of walk(ROOT)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  let v = 0;
  let c = 0;
  for (const line of lines) {
    if (!CJK.test(line)) continue;
    // A line whose CJK sits only after a comment marker is not user-visible.
    const stripped = line.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (CJK.test(stripped)) v++;
    else c++;
  }
  if (v + c > 0) {
    visible += v;
    comments += c;
    perFile.push({ file: file.slice(ROOT.length + 1), v, c });
  }
}

perFile.sort((a, b) => b.v - a.v);
console.log(`files with CJK: ${perFile.length}`);
console.log(`user-visible lines: ${visible}`);
console.log(`comment-only lines: ${comments}\n`);
for (const f of perFile.slice(0, 40)) {
  console.log(`  ${String(f.v).padStart(4)} visible ${String(f.c).padStart(4)} comment  ${f.file}`);
}
