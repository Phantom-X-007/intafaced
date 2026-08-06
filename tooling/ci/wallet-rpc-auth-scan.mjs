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
 *       reachable — its own copy, or via a declared dependency AT THE VERSION
 *       THIS REACTOR BUILDS that provides one.
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
 *   W4  No pom may declare the same in-reactor artifact twice. Maven resolves the
 *       FIRST declaration and says nothing about the second, so a duplicate is a
 *       coordinate whose effective value cannot be read off the file.
 *
 * ── THE HOLE W1 HAD UNTIL THIS COMMIT, AND WHY EXACT MATCH ─────────────────
 *
 * `declaredArtifacts()` collected `<artifactId>` values with one regex and never
 * looked at `<version>`. So W1's real question was "does the string `rpc-common`
 * appear anywhere in this pom?" — a question about spelling, not about what ends
 * up on a classpath.
 *
 * `act/pom.xml` answers it yes twice, at two different versions: `rpc-common`
 * **1.0** at :49-53 and `rpc-common` **1.2** at :77-81. Maven takes the first
 * declaration for a duplicate groupId:artifactId, so `act` resolves 1.0. The
 * `rpc-common` this reactor builds is 1.2, and there is no 1.0 anywhere in this
 * tree. Either the build cannot resolve it, or a stale 1.0 in somebody's local
 * repository satisfies it — and a 1.0 predating the auth work carries no
 * `RpcSecurityConfig`, in which case `act` boots with no interceptor and no
 * startup failure, because nothing else reads `rpc.auth-token`. That is the
 * precise failure mode this scan exists to eliminate, and the scan was passing
 * it. (`docs/security/WALLET-RPC-SECURITY-REVIEW-2026-08-05.md` §F10.)
 *
 * **The rule is exact match to the version this reactor builds, not a floor.**
 * Spelled out, because "at least 1.2" sounds like the more permissive and
 * therefore safer choice and is in fact meaningless here:
 *
 *   · A bare `<version>1.0</version>` is not a minimum in Maven, it is an exact
 *     coordinate. Maven resolves 1.0 and only 1.0. A floor rule would pass a
 *     declaration whose actual effect is "put 1.0 on the classpath" on the
 *     strength of a claim about 1.2 — a version that will never be there. Floors
 *     only mean anything against a range like `[1.2,)`, and nothing in this tree
 *     uses one.
 *   · The only artifact anyone here can PROVE carries `RpcSecurityConfig` is the
 *     one in this checkout, because it is the one whose source we can read. Any
 *     other version resolves to a jar this repository has never seen. Unprovable
 *     is not the same as absent — and it is not the same as present either. A
 *     gate must call it unproven and fail.
 *   · Version ORDERING is a trap this gate should decline. Comparing `1.10`
 *     against `1.9` correctly needs Maven's own comparator, and a floor check
 *     that gets that subtly wrong fails OPEN. String equality against a version
 *     read out of the reactor cannot be subtly wrong.
 *
 * ── WHY act IS FROZEN RATHER THAN SIMPLY RED ───────────────────────────────
 *
 * The fix for `act` is to delete the `1.0` declaration, and that edit is inside
 * `01_wallet_rpc` — unreviewed, unbuilt, key-handling third-party code that
 * `docs/OWNER-ACTIONS-WALLET-RPC-SECRETS.md` §A4 makes an owner action, not a
 * gate's job. So the finding is FROZEN by exact text with a written reason, the
 * convention `wallet-rpc-mainnet-scan.mjs` and `vendor-java-money-scan.mjs`
 * already established. Freezing is not passing:
 *
 *   · `act` is named in the summary line as RECORDED UNPROVEN, so a green run can
 *     no longer be read as "all thirteen authenticate";
 *   · a NEW module in the same shape is not in the baseline and fails;
 *   · an EDIT to `act`'s coordinates changes the frozen text and fails;
 *   · and when the remediation branch deletes the `1.0` line the entry matches
 *     nothing, goes stale, and fails — so the baseline can only shrink, and a
 *     fix cannot silently leave room for the finding to come back.
 *
 * Exit 0 = every bootable wallet RPC service authenticates its callers, or is
 *          recorded here as unproven with a reason a human wrote.
 * Exit 1 = one of them would serve anonymously, or something that was watching
 *          this tree stopped watching.
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
    // vendor/ may contain files (e.g. .gitignore). join(file, '01_wallet_rpc')
    // throws ENOTDIR on Node — only descend into directories.
    const root = join(VENDOR, name);
    if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) continue;
    const candidate = join(root, '01_wallet_rpc');
    if (statSync(candidate, { throwIfNoEntry: false })?.isDirectory()) return candidate;
  }
  return null;
}

