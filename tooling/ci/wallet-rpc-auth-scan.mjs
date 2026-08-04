#!/usr/bin/env node
/**
 * WALLET RPC AUTH SCAN — a wallet RPC service must not be able to boot without
 * an authenticated perimeter.
 *
 * WHY THIS RULE EXISTS, in the words of what actually happened here.
 *
 * The vendored exchange's `01_wallet_rpc` tree has 14 Spring Boot services that
 * hold private keys. A previous change added `RpcSecurityConfig` +
 * `RpcAuthInterceptor` to the `rpc-common` module and wrote
 *
 *     rpc.auth-token=${WALLET_RPC_AUTH_TOKEN}
 *
 * into all 14 `application.properties`, above a comment stating that an unset
 * variable would leave the placeholder unresolved and the service would refuse
 * to start.
 *
 * Six of the 14 — bch, bsv, btm, eos, ltc, xmr — do not depend on `rpc-common`
 * and never did. On those six the property was read by nothing. **An unresolved
 * `${...}` placeholder in a properties file is inert until something asks for
 * the value**, so Spring never resolved it, nothing threw, and the service
 * started and served `/rpc/**` to anyone who could open a socket. Three of them
 * (bch, bsv, ltc) expose `GET /rpc/address/{account}`, which mints a fresh
 * secp256k1 private key and writes it into an unencrypted bitcoinj wallet file.
 *
 * A document recorded this perimeter as enforced. It had been verified by
 * reading `rpc-common` — the module where the guard is real — and not by asking
 * which modules actually compile against it.
 *
 * The lesson is not "remember to add the dependency". It is that a security
 * property asserted in a comment, a doc, or a properties file is not a security
 * property. This scan asks the only question that matters: for each service that
 * can boot, is the guard on its classpath?
 *
 * WHAT IT ENFORCES
 *
 *   W1  Every module with a @SpringBootApplication must have RpcSecurityConfig
 *       reachable — its own copy, or via a declared dependency that provides one.
 *
 *   W2  Any module whose application.properties declares `rpc.auth-token` must
 *       have a reader for it. A placeholder nobody reads is worse than no
 *       placeholder, because it reads as a control.
 *
 *   W3  Any compose service built from 01_wallet_rpc that publishes a port must
 *       bind it to 127.0.0.1. These processes hold withdrawal keys; nothing in
 *       here is allowed to be reachable off-box. (PR #409 did this for the
 *       vendored datastores; this keeps it true for anything added later.)
 *
 * Exit 0 = every bootable wallet RPC service authenticates its callers.
 * Exit 1 = one of them would serve anonymously.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const VENDOR = join(ROOT, 'vendor');

/**
 * The wallet RPC tree, located rather than hard-coded — the vendor's own name is
 * not written into our source (Doctrine §0.7), and this keeps working if the
 * vendored tree is ever re-rooted.
 */
function findWalletRpc() {
  let entries;
  try {
    entries = readdirSync(VENDOR);
  } catch {
    return null;
  }
  for (const name of entries) {
    const candidate = join(VENDOR, name, '01_wallet_rpc');
    if (statSync(candidate, { throwIfNoEntry: false })?.isDirectory()) return candidate;
  }
  return null;
}

const WALLET_RPC = findWalletRpc();

/** The class that installs the interceptor. Presence of the file is the proof. */
const GUARD_CLASS = 'RpcSecurityConfig.java';

/** Modules that exist to be depended on, not to boot. Not services. */
const LIBRARY_MODULES = new Set(['rpc-common', 'eth-support', 'lib']);

if (WALLET_RPC === null) {
  console.log('✓ wallet-rpc-auth-scan: no vendored 01_wallet_rpc tree — skip');
  process.exit(0);
}

const violations = [];

function readIfExists(p) {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

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
    else out.push(p);
  }
  return out;
}

/** artifactIds this pom declares a dependency on. Crude but sufficient: we only
 *  need to know whether a name appears, and these poms are flat and hand-written. */
function declaredArtifacts(pomText) {
  const ids = new Set();
  const re = /<artifactId>\s*([^<\s]+)\s*<\/artifactId>/g;
  let m;
  while ((m = re.exec(pomText)) !== null) ids.add(m[1]);
  return ids;
}

const moduleDirs = readdirSync(WALLET_RPC).filter((name) => {
  const p = join(WALLET_RPC, name);
  return statSync(p, { throwIfNoEntry: false })?.isDirectory() && !name.startsWith('.');
});

/**
 * Which modules ship a guard class of their own. Used to decide whether a
 * dependency on one of them transitively supplies the guard.
 */
const providesGuard = new Set();
for (const name of moduleDirs) {
  if (walk(join(WALLET_RPC, name)).some((f) => f.endsWith(sep + GUARD_CLASS))) providesGuard.add(name);
}

/**
 * Transitive closure: a module has the guard if it ships one, or if it depends
 * — at any depth — on a module that does. `eth`, `erc-token` and `erc-eusdt`
 * reach it two hops out, via `eth-support` → `rpc-common`, which is exactly the
 * kind of indirection a one-hop check would have reported as a hole. Iterate to
 * a fixed point rather than guessing the depth.
 */
