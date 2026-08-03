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
 *   2. No contract under a Protocol Plane service exposes a platform-callable
 *      path that can move user funds (a heuristic scan over Solidity sources,
 *      reported as a hard failure so a human has to look).
 *
 * Exit 0 = provably non-custodial. Exit 1 = the boundary moved.
 *
 * ── WHAT THIS GATE IS, AND WHAT IT IS NOT (read this before citing it) ─────
 *
 * This is a PROTOCOL PLANE gate. It is routinely cited as if it were a
 * repo-wide custody check. It is not one, and both vendored-exchange ADRs turn
 * on knowing the difference.
 *
 * COVERED: the services whose `planes` is exactly ['protocol'] and whose
 * `custodial` is false — DERIVED from packages/config/src/modules.ts, see
 * below — plus every .sol file underneath them and a root contracts/.
 * Measured 2026-08-03: svc-chain, svc-dex, svc-indexer, svc-protocol are
 * registered; svc-chain has no directory yet, so three are walked — svc-dex
 * (17 .ts/.tsx), svc-indexer (27 + 1 .sol), svc-protocol (44 + 9 .sol).
 *
 * NOT COVERED, deliberately:
 *   · The other 14 services under services/, including every custodial one.
 *     svc-ledger, svc-pay, svc-bank and svc-trade hold value ON PURPOSE, as
 *     svc-bridge will (§17.3). This gate asserts non-custody only where
 *     non-custody is promised; asserting it everywhere would assert a
 *     falsehood.
 *   · packages/ and apps/ — 170 .ts/.tsx files, walked by neither check.
 *   · Any Java. All 882 files under vendor/ are outside this gate. The
 *     dual-book question there belongs to `vendor-java-money-scan.mjs` and
 *     `dual-book-door-scan.mjs` — different gates, different rules, both
 *     already in CI and in the DoD gate. "Extend custody-scan to Java" would
 *     extend the WRONG GATE: it would put vendor rules on a Protocol Plane
 *     check, and the two have no rule, no path and no failure mode in common.
 *     Both ADRs said it; both were corrected. Do not re-do it here.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SERVICES = join(ROOT, 'services');
const MODULES_TS = join(ROOT, 'packages', 'config', 'src', 'modules.ts');

/**
 * Protocol Plane services, DERIVED from packages/config/src/modules.ts.
 *
 * This list used to be a hardcoded array. It was accurate — and it was still a
 * latent hole, because accuracy at the moment of writing is not the property a
 * gate needs. Adding a Protocol Plane module to the registry would not have
 * armed this scan until somebody separately remembered to edit the array here,
 * and the failure of that memory is silent: the scan keeps printing ✓ while
 * walking a set that no longer matches the registry it claims to mirror. A gate
 * that reports green over a service it never opened is worse than no gate.
 *
 * So it is read from the registry instead. `modules.ts` is TypeScript and this
 * is a plain .mjs run by node with no build step, so it is parsed as text
 * rather than imported. That is a real constraint, not a shortcut: the parse
 * therefore FAILS CLOSED. If the file moves, or its shape changes enough that
 * no module matches, this exits 1 rather than scanning nothing and calling it
 * clean — the exact failure being designed out.
 *
 * svc-bridge is excluded by the rule itself, not by a special case: its
 * `planes` is ['fiat','protocol'] and its `custodial` is true. It is the one
 * seam that debits the ledger and credits the chain, custodial by design
 * (§17.3), and the registry already says so.
 */
