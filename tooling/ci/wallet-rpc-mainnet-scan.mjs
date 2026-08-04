#!/usr/bin/env node
/**
 * WALLET RPC MAINNET SCAN — the vendored wallet RPC tree is prohibited from
 * reaching a live chain, and until this file that prohibition existed only in
 * prose.
 *
 * ── WHAT WAS ACTUALLY TRUE BEFORE THIS GATE ────────────────────────────────
 *
 * `docs/OWNER-ACTIONS-WALLET-RPC-SECRETS.md` §A4 says, in words: "do not deploy
 * this against real value yet", because the security review that the vendored
 * exchange ADR makes a precondition of adoption has not happened. 13 bootable
 * Spring Boot services, ~228 Java files, several of which mint a fresh
 * secp256k1 private key on an HTTP GET. That paragraph is correct and it is
 * also unenforced: no check in this repo has ever read a chain id, an RPC
 * endpoint, a start height or a network selector out of this tree.
 *
 * What stops mainnet today is INCIDENTAL, and every piece of it is one commit
 * from evaporating:
 *
 *   · there is no Dockerfile anywhere in the tree,
 *   · no compose file defines a service that builds or runs any module,
 *   · no workflow builds it (there is no JDK step in CI at all),
 *   · the reactor pom declares a module that is absent from disk, so `mvn`
 *     cannot even resolve the build,
 *   · and the `${...}` placeholders added by the auth/secrets work stop a
 *     service from starting while they are unset.
 *
 * The last one is the one people mistake for a control. It is not a network
 * control: **supply the environment, point `coin.rpc` at a mainnet node, and
 * every other gate in this repo still prints clean.** The placeholders decide
 * whether a service starts, not which chain it talks to.
 *
 * And the code underneath is not network-agnostic waiting for configuration.
 * It is hardcoded to mainnet:
 *
 *   · `MainNetParams.get()` is the literal, only network selector in the
 *     bitcoinj/litecoinj address-minting controllers. The string "testnet"
 *     appears exactly ONCE in the whole tree, inside a comment. There is no
 *     switch to flip.
 *   · Every ETH/ERC withdrawal is signed by the two-argument
 *     `TransactionEncoder.signMessage(rawTx, credentials)` — the pre-EIP-155
 *     form, with NO chain id — so the signature it produces is valid on every
 *     EVM chain simultaneously, mainnet included, whatever `coin.rpc` names.
 *   · The same withdrawal is then broadcast a SECOND time to a hardcoded
 *     `https://api.etherscan.io/api` proxy, which is Ethereum mainnet and is
 *     not configurable at all. Pointing the node at a testnet does not stop
 *     this path; it just means the mainnet copy is the one that lands.
 *
 * So "point it at a testnet" is not available as a mitigation, and the real
 * invariant is narrower and harder: **nothing in this repository may be able to
 * build, boot or ship any module of this tree, and no NEW mainnet constant may
 * be added to it,** until a human completes the review that §A4 requires.
 * That is what this gate asserts.
 *
 * ── WHY A NEW FILE AND NOT AN EXTENSION OF wallet-rpc-auth-scan ────────────
 *
 * They look adjacent — same tree, same doctrine section — and they are not the
 * same check. The auth scan asks ONE structural question ("is the guard class
 * on this module's classpath?") and answers it from poms; it holds no
 * allowlist, no per-value state, and its whole output is a single sentence
 * about authentication. This gate asks a content question over Java, a value
 * question over .properties, and three ABSENCE questions over deployment
 * artefacts, and it carries a 38-entry frozen baseline. Merging them would
 * produce one script with two unrelated failure headlines and a ratchet the
 * auth scan has no concept of — and, because `gates.mjs` prints one line and
 * one doctrine per gate id, a red would no longer say which prohibition broke.
 * They are also allowed to move independently: the auth perimeter can be
 * finished and deleted while the mainnet prohibition must outlive it.
 *
 * Rule W3 of the auth scan is the one overlap, and the two are complementary
 * rather than duplicated. W3 says "IF a compose service publishes a wallet RPC
 * port, it must bind 127.0.0.1". It currently walks nothing, because no compose
 * service references the tree — so it can never fire, and a green W3 today is a
 * statement about the empty set. M6 here states the stronger invariant that
 * makes W3's silence meaningful: **no compose service may reference this tree
 * at all.** W3 stays as the weaker fallback for the day M6 is deliberately
 * relaxed.
 *
 * ── WHAT IT ENFORCES ───────────────────────────────────────────────────────
 *
 *   M1  No mainnet network-parameter selector in Java. `MainNetParams` (both
 *       the bitcoinj and the litecoinj package — matched by CLASS name so a
 *       third fork cannot slip past on a new package), `NetworkParameters
 *       .prodNet()`, `ID_MAINNET`. Imports count: an unused import in a
 *       key-minting controller is one line away from being the live selector,
 *       which is exactly the state btm, eos and xmr are in.
 *
 *   M2  No hardcoded public chain endpoint in Java. A URL literal whose host is
 *       routable off-box is a network selector that no properties file can
 *       override.
 *
 *   M3  No chain-id-less EVM signature. Two-argument `signMessage` is
 *       pre-EIP-155: the resulting transaction is replay-valid on mainnet no
 *       matter which node signed the nonce.
 *
 *   M4  No mainnet-shaped value in .properties — a public chain endpoint, a
 *       non-zero chain start height, a literal address, or a keystore filename
 *       embedding an account.
 *
 *   M5  No Dockerfile, and no build/run script, that can package a module here.
 *   M6  No compose service that references this tree.
 *   M7  No workflow step that builds or boots a module here.
 *
 *       M5-M7 are the three incidental barriers, restated as invariants. They
 *       are ABSENCE assertions and each names its own denominator, so "nothing
 *       found" can never be confused with "nothing looked" — see the walk guard.
 *
 * ── THE RATCHET, BY EXACT TEXT ─────────────────────────────────────────────
 *
 * The tree is full of mainnet constants and this branch may not touch it: it is
 * unreviewed, unbuilt, key-handling third-party code, and editing it is an
 * owner action, not a gate's job. So the existing findings are FROZEN — not
 * counted, but pinned to the exact string that produced them, following the
 * convention `vendor-java-money-scan.mjs` established. Counting would let a
 * mainnet height be swapped for a different mainnet height, or one address for
 * another, with the total unchanged. Pinning the text means:
 *
 *   · a NEW mainnet constant, or an EDIT to a frozen one, fails — the value is
 *     the thing being frozen, not the quantity of values;
 *   · a REMOVED one also fails, asking for its entry to be deleted, so the
 *     baseline can only shrink and a fix cannot silently leave room to regress;
 *   · and every entry carries a written reason, because a baseline without one
 *     is indistinguishable from an exemption nobody remembers granting.
 *
 * Entries are keyed by MODULE + FILE BASENAME, and property keys are recorded
 * by their LAST dot-segment only. Both are forced by `brand-scan` §0.7: the
 * upstream vendor's name appears in its directory name, its Java package and
 * some of its property key prefixes, and this repo's own source may not carry
 * it. `vendor-java-money-scan.mjs` hit the same wall and answered it the same
 * way. It is the better key regardless — it survives the vendored tree being
 * re-rooted, which a path prefix would not.
 *
 * ── THE WALK GUARD (this repo has a named recurring defect) ────────────────
 *
 * "Checks that report on nothing and get read as evidence." Four gates were
 * landed to close that class; W3 above is a live example of it. So every
 * denominator here is asserted before any verdict is printed: the tree, its
 * modules, its Java files, its properties files, the compose files, and the
 * workflow files. Zero of any of them is a HARD FAILURE, never a clean run —
 * the same discipline as `custody-scan.mjs`, which exits 1 rather than scan an
 * empty derived service list.
 *
 * The frozen baseline is the second, stronger half of that guard: 38 entries
 * that must ALL be re-found on every run. If someone narrows a regex until it
 * matches nothing, the rules do not quietly go green — the entries that rule
 * held go stale and the gate fails. That is proof-of-life per rule, not just
 * per scan: M3 has exactly one entry, so blinding M3 alone still goes red.
 *
 * Exit 0 = this tree cannot reach mainnet, and gained no new way to try.
 * Exit 1 = it can, or something that was watching it stopped watching.
 *
 * Background: docs/OWNER-ACTIONS-WALLET-RPC-SECRETS.md §A4 · A1.4 perimeter §3
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';

const ROOT = process.cwd();
const VENDOR = join(ROOT, 'vendor');

/** The tree's own directory name. The vendor's is not written into our source (§0.7). */
const TREE = '01_wallet_rpc';