const WALLET_RPC = findWalletRpc();

/** The class that installs the interceptor. Presence of the file is the proof. */
const GUARD_CLASS = 'RpcSecurityConfig.java';

/** Modules that exist to be depended on, not to boot. Not services. */
const LIBRARY_MODULES = new Set(['rpc-common', 'eth-support', 'lib']);

/**
 * Findings that exist in the tree today, pinned to the exact string that produced
 * them. See the header for why they are frozen rather than red: the fix is inside
 * `01_wallet_rpc`, which is an owner action, not a gate's job.
 *
 * NOT AN EXEMPTION LIST. Each entry says a human read this exact coordinate and
 * understood what it means. `module` + `id` + `text` is the key; `text` is
 * derived from the pom by the scan itself, so editing either version changes it
 * and the entry stops matching.
 *
 * @type {{ id: string, module: string, text: string, reason: string }[]}
 */
const FROZEN = [
  {
    id: 'W1',
    module: 'act',
    text: 'rpc-common@1.0 (this reactor builds rpc-common@1.2)',
    reason:
      'act/pom.xml:49-53 declares rpc-common 1.0 and :77-81 declares it again at 1.2. Maven resolves the first, so act ' +
      'resolves 1.0 — a version that does not exist in this reactor and whose contents nobody here can read. If it comes ' +
      'from a stale local repository and predates the auth work it carries no RpcSecurityConfig, and act then boots, ' +
      'serves /rpc/** to anyone who can open a socket, and throws nothing on startup because nothing else reads ' +
      'rpc.auth-token. Until this commit W1 read only the artifactId and passed act as authenticated. It is not ' +
      'authenticated; it is UNPROVEN, and that is what this entry records. Owner queue: delete the 1.0 declaration ' +
      '(WALLET-RPC-SECURITY-REVIEW-2026-08-05 §F10 remediation direction), then delete this entry — the gate will ' +
      'demand it, because a fixed finding that stays frozen is room left for the finding to come back.',
  },
  {
    id: 'W2',
    module: 'act',
    text: 'rpc-common@1.0 (this reactor builds rpc-common@1.2)',
    reason:
      'The same root cause seen from the properties side, and worth its own entry because it is the ORIGINAL defect ' +
      'this scan was written for: act/src/main/resources/application.properties declares rpc.auth-token, and on the ' +
      'classpath act actually resolves there is nothing that reads it. An unresolved ${...} placeholder is inert until ' +
      'something asks for the value, so it never fails to resolve and never stops a boot — it only reads like a control ' +
      'in a file, in a diff, and in a document. Clears when the W1 entry above clears.',
  },
  {
    id: 'W4',
    module: 'act',
    text: 'rpc-common declared 2× as 1.0, 1.2',
    reason:
      'The shape that made the version defect invisible. Two declarations of the same in-reactor artifact, forty lines ' +
      'apart, resolving to the one a reader is least likely to look at. Frozen separately from W1 because W4 catches ' +
      'this even when BOTH versions happen to be valid — at which point nothing else in this gate would notice, and the ' +
      'file would still not state which coordinate is in effect.',
  },
  {
    id: 'W4',
    module: 'ect',
    text: 'rpc-common declared 2× as (no version), (no version)',
    reason:
      'ect/pom.xml:48-51 and :69-72 both declare rpc-common with no version, so both inherit 1.2 from the reactor ' +
      'dependencyManagement and the duplicate is currently harmless. Frozen anyway, and this is the point of W4: a ' +
      'harmless duplicate is what teaches a reviewer that a duplicate here is normal, and that is exactly the reading ' +
      "under which act's harmful one survived. Adding a version to either line changes this string and fails.",
  },
];

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

