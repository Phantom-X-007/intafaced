#!/usr/bin/env node
/**
 * RETHEME — the vendored front-end is navy + gold, hardcoded as literal hex in
 * ~1,900 places rather than as variables. This remaps the whole palette to
 * INTAFACED black + orange in one pass.
 *
 * Two layers, because a hand-written list of the top offenders always misses a
 * long tail of one-off shades that then show up as a stray blue panel:
 *
 *   1. EXPLICIT — the brand colours, mapped deliberately. Gold and the
 *      secondary blues both become the orange scale; the navy surfaces become
 *      the black scale.
 *   2. DERIVED — any remaining *dark, cool* colour is a surface the designer
 *      tinted blue. Those are desaturated to a neutral of the same lightness.
 *      Bright cool colours are left alone: they are content, not chrome.
 *
 * Market up/down (green #00b275, red #ff4a68) is deliberately untouched. Those
 * are not branding — a trader reads them as direction, and recolouring them to
 * fit a palette would be actively wrong.
 *
 * Run: node retheme.mjs [--dry]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOTS = ['05_Web_Front/src', '05_Web_Front/index.html'].map((p) => join(HERE, p));
const DRY = process.argv.includes('--dry');

const EXTS = new Set(['.vue', '.less', '.scss', '.css', '.html', '.js']);
const SKIP = new Set(['node_modules', 'charting_library', '.git']);

/** The brand. Everything else is derived from these. */
const ORANGE = '#ff6b00';
const ORANGE_LIGHT = '#ff8534';
const ORANGE_DARK = '#cc5500';

const EXPLICIT = {
  // ── gold → orange ─────────────────────────────────────────────────────────
  '#f0a70a': ORANGE,
  '#f0ac19': ORANGE_LIGHT,
  '#f1ab15': ORANGE_LIGHT,
  '#f89e30': ORANGE_LIGHT,
  '#f9b03c': ORANGE_LIGHT,
  '#e09a09': ORANGE_DARK,
  '#d99a0c': ORANGE_DARK,
  // gold tints used as pale backgrounds behind notices
  '#fdfaf3': '#1a1004',
  '#f9f5eb': '#1a1004',
  // ── secondary blues → orange, so the accent reads as one brand ────────────
  '#3bb3e4': ORANGE,
  '#3babd8': ORANGE,
  '#049ddc': ORANGE_DARK,
  '#00b5f6': ORANGE,
  '#5ec6e8': ORANGE_LIGHT,
  // ── navy surfaces → black scale ───────────────────────────────────────────
  '#192330': '#000000', // page background
  '#141e2c': '#000000',
  '#18202a': '#050505',
  '#27313e': '#141414', // panel / card
  '#2b3648': '#1c1c1c',
  '#1b2431': '#0a0a0a',
  '#252c3c': '#161616',
  '#0e1621': '#000000',
  // ── cool greys → neutral greys ────────────────────────────────────────────
  '#828ea1': '#8a8a8a',
  '#8994a3': '#909090',
  '#61688a': '#6b6b6b',
  '#c5cdd7': '#cccccc',
  '#c9cbcd': '#cbcbcb',
};

const hex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/**
 * A dark colour with a clear blue bias is chrome the designer tinted navy.
 * Flatten it to neutral at the same perceived lightness.
 */
function derive(value) {
  const r = parseInt(value.slice(1, 3), 16);
  const g = parseInt(value.slice(3, 5), 16);
  const b = parseInt(value.slice(5, 7), 16);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const cool = b - r;
  // Bright colours are content (charts, illustrations) — leave them.
  if (lum > 110 || cool < 18) return null;
  // Pull toward black harder than a straight desaturation would, so panels
  // separate from the true-black page background instead of muddying into it.
  const grey = lum * 0.72;
  return `#${hex(grey)}${hex(grey)}${hex(grey)}`;
}

function walk(target, out = []) {
  if (!statSync(target).isDirectory()) {
    if (EXTS.has(extname(target))) out.push(target);
    return out;
  }
  for (const name of readdirSync(target)) {
    if (SKIP.has(name)) continue;
    walk(join(target, name), out);
  }
  return out;
}

const files = ROOTS.flatMap((r) => walk(r));
const tally = new Map();
let changedFiles = 0;

for (const file of files) {
  const before = readFileSync(file, 'utf8');
  const after = before.replace(/#[0-9a-fA-F]{6}\b/g, (match) => {
    const key = match.toLowerCase();
    const mapped = EXPLICIT[key] ?? derive(key);
    if (!mapped || mapped === key) return match;
    tally.set(`${key} → ${mapped}`, (tally.get(`${key} → ${mapped}`) ?? 0) + 1);
    return mapped;
  });
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