/** Repo-relative path with forward slashes — CI is Linux, half of us are on Windows. */
const relPath = (file) => relative(ROOT, file).replace(/\\/g, '/');

/**
 * Locate the wallet RPC tree rather than hard-coding a path to it — same
 * approach as `wallet-rpc-auth-scan.mjs`, and for the same two reasons: the
 * vendor's directory name may not appear in this file, and the check must keep
 * working if the vendored tree is ever re-rooted.
 */
function findWalletRpc() {
  let entries;
  try {
    entries = readdirSync(VENDOR);
  } catch {
    return null;
  }
  for (const name of entries) {
    const root = join(VENDOR, name);
    if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) continue;
    const candidate = join(root, TREE);
    if (statSync(candidate, { throwIfNoEntry: false })?.isDirectory()) return candidate;
  }
  return null;
}

/** Every failure exits through here, so no verdict can be printed past one. */
function die(headline, lines) {
  console.error(`\n✖ wallet-rpc-mainnet-scan FAILED — ${headline}\n`);
  for (const line of lines) console.error(`  ${line}`);
  console.error('\n  This tree is unreviewed third-party key-handling code and is barred from live value');
  console.error('  (docs/OWNER-ACTIONS-WALLET-RPC-SECRETS.md §A4). Clearing that bar is an owner action.\n');
  process.exit(1);
}

const WALLET_RPC = findWalletRpc();

// ── Walk guard, part 1: the tree itself ────────────────────────────────────
//
// The auth scan exits 0 when the tree is absent, because a tree that does not
// exist cannot serve unauthenticated. This gate does the opposite, matching
// `vendor-java-money-scan.mjs`: an absent tree means this gate PROVED NOTHING,
// and a gate that proved nothing must not print a tick. If the tree is ever
// legitimately deleted, delete this gate in the same commit — that is the
// intended forcing function, not an inconvenience.
if (WALLET_RPC === null) {
  die('the wallet RPC tree is not in this checkout', [
    `Expected a ${TREE}/ directory one level inside vendor/.`,
    'Without it there is nothing to fence, and this gate cannot assert the prohibition it exists to assert.',
    'If the tree was deliberately removed, remove this gate and its GATES entry in the same commit.',
  ]);
}

// ── Rules over Java ─────────────────────────────────────────────────────────

/**
 * Mainnet network-parameter selectors. Matched on CLASS name rather than fully
 * qualified package: this tree already carries two different vendored forks of
 * the same library (`org.bitcoinj.params.MainNetParams` in bch/bsv/btm/eos and
 * `org.litecoinj.params.MainNetParams` in ltc/xmr), which is precisely how a
 * package-qualified rule would have covered four modules and missed two.
 */
