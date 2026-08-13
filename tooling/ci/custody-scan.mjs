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
 *   3. Vendor Java **runtime risk surface** is opened (D26-P2-08). Dual-book
 *      detail and the call-site ratchet stay in `vendor-java-money-scan.mjs`;
 *      this gate asserts the custody boundary is not blind to Java that can
 *      move value at runtime — source under money-plane modules' `src/main`
 *      plus every committed classpath `.jar`.
 *
 * Exit 0 = provably non-custodial / runtime Java surface clean. Exit 1 = the
 * boundary moved.
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
 * COVERED (check 3 — D26-P2-08): the **runtime risk surface** in vendor Java,
 * not every `.java` file under `vendor/` and not the dual-book ADOPT-AND-ADAPT
 * ratchet. Scan object = modules that can move value if they boot (money-plane
 * map) via `src/main/java`, plus committed `*.jar` bytes on a classpath. Test
 * sources, docs, and gitignored `target/*.jar` are outside this object on
 * purpose — a source scan of unbuilt trees is not a runtime claim (ADR
 * 2026-08-04), and this check names that boundary rather than papering over it.
 *
 * NOT COVERED, deliberately:
 *   · The other services under services/, including every custodial one.
 *     svc-ledger, svc-pay, svc-bank and svc-trade hold value ON PURPOSE, as
 *     svc-bridge will (§17.3). Checks 1–2 assert non-custody only where
 *     non-custody is promised; asserting it everywhere would assert a
 *     falsehood.
 *   · packages/ and apps/ — walked by neither Protocol Plane check.
 *   · The dual-book call-site ratchet / Grade queue — `vendor-java-money-scan`.
 *
 * History: an earlier WIP bolted the full dual-book ratchet onto this file and
 * was correctly split out (DB-4 successor). D26-P2-08 re-opens Java **here**
 * with a different object — runtime risk surface — so `pnpm scan:custody`
 * cannot print clean while never opening a money-plane `.java` or classpath
 * jar. Do not re-merge the ratchet into checks 1–2.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, basename, sep } from 'node:path';

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

/** Live second-book SQL/JPQL — must be absent on the runtime risk surface. */
const JAVA_LIVE_SECOND_BOOK = [
  {
    id: 'jpql-increase-balance-live',
    re: /wallet\.balance\s*=\s*wallet\.balance\s*\+\s*:amount/i,
    reason: 'live increaseBalance JPQL on runtime risk surface — dual-book write',
  },
  {
    id: 'jpql-decrease-balance-live',
    re: /wallet\.balance\s*=\s*wallet\.balance\s*-\s*:amount\s+where\s+wallet\.id\s*=\s*:walletId\s+and\s+wallet\.balance\s*>=\s*:amount/i,
    reason: 'live decreaseBalance JPQL on runtime risk surface — dual-book write',
  },
  {
    id: 'jpql-freeze-balance-live',
    re: /wallet\.frozenBalance\s*=\s*wallet\.frozenBalance\s*\+\s*:amount/i,
    reason: 'live freezeBalance JPQL on runtime risk surface — dual-book freeze write',
  },
  {
    id: 'jpql-thaw-balance-live',
    re: /wallet\.balance\s*=\s*wallet\.balance\s*\+\s*:amount\s*,\s*wallet\.frozenBalance\s*=\s*wallet\.frozenBalance\s*-\s*:amount/i,
    reason: 'live thawBalance JPQL on runtime risk surface — dual-book thaw write',
  },
  {
    id: 'native-balance-plus',
    re: /SET\s+balance\s*=\s*balance\s*\+/i,
    reason: 'native SQL live balance credit on runtime risk surface — dual-book',
  },
  {
    id: 'native-balance-minus',
    re: /SET\s+balance\s*=\s*balance\s*-/i,
    reason: 'native SQL live balance debit on runtime risk surface — dual-book',
  },
  {
    id: 'native-frozen-plus',
    re: /SET\s+frozen_balance\s*=\s*frozen_balance\s*\+/i,
    reason: 'native SQL live frozen credit on runtime risk surface — dual-book',
  },
  {
    id: 'native-frozen-minus',
    re: /SET\s+frozen_balance\s*=\s*frozen_balance\s*-/i,
    reason: 'native SQL live frozen debit on runtime risk surface — dual-book',
  },
  {
    id: 'native-to-released-write',
    re: /SET\s+to_released\s*=/i,
    reason: 'native/JPQL live to_released write on runtime risk surface — second-book column',
  },
];