/** XML comments hide whole `<dependency>` blocks. Remove them before reading anything. */
const stripXmlComments = (xml) => xml.replace(/<!--[\s\S]*?-->/g, '');

/** First `<name>…</name>` in a block, trimmed. These poms are flat and hand-written. */
function tagIn(block, name) {
  const m = new RegExp(`<${name}>\\s*([^<]*?)\\s*</${name}>`).exec(block);
  return m ? m[1].trim() : null;
}

/**
 * `${...}` expansion against the reactor's properties. `bch` versions itself
 * `${project-version}` and `erc-token` uses `${parent.version}` — both resolve to
 * the same 1.2, and a gate that compared the raw strings would call two identical
 * versions different and fail on modules that are fine.
 */
function expand(value, props) {
  if (value === null || value === undefined) return null;
  let out = value;
  for (let i = 0; i < 5 && out.includes('${'); i++) {
    const before = out;
    out = out.replace(/\$\{([^}]+)\}/g, (whole, key) => (key in props ? props[key] : whole));
    if (out === before) break;
  }
  return out;
}

/**
 * Everything about a pom this gate needs: what version the module IS, and what
 * version it asks for of every artifact it depends on.
 *
 * `first` is the whole point. Maven resolves a duplicate groupId:artifactId to
 * its FIRST declaration in the file and reports nothing about the rest, which is
 * how `act` came to depend on rpc-common 1.0 while a reader's eye landed on the
 * 1.2 block below it. This mirrors that resolution order exactly; `all` keeps
 * every declaration so W4 can say what was shadowed.
 */