const JAVA_NETWORK_SELECTORS = [
  {
    re: /\bMainNetParams\b/g,
    reason: 'bitcoinj-family mainnet network parameters — the address this mints is a live-chain address',
  },
  {
    re: /\bNetworkParameters\s*\.\s*prodNet\s*\(/g,
    reason: 'the older bitcoinj mainnet accessor — same effect as MainNetParams.get()',
  },
  {
    re: /\bID_MAINNET\b/g,
    reason: 'NetworkParameters.fromID(ID_MAINNET) selects mainnet by identifier',
  },
];

/** Hosts that cannot reach a public chain. Anything else in a URL literal can. */
function isOffBoxHost(host) {
  const h = host.toLowerCase();
  if (h === 'localhost' || h === '::1' || h === '0.0.0.0') return false;
  if (/^127\./.test(h)) return false;
  if (/^10\./.test(h)) return false;
  if (/^192\.168\./.test(h)) return false;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(h)) return false;
  // A host that is entirely an unresolved placeholder is decided by the
  // environment, not by this file. M5-M7 are what keep that undecidable.
  if (/^\$\{[^}]*\}$/.test(h)) return false;
  return true;
}

/** Host portion of a URL literal, without pulling in a URL parser for `${}` shapes. */
function hostOf(url) {
  const m = /^[a-z][a-z0-9+.-]*:\/\/(?:[^/@]*@)?([^/:?#]+)/i.exec(url);
  return m ? m[1] : null;
}

/**
 * Blank Java comments in place, preserving length and newlines so a match
 * offset still maps to its original line. String CONTENTS are kept: the
 * hardcoded mainnet broadcaster this gate has to catch lives inside a string
 * literal, so blanking them would make M2 match nothing at all.
 *
 * A line filter was not enough here. The one occurrence of the word "testnet"
 * in the entire tree is inside a block comment, and a naive `startsWith('*')`
 * check is fooled by a trailing comment on a live line.
 */
function stripJavaComments(source) {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];

    if (c === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') {
        out += ' ';
        i++;
      }
      continue;
    }

    if (c === '/' && next === '*') {
      out += '  ';
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        out += source[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < source.length) {
        out += '  ';
        i += 2;
      }
      continue;
    }

    if (c === '"' || c === "'") {
      out += c;
      i++;
      while (i < source.length && source[i] !== c) {
        if (source[i] === '\\') {
          out += source.slice(i, i + 2);
          i += 2;
          continue;
        }
        // A raw newline cannot appear in a Java literal — treat it as
        // unterminated rather than swallowing the rest of the file.
        if (source[i] === '\n') break;
        out += source[i];
        i++;
      }
      if (i < source.length && source[i] === c) {
        out += c;
        i++;
      }
      continue;
    }

    out += c;
    i++;
  }
  return out;
}

/** Index of the `)` closing the `(` at `open`. */
function findClose(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return text.length - 1;
}

/** 1-based line number of a character offset. */
function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === '\n') line++;
  return line;
}

/**
 * Top-level argument count of the call whose open paren is at `open`.
 * Used by M3: `signMessage(tx, credentials)` is pre-EIP-155 and
 * `signMessage(tx, chainId, credentials)` is not, and the difference is
 * entirely in the arity. A regex cannot count balanced arguments; this can.
 */
function argumentCount(text, open) {
  let depth = 0;
  let args = 1;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') {
      depth--;
      if (depth === 0) return args;
    } else if (c === ',' && depth === 1) args++;
    else if (c === ';' && depth === 0) return -1;
  }
  return -1;
}

// ── Rules over .properties ──────────────────────────────────────────────────

/**
 * Property keys whose value names a chain endpoint. Matched on the LAST
 * dot-segment: one of these keys is prefixed with the upstream vendor's name,
 * which may not be written in this file (§0.7), and the suffix is the part that
 * carries the meaning anyway.
 *
 * `uri` is deliberately NOT here — `spring.data.mongodb.uri` is a datastore,
 * not a chain, and a gate that fires on a database URL gets switched off.
 */
const CHAIN_ENDPOINT_KEYS = new Set(['rpc', 'blockapi', 'url', 'endpoint', 'node']);

/** Go-ethereum keystore filename — an ISO timestamp and a 40-hex account. */
const KEYSTORE_FILENAME = /^UTC--[0-9T:.\-]+Z?--[0-9a-fA-F]{38,40}(\.json)?$/;

/** A value the environment supplies, so this file does not decide it. */
const isPlaceholder = (value) => /^\$\{[^}]*\}$/.test(value.trim());

/**
 * An `*address` key does not always hold an address. `prefer-ip-address=true`
 * is a Eureka registration flag and appears in all 13 files, so without this
 * the rule fires 13 times on a boolean — and a gate that cries wolf gets
 * switched off, after which the real finding goes through it unnoticed
 * (`workspace-sync.mjs` set that precedent by going red on an English
 * sentence). The filter is on the VALUE SHAPE rather than on the key name:
 * excluding `prefer-ip-address` by name would be a rule about one spelling of
 * one upstream property, and the next author picks a different one.
 *
 * Nothing that could be a chain address is excluded — every address family in
 * this tree is base58/bech32/hex and at least 26 characters, and the shortest
 * value this admits is 12.
 */
const isAddressLike = (value) =>
  value.length >= 12 && /^[0-9A-Za-z]+$/.test(value) && !/^(true|false)$/i.test(value) && !/^\d+$/.test(value);

/**
 * Best-effort network classification, used only to sharpen the message. A
 * finding is a finding either way — an address checked into a source tree is an
 * assertion about one specific live chain no matter which one it is.
 */
function classifyAddress(value) {
  if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(value)) return 'bitcoin-family mainnet P2PKH/P2SH (testnet is m/n/2)';
  if (/^(bc1|ltc1)[0-9a-z]{20,}$/i.test(value)) return 'bech32 mainnet (testnet is tb1/tltc1)';
  if (/^4[0-9AB][1-9A-HJ-NP-Za-km-z]{90,100}$/.test(value)) return 'monero mainnet (testnet is 9/A, stagenet is 5)';
  if (/^0x[0-9a-fA-F]{40}$/.test(value)) return 'well-formed EVM account/contract address';
  if (/^0x[0-9a-fA-F]{20,39}$/.test(value)) return 'EVM-shaped but short — a mangled/redacted address literal';
  return 'chain address literal';
}

