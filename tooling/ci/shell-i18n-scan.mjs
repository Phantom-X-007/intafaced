#!/usr/bin/env node
/**
 * SHELL i18n SCAN — §9 and §14.4, enforced.
 *
 *   "i18n: all surfaces keyed from day one; 100+ languages = translation files,
 *    not refactors" (§9)
 *   "Every user-facing string i18n-keyed" (§14.4)
 *
 * The companion to `i18n-scan.mjs`. That one reads `apps/**\/*.tsx` and only
 * REPORTS; this one reads the Vue shell under vendor/ and BLOCKS.
 *
 * Two scanners because the two trees are in different places. `apps/` is still
 * being written, so a blocking gate there would redden main on work in
 * progress. The shell is finished product — every screen a customer sees today
 * is one of these files — and it was swept clean in one pass. Clean is cheap to
 * hold and expensive to recover, so the gate closes behind the sweep.
 *
 * What counts as a user-facing string:
 *   · a text node in a <template>, once the {{ }} expressions are removed
 *   · placeholder / title / alt / label / content and the iView *-text props,
 *     whether written as a literal attribute or as a literal inside a binding
 *   · a string literal inside {{ }} that is not a $t(…) call
 *   · $Message / $Notice / $Modal copy, and window.document.title, in <script>
 *
 * What does not: markup and entities, tickers and currency codes, enum values
 * the backend defines, URLs, emails, API paths, service ids, dotted procedure
 * names, and numbers. Those are not translated in any locale, and a gate that
 * demands a key for `USDT` is a gate someone deletes.
 *
 * A genuine false positive is suppressed with `i18n-exempt` and a REASON, in a
 * comment on the line or the line above — same escape hatch, same posture, as
 * brand-scan and i18n-scan. Every suppression is a reviewable decision.
 *
 * Usage:
 *   node tooling/ci/shell-i18n-scan.mjs           scan, exit 1 on any finding
 *   node tooling/ci/shell-i18n-scan.mjs --quiet   counts only
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const QUIET = process.argv.includes('--quiet');

/**
 * The Vue shell's `src`, found rather than named.
 *
 * Brand-scan (§0.7) forbids the upstream vendor's identity as a token anywhere
 * in source, and that includes a path literal — so the directory is located by
 * its shape (a `05_Web_Front/src` holding `App.vue`) under whatever the vendor
 * tree happens to be called. Same dodge vendor-shell-scan uses, one level
 * deeper because this scan wants one app rather than all of vendor/.
 */
function findShellSrc() {
  const vendor = join(ROOT, 'vendor');
  if (!existsSync(vendor)) return null;
  for (const name of readdirSync(vendor)) {
    const candidate = join(vendor, name, '05_Web_Front', 'src');
    if (existsSync(join(candidate, 'App.vue'))) return candidate;
  }
  return null;
}

const SHELL = findShellSrc();

/** Props whose string value is read by a human. */
const USER_PROPS = [
  'placeholder',
  'title',
  'alt',
  'label',
  'content',
  'ok-text',
  'cancel-text',
  'confirm-text',
  'not-found-text',
  'loading-text',
];

const SKIP_DIRS = new Set(['node_modules', 'dist', 'static']);

/**
 * Directories that are not product copy, relative to the shell's `src`. Each
 * entry is a reviewable decision, not a way around the rule.
 */
const ALLOWLIST = [
  {
    path: join('pages', 'intafaced'),
    reason:
      'platform probe screens — the visible text IS the service id, route prefix and tRPC procedure name being called; ' +
      'translating an identifier would make the screen lie. Prose on these screens lives in intafaced.* keys already.',
  },
];

/** @param relToShell path relative to the shell's src, not the repo root. */
function isAllowlisted(relToShell) {
  return ALLOWLIST.some((e) => relToShell === e.path || relToShell.startsWith(e.path + sep));
}