const deps = new Map();
for (const name of moduleDirs) {
  const pom = readIfExists(join(WALLET_RPC, name, 'pom.xml'));
  deps.set(name, pom ? declaredArtifacts(pom) : new Set());
}

const guardOnClasspath = new Set(providesGuard);
for (let changed = true; changed;) {
  changed = false;
  for (const name of moduleDirs) {
    if (guardOnClasspath.has(name)) continue;
    for (const dep of deps.get(name)) {
      if (guardOnClasspath.has(dep)) {
        guardOnClasspath.add(name);
        changed = true;
        break;
      }
    }
  }
}

let servicesChecked = 0;

for (const name of moduleDirs) {
  if (LIBRARY_MODULES.has(name)) continue;
  const moduleDir = join(WALLET_RPC, name);
  const files = walk(moduleDir);

  const javaFiles = files.filter((f) => f.endsWith('.java'));
  const bootable = javaFiles.some((f) => {
    const text = readIfExists(f);
    return text !== null && /@SpringBootApplication/.test(text);
  });

  const propsFiles = files.filter((f) => f.endsWith('.properties'));
  const declaresAuthToken = propsFiles.some((f) => {
    const text = readIfExists(f);
    return text !== null && /^\s*rpc\.auth-token\s*=/m.test(text);
  });

  const hasGuard = guardOnClasspath.has(name);

  // W1 — a service that can boot must authenticate.
  if (bootable) {
    servicesChecked++;
    if (!hasGuard) {
      violations.push({
        id: 'W1',
        rel: relative(ROOT, moduleDir),
        reason:
          `@SpringBootApplication with no ${GUARD_CLASS} reachable. This service would serve /rpc/** ` +
          `unauthenticated. Add a ${GUARD_CLASS} to its config package, or a dependency on a module that has one.`,
      });
    }
  }

  // W2 — a declared token nobody reads is a control that does not exist.
  if (declaresAuthToken && !hasGuard) {
    violations.push({
      id: 'W2',
      rel: relative(ROOT, moduleDir),
      reason:
        'application.properties declares rpc.auth-token but nothing on this classpath reads it. ' +
        'The placeholder will never fail to resolve, so it stops nothing — it only reads like a control.',
    });
  }
}

// W3 — nothing here may be published off-box. Every compose file at the repo
// root and one level into vendor/, discovered rather than listed: a new compose
// file is exactly where an unbound wallet port would appear.
const composeCandidates = [
  ...readdirSync(ROOT)
    .filter((n) => /^docker-compose.*\.ya?ml$/.test(n))
    .map((n) => join(ROOT, n)),
  ...(statSync(VENDOR, { throwIfNoEntry: false })?.isDirectory()
    ? readdirSync(VENDOR)
        .filter((n) => /compose.*\.ya?ml$/.test(n))
        .map((n) => join(VENDOR, n))
    : []),
];

let composeChecked = 0;
for (const file of composeCandidates) {
  if (!existsSync(file)) continue;
  const text = readIfExists(file);
  if (text === null) continue;
  composeChecked++;
  const lines = text.split(/\r?\n/);

  // Track the nearest preceding service block that references 01_wallet_rpc,
  // and flag any port it publishes without an explicit 127.0.0.1 bind.
  let inWalletRpcService = false;
  let serviceIndent = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue;
    const indent = line.length - line.trimStart().length;

    const isServiceKey = /^\s{2,}[A-Za-z0-9_.-]+:\s*$/.test(line);
    if (isServiceKey && (serviceIndent === -1 || indent <= serviceIndent)) {
      // New service block at or above the tracked level — re-evaluate.
      const block = lines.slice(i, i + 25).join('\n');
      inWalletRpcService = /01_wallet_rpc/.test(block);
      serviceIndent = indent;
      continue;
    }

    if (!inWalletRpcService) continue;
    const port = line.match(/^\s*-\s*['"]?([0-9A-Za-z_.${}:-]+)['"]?\s*$/);
    if (!port) continue;
    const value = port[1];
    // A published mapping has a colon and is not an env-var-only line.
    if (!value.includes(':')) continue;
    if (!value.startsWith('127.0.0.1:')) {
      violations.push({
        id: 'W3',
        rel: `${relative(ROOT, file)}:${i + 1}`,
        reason:
          `wallet RPC port '${value}' is not bound to 127.0.0.1. These processes hold withdrawal keys ` +
          `and must not be reachable off-box.`,
      });
    }
  }
}

if (violations.length) {
  console.error('✖ wallet-rpc-auth-scan failed — a wallet RPC service would serve without authentication:\n');
  for (const v of violations) {
    console.error(`  ${v.rel}  [${v.id}]`);
    console.error(`    ${v.reason}\n`);
  }
  console.error(`${violations.length} violation(s).`);
  console.error('  Background: docs/A1.4-WALLET-SECRETS-PERIMETER-2026-07-30.md §3\n');
  process.exit(1);
}

console.log(
  `✓ wallet-rpc-auth-scan clean — ${servicesChecked} bootable wallet RPC service(s) authenticate, ` +
    `${composeChecked} compose file(s) checked`,
);