// ── The frozen baseline ─────────────────────────────────────────────────────

/**
 * Every mainnet constant already in the tree, pinned to its exact text.
 *
 * NOT AN EXEMPTION LIST. Each entry is a statement that this specific string
 * was read by a human, understood, and is barred from changing. The tree cannot
 * be edited by this branch — it is unreviewed key-handling third-party code and
 * §A4 makes touching it an owner action — so freezing is the only honest way to
 * land a gate over it without either lying about the tree or narrowing the
 * rules until they see nothing.
 *
 * `module` is the Maven module directory, `file` the class or resource
 * basename, `text` the exact matched string. See the header for why the key is
 * shaped this way.
 *
 * @type {{ rule: string, module: string, file: string, text: string, reason: string }[]}
 */
const FROZEN = [
  // ── M1: mainnet network parameters in the key-minting controllers ────────
  {
    rule: 'M1',
    module: 'bch',
    file: 'WalletController.java',
    text: 'MainNetParams',
    reason:
      'GET /rpc/address/{account} mints a fresh secp256k1 key and derives a BCH MAINNET address from it, then writes ' +
      'the key to an unencrypted wallet file. Appears twice — the import and the live NetworkParameters assignment — ' +
      'and there is no testnet branch to select instead. Owner queue: this module must not be built until reviewed.',
  },
  {
    rule: 'M1',
    module: 'bsv',
    file: 'WalletController.java',
    text: 'MainNetParams',
    reason: 'Identical shape to bch: import plus a live MainNetParams.get() in the address-minting controller. Same queue.',
  },
  {
    rule: 'M1',
    module: 'ltc',
    file: 'WalletController.java',
    text: 'MainNetParams',
    reason:
      'Identical shape to bch, via the litecoinj fork rather than bitcoinj — which is why M1 matches the class name and ' +
      'not the package. Import plus live assignment. Same queue.',
  },
  {
    rule: 'M1',
    module: 'btm',
    file: 'WalletController.java',
    text: 'MainNetParams',
    reason:
      'Import only — the mainnet selector is present on the classpath of a key-handling controller but not yet assigned. ' +
      'Frozen rather than ignored precisely BECAUSE it is unused: an unused mainnet import in a wallet controller is one ' +
      'line from being the live selector, and that line would otherwise add no new symbol for a gate to notice.',
  },
  {
    rule: 'M1',
    module: 'eos',
    file: 'WalletController.java',
    text: 'MainNetParams',
    reason: 'Import only, same reasoning as btm.',
  },
  {
    rule: 'M1',
    module: 'xmr',
    file: 'WalletController.java',
    text: 'MainNetParams',
    reason: 'Import only, via litecoinj. Same reasoning as btm.',
  },

  // ── M2: hardcoded public endpoints in Java ───────────────────────────────
  {
    rule: 'M2',
    module: 'eth-support',
    file: 'EtherscanApi.java',
    text: 'https://api.etherscan.io/api',
    reason:
      'THE WORST ONE IN THE TREE. This is the Ethereum MAINNET Etherscan proxy, hardcoded, with no property behind it. ' +
      'It is reached from PaymentHandler on both the ether and the token withdrawal path: after broadcasting to ' +
      'coin.rpc, the SAME signed transaction is POSTed here as eth_sendRawTransaction. So aiming coin.rpc at a testnet ' +
      'node does not make the withdrawal a testnet withdrawal — it makes the mainnet copy the one that lands. ' +
      'Owner queue: this must become a property, or the second broadcast must be deleted.',
  },
  {
    rule: 'M2',
    module: 'act',
    file: 'ActClientTest.java',
    text: 'http://act:123456@47.74.42.87:8900/rpc',
    reason:
      'A public node endpoint with inline basic-auth credentials, in a main() inside src/test — item A3 of ' +
      'docs/OWNER-ACTIONS-WALLET-RPC-SECRETS.md, DELIBERATELY left in the tree. Deleting the line changes nothing (it is ' +
      'in git history either way and surefire never runs a main()), and it stands as evidence of what this tree ships ' +
      'with. Frozen so it cannot be edited into a live path or joined by a second one. Owner queue: A3, decide whether ' +
      'that node is ours and rotate if so.',
  },

  // ── M3: chain-id-less EVM signatures ─────────────────────────────────────
  {
    rule: 'M3',
    module: 'eth-support',
    file: 'PaymentHandler.java',
    text: 'TransactionEncoder.signMessage(rawTransaction, payment.getCredentials())',
    reason:
      'Pre-EIP-155 signing on BOTH withdrawal paths (ether transfer and ERC-20 transfer) — the two-argument form takes ' +
      'no chain id, so the signature is valid on every EVM chain at once, mainnet included. This is why "just point it ' +
      'at a testnet" is not an available mitigation for this tree: a testnet-signed withdrawal here is also a valid ' +
      'mainnet withdrawal, and the Etherscan path above will happily relay it. Both call sites are the identical string, ' +
      'so one frozen entry covers them; a THIRD would fail, and so would changing either. Owner queue: pass a chain id.',
  },

  // ── M4: mainnet-shaped values in .properties ─────────────────────────────
  // Public chain endpoints.
  {
    rule: 'M4-endpoint',
    module: 'bch',
    file: 'application.properties',
    text: 'blockApi=https://bch-chain.api.btc.com/v3/',
    reason: 'Public BCH MAINNET block explorer API — the deposit watcher reads live mainnet blocks from it. Owner queue: review.',
  },
  {
    rule: 'M4-endpoint',
    module: 'bsv',
    file: 'application.properties',
    text: 'blockApi=https://bchsvexplorer.com/api/',
    reason: 'Public BSV MAINNET block explorer API, same watcher shape as bch. Owner queue: review.',
  },
  {
    rule: 'M4-endpoint',
    module: 'eos',
    file: 'application.properties',
    text: 'blockApi=https://open-api.eos.blockdog.com/',
    reason: 'Public EOS MAINNET API, third-party, keyed by the EOS_BLOCK_API_KEY placeholder below it. Owner queue: review.',
  },
  {
    rule: 'M4-endpoint',
    module: 'ltc',
    file: 'application.properties',
    text: 'blockApi=https://litecoinblockexplorer.net/api/',
    reason: 'Public LTC MAINNET block explorer API. Owner queue: review.',
  },
  {
    rule: 'M4-endpoint',
    module: 'btm',
    file: 'application.properties',
    text: 'url=http://111.111.111.111:9888/',
    reason:
      "The upstream's redaction placeholder — but 111.111.111.111 is a ROUTABLE public address, not a documentation " +
      'range, and this is the node URL every Bytom call goes to. Frozen rather than waved through: a redaction that ' +
      'happens to be routable is a live endpoint that nobody chose. Owner queue: replace with a placeholder.',
  },

  // Chain start heights.
  {
    rule: 'M4-height',
    module: 'bch',
    file: 'application.properties',
    text: 'init-block-height=600000',
    reason: 'BCH mainnet height (~Sep 2019). A start height is a claim about one specific chain’s history; a fresh chain starts at 0.',
  },
  {
    rule: 'M4-height',
    module: 'bsv',
    file: 'application.properties',
    text: 'init-block-height=600350',
    reason: 'BSV mainnet height (~Sep 2019). Same reasoning as bch.',
  },
  {
    rule: 'M4-height',
    module: 'btm',
    file: 'application.properties',
    text: 'init-block-height=334504',
    reason: 'Bytom mainnet height. Same reasoning as bch.',
  },
  {
    rule: 'M4-height',
    module: 'eos',
    file: 'application.properties',
    text: 'init-block-height=79953165',
    reason: 'EOS mainnet block number. Same reasoning as bch.',
  },
  {
    rule: 'M4-height',
    module: 'ltc',
    file: 'application.properties',
    text: 'init-block-height=1703228',
    reason: 'Litecoin mainnet height (~Sep 2019). Same reasoning as bch.',
  },
  {
    rule: 'M4-height',
    module: 'xmr',
    file: 'application.properties',
    text: 'init-block-height=1926300',
    reason: 'Monero mainnet height (~Sep 2019). Same reasoning as bch.',
  },
  {
    rule: 'M4-height',
    module: 'usdt',
    file: 'application.properties',
    text: 'init-block-height=592417',
    reason: 'Bitcoin mainnet height (~Sep 2019) — Omni USDT rides BTC blocks. Same reasoning as bch.',
  },
  {
    rule: 'M4-height',
    module: 'eth',
    file: 'application.properties',
    text: 'init-block-height=8336120',
    reason: 'Ethereum mainnet block (~Aug 2019), on coin.init-block-height. Same reasoning as bch.',
  },
  {
    rule: 'M4-height',
    module: 'eth',
    file: 'application.properties',
    text: 'init-block-height=8347300',
    reason:
      'Ethereum mainnet block (~Aug 2019), on watcher.init-block-height. Distinct from the entry above: this file sets ' +
      'TWO start heights with two different values, and freezing by exact text keeps both pinned separately.',
  },
  {
    rule: 'M4-height',
    module: 'erc-token',
    file: 'application.properties',
    text: 'init-block-height=8347300',
    reason: 'Ethereum mainnet block (~Aug 2019). Same reasoning as bch.',
  },
  {
    rule: 'M4-height',
    module: 'erc-eusdt',
    file: 'application.properties',
    text: 'init-block-height=8551979',
    reason: 'Ethereum mainnet block (~Sep 2019). Same reasoning as bch.',
  },
  {
    rule: 'M4-height',
    module: 'ect',
    file: 'application.properties',
    text: 'init-block-height=39610',
    reason:
      'A low height on a small Ripple-family chain rather than a major mainnet — but still a claim about one live ' +
      'chain’s history, and this is the module whose withdrawal secret is item A1. Frozen on the same rule as the ' +
      'rest rather than pattern-excluded for being small: "small heights are safe" stops being true the moment somebody ' +
      'edits one.',
  },

  // Address literals.
  {
    rule: 'M4-address',
    module: 'usdt',
    file: 'application.properties',
    text: 'withdraw-address=1QDEimf6f4VrDqCSBmgfh1ReW9L2vHvvg',
    reason:
      'A Bitcoin MAINNET P2PKH address (leading 1; testnet would be m/n/2) and the destination every USDT withdrawal ' +
      'sweep pays to. Owner queue: this is the address to check a balance on before anything here is ever booted.',
  },
  {
    rule: 'M4-address',
    module: 'xmr',
    file: 'application.properties',
    text: 'depositAddress=47ddRY4X3AhVzcnZ6Rcg7KWA3iX8DLyMWJLT5u5ugQDHn9kf2nFx49hrnT66Ry4ukV2s9iP6FPzrP1rwYLGnFZnLpBGD8f',
    reason: 'A Monero MAINNET standard address (leading 4; testnet is 9/A, stagenet 5). Owner queue: review.',
  },
  {
    rule: 'M4-address',
    module: 'act',
    file: 'application.properties',
    text: 'master-address=ACT5i65XW1yRasdeLMD2rFJffRmndn91bho6',
    reason:
      'The ACT chain master account every deposit is collected into. Carries the upstream’s "asd" redaction mangling, ' +
      'so it is probably not spendable as written — frozen anyway, because the failure mode being prevented is somebody ' +
      'un-mangling it, and that edit changes this exact string.',
  },
  {
    rule: 'M4-address',
    module: 'ect',
    file: 'application.properties',
    text: 'master-address=esV75BQfiEiKdgaivjasdw7EXk3BwJiscX',
    reason: 'ECT collection account, same "asd" mangling as act. Same reasoning.',
  },
  {
    rule: 'M4-address',
    module: 'ect',
    file: 'application.properties',
    text: 'withdraw-address=esV75BQfiEiKdasdejEYCt7EXk3BwJiscX',
    reason:
      'The address controlled by the item-A1 disclosed withdrawal secret. Public, deliberately left as a literal by the ' +
      'auth branch, and named in OWNER-ACTIONS §A1 step 1 as the balance to check. Frozen so it cannot drift away from ' +
      'the address that document tells the owner to sweep.',
  },
  {
    rule: 'M4-address',
    module: 'eth',
    file: 'application.properties',
    text: 'ignore-from-address=0x672881426632b13d18f74664c039acc7b5610b7',
    reason:
      'The hot wallet the deposit watcher ignores incoming transfers from — 39 hex digits, so mangled like the others, ' +
      'but it names the platform’s own Ethereum account. Owner queue: review with the keystore entry below, which ' +
      'names the same account.',
  },
  {
    rule: 'M4-address',
    module: 'eos',
    file: 'application.properties',
    text: 'depositAddress=AAAAAAAAAAAAA',
    reason:
      'An obvious dummy EOS account name, not a live address. Frozen rather than pattern-excluded: the rule is "an ' +
      'address key holds no literal", and carving out "except when it looks fake" is how a real value arrives disguised ' +
      'as a placeholder. A real EOS account here would be a different string and would fail.',
  },
  {
    rule: 'M4-address',
    module: 'erc-eusdt',
    file: 'application.properties',
    text: 'address=0xdac17f958d2ee523a2206206994597c13d831ec7',
    reason:
      'THE LIVE ETHEREUM MAINNET TETHER (USDT) CONTRACT — 40 valid hex digits, unmangled, correct. This one is real. The ' +
      'module watches and transfers against it. Nothing else in the tree pins a mainnet contract this precisely. Owner ' +
      'queue: highest priority of the M4 entries.',
  },
  {
    rule: 'M4-address',
    module: 'erc-token',
    file: 'application.properties',
    text: 'address=0xdac17f958d2ee5232206206994597c13d831ec7',
    reason:
      'The same Tether contract with 39 digits instead of 40 — mangled, so inert as written. Frozen precisely because ' +
      'the one-character edit that "fixes" it turns this module into a live mainnet USDT mover, and that edit changes ' +
      'this exact string.',
  },

  // Keystore filenames.
  {
    rule: 'M4-keystore',
    module: 'eth',
    file: 'application.properties',
    text: 'withdraw-wallet=UTC--2019-08-13T06-24-07.378035684Z--672881426632b13d8f474664c039acc7b5610b7',
    reason:
      'A go-ethereum keystore FILENAME, which embeds the account it holds — the same platform hot wallet named by ' +
      'ignore-from-address above. The file itself is not in the repo; the name is, and it identifies the account whose ' +
      'key the service expects to load from coin.keystore-path at startup. Owner queue: see ' +
      'docs/RUNBOOK-ETH-KEYSTORE-REENCRYPTION.md.',
  },
  {
    rule: 'M4-keystore',
    module: 'erc-token',
    file: 'application.properties',
    text: 'withdraw-wallet=UTC--2019-08-13T06-24-07.378035684Z--67288142662b13d18f474664c039acc7b5610b7',
    reason: 'The same keystore filename with a different digit run — upstream mangling. Same queue as eth.',
  },
  {
    rule: 'M4-keystore',
    module: 'erc-eusdt',
    file: 'application.properties',
    text: 'withdraw-wallet=UTC--2019-09-11T08-36-14.828000000Z--2b7d8aa02fccbd7bc69368fa30cabe22e3c2c2d.json',
    reason:
      'A second, different keystore filename — a distinct account from the eth one, and the only entry carrying the ' +
      '.json suffix. Same queue.',
  },
];

