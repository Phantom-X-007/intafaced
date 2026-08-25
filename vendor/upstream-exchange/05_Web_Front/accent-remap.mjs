#!/usr/bin/env node
/**
 * ACCENT REMAP — legacy teal/orange chrome to N4 Terminal Zero.
 *
 * The shell's accent lives in two places, not one:
 *
 *   1. `src/assets/css/intafaced.css` `:root`, which is the token block the
 *      colour-lock doc points at.
 *   2. Roughly a thousand raw hex literals across ~66 Vue/CSS files, inherited
 *      from the upstream template, which the token block does not reach.
 *
 * Changing only (1) leaves the product half one colour and half another, which
 * is visibly worse than either. So the token block and the literals move
 * together, exactly as `../retheme.mjs` did for the original navy→black pass.
 *
 * Market up/down (green/red) is deliberately untouched: a trader reads those as
 * direction, not as brand.
 *
 * Run: node accent-remap.mjs [--dry]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOTS = ['src', 'index.html'].map((p) => join(HERE, p));
const DRY = process.argv.includes('--dry');

const EXTS = new Set(['.vue', '.less', '.scss', '.css', '.html', '.js', '.svg']);
/** Third-party bundles keep their own colours; we do not rewrite vendored libs. */
const SKIP_FILES = new Set([
  'jquery.min.js',
  'jquery-2.0.3.min.js',
  'jquery.fullPage.min.js',
  'jquery.peity.min.js',
  'jquery.qrcode.min.js',
  'bignumber.min.js',
  'gt.js',
]);
const SKIP_DIRS = new Set(['node_modules', 'charting_library', 'market-chart', '.git']);

/** Legacy brand scales → N4 neutral instrument scale. Market green/red stay intact. */
const MAP = {
  '#00c2a8': '#c8c8c8',
  '#1ad4bc': '#e2e2e2',
  '#009e89': '#8a8a8a',
  '#33dcc8': '#f2f2f2',
  '#041210': '#000000',
  '#ff6b00': '#c8c8c8',
  '#ff8534': '#e2e2e2',
  '#cc5500': '#8a8a8a',
  '#ff9d5c': '#f2f2f2',
  '#1a0a00': '#000000',
  '#ff8a1f': '#d8d8d8',
  '#ff8100': '#d0d0d0',
  '#ed7325': '#b8b8b8',
  '#ffa800': '#d8d8d8',
  '#ffaf38': '#bdbdbd',
  '#ffd58a': '#d8d8d8',
  '#f0ad4e': '#bdbdbd',
  '#f0a70a': '#bdbdbd',
  '#ffb100': '#c8c8c8',
  '#df9000': '#8a8a8a',
  '#ee6543': '#a8a8a8',
  '#1a1004': '#080808',
};
/** Same colours expressed as rgba(), used for soft fills and glows. */
const RGBA = [
  [/rgba\(\s*0\s*,\s*194\s*,\s*168\s*,/gi, 'rgba(200, 200, 200,'],
  [/rgba\(\s*255\s*,\s*107\s*,\s*0\s*,/gi, 'rgba(200, 200, 200,'],
  [/rgba\(\s*255\s*,\s*138\s*,\s*31\s*,/gi, 'rgba(216, 216, 216,'],
  [/rgba\(\s*255\s*,\s*175\s*,\s*56\s*,/gi, 'rgba(189, 189, 189,'],
];

function walk(target, out = []) {
  if (!statSync(target).isDirectory()) {
    if (EXTS.has(extname(target)) && !SKIP_FILES.has(target.split(/[\\/]/).pop())) out.push(target);
    return out;
  }
  for (const name of readdirSync(target)) {
    if (SKIP_DIRS.has(name)) continue;
    walk(join(target, name), out);
  }
  return out;
}

const files = ROOTS.flatMap((r) => walk(r));
const tally = new Map();
let changedFiles = 0;

for (const file of files) {
  const before = readFileSync(file, 'utf8');
  let after = before.replace(/#[0-9a-fA-F]{6}\b/g, (match) => {
    const mapped = MAP[match.toLowerCase()];
    if (!mapped) return match;
    tally.set(`${match.toLowerCase()} → ${mapped}`, (tally.get(`${match.toLowerCase()} → ${mapped}`) ?? 0) + 1);
    // Preserve the author's casing habit so diffs stay readable.
    return match === match.toUpperCase() ? mapped.toUpperCase() : mapped;
  });
  for (const [re, to] of RGBA) {
    after = after.replace(re, () => {
      const rule = `${re.source} → ${to}`;
      tally.set(rule, (tally.get(rule) ?? 0) + 1);
      return to;
    });
  }
  if (after !== before) {
    changedFiles++;
    if (!DRY) writeFileSync(file, after, 'utf8');
  }
}

const total = [...tally.values()].reduce((a, b) => a + b, 0);
console.log(`${DRY ? '[dry run] ' : ''}${total} colour(s) remapped across ${changedFiles} file(s)\n`);
for (const [rule, n] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${rule}`);
}
