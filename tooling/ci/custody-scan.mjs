#!/usr/bin/env node
/**
 * CUSTODY SCAN — Doctrine §16.10, enforced.
 *
 *   "The custody boundary is drawn in code. An automated CI check asserts that
 *    no Protocol Plane service imports ledger-client write recipes and no
 *    contract grants platform keys withdrawal power over user funds.
 *    Provably non-custodial or it doesn't merge."
 *
 * Three checks:
 *   1. No Protocol Plane service imports the ledger's write surface. Reading
 *      balances is fine; posting transactions is what custody looks like.
 *   2. No contract under a Protocol Plane service exposes a platform-callable
 *      path that can move user funds (a heuristic scan over Solidity sources,
 *      reported as a hard failure so a human has to look).
 *   3. Vendor Java **runtime risk surface** is in the scan object (D26-P2-08).
 *      Dual-book rules are NOT restated here — this gate **composes**
 *      `vendor-java-money-scan.mjs` as the DB-4 successor and fails closed if
 *      that successor is missing, red, or reports zero Java files. Money-plane
 *      `src/main/java` plus committed classpath `*.jar` must still be openable
 *      (presence), or the object is unscanned theater.
 *
 * Exit 0 = provably non-custodial / runtime Java surface scanned. Exit 1 = the
 * boundary moved or Java was never opened.
 *
 * ── WHAT THIS GATE IS, AND WHAT IT IS NOT (read this before citing it) ─────
 *
 * Checks 1–2 are a PROTOCOL PLANE gate. They are routinely cited as if they
 * were a repo-wide custody check. They are not: they assert non-custody only
 * where non-custody is promised.
 *
 * COVERED (checks 1–2): the services whose `planes` is exactly ['protocol'] and
 * whose `custodial` is false — DERIVED from packages/config/src/modules.ts —
 * plus every .sol file underneath them and a root contracts/.
 *
 * COVERED (check 3 — D26-P2-08): the **runtime risk surface** in vendor Java.
 * Scan object = money-plane module `src/main/java` (can move value if they
 * boot) + committed classpath jars (presence) + the successor scan actually
 * executed. Dual-book SQL / DAO / JPA ratchet lives only in
 * `vendor-java-money-scan.mjs`. Forking those rules here is a third scanner
 * and is forbidden. Test sources, docs, and gitignored `target/*.jar` stay
 * outside this object — a source scan of unbuilt trees is not a runtime claim
 * (ADR 2026-08-04).
 *
 * NOT COVERED, deliberately:
 *   · The other services under services/, including every custodial one.
 *     svc-ledger, svc-pay, svc-bank and svc-trade hold value ON PURPOSE, as
 *     svc-bridge will (§17.3). Checks 1–2 assert non-custody only where
 *     non-custody is promised; asserting it everywhere would assert a
 *     falsehood.
 *   · packages/ and apps/ — walked by neither Protocol Plane check.
 *   · Restating the dual-book call-site ratchet — that is the successor file.
 *
 * History: an earlier WIP bolted the full dual-book ratchet onto this file and
 * was correctly split out (DB-4 successor). #1748 re-opened Java here by
 * copying live-write regexes — a third scanner. This file now composes the
 * successor instead, so `pnpm scan:custody` cannot print clean while Java
 * money/custody is unscanned, and cannot drift from vendor-java-money-scan.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const SERVICES = join(ROOT, 'services');
const VENDOR = join(ROOT, 'vendor');
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

/**
 * Maven module directory names that can move value if they boot.
 * Keys are directory basenames only — never a vendor package path (brand-scan).
 * Source: vendor Java money-plane map (D26-P2-02 / D26-P2-08 done bar).
 */
const RUNTIME_RISK_MODULES = ['admin', 'ucenter-api', 'otc-api', 'exchange-api', 'market', 'wallet', 'exchange', 'core'];

/** DB-4 successor — the only dual-book Java scanner. Do not fork its rules here. */
const JAVA_SUCCESSOR = join(ROOT, 'tooling', 'ci', 'vendor-java-money-scan.mjs');

const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', '.next', 'coverage', 'drizzle', 'target', '.git']);

function* walk(dir, extensions) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full, extensions);
    else if (extensions.some((ext) => name.endsWith(ext))) yield full;
  }
}

/** Repo-relative path with forward slashes. */
const relPath = (file) => relative(ROOT, file).split(sep).join('/');

/** Find Maven module roots named `module` that carry src/main/java. */
function findRuntimeModuleRoots(module) {
  const found = [];
  function visit(dir) {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      if (SKIP_DIRS.has(name)) continue;
      const full = join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (!st.isDirectory()) continue;
      if (name === module && existsSync(join(full, 'src', 'main', 'java'))) found.push(full);
      visit(full);
    }
  }
  visit(VENDOR);
  return found;
}