// ── Collect findings ────────────────────────────────────────────────────────

/** Module directory for a path inside the tree, or null if it is the tree root. */
function moduleOf(file) {
  const rel = relative(WALLET_RPC, file).replace(/\\/g, '/');
  const first = rel.split('/')[0];
  return rel.includes('/') ? first : null;
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === 'target' || name === '.git' || name === '.settings') continue;
    const p = join(dir, name);
    const st = statSync(p, { throwIfNoEntry: false });
    if (!st) continue;
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const moduleDirs = readdirSync(WALLET_RPC).filter(
  (name) => statSync(join(WALLET_RPC, name), { throwIfNoEntry: false })?.isDirectory() && !name.startsWith('.'),
);

const treeFiles = walk(WALLET_RPC);
const javaFiles = treeFiles.filter((f) => f.endsWith('.java'));
const propsFiles = treeFiles.filter((f) => f.endsWith('.properties'));

/** @type {{ rule: string, module: string, file: string, text: string, where: string, detail: string }[]} */
const findings = [];

const record = (rule, file, text, line, detail) =>
  findings.push({
    rule,
    module: moduleOf(file) ?? '(tree root)',
    file: basename(file),
    text,
    where: `${relPath(file)}:${line}`,
    detail,
  });

// ── M1 / M2 / M3 over Java ─────────────────────────────────────────────────
for (const file of javaFiles) {
  const source = readFileSync(file, 'utf8');
  const code = stripJavaComments(source);

  for (const { re, reason } of JAVA_NETWORK_SELECTORS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(code)) !== null) {
      record('M1', file, m[0], lineAt(code, m.index), reason);
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }

  for (const m of code.matchAll(/"(https?:\/\/[^"\s]+)"/g)) {
    const url = m[1];
    const host = hostOf(url);
    if (host === null || !isOffBoxHost(host)) continue;
    record('M2', file, url, lineAt(code, m.index), `hardcoded endpoint at a routable host (${host}) — no property can override it`);
  }

  for (const m of code.matchAll(/\bsignMessage\s*\(/g)) {
    const open = m.index + m[0].length - 1;
    // Three arguments is `signMessage(tx, chainId, credentials)` — EIP-155, and
    // correct. Two is the replayable form. Arity is the whole rule.
    if (argumentCount(code, open) !== 2) continue;
    // Freeze the call as written, including the qualifier, so a rename of
    // either argument is a new string and has to be looked at.
    const start = code.lastIndexOf('\n', m.index) + 1;
    const text = code
      .slice(start, findClose(code, open) + 1)
      .replace(/^[\s\S]*?(\b[\w.]*signMessage\s*\()/, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    record('M3', file, text, lineAt(code, m.index), 'two-argument signMessage carries no chain id (pre-EIP-155) — replay-valid on mainnet');
  }
}

// ── M4 over .properties ────────────────────────────────────────────────────
for (const file of propsFiles) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*[#!]/.test(line) || !line.includes('=')) continue;
    const key = line.slice(0, line.indexOf('=')).trim();
    const value = line.slice(line.indexOf('=') + 1).trim();
    if (value === '' || isPlaceholder(value)) continue;
    // Last dot-segment only — see the header on why the full key cannot be used.
    const leaf = key.slice(key.lastIndexOf('.') + 1);
    const text = `${leaf}=${value}`;

    if (CHAIN_ENDPOINT_KEYS.has(leaf.toLowerCase())) {
      const host = hostOf(value);
      if (host !== null && isOffBoxHost(host)) {
        record('M4-endpoint', file, text, i + 1, `chain endpoint at a routable host (${host})`);
      }
    }

    if (leaf.toLowerCase() === 'init-block-height' && /^\d+$/.test(value) && Number(value) > 0) {
      record('M4-height', file, text, i + 1, 'non-zero chain start height — a statement about one live chain’s history');
    }

    if (/address$/i.test(leaf) && isAddressLike(value)) {
      record('M4-address', file, text, i + 1, classifyAddress(value));
    }

    if (KEYSTORE_FILENAME.test(value)) {
      record('M4-keystore', file, text, i + 1, 'go-ethereum keystore filename — it embeds the account whose key it holds');
    }
  }
}

// ── M5 / M6 / M7: the three incidental barriers, as invariants ─────────────
//
// Each of these is an ABSENCE assertion, and each counts what it opened. An
// absence proved over zero candidates is the exact defect this repo keeps
// naming, so the denominators are checked below before any verdict prints.

/** @type {{ id: string, where: string, detail: string }[]} */
const barrierBreaks = [];

// M5 — no Dockerfile or build/run script that can package a module here.
let dockerfilesInspected = 0;
const repoDockerfiles = [];
(function collectDockerfiles(dir, depth) {
  if (depth > 4) return;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.git' || name === 'dist' || name === '.turbo' || name === 'target') continue;
    const p = join(dir, name);
    const st = statSync(p, { throwIfNoEntry: false });
    if (!st) continue;
    if (st.isDirectory()) collectDockerfiles(p, depth + 1);
    else if (/^Dockerfile/i.test(name) || name.endsWith('.dockerfile')) repoDockerfiles.push(p);
  }
})(ROOT, 0);

