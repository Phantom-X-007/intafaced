#!/usr/bin/env node
/**
 * BRAND SCAN — Doctrine §0.7, enforced.
 *
 *   "The onboarding intelligence is the GMaster Neural Engine consumed as an
 *    internal service. User-facing copy references only: Identity Blueprint,
 *    Sovereign Intelligence, Neural Engine. No third-party system names
 *    anywhere in UI, API responses, or docs shipped to users."
 *
 * This scans everything that can reach a user — components, i18n catalogues,
 * API response literals, public docs — for forbidden names. Internal service
 * code may name the engine (it has to call it), so `services/svc-blueprint/src`
 * is allowed to reference it OUTSIDE of user-facing strings; the allowlist
 * below is deliberately narrow and every entry needs a reason.
 *
 * Exit 0 = clean. Exit 1 = a name would have shipped.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();

/**
 * Names that must never appear in shipped copy. Extend as partners are added
 * (§0.4 adapters: rail and issuer names are internal identifiers, not brands).
 */
const FORBIDDEN = [
  { pattern: /\bGMaster\b/i, reason: 'engine vendor name — say "Neural Engine"' },
  { pattern: /\bG-?Master\s*Neural\b/i, reason: 'engine vendor name' },
  { pattern: /\bFincept\b/i, reason: 'licensed terminal vendor — the desktop client ships fully rebranded (docs/TERMINAL_INTEGRATION.md §8)' },
  { pattern: /\bSettleTX\b/i, reason: 'rail partner name' },
  { pattern: /\bPayKwik\b/i, reason: 'rail partner name' },
  { pattern: /\bNTG\b/, reason: 'rail partner name' },
  { pattern: /\bAnthropic\b/i, reason: 'model provider — agents are "Sovereign Intelligence"' },
  { pattern: /\bClaude\b/i, reason: 'model provider' },
  { pattern: /\bOpenAI\b/i, reason: 'model provider' },
  { pattern: /\bGPT-\d/i, reason: 'model provider' },
];

/** Directories never scanned. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.next',
  '.turbo',
  'coverage',
  'drizzle',
  '.docker-data',
]);

/**
 * Paths exempt from the scan, each with a reason. Anything added here is a
 * deliberate, reviewable decision — not a way around the rule.
 */
const ALLOWLIST = [
  { path: 'INTAFACED_DEFINITIVE_BUILD.md', reason: 'the build doctrine itself — internal, never shipped to users' },
  { path: join('tooling', 'ci', 'brand-scan.mjs'), reason: 'this file declares the forbidden names' },
  { path: join('tooling', 'agent-protocol'), reason: 'internal agent rules — not user-facing' },
  { path: 'README.md', reason: 'internal repo README' },
  { path: 'CONTRIBUTING.md', reason: 'internal contributor guide — names the agent tools we actually use' },
  { path: 'AGENTS.md', reason: 'internal agent brief — not shipped to users' },
  { path: '.github', reason: 'internal repo templates and workflows' },
  {
    path: join('docs', 'TERMINAL_INTEGRATION.md'),
    reason: 'internal architecture + licensing record; names the vendor deliberately so the rebrand scope is auditable',
  },
  { path: 'CLAUDE.md', reason: 'internal agent instructions' },
  { path: '.claude', reason: 'internal tooling config' },
];

/** Only these extensions can carry shipped copy. */
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.md', '.mdx', '.html', '.css', '.yaml', '.yml'];

function isAllowlisted(relPath) {
  return ALLOWLIST.some((entry) => relPath === entry.path || relPath.startsWith(entry.path + sep));
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const stats = statSync(full);
    if (stats.isDirectory()) yield* walk(full);
    else if (EXTENSIONS.some((ext) => name.endsWith(ext))) yield full;
  }
}

const violations = [];
let scanned = 0;

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  if (isAllowlisted(rel)) continue;

  scanned++;
  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n');

  for (const { pattern, reason } of FORBIDDEN) {
    if (!pattern.test(content)) continue;
    lines.forEach((line, i) => {
      // Fresh regex per line: the shared one may carry lastIndex state.
      if (new RegExp(pattern.source, pattern.flags.replace('g', '')).test(line)) {
        violations.push({ file: rel, line: i + 1, text: line.trim().slice(0, 120), reason });
      }
    });
  }
}

if (violations.length > 0) {
  console.error(`\n✖ BRAND SCAN FAILED — ${violations.length} occurrence(s) of a forbidden name (Doctrine §0.7)\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.text}`);
    console.error(`    → ${v.reason}\n`);
  }
  console.error('  User-facing copy says only: Identity Blueprint · Sovereign Intelligence · Neural Engine.\n');
  process.exit(1);
}

console.log(`✓ brand-scan clean — ${scanned} files, 0 forbidden names (Doctrine §0.7)`);
