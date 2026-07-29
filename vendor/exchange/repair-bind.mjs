#!/usr/bin/env node
/**
 * Repair damage from the punctuation pass.
 *
 * That pass removed spaces before `:` in order to fix "word ：" artefacts left
 * by the Chinese typography. In templates it also matched Vue's `:` bind
 * shorthand, so `<div :class="x">` became `<div:class="x">` — which the
 * template compiler rejects outright.
 *
 * Restores the space only where a `:`-prefixed attribute directly abuts a tag
 * name or a closing attribute quote. Namespaced attributes (xlink:href,
 * xmlns:xlink) and directive arguments (v-bind:class, v-on:click) are not
 * matched, because their colon follows an identifier rather than a tag or
 * quote.
 *
 * Run: node repair-bind.mjs [--dry]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '05_Web_Front/src');
const DRY = process.argv.includes('--dry');
const EXTS = new Set(['.vue', '.js', '.html']);
const SKIP = new Set(['node_modules', 'charting_library', '.git']);

const RULES = [
  // <tag:attr="  and  "attr:next="  →  restore the separating space
  [/(<[A-Za-z][A-Za-z0-9-]*)(:[A-Za-z][A-Za-z0-9._-]*=)/g, '$1 $2'],
  [/(["'])(:[A-Za-z][A-Za-z0-9._-]*=)/g, '$1 $2'],
  // the same collision for the @ shorthand and for plain attributes
  [/(<[A-Za-z][A-Za-z0-9-]*)(@[A-Za-z][A-Za-z0-9._-]*=)/g, '$1 $2'],
  [/(["'])(v-[a-z-]+[=\s>])/g, '$1 $2'],
];

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
let fixes = 0;
for (const file of walk(ROOT)) {
  const before = readFileSync(file, 'utf8');
  let after = before;
  for (const [find, replace] of RULES) {
    const m = after.match(find);
    if (m) fixes += m.length;
    after = after.replace(find, replace);
  }
  if (after !== before) {
    changed++;
    if (!DRY) writeFileSync(file, after, 'utf8');
  }
}
console.log(`${DRY ? '[dry run] ' : ''}${fixes} binding(s) repaired across ${changed} file(s)`);