for (const file of repoDockerfiles) {
  dockerfilesInspected++;
  const rel = relPath(file);
  if (rel.includes(`/${TREE}/`)) {
    barrierBreaks.push({
      id: 'M5',
      where: rel,
      detail: 'a Dockerfile inside the wallet RPC tree — this tree may not be packaged into an image',
    });
    continue;
  }
  if (readFileSync(file, 'utf8').includes(TREE)) {
    barrierBreaks.push({ id: 'M5', where: rel, detail: `this Dockerfile references ${TREE}` });
  }
}

// A build or run script checked in beside the poms is the same barrier by a
// different name, so the tree is swept for one too.
for (const file of treeFiles) {
  if (/\.(sh|bat|cmd|ps1)$/i.test(file) || /^(Makefile|mvnw)$/i.test(basename(file))) {
    barrierBreaks.push({
      id: 'M5',
      where: relPath(file),
      detail: 'a build/run script inside the wallet RPC tree — nothing here may be made runnable',
    });
  }
}

// M6 — no compose service referencing the tree. Compose files are DISCOVERED,
// at the repo root and one level into vendor/, because a new compose file is
// exactly where such a service would appear.
const composeFiles = [
  ...readdirSync(ROOT)
    .filter((n) => /compose.*\.ya?ml$/i.test(n))
    .map((n) => join(ROOT, n)),
  ...(statSync(VENDOR, { throwIfNoEntry: false })?.isDirectory()
    ? readdirSync(VENDOR)
        .filter((n) => /compose.*\.ya?ml$/i.test(n))
        .map((n) => join(VENDOR, n))
    : []),
];