/**
 * Strings that are never copy in any locale.
 *
 * Generous on purpose, and each clause earns its place against a real string in
 * this tree — see the comment beside it. The narrower this gets, the more
 * `i18n-exempt` noise the templates carry for no translation benefit.
 */
function looksTechnical(value) {
  const text = value.trim();
  if (!text) return true;

  // Markup residue: entity references and nothing else. `&nbsp;&nbsp;`
  const withoutEntities = text.replace(/&[a-zA-Z]+;|&#\d+;/g, ' ').trim();
  if (!withoutEntities) return true;

  // Needs two adjacent letters somewhere to be a word at all. `0.001`, `%`, `/`
  if (!/[A-Za-z]{2}/.test(withoutEntities)) return true;

  // URLs, emails, file names. `https://twitter.com/…`, `list@intafaced.com`
  if (/:\/\//.test(withoutEntities)) return true;
  if (/[\w.-]+@[\w.-]+\.\w+/.test(withoutEntities)) return true;

  // Everything that is left, minus punctuation the copy would not carry alone.
  const core = withoutEntities.replace(/^[\s·:()[\]{}<>/|,.+*-]+|[\s·:()[\]{}<>/|,.+*-]+$/g, '').trim();
  if (!core) return true;
  if (!/[A-Za-z]{2}/.test(core)) return true;

  // Single token, no spaces — an identifier, ticker, code or path, not a phrase.
  if (!/\s/.test(core)) {
    // Tickers, enum values, currency codes: `USDT`, `BUY`, `MARKET_PRICE`, `TOP20`
    if (/^[A-Z][A-Z0-9_]*$/.test(core)) return true;
    // API paths and service ids: `svc-dex`, `/api/dex/trpc`, `spaces.list`
    if (/^[a-z][a-zA-Z0-9]*$/.test(core)) return true;
    if (/^[\w-]+(\.[\w-]+)+$/.test(core)) return true;
    if (core.includes('/')) return true;
  }

  // HTTP request lines shown verbatim: `POST /api/identity/trpc/auth.login`
  if (/^(GET|POST|PUT|PATCH|DELETE)\s+\S+$/.test(core)) return true;

  return false;
}

function* walk(dir) {
  if (!dir || !existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (name.endsWith('.vue')) yield full;
  }
}

/** Blank a region out while preserving line numbers. */
const blank = (s) => s.replace(/[^\n]/g, ' ');

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length;
}

function exemptAt(lines, line) {
  const current = lines[line - 1] ?? '';
  const previous = line > 1 ? (lines[line - 2] ?? '') : '';
  return /i18n-exempt/.test(current) || /i18n-exempt/.test(previous);
}

const findings = [];
let scanned = 0;

for (const file of walk(SHELL)) {
  if (isAllowlisted(relative(SHELL, file))) continue;
  const rel = relative(ROOT, file);

  const src = readFileSync(file, 'utf8');
  if (/i18n-exempt-file/.test(src)) continue;
  scanned++;
  const lines = src.split('\n');

  const push = (index, kind, text, hint) => {
    const line = lineOf(src, index);
    if (exemptAt(lines, line)) return;
    if (looksTechnical(text)) return;
    findings.push({ rel, line, kind, text: text.replace(/\s+/g, ' ').trim(), hint });
  };

  // ── <template> ────────────────────────────────────────────────────────────
  const open = /^<template>/m.exec(src);
  const close = src.lastIndexOf('\n</template>');
  if (open && close > open.index) {
    const base = open.index + open[0].length;
    const tpl = src.slice(base, close).replace(/<!--[\s\S]*?-->/g, blank);

    // Text nodes, with the expressions taken out. A `>…<` run whose only
    // content was {{ }} is not copy.
    for (const m of tpl.matchAll(/>([^<>]*)</g)) {
      const literal = m[1].replace(/\{\{[\s\S]*?\}\}/g, ' ');
      push(base + m.index + 1, 'text node', literal, 'render {{ $t(…) }} instead');
    }

    // Literal attributes: placeholder="Search market"
    const attrRe = new RegExp(`(?<![:@\\w.-])(${USER_PROPS.join('|')})\\s*=\\s*"([^"]*)"`, 'g');
    for (const m of tpl.matchAll(attrRe)) {
      push(base + m.index, `${m[1]}=""`, m[2], `bind it: :${m[1]}="$t(…)"`);
    }

    // Literals inside {{ }} and inside bound user-facing props.
    for (const m of tpl.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
      if (/\$t\s*\(/.test(m[1])) continue;
      for (const lit of m[1].match(/'[^']*'|"[^"]*"/g) ?? []) {
        push(base + m.index, 'literal in {{ }}', lit.slice(1, -1), 'call $t(…) for the branch that is copy');
      }
    }
    const boundRe = new RegExp(`:(${USER_PROPS.join('|')})\\s*=\\s*"([^"]*)"`, 'g');
    for (const m of tpl.matchAll(boundRe)) {
      if (/\$t\s*\(/.test(m[2])) continue;
      for (const lit of m[2].match(/'[^']*'/g) ?? []) {
        push(base + m.index, `:${m[1]}`, lit.slice(1, -1), 'call $t(…) inside the binding');
      }
    }
  }

  // ── <script> ──────────────────────────────────────────────────────────────
  const scriptOpen = /^<script>/m.exec(src);
  if (scriptOpen) {
    const scriptEnd = src.lastIndexOf('\n</script>');
    const base = scriptOpen.index + scriptOpen[0].length;
    const script = src
      .slice(base, scriptEnd > base ? scriptEnd : src.length)
      .replace(/\/\*[\s\S]*?\*\//g, blank)
      .replace(/(^|[^:'"])\/\/[^\n]*/g, (m, p) => p + blank(m.slice(p.length)));

    // Toast and dialog copy. Both quote styles: the vendor files mix them
    // freely, and a scanner that only reads one of them is a false green.
    for (const m of script.matchAll(/\$(?:Message|Notice|Modal)\.\w+\s*\(\s*(?:'([^']*)'|"([^"]*)")/g)) {
      push(base + m.index, '$Message/$Notice', m[1] ?? m[2], 'pass this.$t(…)');
    }
    // Option objects handed to those components, and to iView's own dialogs.
    for (const m of script.matchAll(/\b(title|content|desc|message|okText|cancelText)\s*:\s*(?:'([^']*)'|"([^"]*)")/g)) {
      push(base + m.index, `${m[1]}:`, m[2] ?? m[3], 'pass this.$t(…)');
    }
    // Browser tab title.
    for (const m of script.matchAll(/document\.title\s*=\s*(?:'([^']*)'|"([^"]*)")/g)) {
      push(base + m.index, 'document.title', m[1] ?? m[2], 'assign this.$t(…)');
    }
  }
}

// ── Report ──────────────────────────────────────────────────────────────────

if (!SHELL) {
  console.log('✓ shell-i18n-scan — no web shell in this checkout; the scan re-arms when it lands (§9)');
  process.exit(0);
}

if (findings.length === 0) {
  console.log(`✓ shell-i18n-scan clean — ${scanned} .vue file(s), 0 hardcoded user-facing strings (§9, §14.4)`);
  process.exit(0);
}

const files = new Set(findings.map((f) => f.rel));
console.error(`\n✖ shell-i18n-scan failed — ${findings.length} hardcoded user-facing string(s) in ${files.size} of ${scanned} file(s)\n`);

if (!QUIET) {
  for (const f of findings) {
    console.error(`  ${f.rel}:${f.line}  [${f.kind}]`);
    console.error(`    ${f.text.slice(0, 140)}`);
    console.error(`    → ${f.hint}\n`);
  }
}

console.error('  Keys live in the shell catalogue: src/assets/lang/en.js. A string that is not keyed');
console.error('  is a screen that cannot be translated without another sweep (§9).');
console.error('  Genuinely not copy? Put `i18n-exempt <reason>` in a comment on the line above.\n');

process.exit(1);
