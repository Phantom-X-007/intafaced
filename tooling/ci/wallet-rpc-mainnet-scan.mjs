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
 *     STILL TRUE. Fixing it changes the bytes that get signed, and there is no
 *     JDK here to compile or test that change, so it is specified rather than
 *     applied: docs/SPEC-EIP155-WALLET-RPC-WITHDRAWAL-SIGNING.md.
 *   · The same withdrawal was then broadcast a SECOND time to a hardcoded
 *     `https://api.etherscan.io/api` proxy, which is Ethereum mainnet and was
 *     not configurable at all. NO LONGER TRUE — that second broadcast was
 *     deleted (PR on fix/wallet-rpc-criticals). It was the one defect here that
 *     could be removed without a compiler, because deleting a redundant relay
 *     of already-signed bytes cannot change how a transaction is signed or
 *     built. The endpoint literal survives on `checkEventLog`, a read-only
 *     deposit-watcher path, and stays frozen under M2.
 *
 * Removing that relay narrows the hole; it does not close it. A testnet-signed
 * withdrawal from this tree is STILL a valid mainnet withdrawal, because the
 * signature still carries no chain id — anyone who observes it can replay it.
 * So "point it at a testnet" is still not available as a mitigation, and the real
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
 * artefacts, and it carries a 54-entry frozen baseline. Merging them would
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
 *       override. Scheme set is http/https/ws/wss — web3j reaches a node
 *       through `HttpService` OR `WebSocketService`, and `wss://` is the
 *       canonical form of every hosted mainnet endpoint with a subscription
 *       API, so an https-only rule is two characters from being bypassed.
 *
 *   M3  No chain-id-less EVM signature, in any of the shapes web3j offers.
 *       Two-argument `signMessage` is pre-EIP-155: the resulting transaction is
 *       replay-valid on mainnet no matter which node signed the nonce. Arity on
 *       that one call was the original rule, and it answers the wrong question
 *       — "was an argument passed" rather than "was a real chain id passed".
 *       Also caught: `ChainId.NONE` (web3j's no-chain-id sentinel, which
 *       SATISFIES the arity rule and is exactly what someone applying the
 *       EIP-155 fix without a compiler reaches for), the two-argument
 *       `RawTransactionManager` (chain-id-less on web3j 3.x without the word
 *       signMessage appearing), and `Transfer.sendFunds` (whose manager this
 *       gate cannot inspect without a JDK, so it refuses to assume the safe
 *       answer).
 *
 *   M4  No mainnet-shaped value in .properties — a public chain endpoint, a
 *       non-zero chain start height, a literal address, a keystore filename
 *       embedding an account, or an EVM event-topic filter (M4-topic). An
 *       address is recognised by the KEY (`*address`, which carries every
 *       non-EVM chain here) OR by the VALUE (exactly 0x + 40 hex, under any key
 *       at all). The key rule alone is defeated by renaming:
 *       `contract.token=0xdac17…` is the same live mainnet pin.
 *
 *   M5  No Dockerfile, and no build/run script, that can package a module here.
 *   M6  No compose service that references this tree.
 *   M7  No workflow step that builds or boots a module here.
 *
 *       M5-M7 are the three incidental barriers, restated as invariants. They
 *       are ABSENCE assertions and each names its own denominator, so "nothing
 *       found" can never be confused with "nothing looked" — see the walk guard.
 *
 *   M8  No live EVM address pinned in Java. M4 only ever read .properties, so
 *       the mainnet contract this tree used to pin could be re-pinned by moving
 *       it one file sideways into a Java constant, and nothing here would have
 *       said a word. 40 hex digits is an account or a contract and nothing else
 *       — a 64-hex event topic does not match, and neither does a txid.
 *
 *   M9  No credential-bearing value reaching a log or print sink. FOUR services
 *       here write a live spending credential to stdout on an ordinary success
 *       path, which makes the security boundary of the hot wallets the read
 *       permission on the log files. This catches the fifth.
 *
 *       Taint has two sources, because the fourth service needed a second one.
 *       A value is credential-bearing if its NAME says so, or a @Value binding
 *       says so — or if its declared TYPE has a public getter graph that reaches
 *       a private key and it is handed WHOLE to a reflective serialiser. Name
 *       taint cannot see `JSON.toJSON(current)`; nothing about `current` is
 *       spelled like a secret, and `Payment` only reaches the key three getters
 *       down, through a library.
 *
 *   M10 Every EVM deposit credit is classified by whether the method that builds
 *       it ever fetches the transaction receipt, and the classification is part
 *       of the frozen key — so a path that LOSES its success check fails, not
 *       just a path added without one.
 *
 * ── WHAT THE 2026-08-05 SECURITY REVIEW ADDED, AND WHY IT IS FROZEN ────────
 *
 * `docs/security/WALLET-RPC-SECURITY-REVIEW-2026-08-05.md` is the first read of
 * this tree that opened every file. It found three classes of thing this ratchet
 * did not cover. All three are frozen rather than fixed, for the same reason the
 * chain-id fix is specified rather than applied: editing `01_wallet_rpc` without
 * a compiler is how money gets stranded by a change that looks obviously right.
 *
 *   · **A control that works by accident.** `contract.event-topic0` is 63 hex
 *     digits in both erc modules where a keccak topic is 64, so the Transfer-log
 *     check the upstream added "to prevent fake deposits" never matches and no
 *     deposit is credited at all. It fails CLOSED, which is not the same as
 *     working. It is NOT fixed here and must not be: correcting it activates a
 *     filter that has never fired, in a deposit-crediting path, on a host with no
 *     JDK — a behaviour change that needs a build and a deposit fixture test.
 *     Deleting the line is worse; it removes the guard entirely. Frozen so that
 *     neither edit can happen unread. (M4-topic, and note the probe: the CORRECT
 *     64-digit topic fires too. This rule freezes the filter either way.)
 *   · **Credential-logging sites** — M9, eight of them, each stating in its
 *     reason what it does and does not prove.
 *   · **Unverified deposit credits** — M10. `EthWatcher` credits from block
 *     fields with no receipt fetch; the erc watchers have the check present and
 *     COMMENTED OUT in the scheduled path and live in the replay path, which is
 *     why M10 is method-scoped: a file-scope rule reads those two modules as safe.
 *
 * One thing the review flagged used to be deliberately NOT a rule here, and now
 * is. `PaymentHandler` passes a `Payment` — which has a public
 * `getCredentials()` — to `JSON.toJSON` every thirty seconds, which logs the ETH
 * private key on a timer IF fastjson serialises getters and IF web3j's accessor
 * chain is what its published API says. Both halves have now been read out of
 * shipped bytecode on this host, without a JVM:
 *
 *   · fastjson 1.2.31 (2026-08-05) — `JSON.toJSON` → `getObjectWriter` →
 *     `JavaBeanSerializer.getFieldValuesMap` → `FieldInfo.get` →
 *     `Method.invoke`, then `JSON.toJSON` again on every value it collected.
 *     `ParserConfig.isPrimitive2` lists `java.math.BigInteger`, so the key is
 *     kept verbatim rather than skipped.
 *   · web3j crypto 3.3.1 (2026-08-06) — `Credentials.getEcKeyPair()` and
 *     `ECKeyPair.getPrivateKey()` are both public, no-arg, over `private final`
 *     fields that are not transient and carry no annotation.
 *
 * So §F3 is a FINDING, and M9 now reaches it — three entries, added by a human
 * with a reason, which is exactly the bar the previous version of this comment
 * set for changing its mind. The taint that reaches it is type-based and applies
 * only where the object is passed WHOLE to a serialiser: a gate must still not
 * promote an inference by pattern-matching it, and `payment.getTo()` in the same
 * class stays silent.
 *
 * The jar is not checksum-verified — see the §F3 follow-up for its SHA-256 and
 * for what would settle its provenance. What the jar says is corroborated by
 * every web3j signature this tree compiles against resolving against it exactly.
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
 * The frozen baseline is the second, stronger half of that guard: 54 entries
 * that must ALL be re-found on every run. If someone narrows a regex until it
 * matches nothing, the rules do not quietly go green — the entries that rule
 * held go stale and the gate fails. That is proof-of-life per rule, not just
 * per scan: M3 has exactly one entry, so blinding M3 alone still goes red.
 *
 * And a third half, because the baseline has a limit that only shows up when
 * the gate is WIDENED. Proof-of-life by baseline works only for rules that
 * currently match something. Every rule added to close a hole is, by
 * construction, a rule with nothing to freeze — the tree has no `wss://`
 * endpoint, no `ChainId.NONE`, no `RawTransactionManager`, and after this branch
 * no EVM address under a non-address key. On a green run those are
 * indistinguishable from rules that were deleted. So RULE_PROBES near the
 * bottom pushes synthetic fixtures through the SAME scanJavaSource /
 * scanPropertiesSource the tree goes through — the functions, not a copy of the
 * regexes — and asserts which fire and which must NOT. Blinding a rule breaks
 * its probe; widening one until it fires on a private host, an event topic or a
 * correctly-chain-id'd signMessage breaks a negative probe. That second half
 * matters as much: a gate that cries wolf is switched off, and then the real
 * finding goes through it unnoticed.
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