let composeInspected = 0;
for (const file of composeFiles) {
  composeInspected++;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes(TREE)) continue;
    barrierBreaks.push({
      id: 'M6',
      where: `${relPath(file)}:${i + 1}`,
      detail:
        `a compose file references ${TREE}. No service may build, mount or run any module of this tree: ` +
        'a container that starts one is a process holding withdrawal keys, from unreviewed code, with an environment ' +
        'that decides which chain it talks to',
    });
  }
}

// M7 — no workflow step that builds or boots a module here.
const workflowDir = join(ROOT, '.github', 'workflows');
let workflowsInspected = 0;
const workflowFiles = statSync(workflowDir, { throwIfNoEntry: false })?.isDirectory()
  ? readdirSync(workflowDir)
      .filter((n) => /\.ya?ml$/i.test(n))
      .map((n) => join(workflowDir, n))
  : [];

for (const file of workflowFiles) {
  workflowsInspected++;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // A path mention is only a break if it is in a RUN step; this gate's own
    // registration in the gate list is a mention and must not fire.
    if (line.includes(TREE) && !/wallet-rpc-(auth|mainnet)-scan/.test(line)) {
      barrierBreaks.push({ id: 'M7', where: `${relPath(file)}:${i + 1}`, detail: `a workflow references ${TREE}` });
    }
    if (/\b(mvn|mvnw|maven)\b/.test(line) && !/^\s*#/.test(line)) {
      barrierBreaks.push({
        id: 'M7',
        where: `${relPath(file)}:${i + 1}`,
        detail:
          'a Maven invocation in CI. There is no JDK step in this repo by design — the vendored Java trees are ' +
          'never compiled here, and the wallet RPC reactor must not become the reason one appears',
      });
    }
  }
}

