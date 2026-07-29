#!/usr/bin/env node
/**
 * ENGLISH ONLY — remove the Chinese locale from the front-end for good.
 *
 * Setting the i18n default to `en` is not enough. The vendor scattered
 * language branches through the components: a `langPram` computed that asks
 * the backend for CN content and *defaults to CN* when the language is
 * anything unexpected, `v-if` guards that show Chinese-only artwork and legal
 * links, and document titles that append a Chinese site name to every route.
 * Any of those can put Chinese back on screen even with an English locale.
 *
 * This resolves every branch to its English side and deletes the Chinese one,
 * so there is no path left that renders Chinese — not a stale localStorage
 * value, not a query param, not a backend response.
 *
 * Run: node english-only.mjs [--dry]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '05_Web_Front/src');
const DRY = process.argv.includes('--dry');
const EXTS = new Set(['.vue', '.js']);
const SKIP = new Set(['node_modules', 'charting_library', '.git', 'lang']);

const SITE = 'INTAFACED | Sovereign Exchange';

const RULES = [
  // ── the backend content-language parameter ────────────────────────────────
  // Shape is identical in all 11 components. Note the original *defaults* to
  // "CN", which is how Chinese CMS copy reaches an English UI.
  [
    /langPram\s*\(\)\s*\{\s*if\s*\(this\.\$store\.state\.lang\s*==\s*"简体中文"\)\s*\{\s*return\s*"CN";\s*\}\s*if\s*\(this\.\$store\.state\.lang\s*==\s*"English"\)\s*\{\s*return\s*"EN";\s*\}\s*return\s*"CN";\s*\}/g,
    'langPram() {\n      // English only — the backend must never be asked for CN content.\n      return "EN";\n    }',
  ],

  // ── document titles ───────────────────────────────────────────────────────
  // `(this.lang == "简体中文" ? "交易中心" : "Exchange") + " - <chinese site>"`
  [
    /\(\s*this\.lang\s*==\s*"简体中文"\s*\?\s*"[^"]*"\s*:\s*("[^"]*")\s*\)/g,
    '$1',
  ],
  // Whatever site suffix survived, in either quote style.
  [/["']\s*-\s*INTAFACED\s*\|[^"']*["']/g, `" - ${SITE}"`],
  [/["']INTAFACED\s*\|\s*全球[^"']*["']/g, `"${SITE}"`],

  // ── template guards on the Chinese locale ─────────────────────────────────
  // These wrap Chinese-market artwork and PRC legal links. The guard is now
  // permanently false, so the element never renders.
  [/v-if="lang\s*===?\s*'简体中文'\s*&&\s*/g, 'v-if="false && '],
  [/v-if="lang\s*===?\s*'简体中文'"/g, 'v-if="false"'],
  [/v-if="lang\s*===?\s*"简体中文""/g, 'v-if="false"'],

  // ── script-side comparisons ───────────────────────────────────────────────
  [/this\.\$store\.state\.lang\s*==\s*"简体中文"/g, 'false'],
  [/this\.lang\s*==\s*"简体中文"/g, 'false'],
  [/lang\s*===?\s*['"]简体中文['"]/g, 'false'],

  // ── the language switcher's own value ─────────────────────────────────────
  [/this\.\$store\.commit\(\s*["']setlang["']\s*,\s*["']简体中文["']\s*\)/g, 'this.$store.commit("setlang")'],
  [/this\.\$store\.commit\(\s*["']setlang["']\s*,\s*["']English["']\s*\)/g, 'this.$store.commit("setlang")'],

  // ── the CMS title-language filter ─────────────────────────────────────────
  // Kept, because it usefully hides any Chinese article still sitting in the
  // CMS — but its label must not itself be Chinese.
  [/return\s*"简体中文";/g, 'return "Chinese";'],
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
const hits = new Map();

for (const file of walk(ROOT)) {
  const before = readFileSync(file, 'utf8');
  let after = before;
  RULES.forEach(([find, replace], i) => {
    const matches = after.match(find);
    if (matches) hits.set(i, (hits.get(i) ?? 0) + matches.length);
    after = after.replace(find, replace);
  });
  if (after !== before) {
    changed++;
    if (!DRY) writeFileSync(file, after, 'utf8');
  }
}

console.log(`${DRY ? '[dry run] ' : ''}${changed} file(s) changed`);
for (const [i, n] of [...hits.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  rule ${i}: ${String(RULES[i][0]).slice(0, 88)}`);
}
