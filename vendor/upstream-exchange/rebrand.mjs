#!/usr/bin/env node
/**
 * REBRAND — the vendored exchange front-end carries the upstream operator's
 * name through copy, meta tags, help-page titles and a CDN it no longer has
 * access to. This rewrites all of it to ours in one pass.
 *
 * It reads and writes UTF-8 explicitly. A previous pass used PowerShell's
 * default encoding, which decoded UTF-8 Chinese as ANSI and wrote the mojibake
 * back — webpack then died on `Unexpected character '€'`. Do not do this with
 * Get-Content/Set-Content.
 *
 * Run from vendor/upstream-exchange: node rebrand.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not URL.pathname — the repo path contains a space, which
// pathname leaves percent-encoded.
const ROOT = dirname(fileURLToPath(import.meta.url));
const EXTS = new Set(['.vue', '.js', '.json', '.html', '.less', '.scss', '.css']);

/** Applied in order. Longest / most specific first. */
const RULES = [
  // The chart bundles are in the repo; upstream loaded them from its own OSS
  // bucket, so the terminal was blank for anyone who is not upstream.
  [/https:\/\/bizzan\.oss-cn-hangzhou\.aliyuncs\.com\/assets\/charting_library\/static\//g, './'],
  [/https:\/\/bizzan\.oss-cn-hangzhou\.aliyuncs\.com\//g, '/static/'],
  [/币严官网/g, 'INTAFACED'],
  [/币严/g, 'INTAFACED'],
  [/www\.bizzan\.com/g, 'www.intafaced.com'],
  [/BIZZAN/g, 'INTAFACED'],
  [/Bizzan/g, 'INTAFACED'],
  [/bizzan/g, 'intafaced'],
];

/** Scoped-slot deep selector: `/deep/` is gone in the current sass/less chain. */
const DEEP = [/\/deep\/\s/g, '::v-deep '];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    // node_modules is not ours; charting_library holds minified vendor bundles
    // whose contents must not be pattern-replaced.
    if (name === 'node_modules' || name === 'charting_library' || name === '.git') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (EXTS.has(extname(name))) out.push(path);
  }
  return out;
}

let changed = 0;
const touched = [];
for (const file of walk(ROOT)) {
  const before = readFileSync(file, 'utf8');
  let after = before;
  for (const [find, replace] of [...RULES, DEEP]) after = after.replace(find, replace);
  if (after !== before) {
    writeFileSync(file, after, 'utf8');
    changed++;
    touched.push(file.slice(ROOT.length));
  }
}

// The chart HTML lives under charting_library, which walk() skips on purpose —
// but its four <script>/<link> tags must still be repointed at the local copies.
const chart = join(
  ROOT,
  '05_Web_Front/src/assets/js/charting_library/static/tv-chart.fe3192321931572c06b8.html',
);
try {
  const before = readFileSync(chart, 'utf8');
  const after = before.replace(RULES[0][0], RULES[0][1]);
  if (after !== before) {
    writeFileSync(chart, after, 'utf8');
    changed++;
    touched.push(chart.slice(ROOT.length));
  }
} catch {
  console.warn('  ! chart host page not found — skipped');
}

console.log(`  ✓ rebranded ${changed} file(s)`);
for (const t of touched) console.log(`      · ${t}`);