function parsePom(rawText) {
  const xml = stripXmlComments(rawText);

  const parentBlock = /<parent>([\s\S]*?)<\/parent>/.exec(xml)?.[1] ?? '';
  const parentVersion = tagIn(parentBlock, 'version');

  // The project's own coordinates are what is left once the blocks that carry
  // OTHER artifacts' versions are removed — otherwise the first `<version>` found
  // is a dependency's and every module looks like it is at 1.4.6.
  const projectOnly = xml
    .replace(/<parent>[\s\S]*?<\/parent>/g, '')
    .replace(/<dependencyManagement>[\s\S]*?<\/dependencyManagement>/g, '')
    .replace(/<dependencies>[\s\S]*?<\/dependencies>/g, '')
    .replace(/<build>[\s\S]*?<\/build>/g, '')
    .replace(/<profiles>[\s\S]*?<\/profiles>/g, '');

  const props = Object.create(null);
  for (const block of xml.matchAll(/<properties>([\s\S]*?)<\/properties>/g)) {
    for (const p of block[1].matchAll(/<([\w.-]+)>\s*([^<]*?)\s*<\/\1>/g)) props[p[1]] = p[2];
  }

  /** Dependencies declared in a `<dependencies>` block that is NOT dependencyManagement. */
  const declared = new Map();
  const directBlocks = xml
    .replace(/<dependencyManagement>[\s\S]*?<\/dependencyManagement>/g, '')
    .matchAll(/<dependencies>([\s\S]*?)<\/dependencies>/g);
  for (const block of directBlocks) {
    for (const dep of block[1].matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
      const artifactId = tagIn(dep[1], 'artifactId');
      if (artifactId === null) continue;
      const version = tagIn(dep[1], 'version');
      const existing = declared.get(artifactId);
      if (existing) existing.all.push(version);
      else declared.set(artifactId, { first: version, all: [version] });
    }
  }

  /** dependencyManagement supplies the version when a module omits one. */
  const managed = new Map();
  for (const block of xml.matchAll(/<dependencyManagement>([\s\S]*?)<\/dependencyManagement>/g)) {
    for (const dep of block[1].matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
      const artifactId = tagIn(dep[1], 'artifactId');
      if (artifactId !== null && !managed.has(artifactId)) managed.set(artifactId, tagIn(dep[1], 'version'));
    }
  }

  return { ownVersion: tagIn(projectOnly, 'version'), parentVersion, props, declared, managed };
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

// The reactor pom: its properties and its dependencyManagement are inherited by
// every module, and `ect`, `erc-token` and `erc-eusdt` get the version of their
// in-tree dependency from nowhere else.
const reactorPom = parsePom(readIfExists(join(WALLET_RPC, 'pom.xml')) ?? '');

const poms = new Map();
for (const name of moduleDirs) {
  const text = readIfExists(join(WALLET_RPC, name, 'pom.xml'));
  poms.set(name, text === null ? null : parsePom(text));
}

/** The version this reactor BUILDS for a module — the only version we can read the source of. */
const moduleVersion = new Map();
for (const [name, pom] of poms) {
  if (pom === null) continue;
  const props = { ...reactorPom.props, ...pom.props, 'parent.version': pom.parentVersion, 'project.parent.version': pom.parentVersion };
  moduleVersion.set(name, expand(pom.ownVersion ?? pom.parentVersion, props));
}

/** What version of `artifactId` this module actually resolves. `null` = nothing states one. */
function resolvedVersion(name, artifactId) {
  const pom = poms.get(name);
  if (!pom) return null;
  const props = { ...reactorPom.props, ...pom.props, 'parent.version': pom.parentVersion, 'project.parent.version': pom.parentVersion };
  const declared = pom.declared.get(artifactId);
  const stated = declared?.first ?? pom.managed.get(artifactId) ?? reactorPom.managed.get(artifactId) ?? null;
  return expand(stated, props);
}

/**
 * Transitive closure: a module has the guard if it ships one, or if it depends
 * — at any depth — on a module that does, AT THE VERSION THIS REACTOR BUILDS.
 * `eth`, `erc-token` and `erc-eusdt` reach it two hops out, via `eth-support` →
 * `rpc-common`, which is exactly the kind of indirection a one-hop check would
 * have reported as a hole. Iterate to a fixed point rather than guessing depth.
 *
 * `mismatched` records the near-misses so W1 can say WHY a module failed instead
 * of only that it did: "declares rpc-common but resolves 1.0, and this reactor
 * builds 1.2" is actionable; "no guard reachable" sends someone to add a
 * dependency that is already there.
 */
const guardOnClasspath = new Set(providesGuard);
/** @type {Map<string, { artifactId: string, resolved: string | null, built: string }[]>} */
const mismatched = new Map();

for (let changed = true; changed;) {
  changed = false;
  for (const name of moduleDirs) {
    if (guardOnClasspath.has(name)) continue;
    const pom = poms.get(name);
    if (!pom) continue;
    for (const artifactId of pom.declared.keys()) {
      if (!guardOnClasspath.has(artifactId)) continue;
      const built = moduleVersion.get(artifactId) ?? null;
      const resolved = resolvedVersion(name, artifactId);
      if (built !== null && resolved === built) {
        guardOnClasspath.add(name);
        changed = true;
        break;
      }
      const list = mismatched.get(name) ?? [];
      if (!list.some((e) => e.artifactId === artifactId)) list.push({ artifactId, resolved, built });
      mismatched.set(name, list);
    }
  }
}

// A module that reached the guard on a later pass may have logged a near-miss on
// an earlier one against a dependency that had not yet been resolved. Only the
// modules that never got there need an explanation.
for (const name of [...mismatched.keys()]) if (guardOnClasspath.has(name)) mismatched.delete(name);

/**
 * A near-miss, rendered as the exact coordinate string that caused it. This is
 * the FREEZE KEY, so it has to be derived from the pom rather than written by
 * hand: `rpc-common@1.0 (this reactor builds rpc-common@1.2)`. Editing either
 * version in the pom changes this string and the frozen entry stops matching.
 */
function mismatchText(name) {
  return (mismatched.get(name) ?? [])
    .map((e) => `${e.artifactId}@${e.resolved ?? '(no version stated)'} (this reactor builds ${e.artifactId}@${e.built ?? '?'})`)
    .join(', ');
}

/**
 * The near-miss may be one or two hops away: if `eth-support` resolves the wrong
 * `rpc-common`, `eth` fails with no near-miss of its own, because from `eth`'s
 * position `eth-support` simply stopped providing a guard. Walking the in-reactor
 * dependencies for THEIR recorded mismatches turns "no dependency provides it"
 * back into an address. Reason text only — never the freeze key, so widening this
 * cannot move a frozen entry.
 */
function rootCauseChain(name, seen = new Set()) {
  if (seen.has(name)) return [];
  seen.add(name);
  const out = [];
  const own = mismatchText(name);
  if (own !== '') out.push(`${name} → ${own}`);
  for (const artifactId of poms.get(name)?.declared.keys() ?? []) {
    if (moduleVersion.has(artifactId)) out.push(...rootCauseChain(artifactId, seen));
  }
  return out;
}

let servicesChecked = 0;

for (const name of moduleDirs) {
  const pom = poms.get(name);

  // W4 — a duplicate in-reactor coordinate. Checked for LIBRARY modules too: the
  // shadowed declaration is the defect whether or not the module boots.
  if (pom) {
    for (const [artifactId, decl] of pom.declared) {
      if (decl.all.length < 2) continue;
      if (!moduleVersion.has(artifactId)) continue; // only in-reactor artifacts
      violations.push({
        id: 'W4',
        module: name,
        rel: relative(ROOT, join(WALLET_RPC, name, 'pom.xml')),
        text: `${artifactId} declared ${decl.all.length}× as ${decl.all.map((v) => v ?? '(no version)').join(', ')}`,
        reason:
          `pom.xml declares the in-reactor artifact '${artifactId}' more than once. Maven silently resolves the FIRST ` +
          'declaration and reports nothing about the others, so the effective coordinate cannot be read off the file — ' +
          'which is how a stale version survives review sitting directly above a correct one.',
      });
    }
  }

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
  const near = mismatchText(name);

  // W1 — a service that can boot must authenticate.
  if (bootable) {
    servicesChecked++;
    if (!hasGuard) {
      violations.push({
        id: 'W1',
        module: name,
        rel: relative(ROOT, moduleDir),
        text: near === '' ? `no declared dependency provides ${GUARD_CLASS}` : near,
        reason:
          near === ''
            ? `@SpringBootApplication with no ${GUARD_CLASS} reachable. This service would serve /rpc/** ` +
              `unauthenticated. Add a ${GUARD_CLASS} to its config package, or a dependency on a module that has one.` +
              (rootCauseChain(name).length > 0 ? `\n    Version mismatch further down the chain: ${rootCauseChain(name).join(' · ')}` : '')
            : `@SpringBootApplication whose only route to ${GUARD_CLASS} is a dependency declared at a version this ` +
              `reactor does not build — ${near}. That version's contents are not in this checkout, so the guard cannot ` +
              'be shown to be on the classpath. It resolves from a local repository or not at all, and a version ' +
              'predating the auth work carries no guard at all: the service boots, serves /rpc/** and throws nothing.',
      });
    }
  }

  // W2 — a declared token nobody reads is a control that does not exist.
  if (declaresAuthToken && !hasGuard) {
    violations.push({
      id: 'W2',
      module: name,
      rel: relative(ROOT, moduleDir),
      text: near === '' ? 'rpc.auth-token declared, no reader on the classpath' : near,
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
        module: '(compose)',
        rel: `${relative(ROOT, file)}:${i + 1}`,
        text: value,
        reason:
          `wallet RPC port '${value}' is not bound to 127.0.0.1. These processes hold withdrawal keys ` +
          `and must not be reachable off-box.`,
      });
    }
  }
}

