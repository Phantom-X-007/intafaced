#!/usr/bin/env node
/**
 * i18n SCAN — §9 and §14.4, reported.
 *
 *   "i18n: all surfaces keyed from day one; 100+ languages = translation files,
 *    not refactors" (§9)
 *   "Every user-facing string i18n-keyed" (§14.4)
 *
 * Reads every `.tsx` under `apps/` and reports copy that would ship
 * untranslated: JSX text nodes, and the string props a human actually reads
 * (`title`, `label`, `placeholder`, `alt`, `aria-label`) written as literals
 * instead of `t()`.
 *
 * DELIBERATELY NOT A BLOCKING GATE. Deciding "user-facing" from syntax alone is
 * a heuristic, and a heuristic that reddens main on a false positive gets
 * switched off inside a week — leaving neither the gate nor the discipline. So
 * this reports and exits 0 by default. `--strict` exits 1, for anyone who wants
 * it in their own pre-merge routine.
 *
 * Suppress a genuine false positive with `i18n-exempt` and a reason, in a
 * comment on the line or the line above; `i18n-exempt-file` skips a whole file.
 * It is line-based, so copy split across several lines is not seen — the gate
 * that actually holds is the type system in packages/i18n, not this.
 *
 * Usage:
 *   node tooling/ci/i18n-scan.mjs            report, exit 0
 *   node tooling/ci/i18n-scan.mjs --strict   report, exit 1 on any finding
 *   node tooling/ci/i18n-scan.mjs --quiet    counts only
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const APPS = join(ROOT, 'apps');
const STRICT = process.argv.includes('--strict');
const QUIET = process.argv.includes('--quiet');

/** Props whose string value is read by a human. */
const USER_FACING_PROPS = ['aria-label', 'placeholder', 'title', 'label', 'alt'];

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', '.turbo', 'coverage', '__snapshots__']);

/**
 * Paths exempt from the scan, each with a reason — same posture as brand-scan:
 * every entry is a reviewable decision, not a way around the rule.
 */
const ALLOWLIST = [{ path: join('apps', 'admin'), reason: 'operator console — internal tooling, English-only by design (§14.6)' }];

const PROP_PATTERN = new RegExp(`\\b(${USER_FACING_PROPS.join('|')})\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{\\s*['"]([^'"]*)['"]\\s*\\})`, 'g');

/**
 * JSX text immediately before a closing tag: `>Place order</`. Requiring the
 * closing tag keeps `count > total && x` out of the report; expression children
 * such as `{t('trade.order.submit')}` can never match.
 */
const TEXT_PATTERN = />([^<>{}\n][^<>{}]*)<\//g;

function isAllowlisted(relPath) {
  return ALLOWLIST.some((entry) => relPath === entry.path || relPath.startsWith(entry.path + sep));
}

/**
 * Strings that are almost never copy: ids, class names, urls, mime types, enum
 * values, format tokens. Being generous here is the difference between a report
 * people read and a report people mute.
 */
function looksTechnical(value) {
  const text = value.trim();
  if (text.length < 2) return true;
  if (!/[A-Za-z]{2}/.test(text)) return true;
  if (/^[#/.]/.test(text)) return true;
  if (text.includes('://') || text.includes('@') || text.includes('_')) return true;
  if (/^[a-z0-9-]+$/.test(text) && !text.includes(' ')) return true;
  if (/^[a-z]+([A-Z][a-z0-9]*)+$/.test(text)) return true;
  if (/^[A-Z0-9_]+$/.test(text)) return true;
  if (/^&[a-z]+;$/.test(text)) return true;
  return false;
}

function isExempt(lines, index) {
  const current = lines[index] ?? '';
  const previous = index > 0 ? (lines[index - 1] ?? '') : '';
  return /i18n-exempt/.test(current) || /i18n-exempt/.test(previous);
}

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (name.endsWith('.tsx')) yield full;
  }
}

const findings = [];
let scanned = 0;

for (const file of walk(APPS)) {
  const rel = relative(ROOT, file);
  if (isAllowlisted(rel)) continue;

  const content = readFileSync(file, 'utf8');
  if (/i18n-exempt-file/.test(content)) continue;

  scanned++;
  const lines = content.split('\n');

  lines.forEach((line, i) => {
    if (isExempt(lines, i)) return;
    // Drop a trailing line comment — but only a real one. `https://…` inside a
    // prop is not a comment, and stripping it would hide the copy beside it.
    const code = line.replace(/(^|\s)\/\/.*$/, '$1');

    for (const match of code.matchAll(TEXT_PATTERN)) {
      const text = (match[1] ?? '').trim();
      if (looksTechnical(text)) continue;
      findings.push({ file: rel, line: i + 1, text, reason: 'JSX text node — key it and render {t(…)}' });
    }

    for (const match of code.matchAll(PROP_PATTERN)) {
      const prop = match[1];
      const value = (match[2] ?? match[3] ?? match[4] ?? '').trim();
      if (looksTechnical(value)) continue;
      findings.push({ file: rel, line: i + 1, text: `${prop}="${value}"`, reason: `${prop} is read by a user — pass ${prop}={t(…)}` });
    }
  });
}

// ── Report ──────────────────────────────────────────────────────────────────

if (!existsSync(APPS)) {
  console.log('✓ i18n-scan — no apps/ yet; the scan re-arms when the first surface lands (§9)');
  process.exit(0);
}

if (findings.length === 0) {
  console.log(`✓ i18n-scan clean — ${scanned} files, 0 hardcoded user-facing strings (§9, §14.4)`);
  process.exit(0);
}

const files = new Set(findings.map((f) => f.file));
console.log(`\n⚠ i18n-scan — ${findings.length} possible hardcoded string(s) across ${files.size} of ${scanned} file(s)\n`);

if (!QUIET) {
  for (const finding of findings) {
    console.log(`  ${finding.file}:${finding.line}`);
    console.log(`    ${finding.text.slice(0, 120)}`);
    console.log(`    → ${finding.reason}\n`);
  }
}

console.log('  Keys live in packages/i18n/src/catalog.ts. A string that is not keyed is a string that ships in English only.');
console.log('  False positive? Add `i18n-exempt` on the line above, with a reason.\n');

process.exit(STRICT ? 1 : 0);