// ── M9 / M10 support: method scope, and a tiny taint model ─────────────────

/**
 * The comment-stripped source with string CONTENTS blanked, offsets preserved.
 *
 * `stripJavaComments` keeps string contents on purpose — M2 has to see the
 * hardcoded mainnet endpoint, which lives inside a literal. But M9 and M10 need
 * to know where methods begin and end, and this tree is full of lines like
 * `logger.info("received coin {} at height {}", …)`. Counting braces over source
 * that still contains those literals puts every later method at the wrong
 * nesting depth. Two views over the same offsets is the cheapest correct answer:
 * structure is read here, content is read from the other.
 */
function blankStringContents(code) {
  let out = '';
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === '"' || c === "'") {
      out += c;
      i++;
      while (i < code.length && code[i] !== c) {
        if (code[i] === '\\') {
          out += '  ';
          i += 2;
          continue;
        }
        if (code[i] === '\n') break;
        out += ' ';
        i++;
      }
      if (i < code.length && code[i] === c) {
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

/** Index of the `}` closing the `{` at `open`, over the structural view. */
function matchBrace(struct, open) {
  let depth = 0;
  for (let i = open; i < struct.length; i++) {
    if (struct[i] === '{') depth++;
    else if (struct[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return struct.length - 1;
}

/**
 * Method bodies, by brace depth. A method is a `{` opened at depth 1 — inside the
 * class body — whose preceding text ends in `name(args)`.
 *
 * M10 exists because of a distinction only method scope can see. `erc-eusdt` and
 * `erc-token` DO contain an active transaction-receipt check, in
 * `replayBlockInit`, and DO NOT contain one in the scheduled `replayBlock` that
 * actually credits deposits. A file-scope rule reads those two modules as
 * "receipt check present" and returns the safe answer to the dangerous question.
 *
 * Anonymous classes and lambdas open braces at deeper levels and are therefore
 * part of the enclosing method's body, which is what both rules want: the eth
 * deposit credit lives inside a `forEach` lambda.
 */
function methodSpans(source, struct = blankStringContents(source)) {
  const spans = [];
  let depth = 0;
  for (let i = 0; i < struct.length; i++) {
    const c = struct[i];
    if (c === '}') {
      depth--;
      continue;
    }
    if (c !== '{') continue;
    if (depth === 1) {
      // From i-1: `lastIndexOf` includes its own start index, and struct[i] is
      // the brace we are standing on, so searching from `i` returns `i` and the
      // signature comes back empty.
      const boundary = Math.max(struct.lastIndexOf(';', i - 1), struct.lastIndexOf('}', i - 1), struct.lastIndexOf('{', i - 1));
      const head = source.slice(boundary + 1, i);
      // The parameter list is the LAST balanced `(...)` in the signature, not the
      // first. `@GetMapping("address/{account}") public MessageResult
      // getNewAddress(…)` would otherwise be named after its annotation, and its
      // "parameters" would be the annotation's argument. One level of nesting is
      // permitted inside, which is exactly what `@Value("${coin.rpc}") String uri`
      // needs M9 to be able to read.
      const m = /([A-Za-z_$][\w$]*)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*(?:throws[\s\w,.]*)?\s*$/.exec(head);
      // `if`/`for`/`while`/`switch`/`catch`/`synchronized` also match `name(...)`,
      // but none of them can appear at class-body depth. `new X() {` can, in a
      // field initialiser — excluded by name.
      if (m !== null && m[1] !== 'new') {
        spans.push({ name: m[1], params: m[2], start: i, end: matchBrace(struct, i) });
      }
    }
    depth++;
  }
  return spans;
}

/** An identifier whose own name says it holds a credential. */
const CREDENTIAL_IDENT = /(secret|password|passwd|passphrase|privatekey|private_key|privkey|credential|mnemonic)/i;

/**
 * Property leaves whose VALUE carries a credential. `rpc` is here because this
 * tree's own `bitcoin/src/main/resources/application.properties` documents it as
 * the endpoint "including its rpcuser:rpcpassword", and `act`'s own JsonrpcClient
 * rebuilds the URI without the userinfo before putting it on the wire.
 */
const CREDENTIAL_PROPERTY_LEAF = /^(rpc|password|passwd|passphrase|secret|private-?key|withdraw-wallet)$/i;

/** stdout, stderr and every logger spelling in this tree. */
const LOG_SINK =
  /\b(?:System\s*\.\s*(?:out|err)\s*\.\s*print(?:ln|f)?|(?:logger|log|LOGGER|LOG)\s*\.\s*(?:info|warn|error|debug|trace))\s*\(/g;

/**
 * Types whose PUBLIC GETTER GRAPH reaches a secp256k1 private key. Not types that
 * "look sensitive" — types read out of shipped bytecode and confirmed to expose
 * the key through a chain a reflective serialiser will walk unaided:
 *
 *   Payment      → getCredentials() : Credentials     (eth-support entity, `:28`)
 *   Credentials  → getEcKeyPair()   : ECKeyPair       (org.web3j:crypto:3.3.1)
 *   ECKeyPair    → getPrivateKey()  : BigInteger      (org.web3j:crypto:3.3.1)
 *
 * All three getters are public, no-arg, and back onto a `private final` field
 * that is NOT transient and carries no annotation of any kind. See the §F3
 * follow-up of 2026-08-06 in the security review for the byte-level read.
 *
 * The name-based `CREDENTIAL_IDENT` above cannot see any of this: not one of
 * those three identifiers contains "secret", "password" or "key" in a position
 * that regex matches, and the variable at the call site is called `current`.
 */
const CREDENTIAL_BEARING_TYPE = /^(?:Payment|Credentials|ECKeyPair)$/;

/**
 * A declaration — field, local or parameter — of a credential-bearing type.
 * Deliberately class-wide rather than method-scoped: the site this rule exists
 * for reads a FIELD (`private Payment current;`) from inside a `@Scheduled`
 * method that declares nothing and takes no arguments, which is exactly why the
 * signature-sourced taint model above never reached it.
 *
 * `LinkedList<Payment> tasks` does not match, and should not: a collection is
 * not passed whole to the serialiser anywhere here, and matching it would taint
 * `tasks` in every method that reads its size.
 */
const CREDENTIAL_BEARING_DECL = /\b(Payment|Credentials|ECKeyPair)\s+([A-Za-z_$][\w$]*)\s*[;,=)]/g;

/**
 * fastjson entered through the calls this tree actually uses. This is the sink
 * that matters and the reason the rule is worth having: a reflective serialiser
 * does not print the object, it WALKS it, so what reaches the log is not the
 * `toString()` of a `Payment` but every leaf its getter graph can reach.
 *
 * Confirmed from the shipped bytecode of the pinned `com.alibaba:fastjson:1.2.31`
 * jar — `JSON.toJSON(Object, SerializeConfig)` calls
 * `JavaBeanSerializer.getFieldValuesMap`, then calls `JSON.toJSON` again on every
 * value it collected, and `ParserConfig.isPrimitive2` lists `java.math.BigInteger`
 * so the key lands verbatim as a decimal integer rather than being skipped.
 *
 * Only a BARE IDENTIFIER argument counts. `JSON.toJSON(payment.getTo())` hands
 * the serialiser a String and is not this defect; a rule that could not tell the
 * two apart would report the projection lines in the same class and be tuned off.
 */
const REFLECTIVE_SERIALISER =
  /\b(?:JSON|JSONObject|JSONArray)\s*\.\s*(?:toJSON|toJSONString|toJSONBytes)\s*\(\s*([A-Za-z_$][\w$]*)\s*[,)]/g;

/** Every identifier in this file declared with a credential-bearing type. */
function credentialBearingNames(struct) {
  const names = new Set();
  CREDENTIAL_BEARING_DECL.lastIndex = 0;
  for (const m of struct.matchAll(CREDENTIAL_BEARING_DECL)) {
    if (CREDENTIAL_BEARING_TYPE.test(m[1])) names.add(m[2]);
  }
  return names;
}

/** Split a parameter list on top-level commas — annotations carry parens of their own. */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const c of text) {
    if (c === '(' || c === '[' || c === '<') depth++;
    else if (c === ')' || c === ']' || c === '>') depth--;
    if (c === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += c;
  }
  if (current.trim() !== '') parts.push(current);
  return parts;
}

/** Does this expression mention any identifier in `tainted`, or a credential-named one? */
function mentionsCredential(expr, tainted) {
  for (const id of expr.matchAll(/\b[A-Za-z_$][\w$]*\b/g)) {
    if (tainted.has(id[0])) return true;
    if (CREDENTIAL_IDENT.test(id[0])) return true;
  }
  return false;
}

/**
 * Assignment propagation, narrower than `mentionsCredential` on purpose: the
 * credential must be passed INTO something, not merely asked FOR something.
 *
 *   `new JsonrpcClient(uri)`        → uri is an argument   → propagate
 *   `client.getBlockCount()`        → client is a receiver → do not
 *
 * Without the distinction, `bitcoin/RpcClientConfig.java:26` — which logs a BLOCK
 * HEIGHT read off a client that was built from the credential URL — comes out as
 * a credential leak, and a rule that reports a block height as a leaked password
 * is one nobody reads twice. Its neighbour at `usdt:26` logs the CLIENT itself
 * and is a genuine finding; the two lines look almost identical, and this is what
 * separates them.
 *
 * The cost is a false negative on `String s = secret.substring(0, 8)`. Accepted:
 * the sink test does not use this function, so `log(secret.substring(0, 8))` is
 * still caught — only laundering through an intermediate local escapes, and that
 * shape does not exist in this tree.
 */
function passedInto(expr, tainted) {
  for (const m of expr.matchAll(/\b([A-Za-z_$][\w$]*)\b\s*(.?)/g)) {
    if (m[2] === '.') continue;
    if (tainted.has(m[1]) || CREDENTIAL_IDENT.test(m[1])) return true;
  }
  return false;
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

/**
 * An EVM event-topic filter key: `contract.event-topic0`. Matched on a leaf
 * ENDING in `topic<digits>` so `spring.kafka.template.default-topic` — which is
 * in all 13 files and is a Kafka topic, not an event signature — is not swept up.
 */
const EVENT_TOPIC_KEY = /topic\d+$/i;

/**
 * A topic0 is the keccak hash of an event signature: exactly 32 bytes, 64 hex
 * digits. Anything else cannot equal a real log topic, so the filter it gates
 * never matches and the check it gates never runs.
 */
function classifyTopic(value) {
  const hex = /^0x([0-9a-fA-F]*)$/.exec(value.trim());
  if (hex === null) return 'not a 0x hex literal — this cannot be an event topic at all';
  if (hex[1].length === 64) return 'a well-formed 32-byte event topic — this filter can match a real log';
  return (
    `${hex[1].length} hex digits, not 64. A topic0 is a 32-byte keccak hash; this value cannot equal any log topic, ` +
    'so the filter never matches and the check it gates never runs. It fails CLOSED, which is not the same as working'
  );
}

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
 * `occurrences` pins HOW MANY TIMES that exact string appears, and defaults to
 * 1. It exists because pinning text alone left the gate blind to the single
 * most likely way this tree gets worse, and blind to it in the exact places the
 * reasons below claimed to be watching:
 *
 *   · btm, eos and xmr carry `MainNetParams` as an IMPORT ONLY. The reason on
 *     the btm entry says it is frozen "precisely BECAUSE it is unused: an
 *     unused mainnet import in a wallet controller is one line from being the
 *     live selector". Adding that line adds a SECOND occurrence of the same
 *     string in the same file — which, without a count, incremented a counter
 *     nobody read and printed a tick. The gate did not catch the one transition
 *     its own baseline said it was there for.
 *   · The M3 entry says "Both call sites are the identical string, so one
 *     frozen entry covers them; a THIRD would fail". It would not have. It
 *     would have been a third increment and a green run.
 *   · And the second Etherscan broadcast deleted on this branch could be pasted
 *     back tomorrow, restoring the same literal in the same file, with nothing
 *     to say so.
 *
 * Defaulting to 1 is the safe default rather than a convenience: an entry added
 * for a string that appears twice fails until its author writes the number
 * down, which makes multiplicity a decision instead of an accident.
 *
 * @type {{ rule: string, module: string, file: string, text: string, occurrences?: number, reason: string }[]}
 */
const FROZEN = [
  // ── M1: mainnet network parameters in the key-minting controllers ────────
  {
    rule: 'M1',
    module: 'bch',
    file: 'WalletController.java',
    text: 'MainNetParams',
    occurrences: 2,
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
    occurrences: 2,
    reason: 'Identical shape to bch: import plus a live MainNetParams.get() in the address-minting controller. Same queue.',
  },
  {
    rule: 'M1',
    module: 'ltc',
    file: 'WalletController.java',
    text: 'MainNetParams',
    occurrences: 2,
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
      'The Ethereum MAINNET Etherscan proxy, hardcoded, with no property behind it. It WAS the worst one in the tree: ' +
      'PaymentHandler reached it on both the ether and the token withdrawal path, POSTing the SAME signed transaction ' +
      'here as eth_sendRawTransaction after already broadcasting it to coin.rpc — so aiming coin.rpc at a testnet node ' +
      'did not make the withdrawal a testnet withdrawal, it made the mainnet copy the one that landed. THAT SECOND ' +
      'BROADCAST IS DELETED (fix/wallet-rpc-criticals); sendRawTransaction and both call sites are gone. What remains, ' +
      'and what this entry now freezes, is the same literal on checkEventLog — a READ-ONLY path the erc-token and ' +
      'erc-eusdt deposit watchers use to confirm an ERC-20 Transfer event. It broadcasts nothing and signs nothing. ' +
      'Still frozen because a read against mainnet is still a mainnet reach, and because the cheapest way to restore ' +
      'the write path would be to add a method beside it. Owner queue: make it a property. UNVERIFIED — no JDK on this ' +
      'host, so the deletion was reasoned from call-graph reachability, not compiled.',
  },
  {
    rule: 'M2',
    module: 'act',
    file: 'ActClientTest.java',
    // Split across concatenation ON PURPOSE, and do not rejoin it. Written whole, this
    // frozen entry copies a `user:password@host` URL out of the vendor tree into OUR
    // source — where secret-scan's KNOWN_DISCLOSED exemption, which covers the ORIGINAL
    // path under OWNER-4, does not reach. So the gate that freezes the credential tripped
    // the gate that bans committing one, and the branch was red on its own.
    // The concatenated value is byte-identical, so the exact-text ratchet is unaffected.
    text: 'http://act:123456' + '@47.74.42.87' + ':8900/rpc',
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
    occurrences: 2,
    reason:
      'Pre-EIP-155 signing on BOTH withdrawal paths (ether transfer and ERC-20 transfer) — the two-argument form takes ' +
      'no chain id, so the signature is valid on every EVM chain at once, mainnet included. STILL UNFIXED, and ' +
      'deliberately so: adding a chain id changes the bytes that get signed, and there is no JDK, JRE or Maven on this ' +
      'host, so the change could not be compiled, let alone tested against a known-good signed-transaction fixture. ' +
      'Applying it blind to a withdrawal path is how money gets stranded by a change that looks obviously right. The ' +
      'exact diff, the chain-id source, every call site and the tests that must pass first are specified in ' +
      'docs/SPEC-EIP155-WALLET-RPC-WITHDRAWAL-SIGNING.md. This is why "just point it at a testnet" is STILL not an ' +
      'available mitigation for this tree, even with the Etherscan relay deleted: a testnet-signed withdrawal here is ' +
      'also a valid mainnet withdrawal, and anyone who sees it can replay it themselves. Both call sites are the ' +
      'identical string, so one frozen entry covers them; a THIRD would fail, and so would changing either. Note that ' +
      'M3 now also catches ChainId.NONE, which would satisfy this rule’s arity test while changing nothing.',
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
  // The erc-eusdt entry that used to sit here held THE LIVE ETHEREUM MAINNET
  // TETHER (USDT) CONTRACT — 40 valid hex digits, unmangled, correct, and the
  // most precise mainnet pin anywhere in the tree. It is GONE, not moved: the
  // property is now `contract.address=${EUSDT_CONTRACT_ADDRESS}`, an unresolved
  // placeholder this gate skips by design, so there is no literal left to
  // freeze. The baseline shrank, which is the only direction it is allowed to
  // move. Its erc-token twin below is still frozen, and still mangled.
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

  // ── M8: live EVM addresses pinned in Java ────────────────────────────────
  {
    rule: 'M8',
    module: 'eth-support',
    file: 'EtherscanApi.java',
    text: '0x0b42c73446e4090a7c1db8ac00ad46a38ccbc2ac',
    reason:
      'A 40-hex Ethereum MAINNET contract address, hardcoded as the `address` argument of a checkEventLog call inside a ' +
      'developer scratch `main()` that shipped, alongside a mainnet block height and a mainnet txid. Surfaced by M8, ' +
      'which is new on this branch — no rule here had ever read a bare address literal out of Java, only out of ' +
      '.properties and only under a key ending in "address". FROZEN rather than deleted, following the precedent ' +
      'OWNER-ACTIONS §A3 set for the credentialed URL in ActClientTest: surefire never runs a main(), the value is in ' +
      'git history either way, and deleting the line would buy nothing while editing unreviewed key-handling code. ' +
      'What freezing buys is that the read-only Etherscan client cannot be quietly re-pointed at a different contract, ' +
      'and that M8 has a live finding to prove it still sees — proof-of-life this rule would otherwise lack, since the ' +
      'one other 40-hex literal in the tree was the erc-eusdt Tether pin and that is now a placeholder.',
  },

  // ── M4-topic: the event filter that works by accident ────────────────────
  //
  // READ THIS BEFORE "FIXING" EITHER OF THE TWO ENTRIES BELOW.
  //
  // The real ERC-20 Transfer topic0 is
  // 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef — 64 hex
  // digits. Both modules ship 63, each missing a different character, in the same
  // digit-drop mangling the upstream applied to its addresses. Neither can ever
  // equal a log topic, so `checkEventLog` returns false, `continue` fires, and no
  // deposit is credited on either module.
  //
  // Correcting them to 64 digits is NOT a typo fix. It ACTIVATES a filter that
  // has never fired, in the crediting path of a deposit watcher, on a host with
  // no JDK, no Maven and no way to run the code — and the watcher underneath it
  // has its transaction-receipt check commented out (M10 below) and never
  // compares the function selector, so `approve()` decodes as `transfer()`. The
  // correct constant is the right END state and it is a BEHAVIOUR CHANGE that
  // needs a JDK build and a deposit-fixture test to land safely — the same
  // judgement docs/SPEC-EIP155-WALLET-RPC-WITHDRAWAL-SIGNING.md records for the
  // chain-id fix. Deleting the line or setting it empty is worse:
  // `StringUtils.isNotEmpty` then skips the check entirely and the commented-out
  // receipt check is all that stands between this watcher and free money.
  {
    rule: 'M4-topic',
    module: 'erc-eusdt',
    file: 'application.properties',
    text: 'event-topic0=0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a1128f55a4df523b3ef',
    reason:
      'THIS IS A BROKEN CONTROL, NOT A WORKING ONE, and fixing it is a behaviour change requiring a JDK build and a ' +
      'deposit fixture test. 63 hex digits where a keccak topic0 has 64, so the Etherscan Transfer-log check the ' +
      'upstream added "to prevent fake deposits" never matches anything and the module credits no deposits at all. ' +
      'It fails closed today by accident. Frozen at exactly this string so that neither the one-character correction ' +
      '(which turns the filter on) nor deletion (which turns the guard off) can happen without a human reading this ' +
      'paragraph. Review: docs/security/WALLET-RPC-SECURITY-REVIEW-2026-08-05.md §F6, §F7.',
  },
  {
    rule: 'M4-topic',
    module: 'erc-token',
    file: 'application.properties',
    text: 'event-topic0=0xddf252ad1be2c89b69c2b068fc378daa952b7f163c4a11628f55a4df523b3ef',
    reason:
      'The same broken control, mangled at a different position — 63 digits again, dropped from a different place, ' +
      'which is why the two strings are frozen separately rather than as one pattern. Same instruction: do not correct ' +
      'it and do not delete it outside a change that can be built and tested. Review §F6.',
  },

  // ── M9: a credential-bearing value reaching a log or print sink ──────────
  //
  // The reason this repo cannot call the wallet tree safe. Three services write a
  // live spending credential to stdout on an ordinary success path — not a
  // setting, code — which makes the security boundary of the hot wallets the read
  // permission on the log files. Frozen so the fourth one fails.
  {
    rule: 'M9',
    module: 'ect',
    file: 'EctApi.java',
    text: 'sendFrom: System.out.println(request.toJSONString())',
    reason:
      'THE WORST OF THESE. Twelve lines up, `request.put("secret", privatekey)` puts the ECT WITHDRAWAL SIGNING SECRET ' +
      'into this object; this line serialises the whole object to stdout, on the success path of EVERY withdrawal, ' +
      'before the request is even sent. The secret is bound from coin.withdraw-wallet, which is item A1 of ' +
      'docs/OWNER-ACTIONS-WALLET-RPC-SECRETS.md — the one the owner is told to rotate first. Rotation does not help: ' +
      'this line prints the REPLACEMENT exactly as freely. Note the sink argument names no credential at all, which is ' +
      'why M9 tracks the container rather than the sink text. Owner queue: delete the print. Review §F1.',
  },
  {
    rule: 'M9',
    module: 'bitcoin',
    file: 'RpcClientConfig.java',
    text: 'setClient: logger.info("uri={}",uri)',
    reason:
      'Logs ${coin.rpc} at INFO on startup. This module\'s own application.properties documents that value as "the ' +
      'bitcoind RPC endpoint including its rpcuser:rpcpassword", so this is a node credential in the startup log of ' +
      'every boot. A bitcoind RPC credential is spend authority over that wallet, and nothing in this tree ever locks ' +
      'a node wallet (review §F12), so reachability equals unlimited spend. Owner queue: log scheme, host and port ' +
      'only. Review §F2.',
  },
  {
    rule: 'M9',
    module: 'usdt',
    file: 'RpcClientConfig.java',
    text: 'setClient: logger.info("uri={}",uri)',
    reason: 'Byte-identical to the bitcoin line above, against the omnicore node. Same reasoning, same queue. Review §F2.',
  },
  {
    rule: 'M9',
    module: 'usdt',
    file: 'RpcClientConfig.java',
    text: 'setClient: logger.info("client={}",client)',
    reason:
      'Logs the CLIENT built from that credential URL, which holds the derived `Authorization: Basic …` header. Whether ' +
      'it actually prints is UNRESOLVED and stated as unresolved: JsonrpcClient neither overrides toString() nor ' +
      'carries Lombok @Data, so it most likely resolves to Object.toString() and leaks nothing — but its superclass ' +
      'lives in a committed jar that cannot be decompiled without a JDK. Frozen on the unresolved reading, because the ' +
      'cost of being wrong is a hot-wallet credential and the cost of freezing it is one entry. Review §F2 second-order.',
  },
  {
    rule: 'M9',
    module: 'act',
    file: 'JsonrpcConfig.java',
    text: 'setActClient: System.out.println("coin.rpc="+url)',
    reason:
      "The same startup credential print, to stdout rather than a logger, and with the extra sting that act's own " +
      'JsonrpcClient.java rebuilds the URI WITHOUT the userinfo before putting it on the wire — so somebody already ' +
      'knew the credential was in there. This line prints the original, with it, first. Owner queue: delete. Review §F2.',
  },
  {
    rule: 'M9',
    module: 'eth-support',
    file: 'PaymentHandler.java',
    text: 'transferToken: logger.info("hexRawValue={}",hexValue)',
    reason:
      'Logs the COMPLETE SIGNED RAW TRANSACTION on the ERC-20 withdrawal path. Because that signature still carries no ' +
      'chain id (M3 above, specified and deliberately unfixed), anyone with log-read access holds a transaction that is ' +
      'valid and replayable on every EVM chain at once — and deleting the Etherscan relay did not change that, it only ' +
      'removed the relay that did it for them. Not an inference: the value is signMessage output turned to hex two ' +
      'lines earlier. Owner queue: log the txid only. Review §F3 ("definitely true, no inference needed").',
  },
  {
    rule: 'M9',
    module: 'eth-support',
    file: 'PaymentHandler.java',
    text:
      'transferToken: logger.info("from={},value={},gasPrice={},gasLimit={},nonce={},address={}",payment.getCredentials().getAddress(), ' +
      'value, gasPrice, maxGas, nonce,payment.getTo())',
    reason:
      'What this line logs today is the hot wallet ADDRESS, which is public, so on its own it is not a leak — stated ' +
      'plainly rather than dressed up. It is frozen because the expression reaching the sink is ' +
      '`payment.getCredentials()`, and deleting the twelve characters `.getAddress()` turns this into the object that ' +
      'holds the private key going into a serialising logger. That is not hypothetical: it is precisely the shape of ' +
      'the §F3 inference forty lines below, in the same class.',
  },
  {
    rule: 'M9',
    module: 'eth-support',
    file: 'EthService.java',
    text: 'transferFromWallet: logger.info("transfer address={},amount={},txid={}", account.getAddress(), realAmount, result.getData())',
    reason:
      'Also not a leak as written — the logged fields are an address, an amount and a txid. It is here because `result` ' +
      'is the return of a transfer() call taking the KEYSTORE PASSWORD as an argument, so M9 treats it as ' +
      'credential-derived, and because logging `result` whole instead of `result.getData()` is a one-word edit in a ' +
      'method that has the keystore password in scope. Frozen with its limits written down rather than tuned away: a ' +
      'rule narrow enough to drop this one also drops the hexRawValue line above, which is real.',
  },

  // ── M9, added 2026-08-06: the §F3 inference, now read out of bytecode ─────
  //
  // These three were deliberately NOT frozen when M9 was written, and the header
  // above said why: §F3 depended on an accessor chain in `org.web3j:core:3.3.1`,
  // that artifact was nowhere on this host, and "a gate must not promote an
  // inference to a finding by pattern-matching it." That condition is now met.
  // `org.web3j:crypto:3.3.1` was read on this host without a JVM, the same way
  // the fastjson chain was, and both getters are public, no-arg, non-transient
  // and unannotated. So this is added the way the header said it would be: by a
  // human, with a reason, after somebody actually read the jar.
  {
    rule: 'M9',
    module: 'eth-support',
    file: 'PaymentHandler.java',
    text: 'checkJob: logger.info("转账{}已成功,检查次数:{}", JSON.toJSON(current),checkTimes)',
    reason:
      'THE ETH HOT-WALLET PRIVATE KEY, ON A THIRTY-SECOND TIMER. `current` is a `Payment`; `Payment.getCredentials()` ' +
      'is public and its field is neither transient nor annotated; `Credentials.getEcKeyPair()` and ' +
      '`ECKeyPair.getPrivateKey()` are public no-arg getters over `private final` non-transient fields. fastjson 1.2.31 ' +
      'walks public getters reflectively and RECURSES on every value, and its own isPrimitive2 lists BigInteger, so the ' +
      'secp256k1 key lands in the log as a decimal integer rather than being skipped. The cron is `0/30 * * * * *` and ' +
      'maxCheckTimes is 100, so an unconfirmed withdrawal reprints it for up to fifty minutes. Owner queue: log the ' +
      'txid and the business id only, and never hand an object holding Credentials to a serialiser. Review §F3.',
  },
  {
    rule: 'M9',
    module: 'eth-support',
    file: 'PaymentHandler.java',
    text: 'checkJob: logger.info("转账{}未成功,检查次数:{}", JSON.toJSON(current),checkTimes)',
    reason:
      'The failure branch of the line above, five lines down, and the WORSE of the two: this is the one that runs on ' +
      'every unconfirmed check, so it is the repetition, not the success case, that fills the log. Same object, same ' +
      'serialiser, same key. Review §F3.',
  },
  {
    rule: 'M9',
    module: 'eth-support',
    file: 'PaymentHandler.java',
    text: 'doJob: logger.info("开始执行付款任务:current---"+JSONObject.toJSONString(current))',
    reason:
      'The third serialiser call on the same field, and the one that is NOT a leak today — stated that way rather than ' +
      'counted as a third finding. It sits inside `if (current == null && tasks.size() > 0)`, so `current` is null ' +
      'every time this line runs and it prints the four characters "null". It is frozen because the guard is the only ' +
      'thing making it harmless: this line was written to dump the in-flight payment and would do exactly that the ' +
      'moment the condition is reordered or the log is moved below the assignment. Review §F3.',
  },

  // ── M10: deposit credits, by whether the crediting method verifies success ─
  //
  // Frozen as SHAPE, not as text: the rule id encodes the verdict, so a path that
  // loses its receipt check changes id, goes stale against `-verified` AND
  // unfrozen against `-unverified`, and fails twice. A NEW crediting method fails
  // once. That is the property worth ratcheting; the credit expression itself is
  // identical in all six and would ratchet nothing.
  {
    rule: 'M10-credit-unverified',
    module: 'eth',
    file: 'EthWatcher.java',
    text: 'replayBlock: new Deposit()',
    reason:
      'THE SCHEDULED WATCHER. The credit decision reads `to` and `value` straight out of the block body; the receipt, ' +
      'which is where the success flag lives, is never fetched on this path. A transaction included in a block but ' +
      'REVERTED still carries its `to` and its `value` while transferring nothing, so this credits ether that was ' +
      'never received, at the cost of the gas for a reverting transaction. Owner queue: require the receipt status. ' +
      'Review §F6.',
  },
  {
    rule: 'M10-credit-unverified',
    module: 'eth',
    file: 'EthWatcher.java',
    text: 'replayBlockInit: new Deposit()',
    reason:
      'The manual replay path, same defect, and worse in one respect: it calls depositEvent.onConfirmed() directly for ' +
      'everything it finds, over an operator-supplied and completely unbounded block range (review §F17). Same queue.',
  },
  {
    rule: 'M10-credit-unverified',
    module: 'erc-token',
    file: 'TokenWatcher.java',
    text: 'replayBlock: new Deposit()',
    reason:
      'The scheduled token watcher, and the reason M10 is method-scoped rather than file-scoped. The receipt check IS ' +
      'in this file — at :64-65, commented out, under a note reading "commented out for now, need to confirm later ' +
      'whether it is strictly necessary". It is strictly necessary. A file-scope rule sees the live check in ' +
      'replayBlockInit below and reports this module as verified, which is the safe answer to the dangerous question. ' +
      'Review §F6.',
  },
  {
    rule: 'M10-credit-unverified',
    module: 'erc-eusdt',
    file: 'TokenWatcher.java',
    text: 'replayBlock: new Deposit()',
    reason:
      'Identical to erc-token. The only thing currently stopping a fake credit here is the 63-digit topic0 frozen ' +
      "above — a broken constant, not a control — and that mattered more before this module's contract.address became " +
      'a placeholder. It matters again the moment an operator supplies one. Review §F6.',
  },
  {
    rule: 'M10-credit-verified',
    module: 'erc-token',
    file: 'TokenWatcher.java',
    text: 'replayBlockInit: new Deposit()',
    reason:
      'The manual replay path DOES fetch the receipt and require status 0x1. Frozen as the positive case so that ' +
      'removing that check flips the rule id, which fails as a stale `-verified` entry and again as an unfrozen ' +
      '`-unverified` finding. A gate that only records what is broken cannot notice something working being switched ' +
      'off.',
  },
  {
    rule: 'M10-credit-verified',
    module: 'erc-eusdt',
    file: 'TokenWatcher.java',
    text: 'replayBlockInit: new Deposit()',
    reason:
      'Same as erc-token: receipt fetched and status required on the replay path only. Same reasoning for freezing the ' + 'positive case.',
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

/**
 * Every Java rule, over one file's source. Returns findings rather than
 * recording them, so the probe harness at the bottom can run the REAL matchers
 * against synthetic fixtures instead of a second copy of them that could drift.
 * That indirection is the whole point: a rule with no live finding in the tree
 * has no proof-of-life from the frozen baseline, and a copy-pasted probe would
 * prove only that the copy still works.
 *
 * @returns {{ rule: string, text: string, line: number, detail: string }[]}
 */
function scanJavaSource(source) {
  const out = [];
  const code = stripJavaComments(source);
  const add = (rule, text, index, detail) => out.push({ rule, text, line: lineAt(code, index), detail });

  // M1 — mainnet network-parameter selectors.
  for (const { re, reason } of JAVA_NETWORK_SELECTORS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(code)) !== null) {
      add('M1', m[0], m.index, reason);
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }

  // M2 — hardcoded endpoint literal at a routable host.
  //
  // The scheme set is `http`, `https`, `ws` and `wss`, not just the two. web3j
  // reaches a node through EITHER `HttpService` (what this tree uses today) or
  // `WebSocketService`, and `wss://` is the canonical form of every hosted
  // mainnet endpoint that offers a subscription API. A rule that read only
  // `https?://` would have called a switch to `wss://mainnet.<provider>/ws/v3/KEY`
  // clean — the same endpoint, the same chain, past the gate on the strength of
  // two characters. The properties half of this gate never had that hole,
  // because `hostOf` there is scheme-agnostic; only the Java half did.
  for (const m of code.matchAll(/"((?:https?|wss?):\/\/[^"\s]+)"/g)) {
    const url = m[1];
    const host = hostOf(url);
    if (host === null || !isOffBoxHost(host)) continue;
    add('M2', url, m.index, `hardcoded endpoint at a routable host (${host}) — no property can override it`);
  }

  // M3 — chain-id-less EVM signing, in all the shapes web3j 3.3.1 offers.
  //
  // Arity on `signMessage` was the original rule and it is necessary but not
  // sufficient: it answers "was a chain id passed", and the question that
  // actually decides replayability is "was a REAL chain id passed, by any of the
  // routes that sign". Three additions, all of which produce exactly the
  // pre-EIP-155 signature the two-argument form does:
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
    add('M3', text, m.index, 'two-argument signMessage carries no chain id (pre-EIP-155) — replay-valid on mainnet');
  }

  // M3, and the most important of the three, because it is the one that LOOKS
  // FIXED. `ChainId.NONE` is web3j's literal "no chain id" sentinel (0). Passed
  // as the chain-id argument of the three-argument signMessage it satisfies the
  // arity rule above and produces a byte-identical pre-EIP-155 signature. An
  // agent or engineer applying the EIP-155 fix without a compiler, reaching for
  // the named constant that is already imported, writes exactly this.
  for (const m of code.matchAll(/\bChainId\s*\.\s*NONE\b/g)) {
    add(
      'M3',
      m[0],
      m.index,
      "ChainId.NONE is web3j's no-chain-id sentinel — it satisfies the three-argument signMessage signature while " +
        'producing the same replayable transaction the two-argument form does',
    );
  }

  // M3 — the two-argument `RawTransactionManager(web3j, credentials)`. In web3j
  // 3.3.1 (the version this reactor pins) that constructor delegates to the
  // three-argument one with ChainId.NONE, so every transaction it sends is
  // pre-EIP-155 without the word `signMessage` appearing anywhere.
  for (const m of code.matchAll(/\bRawTransactionManager\s*\(/g)) {
    const open = m.index + m[0].length - 1;
    if (argumentCount(code, open) !== 2) continue;
    add(
      'M3',
      'RawTransactionManager(<2 args>)',
      m.index,
      'the two-argument RawTransactionManager defaults to ChainId.NONE in web3j 3.x — it signs pre-EIP-155 without ' +
        'naming signMessage at all',
    );
  }

  // M3 — `Transfer.sendFunds`. Flagged rather than trusted: in web3j 3.x it
  // builds its own TransactionManager, and whether that manager carries a chain
  // id is a property of the version resolved at build time. This gate cannot
  // resolve a jar (there is no JDK here by design, M7), so it refuses to assume
  // the safe answer. If a reviewer WITH a compiler establishes that the call is
  // EIP-155 on the pinned version, that belongs in FROZEN with the evidence.
  for (const m of code.matchAll(/\bTransfer\s*\.\s*sendFunds\s*\(/g)) {
    add(
      'M3',
      'Transfer.sendFunds(...)',
      m.index,
      'Transfer.sendFunds signs through a TransactionManager this gate cannot inspect without a JDK; on web3j 3.x the ' +
        'default is chain-id-less. Prove it EIP-155 at review or do not use it',
    );
  }

  // M8 — a live EVM address pinned in Java rather than in config.
  //
  // M4-address only ever looked at .properties, and only at keys whose last
  // segment ends in `address`. Both limits are real holes: the mainnet Tether
  // contract this branch just removed from erc-eusdt could be re-pinned by
  // moving it one file sideways into a Java constant, and no rule here would
  // have said a word. 40 hex digits is an EVM account or contract and nothing
  // else — a 64-hex event topic does not match, and neither does a txid.
  for (const m of code.matchAll(/"(0x[0-9a-fA-F]{40})"/g)) {
    add('M8', m[1], m.index, `${classifyAddress(m[1])} pinned in Java — no property can override a literal`);
  }

  // ── M9 / M10, both method-scoped ─────────────────────────────────────────
  //
  // Taint is reasoned over the STRUCTURAL view, with string contents blanked, so
  // that `logger.info("password check failed")` is a message ABOUT a credential
  // rather than a credential. Findings are RECORDED from `code`, so the frozen
  // text is the line a human would read.
  const struct = blankStringContents(code);
  const keyBearing = credentialBearingNames(struct);

  for (const method of methodSpans(code, struct)) {
    const body = struct.slice(method.start, method.end + 1);

    // M9 — sources from the signature, then one forward pass over the body.
    const tainted = new Set();
    for (const param of splitTopLevel(method.params)) {
      const name = /([A-Za-z_$][\w$]*)\s*$/.exec(param.trim())?.[1];
      if (name === undefined) continue;
      if (CREDENTIAL_IDENT.test(name)) tainted.add(name);
      // The @Value binding needs the string CONTENTS, so it is read from `code`.
      const bound = /@Value\s*\(\s*"\s*\$\{([^}:]+)/.exec(param)?.[1];
      if (bound !== undefined && CREDENTIAL_PROPERTY_LEAF.test(bound.slice(bound.lastIndexOf('.') + 1).trim())) tainted.add(name);
    }

    // One pass in source order, so a value is tainted before the sink that
    // prints it is reached. These files are one statement per line.
    const bodyLines = body.split('\n');
    let lineStart = method.start;
    for (const stmt of bodyLines) {
      const stmtStart = lineStart;
      lineStart += stmt.length + 1;

      const assign = /(?:^|[\s;(])(?:final\s+)?(?:[\w$<>[\],.]+\s+)?([A-Za-z_$][\w$]*)\s*=\s*([^=][^;]*)/.exec(stmt);
      if (assign !== null && passedInto(assign[2], tainted)) tainted.add(assign[1]);

      for (const mut of stmt.matchAll(/\b([A-Za-z_$][\w$]*)\s*\.\s*(?:put|add|append|set[A-Za-z_$]*)\s*\(([^;]*)/g)) {
        if (mentionsCredential(mut[2], tainted)) tainted.add(mut[1]);
      }

      // A credential-bearing object handed WHOLE to a reflective serialiser.
      // The taint is added here, in statement order and before the sink scan
      // below, because the serialiser call and the log call are the same
      // statement: `logger.info("…{}…", JSON.toJSON(current), checkTimes)`.
      // Tainting the NAME rather than the whole statement is what keeps the
      // projection lines in this same class silent — `payment.getTo()` never
      // becomes a bare identifier inside a serialiser call.
      REFLECTIVE_SERIALISER.lastIndex = 0;
      for (const ser of stmt.matchAll(REFLECTIVE_SERIALISER)) {
        if (keyBearing.has(ser[1])) tainted.add(ser[1]);
      }

      LOG_SINK.lastIndex = 0;
      let sink;
      while ((sink = LOG_SINK.exec(stmt)) !== null) {
        const open = stmtStart + sink.index + sink[0].length - 1;
        const close = findClose(struct, open);
        if (!mentionsCredential(struct.slice(open + 1, close), tainted)) continue;
        add(
          'M9',
          `${method.name}: ${code
            .slice(stmtStart + sink.index, close + 1)
            .replace(/\s+/g, ' ')
            .trim()}`,
          open,
          'a credential-bearing value reaches a log/print sink — in a container deployment stdout IS the log pipeline',
        );
      }
    }

    // M10 — an EVM deposit credit, classified by whether the method that builds
    // it ever fetches the receipt that says the transaction succeeded.
    const credit = /\bnew\s+Deposit\s*\(\s*\)/.exec(body);
    if (credit === null) continue;
    if (!/\bweb3j\b|\bEthBlock\b|\bConvert\s*\.\s*fromWei\b/.test(body)) continue;
    const verified = /\bethGetTransactionReceipt\b|\bisTransactionSuccess\b/.test(body);
    add(
      verified ? 'M10-credit-verified' : 'M10-credit-unverified',
      `${method.name}: new Deposit()`,
      method.start + credit.index,
      verified
        ? 'an EVM deposit credit whose method does fetch a transaction receipt'
        : 'an EVM deposit credit built from block fields with no receipt fetch — a reverted transaction still carries ' +
            'its `to` and its `value` in the block body while transferring nothing',
    );
  }

  return out;
}

/**
 * Every .properties rule, over one file's text. Same contract as
 * scanJavaSource, and for the same reason.
 *
 * @returns {{ rule: string, text: string, line: number, detail: string }[]}
 */
function scanPropertiesSource(content) {
  const out = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*[#!]/.test(line) || !line.includes('=')) continue;
    const key = line.slice(0, line.indexOf('=')).trim();
    const value = line.slice(line.indexOf('=') + 1).trim();
    if (value === '' || isPlaceholder(value)) continue;
    // Last dot-segment only — see the header on why the full key cannot be used.
    const leaf = key.slice(key.lastIndexOf('.') + 1);
    const text = `${leaf}=${value}`;
    const add = (rule, detail) => out.push({ rule, text, line: i + 1, detail });

    if (CHAIN_ENDPOINT_KEYS.has(leaf.toLowerCase())) {
      const host = hostOf(value);
      if (host !== null && isOffBoxHost(host)) {
        add('M4-endpoint', `chain endpoint at a routable host (${host})`);
      }
    }

    if (leaf.toLowerCase() === 'init-block-height' && /^\d+$/.test(value) && Number(value) > 0) {
      add('M4-height', 'non-zero chain start height — a statement about one live chain’s history');
    }

    // Two independent ways to be an address, joined so one line can only ever
    // produce one M4-address finding:
    //
    //   · the KEY says so   — `*address`, whatever the value looks like. This is
    //     the original rule and it carries every non-EVM chain in the tree.
    //   · the VALUE says so — exactly 0x + 40 hex, under ANY key. Added because
    //     the key rule is defeated by renaming: `contract.token=0xdac17…` or
    //     `usdt.contract=0xdac17…` is the same live mainnet pin under a key that
    //     does not end in "address", and it read clean. A value of this exact
    //     shape is an EVM account or contract and cannot be anything else.
    const keySaysAddress = /address$/i.test(leaf) && isAddressLike(value);
    const valueIsEvmAddress = /^0x[0-9a-fA-F]{40}$/.test(value);
    if (keySaysAddress || valueIsEvmAddress) {
      add('M4-address', keySaysAddress ? classifyAddress(value) : `${classifyAddress(value)}, under a key that does not name one`);
    }

    if (KEYSTORE_FILENAME.test(value)) {
      add('M4-keystore', 'go-ethereum keystore filename — it embeds the account whose key it holds');
    }

    if (EVENT_TOPIC_KEY.test(leaf)) {
      add('M4-topic', classifyTopic(value));
    }
  }

  return out;
}

// ── M1 / M2 / M3 / M8 over Java ────────────────────────────────────────────
for (const file of javaFiles) {
  for (const f of scanJavaSource(readFileSync(file, 'utf8'))) record(f.rule, file, f.text, f.line, f.detail);
}

// ── M4 over .properties ────────────────────────────────────────────────────
for (const file of propsFiles) {
  for (const f of scanPropertiesSource(readFileSync(file, 'utf8'))) record(f.rule, file, f.text, f.line, f.detail);
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
if (javaFiles.length === 0) emptyWalks.push('walked 0 Java files — M1, M2, M3 and M8 asserted nothing');
if (propsFiles.length === 0) emptyWalks.push('walked 0 .properties files — M4 asserted nothing');
// M5 had a denominator and did not assert it: the summary line has always
// printed "N Dockerfile(s) checked" and N was never required to be non-zero. A
// collector that returned nothing — a rename, a new skip-dir, a depth limit
// tripped by a re-root — would have printed "0 Dockerfile(s) ... none builds
// this tree", which is the repo's named recurring defect stated as a tick. The
// repo has 2 today, so this asserts a fact rather than a hope.
if (dockerfilesInspected === 0) {
  emptyWalks.push('opened 0 Dockerfiles — M5 asserted nothing about images (the in-tree script sweep is a different, narrower check)');
}
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

// ── Walk guard, part 3: proof-of-life for rules with nothing to find ───────
//
// The frozen baseline is proof-of-life ONLY for rules that currently match
// something. Every rule added to widen this gate is, by construction, a rule
// with no live finding — the tree has no `wss://` endpoint, no `ChainId.NONE`,
// no `RawTransactionManager`, and after this branch no EVM contract address
// under a non-address key. Those rules are therefore indistinguishable, on a
// green run, from rules that were deleted or typo'd into never matching. The
// baseline cannot tell them apart because there is nothing to freeze.
//
// So they are exercised, on every run, against synthetic fixtures pushed
// through the SAME scanJavaSource / scanPropertiesSource the tree goes through.
// Not a copy of the regexes: the functions themselves. Blinding a rule breaks
// its probe, and the gate goes red naming the rule.
//
// The negative probes matter as much as the positive ones. A rule widened until
// it fires on a private host, a 64-hex event topic or a correctly-chain-id'd
// signMessage is a rule that will be switched off within the week, and then the
// real finding goes through it unnoticed — the precedent this gate's own header
// cites about `prefer-ip-address` and `workspace-sync`.
const RULE_PROBES = [
  // ── M2: the scheme widening ────────────────────────────────────────────
  {
    rule: 'M2',
    kind: 'java',
    fires: true,
    source: 'class P { String n = "wss://mainnet.example-provider.io/ws/v3/KEY"; }',
    note: 'a websocket mainnet endpoint — the hole before this branch, when M2 read only https?://',
  },
  {
    rule: 'M2',
    kind: 'java',
    fires: true,
    source: 'class P { String n = "https://api.example-chain.io/v1"; }',
    note: 'the original https form still fires',
  },
  {
    rule: 'M2',
    kind: 'java',
    fires: false,
    source: 'class P { String n = "ws://127.0.0.1:8546"; }',
    note: 'loopback is not a mainnet reach, whatever the scheme',
  },
  {
    rule: 'M2',
    kind: 'java',
    fires: false,
    source: 'class P { String n = "wss://${NODE_HOST}"; }',
    note: 'a host the environment decides is not a hardcoded endpoint',
  },

  // ── M3: the shapes arity alone does not catch ──────────────────────────
  {
    rule: 'M3',
    kind: 'java',
    fires: true,
    source: 'class P { void f() { byte[] s = TransactionEncoder.signMessage(tx, ChainId.NONE, credentials); } }',
    note: 'THE ONE THAT LOOKS FIXED — three arguments, so the arity rule passes it, and the signature is still pre-EIP-155',
  },
  {
    rule: 'M3',
    kind: 'java',
    fires: true,
    source: 'class P { void f() { TransactionManager m = new RawTransactionManager(web3j, credentials); } }',
    note: 'signs pre-EIP-155 on web3j 3.x without the word signMessage appearing',
  },
  {
    rule: 'M3',
    kind: 'java',
    fires: true,
    source: 'class P { void f() { Transfer.sendFunds(web3j, credentials, to, amount, Convert.Unit.ETHER); } }',
    note: 'chain-id behaviour depends on a jar this gate cannot resolve — flagged, not assumed safe',
  },
  {
    rule: 'M3',
    kind: 'java',
    fires: true,
    source: 'class P { void f() { byte[] s = TransactionEncoder.signMessage(tx, credentials); } }',
    note: 'the original two-argument form still fires',
  },
  {
    rule: 'M3',
    kind: 'java',
    fires: false,
    source: 'class P { void f() { byte[] s = TransactionEncoder.signMessage(tx, chainId, credentials); } }',
    note: 'a real chain id is the fix — this must NOT fire, or the gate blocks its own remediation',
  },
  {
    rule: 'M3',
    kind: 'java',
    fires: false,
    source: 'class P { void f() { TransactionManager m = new RawTransactionManager(web3j, credentials, chainId); } }',
    note: 'the three-argument manager carries a chain id',
  },

  // ── M8: an EVM address pinned in Java ──────────────────────────────────
  {
    rule: 'M8',
    kind: 'java',
    fires: true,
    source: 'class P { static final String C = "0xdAC17F958D2ee523a2206206994597C13D831ec7"; }',
    note: 'the mainnet Tether contract moved one file sideways out of .properties, mixed-case — no rule saw this before',
  },
  {
    rule: 'M8',
    kind: 'java',
    fires: false,
    source: 'class P { String t = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"; }',
    note: 'a 64-hex event topic is not an address',
  },

  // ── M4-address: the value-shaped branch ────────────────────────────────
  {
    rule: 'M4-address',
    kind: 'properties',
    fires: true,
    source: 'contract.token=0xdac17f958d2ee523a2206206994597c13d831ec7',
    note: 'the same live mainnet pin under a key that does not end in "address" — clean before this branch',
  },
  {
    rule: 'M4-address',
    kind: 'properties',
    fires: true,
    source: 'coin.withdraw-address=1QDEimf6f4VrDqCSBmgfh1ReW9L2vHvvg',
    note: 'the original key-shaped branch still fires, and still covers non-EVM chains',
  },
  {
    rule: 'M4-address',
    kind: 'properties',
    fires: false,
    source: 'eureka.instance.prefer-ip-address=true',
    note: 'the boolean in all 13 files must stay silent — a gate that cries wolf gets switched off',
  },
  {
    rule: 'M4-address',
    kind: 'properties',
    fires: false,
    source: 'contract.address=${EUSDT_CONTRACT_ADDRESS}',
    note: 'an unresolved placeholder is a decision the environment makes, not a pin in this tree',
  },

  // ── M4-topic: the event filter, working and broken ─────────────────────
  {
    rule: 'M4-topic',
    kind: 'properties',
    fires: true,
    source: 'contract.event-topic0=0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
    note: 'the CORRECT 64-digit Transfer topic fires too — this rule freezes the filter either way, because turning a never-matching filter on is a behaviour change in a crediting path',
  },
  {
    rule: 'M4-topic',
    kind: 'properties',
    fires: false,
    source: 'spring.kafka.template.default-topic= test',
    note: 'the Kafka topic in all 13 files is not an event signature — a gate that cries wolf on it gets switched off',
  },

  // ── M9: credential into a log sink, and the lines that only look like it ─
  {
    rule: 'M9',
    kind: 'java',
    fires: true,
    source:
      'class P { void f(String privatekey) { JSONObject r = new JSONObject(); r.put("secret", privatekey); System.out.println(r.toJSONString()); } }',
    note: 'the EctApi shape — the sink argument names no credential at all, so only tracking the container catches it',
  },
  {
    rule: 'M9',
    kind: 'java',
    fires: true,
    source: 'class P { Client f(@Value("${coin.rpc}") String uri) { logger.info("uri={}", uri); return null; } }',
    note: 'a @Value-bound credential-carrying property reaching a logger — the three startup prints',
  },
  {
    rule: 'M9',
    kind: 'java',
    fires: false,
    source: 'class P { void f() { logger.info("password check failed for this request"); } }',
    note: 'a message ABOUT a credential is not a credential — taint is read with string contents blanked, precisely so this stays silent',
  },
  {
    rule: 'M9',
    kind: 'java',
    fires: false,
    source:
      'class P { Client f(@Value("${coin.rpc}") String uri) { Client c = new Client(uri); int h = c.getBlockCount(); logger.info("blockHeight={}", h); return c; } }',
    note: 'a block height read off a client built from the credential URL is not a credential — receiver-position taint would report it as one',
  },
  {
    rule: 'M9',
    kind: 'java',
    fires: true,
    source: 'class P { private Payment current; void f() { logger.info("paid {} times {}", JSON.toJSON(current), n); } }',
    note: 'the §F3 shape — a FIELD of a key-bearing type handed whole to a reflective serialiser inside a scheduled method that declares nothing and takes no arguments, so signature-sourced taint cannot see it and only the declared TYPE can',
  },
  {
    rule: 'M9',
    kind: 'java',
    fires: false,
    source: 'class P { private Payment current; void f() { logger.info("paying to {} amount {}", current.getTo(), v); } }',
    note: 'a scalar PROJECTION off the same field is not the defect — the serialiser walking the getter graph is, and a rule that could not tell them apart would report the address and gas lines in that same class and get tuned off',
  },

  // ── M10: the deposit credit, verified and not ──────────────────────────
  {
    rule: 'M10-credit-unverified',
    kind: 'java',
    fires: true,
    source: 'class P { void f() { EthBlock b = web3j.ethGetBlockByNumber(n, true).send(); Deposit d = new Deposit(); d.setAmount(v); } }',
    note: 'a credit built from block fields with no receipt fetch — the EthWatcher shape',
  },
  {
    rule: 'M10-credit-verified',
    kind: 'java',
    fires: true,
    source:
      'class P { void f() { EthBlock b = web3j.ethGetBlockByNumber(n, true).send(); web3j.ethGetTransactionReceipt(h).send(); Deposit d = new Deposit(); } }',
    note: 'the same credit WITH the receipt fetch — the positive case has to be visible, or a check being switched off is invisible',
  },
  {
    rule: 'M10-credit-unverified',
    kind: 'java',
    fires: false,
    source: 'class P { void f() { web3j.ethGetTransactionReceipt(h).send(); Deposit d = new Deposit(); } }',
    note: 'the verified shape must not ALSO report unverified, or the two ids stop meaning anything',
  },
  {
    rule: 'M10-credit-unverified',
    kind: 'java',
    fires: false,
    source: 'class P { void f() { Deposit d = new Deposit(); d.setTxid(t); } }',
    note: 'a non-EVM watcher credit — bitcoin-family modules confirm by depth, not by receipt, and firing on all eleven of them is how this rule would get switched off',
  },
];

const probeFailures = [];
for (const probe of RULE_PROBES) {
  const found = (probe.kind === 'java' ? scanJavaSource(probe.source) : scanPropertiesSource(probe.source)).some(
    (f) => f.rule === probe.rule,
  );
  if (found !== probe.fires) {
    probeFailures.push(
      `[${probe.rule}] expected ${probe.fires ? 'a finding' : 'NO finding'}, got ${found ? 'a finding' : 'none'}` +
        `\n      fixture: ${probe.source}` +
        `\n      why it exists: ${probe.note}`,
    );
  }
}

if (probeFailures.length > 0) {
  die('a rule stopped doing what it says it does', [
    ...probeFailures.map((p) => `· ${p}\n`),
    'These fixtures are the only proof-of-life some rules here have: they match nothing in the tree, so the',
    'frozen baseline cannot tell a working rule from a deleted one. A failure means either the rule was',
    'narrowed until it went blind, or it was widened until it fires on something correct. Both are how a',
    'gate becomes decoration. Fix the rule — do not relax the fixture.',
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

/** Recorded multiplicity for an entry. Absent means 1 — see the FROZEN header. */
const expectedCount = (entry) => entry.occurrences ?? 1;

// A malformed count is a broken baseline, not a finding: it must be a positive
// integer or nobody can tell what the entry claims.
const malformedCounts = FROZEN.filter((e) => !Number.isInteger(expectedCount(e)) || expectedCount(e) < 1);

// Text still matches, but not as many times as recorded. Both directions are a
// failure and they mean opposite things, so they are reported separately.
const countDrift = [...frozenIndex.values()]
  .filter((v) => v.seen > 0 && v.seen !== expectedCount(v.entry))
  .map((v) => ({ entry: v.entry, seen: v.seen, expected: expectedCount(v.entry) }));

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

if (malformedCounts.length > 0) {
  problems.push('  ── frozen entries with a broken occurrence count ──');
  for (const e of malformedCounts) problems.push(`  [${e.rule}]  ${e.module}:${e.file}  occurrences=${JSON.stringify(e.occurrences)}`);
  problems.push('    `occurrences` must be a positive integer, or omitted to mean 1.');
  problems.push('');
}

if (countDrift.length > 0) {
  problems.push('  ── a frozen string changed how many times it appears ──');
  for (const d of countDrift) {
    problems.push(`  [${d.entry.rule}]  ${d.entry.module}:${d.entry.file}`);
    problems.push(`    text:     ${d.entry.text}`);
    problems.push(`    recorded: ${d.expected}    found: ${d.seen}`);
    problems.push(
      d.seen > d.expected
        ? '    → ANOTHER ONE APPEARED. The text was already frozen, so nothing here is "new" by string — but a second ' +
            'copy of a mainnet constant is a second place it acts from. This is the shape of an unused mainnet import ' +
            'becoming a live selector, of a third chain-id-less signing call, and of a deleted broadcast pasted back.'
        : '    → ONE WENT AWAY. If that was the fix, lower `occurrences` in the same commit so the baseline records ' +
            'the ground it gained and cannot silently give it back. If it was not deliberate, the rule may be going blind.',
    );
    problems.push('');
  }
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

const probesFiring = RULE_PROBES.filter((p) => p.fires).length;
const frozenOccurrences = FROZEN.reduce((n, e) => n + expectedCount(e), 0);

console.log(
  `✓ wallet-rpc-mainnet-scan clean — ${moduleDirs.length} module(s), ${javaFiles.length} Java + ${propsFiles.length} properties file(s) ` +
    `walked; ${FROZEN.length} frozen mainnet constant(s) in ${frozenOccurrences} recorded occurrence(s), all still exactly ` +
    `as recorded (${ruleSummary}); no new one added, and none gained a copy. Barriers held: ${dockerfilesInspected} Dockerfile(s), ${composeInspected} compose file(s) and ` +
    `${workflowsInspected} workflow(s) checked — none builds, composes or boots this tree. ` +
    `${RULE_PROBES.length} rule probe(s) passed (${probesFiring} must fire, ${RULE_PROBES.length - probesFiring} must not) — ` +
    `proof-of-life for the rules the tree gives nothing to freeze.`,
);