// ── Walk guard, part 2: every denominator, before any verdict ──────────────
//
// custody-scan.mjs is the standard: it exits 1 when its derived service list
// comes back empty rather than scanning nothing and calling it clean. Same
// discipline, six denominators. Rule W3 of the auth scan is the cautionary
// example — it walks zero services today and its silence reads as coverage.
const emptyWalks = [];
if (moduleDirs.length === 0) emptyWalks.push('found 0 module directories in the wallet RPC tree');
if (javaFiles.length === 0) emptyWalks.push('walked 0 Java files — M1, M2 and M3 asserted nothing');
if (propsFiles.length === 0) emptyWalks.push('walked 0 .properties files — M4 asserted nothing');
if (composeInspected === 0) emptyWalks.push('opened 0 compose files — M6 asserted nothing (this is exactly how W3 became vacuous)');
if (workflowsInspected === 0) emptyWalks.push('opened 0 workflow files — M7 asserted nothing');
if (FROZEN.length === 0) emptyWalks.push('the frozen baseline is empty — it is the proof-of-life for every rule here');

if (emptyWalks.length > 0) {
  die('a check reported on nothing', [
    ...emptyWalks.map((w) => `· ${w}`),
    '',
    'This is not a clean tree; it is a scan that opened nothing, and a scan that opened nothing must never',
    'print a tick. Fix the discovery above, or delete the rule that can no longer see its subject.',
  ]);
}

// ── The ratchet ─────────────────────────────────────────────────────────────

const frozenKey = (e) => JSON.stringify([e.rule, e.module, e.file, e.text]);

const frozenIndex = new Map();
const duplicateEntries = [];
for (const entry of FROZEN) {
  const key = frozenKey(entry);
  if (frozenIndex.has(key)) duplicateEntries.push(`${entry.rule} ${entry.module}:${entry.file} "${entry.text}"`);
  frozenIndex.set(key, { entry, seen: 0 });
}

/** @type {typeof findings} */
const unfrozen = [];
for (const finding of findings) {
  const hit = frozenIndex.get(frozenKey(finding));
  if (hit) hit.seen++;
  else unfrozen.push(finding);
}

const stale = [...frozenIndex.values()].filter((v) => v.seen === 0).map((v) => v.entry);

// ── Verdict ────────────────────────────────────────────────────────────────

const problems = [];

if (duplicateEntries.length > 0) {
  problems.push('  ── duplicate frozen entries ──');
  for (const d of duplicateEntries) problems.push(`  · ${d}`);
  problems.push('    Two entries with the same key means one of them is unreachable and its reason went unread.');
  problems.push('');
}

if (unfrozen.length > 0) {
  problems.push('  ── NEW mainnet reach (not in the frozen baseline) ──');
  for (const f of unfrozen) {
    problems.push(`  ${f.where}  [${f.rule}]  ${f.module}:${f.file}`);
    problems.push(`    matched: ${f.text}`);
    problems.push(`    → ${f.detail}`);
    problems.push('');
  }
  problems.push('  Nothing in this tree may gain a new way to reach a live chain. If this string is genuinely');
  problems.push('  pre-existing debt that must be carried, add it to FROZEN with a written reason — and be aware');
  problems.push('  that adding an entry is a statement that a human read this exact value and understood it.');
  problems.push('');
}

if (stale.length > 0) {
  problems.push('  ── frozen entries that matched nothing ──');
  for (const e of stale) {
    problems.push(`  [${e.rule}]  ${e.module}:${e.file}`);
    problems.push(`    expected: ${e.text}`);
    problems.push('');
  }
  problems.push('  Either the finding is GONE — delete the entry so the baseline shrinks and cannot silently leave');
  problems.push('  room for it to come back — or the rule that used to see it has gone blind, which is the more');
  problems.push('  dangerous reading and the reason this is a failure rather than a warning.');
  problems.push('');
}

if (barrierBreaks.length > 0) {
  problems.push('  ── an incidental barrier became a real one and was crossed ──');
  for (const b of barrierBreaks) {
    problems.push(`  ${b.where}  [${b.id}]`);
    problems.push(`    → ${b.detail}`);
    problems.push('');
  }
  problems.push('  Until this commit those absences were accidents. They are invariants now: this tree is barred');
  problems.push('  from being built, containerised, composed or run by anything in this repository, and lifting');
  problems.push('  that bar needs the security review the vendored-exchange ADR makes a precondition of adoption.');
  problems.push('');
}

if (problems.length > 0) die('the wallet RPC tree gained a way to reach mainnet', problems);

const frozenByRule = FROZEN.reduce((acc, e) => ((acc[e.rule] = (acc[e.rule] ?? 0) + 1), acc), {});
const ruleSummary = Object.entries(frozenByRule)
  .sort()
  .map(([rule, n]) => `${rule}:${n}`)
  .join(' ');

console.log(
  `✓ wallet-rpc-mainnet-scan clean — ${moduleDirs.length} module(s), ${javaFiles.length} Java + ${propsFiles.length} properties file(s) ` +
    `walked; ${FROZEN.length} frozen mainnet constant(s) all still exactly as recorded (${ruleSummary}); ` +
    `no new one added. Barriers held: ${dockerfilesInspected} Dockerfile(s), ${composeInspected} compose file(s) and ` +
    `${workflowsInspected} workflow(s) checked — none builds, composes or boots this tree.`,
);