const violations = [];
let filesScanned = 0;
let javaFilesScanned = 0;
let jarsScanned = 0;
let successorJavaScanned = 0;

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

// ── Check 3: vendor Java runtime risk surface (D26-P2-08) ───────────────────
//
// Scan object = money-plane src/main/java (openable) + committed jars (openable)
// + vendor-java-money-scan successor actually run. Dual-book rules stay in the
// successor — composing it is the point; copying its regexes is a third scanner.
if (!existsSync(VENDOR) || !statSync(VENDOR).isDirectory()) {
  console.error('\n✖ CUSTODY SCAN FAILED — vendor/ tree missing; cannot open the Java runtime risk surface (D26-P2-08)\n');
  process.exit(1);
}

const resolvedModules = [];
for (const module of RUNTIME_RISK_MODULES) {
  const roots = findRuntimeModuleRoots(module);
  if (roots.length === 0) {
    violations.push({
      check: 'java-runtime-risk-surface',
      file: `vendor/**/${module}/src/main/java`,
      reason: `runtime risk module "${module}" not found under vendor/`,
      detail: 'D26-P2-08 scan object is the money-plane runtime surface — a missing module is a hole, not a pass',
    });
    continue;
  }
  if (roots.length > 1) {
    violations.push({
      check: 'java-runtime-risk-surface',
      file: roots.map(relPath).join(', '),
      reason: `runtime risk module "${module}" resolved to ${roots.length} roots — key must be unique`,
      detail: 'Ambiguous module identity would let a second tree carry live writes unseen',
    });
    continue;
  }
  resolvedModules.push({ module, root: roots[0] });
}

for (const { module, root } of resolvedModules) {
  const mainJava = join(root, 'src', 'main', 'java');
  let moduleFiles = 0;
    for (const _file of walk(mainJava, ['.java'])) {
      moduleFiles++;
      javaFilesScanned++;
      filesScanned++;
    }
  if (moduleFiles === 0) {
    violations.push({
      check: 'java-runtime-risk-surface',
      file: relPath(mainJava),
      reason: `runtime risk module "${module}" has zero .java under src/main/java`,
      detail: 'Fail closed — an empty walk is not coverage of the runtime risk surface',
    });
  }
}

if (javaFilesScanned === 0) {
  console.error('\n✖ CUSTODY SCAN FAILED — opened vendor/ but scanned 0 Java files on the runtime risk surface (D26-P2-08)\n');
  console.error('  Green-over-empty is the failure mode this check exists to prevent.\n');
  process.exit(1);
}

for (const _jar of walk(VENDOR, ['.jar'])) {
  jarsScanned++;
  filesScanned++;
}

if (jarsScanned === 0) {
  violations.push({
    check: 'java-runtime-jar',
    file: 'vendor/**/*.jar',
    reason: 'no committed classpath jars found under vendor/',
    detail: 'Fail closed — the jar half of the runtime risk surface must be openable',
  });
}

if (!existsSync(JAVA_SUCCESSOR)) {
  console.error('\n✖ CUSTODY SCAN FAILED — vendor-java-money-scan.mjs missing; Java money/custody surface unscanned (D26-P2-08)\n');
  console.error('  Compose the DB-4 successor; do not fork a third scanner into this file.\n');
  process.exit(1);
}

const successor = spawnSync(process.execPath, [JAVA_SUCCESSOR], {
  cwd: ROOT,
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
});
if (successor.stdout) process.stdout.write(successor.stdout);
if (successor.stderr) process.stderr.write(successor.stderr);
if (successor.error) {
  console.error('\n✖ CUSTODY SCAN FAILED — could not run vendor-java-money-scan successor (D26-P2-08)\n');
  console.error(`  ${successor.error.message}\n`);
  process.exit(1);
}
if (successor.status !== 0) {
  console.error('\n✖ CUSTODY SCAN FAILED — Java money/custody successor is red (vendor-java-money-scan)\n');
  process.exit(1);
}
const successorText = `${successor.stdout ?? ''}\n${successor.stderr ?? ''}`;
const successorMatch = successorText.match(/(\d+)\s+Java file\(s\)/);
successorJavaScanned = successorMatch ? Number(successorMatch[1]) : 0;
if (!Number.isFinite(successorJavaScanned) || successorJavaScanned === 0) {
  console.error('\n✖ CUSTODY SCAN FAILED — successor printed clean without scanning Java files (D26-P2-08)\n');
  console.error('  The Java money/custody surface was unscanned. Green here would be TS-only theater.\n');
  process.exit(1);
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
    `${pending.length > 0 ? `; ${pending.join(', ')} registered but not built yet — arms automatically` : ''}` +
    `; Java runtime risk surface ${javaFilesScanned} src/main .java + ${jarsScanned} jar(s); successor vendor-java-money-scan walked ${successorJavaScanned} Java file(s) (D26-P2-08)`,
);
