#!/usr/bin/env node
/**
 * Vendor Java money scan (Plan P2-2/P2-3 · Spec DB-3/DB-4 · Architect Seam A).
 *
 * Walks vendor Java sources and fails CI if the four dual-book mutators still have
 * LIVE balance-write SQL / JPQL (wallet.balance += :amount class).
 *
 * No-op form (allowed — same PEACE pattern as unfreezeLess):
 *   UPDATE member_wallet SET id = id WHERE 1 = 0
 *
 * Method names may still exist as disabled stubs; service layer should throw.
 * Door-kill of HTTP controllers is P2-4 (separate).
 *
 * Exit 0 = clean. Exit 1 = live second-book write still present.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const VENDOR = join(ROOT, 'vendor');

/** @type {{ path: string, reason: string }[]} */
const ALLOWLIST = [];

/** @type {{ id: string, re: RegExp, reason: string }[]} */
const FORBIDDEN = [
  {
    id: 'jpql-increase-balance-live',
    re: /wallet\.balance\s*=\s*wallet\.balance\s*\+\s*:amount/i,
    reason: 'live increaseBalance JPQL — dual-book write (must be no-op WHERE 1=0)',
  },
  {
    id: 'jpql-decrease-balance-live',
    re: /wallet\.balance\s*=\s*wallet\.balance\s*-\s*:amount\s+where\s+wallet\.id\s*=\s*:walletId\s+and\s+wallet\.balance\s*>=\s*:amount/i,
    reason: 'live decreaseBalance JPQL — dual-book write',
  },
  {
    id: 'jpql-freeze-balance-live',
    re: /wallet\.frozenBalance\s*=\s*wallet\.frozenBalance\s*\+\s*:amount/i,
    reason: 'live freezeBalance JPQL — dual-book freeze write',
  },
  {
    id: 'jpql-thaw-balance-live',
    // thaw moves frozen → available: balance += amount AND frozenBalance -= amount
    re: /wallet\.balance\s*=\s*wallet\.balance\s*\+\s*:amount\s*,\s*wallet\.frozenBalance\s*=\s*wallet\.frozenBalance\s*-\s*:amount/i,
    reason: 'live thawBalance JPQL — dual-book thaw write',
  },
  {
    id: 'native-balance-plus',
    // Live credit forms (named or positional params). No-ops use SET id = id.
    re: /SET\s+balance\s*=\s*balance\s*\+/i,
    reason: 'native SQL live balance credit — dual-book',
  },
  {
    id: 'native-balance-minus',
    re: /SET\s+balance\s*=\s*balance\s*-/i,
    reason: 'native SQL live balance debit — dual-book',
  },
  {
    id: 'native-frozen-plus',
    re: /SET\s+frozen_balance\s*=\s*frozen_balance\s*\+/i,
    reason: 'native SQL live frozen credit — dual-book',
  },
  {
    id: 'native-frozen-minus',
    re: /SET\s+frozen_balance\s*=\s*frozen_balance\s*-/i,
    reason: 'native SQL live frozen debit — dual-book',
  },
];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'target' || name === '.git') continue;
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith('.java')) out.push(p);
  }
  return out;
}

function isAllowlisted(relPath) {
  return ALLOWLIST.some((e) => relPath === e.path || relPath.startsWith(e.path + sep));
}

if (!statSync(VENDOR, { throwIfNoEntry: false })?.isDirectory()) {
  // Fail closed: dual-book enforcement is meaningless if vendor/ is absent from CI checkout.
  console.error('✖ vendor-java-money-scan: vendor/ tree missing — cannot prove dual-book mutators banned');
  process.exit(1);
}

const files = walk(VENDOR);
const hits = [];
let javaScanned = 0;

for (const file of files) {
  const rel = relative(ROOT, file);
  if (isAllowlisted(rel)) continue;
  javaScanned++;
  const text = readFileSync(file, 'utf8');
  // Match per line only — multi-line windows false-positive against neighboring no-ops.
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
    for (const rule of FORBIDDEN) {
      if (rule.re.test(line)) {
        hits.push({ rel, line: i + 1, id: rule.id, reason: rule.reason, text: trimmed.slice(0, 160) });
        break;
      }
    }
  }
}

// Dedupe same line multi-rule
const seen = new Set();
const unique = hits.filter((h) => {
  const k = `${h.rel}:${h.line}:${h.id}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

if (unique.length) {
  console.error('✖ vendor-java-money-scan failed — live dual-book mutators present:\n');
  for (const h of unique) {
    console.error(`  ${h.rel}:${h.line}  [${h.id}] ${h.reason}`);
    console.error(`    ${h.text}`);
  }
  console.error(`\n${unique.length} hit(s) in ${javaScanned} Java file(s). Four mutators must be no-op (WHERE 1=0) or deleted.`);
  console.error('  Inventory: node tooling/scripts/vendor-money-inventory.mjs\n');
  process.exit(1);
}

console.log(`✓ vendor-java-money-scan clean — ${javaScanned} Java file(s), ${FORBIDDEN.length} live-write pattern(s)`);
