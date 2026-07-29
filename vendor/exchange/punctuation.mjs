#!/usr/bin/env node
/**
 * The English locale file was translated by the vendor but kept Chinese
 * typography: full-width colons, enumeration commas and exclamation marks sit
 * inside otherwise-English sentences, where they render as oversized,
 * badly-spaced glyphs. Ideographic spaces (U+3000) are worse — they look like
 * indentation but are not whitespace to most tooling.
 *
 * This pass covers the files the translation walk deliberately skipped
 * (assets/lang) plus any full-width forms left anywhere else.
 *
 * Run: node punctuation.mjs [--dry]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '05_Web_Front/src');
const DRY = process.argv.includes('--dry');
const EXTS = new Set(['.vue', '.js']);
const SKIP = new Set(['node_modules', 'charting_library', '.git']);

const MAP = [
  [/：/g, ': '],
  [/，/g, ', '],
  [/。/g, '. '],
  [/、/g, ', '],
  [/！/g, '!'],
  [/？/g, '?'],
  [/；/g, '; '],
  [/（/g, ' ('],
  [/）/g, ')'],
  [/《|》/g, ''],
  [/【/g, '['],
  [/】/g, ']'],
  [/　/g, ' '], // ideographic space
  [/···|・・・|…/g, '…'],
  // Collapse the double spaces the above can produce, without touching indent.
  [/(\S)  +/g, '$1 '],
  // A space before terminal punctuation is the tell-tale of a bad conversion.
  [/ +([.,;:!?)])/g, '$1'],
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
for (const file of walk(ROOT)) {
  const before = readFileSync(file, 'utf8');
  let after = before;
  for (const [find, replace] of MAP) after = after.replace(find, replace);
  if (after !== before) {
    changed++;
    if (!DRY) writeFileSync(file, after, 'utf8');
  }
}
console.log(`${DRY ? '[dry run] ' : ''}${changed} file(s) cleaned`);
