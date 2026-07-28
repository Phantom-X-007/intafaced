#!/usr/bin/env node
/**
 * CUSTODY SCAN — Doctrine §16.10, enforced.
 *
 *   "The custody boundary is drawn in code. An automated CI check asserts that
 *    no Protocol Plane service imports ledger-client write recipes and no
 *    contract grants platform keys withdrawal power over user funds.
 *    Provably non-custodial or it doesn't merge."
 *
 * Two checks:
 *   1. No Protocol Plane service imports the ledger's write surface. Reading
 *      balances is fine; posting transactions is what custody looks like.
 *   2. No contract in svc-protocol exposes a platform-callable path that can
 *      move user funds (a heuristic scan over Solidity sources, reported as a
 *      hard failure so a human has to look).
 *
 * Exit 0 = provably non-custodial. Exit 1 = the boundary moved.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SERVICES = join(ROOT, 'services');

/**
 * Protocol Plane services. Mirrors packages/config/src/modules.ts — services
 * whose `planes` is exactly ['protocol'] and `custodial` is false.
 *
 * svc-bridge is deliberately NOT here: it is the one seam that debits the
 * ledger and credits the chain, and it is custodial by design (§17.3).
 */
const PROTOCOL_PLANE_SERVICES = ['svc-chain', 'svc-dex', 'svc-indexer', 'svc-protocol'];

/** Importing any of these means the service can move value in the ledger. */
const WRITE_SURFACE = [
  { pattern: /\bledger\s*\.\s*post\s*\(/, reason: 'calls ledger.post() — that is custody' },
  { pattern: /from\s+['"]@intafaced\/ledger-client\/recipes['"]/, reason: 'imports ledger write recipes' },
  {
    pattern: /import\s*\{[^}]*\b(recipes|deposit|withdrawHold|withdrawSettle|tradeFill|escrowLock|escrowRelease|stake|feeCharge|rewardPay|mintEmission|collateralLock)\b[^}]*\}\s*from\s*['"]@intafaced\/ledger-client['"]/s,
    reason: 'imports a ledger write recipe',
  },
  {
    pattern: /import\s*\{[^}]*\bLedgerClient\b[^}]*\}\s*from\s*['"]@intafaced\/ledger-client['"]/s,
    reason: 'imports the writable LedgerClient — use ReadOnlyLedgerClient on this plane',
  },
];

/** Solidity patterns that would hand the platform withdrawal power. */
const CONTRACT_RISKS = [
  { pattern: /function\s+\w*(withdraw|sweep|drain|rescue|emergencyWithdraw)\w*\s*\([^)]*\)[^{]*\bonlyOwner\b/i, reason: 'owner-callable withdrawal' },
  { pattern: /function\s+\w*(withdraw|sweep|drain|rescue)\w*\s*\([^)]*\)[^{]*\bonlyAdmin\b/i, reason: 'admin-callable withdrawal' },
  { pattern: /\btransferFrom\s*\([^)]*\bmsg\.sender\s*!=/i, reason: 'transferFrom on behalf of a non-caller' },
  { pattern: /\bselfdestruct\s*\(/i, reason: 'selfdestruct can strand or redirect user funds' },
];

const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', '.next', 'coverage', 'drizzle']);

function* walk(dir, extensions) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full, extensions);
    else if (extensions.some((ext) => name.endsWith(ext))) yield full;
  }
}

const violations = [];
let filesScanned = 0;

// ── Check 1: no ledger writes on the Protocol Plane ─────────────────────────
for (const service of PROTOCOL_PLANE_SERVICES) {
  const dir = join(SERVICES, service);
  if (!existsSync(dir)) continue;

  for (const file of walk(dir, ['.ts', '.tsx'])) {
    filesScanned++;
    const content = readFileSync(file, 'utf8');
    const rel = relative(ROOT, file);

    for (const { pattern, reason } of WRITE_SURFACE) {
      if (pattern.test(content)) {
        violations.push({
          check: 'ledger-write-on-protocol-plane',
          file: rel,
          reason,
          detail: `${service} is a Protocol Plane service — it must never hold or move user value (§16.9, §22)`,
        });
      }
    }
  }
}

// ── Check 2: no platform withdrawal power in the contract suite ─────────────
const contractDirs = [join(SERVICES, 'svc-protocol'), join(ROOT, 'contracts')];
for (const dir of contractDirs) {
  for (const file of walk(dir, ['.sol'])) {
    filesScanned++;
    const content = readFileSync(file, 'utf8');
    const rel = relative(ROOT, file);

    for (const { pattern, reason } of CONTRACT_RISKS) {
      if (pattern.test(content)) {
        violations.push({
          check: 'platform-withdrawal-power',
          file: rel,
          reason,
          detail: 'No contract may grant platform keys withdrawal power over user funds (§16.10)',
        });
      }
    }
  }
}

if (violations.length > 0) {
  console.error(`\n✖ CUSTODY SCAN FAILED — ${violations.length} boundary violation(s)\n`);
  for (const v of violations) {
    console.error(`  [${v.check}] ${v.file}`);
    console.error(`    → ${v.reason}`);
    console.error(`      ${v.detail}\n`);
  }
  console.error('  Provably non-custodial or it does not merge (Doctrine §16.10).\n');
  process.exit(1);
}

const scanned = PROTOCOL_PLANE_SERVICES.filter((s) => existsSync(join(SERVICES, s)));
console.log(
  `✓ custody-scan clean — ${filesScanned} files across ${scanned.length} Protocol Plane service(s)` +
    `${scanned.length === 0 ? ' (none built yet — check re-arms automatically when svc-protocol lands)' : ''}`,
);
