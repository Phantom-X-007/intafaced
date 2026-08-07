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

/**
 * The denominator. `scanned` is what the gate opened; `candidates` is what it
 * found before the allowlist and the file-level exemptions took their cut.
 * Reporting only the first lets an empty scope print as a clean result — see
 * the empty-denominator branch below.
 */
let candidates = 0;
const swallowedBy = { allowlist: [], exemptFile: [] };

for (const file of walk(APPS)) {
  const rel = relative(ROOT, file);
  candidates++;
  if (isAllowlisted(rel)) {
    swallowedBy.allowlist.push(rel);
    continue;
  }

  const content = readFileSync(file, 'utf8');
  if (/i18n-exempt-file/.test(content)) {
    swallowedBy.exemptFile.push(rel);
    continue;
  }

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

/**
 * EMPTY DENOMINATOR. A check that cannot say how many things it inspected
 * cannot be trusted to say they were fine.
 *
 * The author already guarded the case above — `apps/` missing entirely. The
 * case that actually arrived is different and printed as a pass: `apps/`
 * exists, `apps/web` was deleted in #757, the one project left is allowlisted
 * in full, so the scan opened nothing and took the `findings.length === 0`
 * success path. "✓ i18n-scan clean — 0 files" reads as reassurance.
 *
 * This repo has now hit that shape three times: the reachability gate
 * inspecting zero modules on Windows (98a6812c), `value-gate` comparing an
 * empty ancestor list against an empty one under `fetch-depth: 1` — named in
 * its own NOT_GATES entry as half of how #832–#876 landed — and here.
 * `wallet-rpc-mainnet-scan` is the one that got it right by design: it states
 * "every denominator non-zero" in its own success line.
 *
 * Zero is not automatically a failure — an all-allowlisted scope is the real,
 * declared state today (§14.6, operator console, English-only by design), and
 * failing on it would red main for a condition that is correct. So: say
 * plainly that nothing was inspected and name what swallowed the scope. Only
 * an emptiness nobody declared — a scope with no candidates at all — is a
 * failure, because that one means the gate silently stopped covering anything.
 */
if (scanned === 0) {
  if (candidates === 0) {
    console.error('\n✖ i18n-scan — scope is EMPTY: apps/ exists but holds no .tsx file at all.\n');
    console.error('  Nothing was inspected, so this gate proves nothing. Either a surface moved out');
    console.error('  of apps/ (repoint APPS) or the tree is not what this gate was written against.');
    process.exit(1);
  }
  console.log(`⚠ i18n-scan INSPECTED NOTHING — 0 of ${candidates} candidate file(s); every one is allowlisted or file-exempt.`);
  for (const rel of swallowedBy.allowlist) console.log(`    allowlisted:  ${rel}`);
  for (const rel of swallowedBy.exemptFile) console.log(`    i18n-exempt-file: ${rel}`);
  console.log('  This is not a clean bill of health — it is an empty scan. The gate re-arms by itself');
  console.log('  as soon as one un-allowlisted .tsx surface lands under apps/ (§9, §14.4).');
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
