#!/usr/bin/env node
/**
 * Vendor shell residue scan — keep the Java exchange UI from re-introducing
 * known money/CORS hazards that the TS ledger does not own.
 *
 * Residual queue (docs/POST-MERGE-RESIDUAL-AFTER-86.md):
 *   - mass balance credit (unfreezeMore +500 / unfreezeLess bulk)
 *   - TRUNCATE wallet snapshot helpers
 *   - CORS wildcard origin with credentials
 *
 * Brand scan deliberately skips vendor/** (upstream identity lives there).
 * This scan is the complementary check: hazards inside vendor/** only.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
// Path under repo `vendor/` only — brand-scan forbids naming the upstream tree
// in source; keep this path as path segments, not a banned token string.
const VENDOR = join(ROOT, 'vendor');

/** @type {{ id: string, re: RegExp, reason: string }[]} */
const FORBIDDEN = [
  {
    id: 'mass-credit-plus-500',
    re: /balance\s*=\s*balance\s*\+\s*500/i,
    reason: 'mass +500 balance credit (unfreezeMore class) — shell is not the books',
  },
  {
    id: 'mass-credit-to-released',
    re: /balance\s*=\s*balance\s*\+\s*to_released/i,
    reason: 'mass credit of to_released into balance (unfreezeLess class)',
  },
  {
    id: 'truncate-wallet-snapshot',
    re: /TRUNCATE\s+TABLE\s+member_wallet_/i,
    reason: 'TRUNCATE of wallet snapshot tables (dropWeekTable class)',
  },
  {
    id: 'cors-star-origin',
    // Active code only — Javadoc {@code ...} may still name the anti-pattern.
    re: /addAllowedOrigin\s*\(\s*"\*"\s*\)/,
    reason: 'CORS wildcard origin (must use CorsAllowlist / explicit origins)',
  },
  {
    id: 'jdbc-mass-to-released',
    re: /to_released\s*=\s*to_released\s*-\s*/,
    reason: 'bulk to_released debit via string SQL (JDBCUtils class)',
  },
];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === 'target' || name === '.git') continue;
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, out);
    else if (/\.(java|js|ts|xml|yml|yaml|properties)$/i.test(name)) out.push(p);
  }
  return out;
}

if (!statSync(VENDOR, { throwIfNoEntry: false })?.isDirectory()) {
  console.log('✓ vendor-shell-scan: no vendor/ tree — skip');
  process.exit(0);
}

const files = walk(VENDOR);
const hits = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file);
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    // Skip pure comments / javadoc lines that document the ban.
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.includes('{@code addAllowedOrigin')) {
      continue;
    }
    for (const rule of FORBIDDEN) {
      if (rule.re.test(line)) {
        hits.push({ rel, line: i + 1, id: rule.id, reason: rule.reason, text: trimmed.slice(0, 160) });
      }
    }
  }
}

if (hits.length) {
  console.error('✖ vendor-shell-scan failed — known residual hazards present:\n');
  for (const h of hits) {
    console.error(`  ${h.rel}:${h.line}  [${h.id}] ${h.reason}`);
    console.error(`    ${h.text}`);
  }
  console.error(`\n${hits.length} hit(s) in ${files.length} file(s). Shell UI must not mass-credit or open CORS "*".`);
  process.exit(1);
}

console.log(`✓ vendor-shell-scan clean — ${files.length} vendor file(s), ${FORBIDDEN.length} hazard pattern(s)`);