// ── Walk guard ──────────────────────────────────────────────────────────────
//
// This repo has a named recurring defect: checks that report on nothing and get
// read as evidence. The absent-tree branch above still exits 0 on purpose — a
// tree that does not exist cannot serve unauthenticated, and that asymmetry with
// `wallet-rpc-mainnet-scan.mjs` is deliberate and documented there. But a tree
// that IS present and yields no modules, no services, no guard class or an empty
// baseline is a scan that opened nothing, and it must never print a tick.
const emptyWalks = [];
if (moduleDirs.length === 0) emptyWalks.push('found 0 module directories in the wallet RPC tree');
if (providesGuard.size === 0) emptyWalks.push(`found 0 modules shipping ${GUARD_CLASS} — the closure below it is meaningless`);
if (servicesChecked === 0) emptyWalks.push('found 0 bootable services — W1 asserted nothing');
if (FROZEN.length === 0) emptyWalks.push('the frozen baseline is empty — it is the proof-of-life for the version rule');

if (emptyWalks.length > 0) {
  console.error('\n✖ wallet-rpc-auth-scan FAILED — a check reported on nothing:\n');
  for (const w of emptyWalks) console.error(`  · ${w}`);
  console.error('\n  A scan that opened nothing must never print a tick. Fix the discovery above, or delete the');
  console.error('  rule that can no longer see its subject.\n');
  process.exit(1);
}