const DAO_MUTATORS = ['increaseBalance', 'decreaseBalance', 'freezeBalance', 'thawBalance'];
const NOOP_QUERY = /^\s*UPDATE\s+member_wallet\s+SET\s+id\s*=\s*id\s+WHERE\s+1\s*=\s*0\b/i;

/** UTF-8 / latin1 needles banned inside committed classpath jars. */
const JAR_BANNED_STRINGS = [
  'increaseBalance',
  'decreaseBalance',
  'freezeBalance',
  'thawBalance',
  'MemberWalletDao',
  'setBalance',
  'setFrozenBalance',
  'setToReleased',
];

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

/**
 * Strip // and /* *\/ comments. String contents KEPT — JPQL lives in @Query("…").
 * Good enough for the live-write shapes below; not a full Java lexer.
 */
function stripJavaComments(source) {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const n = source[i + 1];
    if (c === '/' && n === '/') {
      i += 2;
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && n === '*') {
      i += 2;
      while (i + 1 < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i = Math.min(i + 2, source.length);
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      out += c;
      i++;
      while (i < source.length) {
        out += source[i];
        if (source[i] === '\\') {
          i++;
          if (i < source.length) {
            out += source[i];
            i++;
          }
          continue;
        }
        if (source[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

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
let daoNoopsProved = 0;

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
// Object = money-plane module src/main/java + committed classpath jars.
// Not the full dual-book ratchet (vendor-java-money-scan). Fail closed if the
// surface cannot be opened — green-over-empty is the defect this exists to end.
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
  for (const file of walk(mainJava, ['.java'])) {
    moduleFiles++;
    javaFilesScanned++;
    filesScanned++;
    const rel = relPath(file);
    const raw = readFileSync(file, 'utf8');
    const sqlView = stripJavaComments(raw);

    for (const line of sqlView.split(/\r?\n/)) {
      for (const rule of JAVA_LIVE_SECOND_BOOK) {
        if (rule.re.test(line)) {
          violations.push({
            check: 'java-runtime-risk-surface',
            file: rel,
            reason: rule.reason,
            detail: `${module} is on the Java runtime risk surface — live second-book SQL is custody (§0.6, D26-P2-08)`,
          });
          break;
        }
      }
    }

    // DAO declarations on the runtime surface must stay the sanctioned no-op.
    if (/(?:Dao|Repository)\.java$/.test(rel)) {
      for (const m of [...sqlView.matchAll(/@Query\s*\(([\s\S]{0,400}?)\)\s*([\s\S]{0,200}?);/g)]) {
        const [, annotation, signature] = m;
        const value = /"([^"]*)"/.exec(annotation)?.[1] ?? '';
        const mutator = DAO_MUTATORS.find((name) => new RegExp(`(?<![.\\w])${name}\\s*\\(`).test(signature));
        const isMemberWalletDao = basename(file) === 'MemberWalletDao.java';
        const isWalletUpdate = /UPDATE\s+member_wallet\b/i.test(value);
        if (!mutator && !(isMemberWalletDao && isWalletUpdate)) continue;
        if (!NOOP_QUERY.test(value)) {
          violations.push({
            check: 'java-runtime-risk-surface',
            file: rel,
            reason: `DAO ${mutator ?? 'member_wallet UPDATE'} is not the sanctioned no-op`,
            detail: 'Runtime risk surface DAO mutators must be UPDATE member_wallet SET id = id WHERE 1 = 0',
          });
        } else {
          daoNoopsProved++;
        }
      }
    }
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

// Committed jars are the classpath binaries that actually ship in-tree.
// Application target jars are gitignored; these lib jars must still not carry
// dual-book mutator markers (a dropped app jar would light this up).
for (const file of walk(VENDOR, ['.jar'])) {
  jarsScanned++;
  filesScanned++;
  const bytes = readFileSync(file);
  const text = bytes.toString('latin1');
  const rel = relPath(file);
  for (const needle of JAR_BANNED_STRINGS) {
    if (text.includes(needle)) {
      violations.push({
        check: 'java-runtime-jar',
        file: rel,
        reason: `committed jar contains "${needle}"`,
        detail: 'Classpath jar is part of the runtime risk surface — dual-book / wallet mutator markers must not ship in binary form',
      });
    }
  }
}

if (jarsScanned === 0) {
  violations.push({
    check: 'java-runtime-jar',
    file: 'vendor/**/*.jar',
    reason: 'no committed classpath jars found under vendor/',
    detail: 'Fail closed — the jar half of the runtime risk surface must be openable',
  });
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
    `; Java runtime risk surface ${javaFilesScanned} src/main .java + ${jarsScanned} jar(s), ${daoNoopsProved} DAO no-op(s) proved (D26-P2-08)`,
);