function deriveProtocolPlaneServices() {
  if (!existsSync(MODULES_TS)) {
    console.error(`\n✖ CUSTODY SCAN FAILED — cannot read the module registry at ${relative(ROOT, MODULES_TS)}\n`);
    console.error('  The Protocol Plane service list is derived from it. Without it this gate does not know what to walk.\n');
    process.exit(1);
  }

  const source = readFileSync(MODULES_TS, 'utf8');
  // One module literal per entry: `id: { id: 'x', service: 'svc-x', planes: [...], phase: '..', custodial: false }`.
  const entry = /service:\s*'([^']+)'[^}]*?planes:\s*\[([^\]]*)\][^}]*?custodial:\s*(true|false)/g;
  const derived = [];
  let match;
  while ((match = entry.exec(source)) !== null) {
    const [, service, planesRaw, custodial] = match;
    const planes = [...planesRaw.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    if (planes.length === 1 && planes[0] === 'protocol' && custodial === 'false') derived.push(service);
  }

  if (derived.length === 0) {
    console.error(`\n✖ CUSTODY SCAN FAILED — parsed ${relative(ROOT, MODULES_TS)} and found no Protocol Plane module\n`);
    console.error('  Either the registry changed shape or every protocol module became custodial. Both need a human.\n');
    console.error('  This is a fail-closed guard: scanning an empty set and printing ✓ is the bug it exists to prevent.\n');
    process.exit(1);
  }

  return derived.sort();
}

const PROTOCOL_PLANE_SERVICES = deriveProtocolPlaneServices();

/** Importing any of these means the service can move value in the ledger. */
const WRITE_SURFACE = [
  { pattern: /\bledger\s*\.\s*post\s*\(/, reason: 'calls ledger.post() — that is custody' },
  { pattern: /from\s+['"]@intafaced\/ledger-client\/recipes['"]/, reason: 'imports ledger write recipes' },
  {
    pattern:
      /import\s*\{[^}]*\b(recipes|deposit|withdrawHold|withdrawSettle|tradeFill|escrowLock|escrowRelease|stake|feeCharge|rewardPay|mintEmission|loanCollateralLock|loanCollateralRelease|loanDraw|loanRepay|loanLiquidate|loanBadDebt|loanReserveFund)\b[^}]*\}\s*from\s*['"]@intafaced\/ledger-client['"]/s,
    reason: 'imports a ledger write recipe',
  },
  {
    pattern: /import\s*\{[^}]*\bLedgerClient\b[^}]*\}\s*from\s*['"]@intafaced\/ledger-client['"]/s,
    reason: 'imports the writable LedgerClient — use ReadOnlyLedgerClient on this plane',
  },
];

/** Solidity patterns that would hand the platform withdrawal power. */
const CONTRACT_RISKS = [
  {
    pattern: /function\s+\w*(withdraw|sweep|drain|rescue|emergencyWithdraw)\w*\s*\([^)]*\)[^{]*\bonlyOwner\b/i,
    reason: 'owner-callable withdrawal',
  },
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
//
// Walks EVERY Protocol Plane service, not just svc-protocol. It used to be
// `[svc-protocol, contracts/]` and there is no root contracts/, so in practice
// it read one service's .sol files and nothing else — which left
// services/svc-indexer/contracts/dev/DevVenue.sol scanned by neither check:
// check 1 reaches svc-indexer but reads only .ts/.tsx, and check 2 never looked
// outside svc-protocol. A contract is a contract wherever it is checked in.
const contractDirs = [...PROTOCOL_PLANE_SERVICES.map((s) => join(SERVICES, s)), join(ROOT, 'contracts')];
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
// Name the registered-but-unbuilt services out loud. The count alone reads as
// full coverage of the registry, and it is not: svc-chain is declared in
// modules.ts and has no directory, so "3 services" silently means "3 of 4".
const pending = PROTOCOL_PLANE_SERVICES.filter((s) => !existsSync(join(SERVICES, s)));
console.log(
  `✓ custody-scan clean — ${filesScanned} files across ${scanned.length} Protocol Plane service(s) derived from modules.ts` +
    `${scanned.length === 0 ? ' (none built yet — check re-arms automatically when the first one lands)' : ''}` +
    `${pending.length > 0 ? `; ${pending.join(', ')} registered but not built yet — arms automatically` : ''}`,
);