// ── The ratchet ─────────────────────────────────────────────────────────────

const frozenKey = (e) => JSON.stringify([e.id, e.module, e.text]);

const frozenIndex = new Map();
const duplicateEntries = [];
for (const entry of FROZEN) {
  const key = frozenKey(entry);
  if (frozenIndex.has(key)) duplicateEntries.push(`${entry.id} ${entry.module} "${entry.text}"`);
  frozenIndex.set(key, { entry, seen: 0 });
}

const unfrozen = [];
for (const v of violations) {
  const hit = frozenIndex.get(frozenKey(v));
  if (hit) hit.seen++;
  else unfrozen.push(v);
}

const stale = [...frozenIndex.values()].filter((v) => v.seen === 0).map((v) => v.entry);

if (duplicateEntries.length > 0 || unfrozen.length > 0 || stale.length > 0) {
  console.error('✖ wallet-rpc-auth-scan failed — a wallet RPC service would serve without authentication:\n');

  for (const d of duplicateEntries) {
    console.error(`  [duplicate frozen entry]  ${d}`);
    console.error('    Two entries with the same key means one of them is unreachable and its reason went unread.\n');
  }

  for (const v of unfrozen) {
    console.error(`  ${v.rel}  [${v.id}]  ${v.module}`);
    console.error(`    matched: ${v.text}`);
    console.error(`    ${v.reason}\n`);
  }

  for (const e of stale) {
    console.error(`  [${e.id}]  ${e.module}  — frozen finding matched nothing`);
    console.error(`    expected: ${e.text}`);
    console.error(
      '    Either it is FIXED — delete the entry so the baseline shrinks and cannot silently leave room for\n' +
        '    it to come back — or the rule that used to see it has gone blind, which is the worse reading and\n' +
        '    the reason this is a failure rather than a warning.\n',
    );
  }

  console.error(`${unfrozen.length + stale.length + duplicateEntries.length} problem(s).`);
  console.error('  Background: docs/A1.4-WALLET-SECRETS-PERIMETER-2026-07-30.md §3');
  console.error('  Review: docs/security/WALLET-RPC-SECURITY-REVIEW-2026-08-05.md §F10\n');
  process.exit(1);
}

const unprovenModules = [...new Set(FROZEN.filter((e) => e.id === 'W1').map((e) => e.module))];
const provenServices = servicesChecked - unprovenModules.length;

console.log(
  `✓ wallet-rpc-auth-scan clean — ${provenServices} of ${servicesChecked} bootable wallet RPC service(s) PROVE an ` +
    `authenticated perimeter at the version this reactor builds; ` +
    (unprovenModules.length === 0
      ? 'none recorded unproven; '
      : `${unprovenModules.join(', ')} RECORDED UNPROVEN (not green — see FROZEN in this file); `) +
    `${FROZEN.length} frozen finding(s) all still exactly as recorded; ${composeChecked} compose file(s) checked`,
);
