#!/usr/bin/env node
/**
 * Vendor Java money scan (Plan P2-2/P2-3 · Spec DB-3/DB-4 · Architect Seam A).
 *
 * THE Java dual-book gate. `ledger.*` is the only book (ADR 2026-07-28,
 * Accepted, Option B); `member_wallet` is a read-only projection. Nothing in
 * the vendored Java tree may write it.
 *
 * Spec DB-4 asks for "custody-scan (or successor) reads Java". This is the
 * successor. custody-scan is a PROTOCOL PLANE gate over .ts/.tsx and .sol and
 * has no business holding vendor rules — see the header comment there.
 *
 * ── FOUR CHECKS ───────────────────────────────────────────────────────────
 *
 *  1. SQL/JPQL live-write shapes (original scope). The specific text the
 *     upstream author wrote, banned so a re-arm of a no-op body fails.
 *
 *  2. DAO no-op INTEGRITY — new. Check 1 matches known phrasings, so it can
 *     only catch a re-arm that happens to be phrased the way upstream phrased
 *     it. `UPDATE member_wallet SET balance = :newBalance` writes the second
 *     book and matches none of the eight. So the four mutator declarations are
 *     asserted POSITIVELY instead: whatever @Query they carry must be the
 *     sanctioned no-op. That closes re-arming by any phrasing at all, and it
 *     needs no allowlist because it is a statement about four declarations
 *     rather than a search for bad text.
 *
 *  3. Mutator names, banned (ADR: "become hard-banned by scan"). Ratcheted —
 *     the existing call sites are the ADOPT-AND-ADAPT work queue, and a NEW
 *     one has to fail so it gets written against the ledger adapter instead.
 *
 *  4. JPA managed-entity mutation — new, and the reason this branch exists.
 *     `wallet.setBalance(wallet.getBalance().add(x))` inside a @Transactional
 *     method: Hibernate dirty-checks the managed entity and flushes it to
 *     member_wallet at commit. There is no UPDATE to grep for and often no
 *     save() either. It was invisible to all three existing gates — check 1
 *     matches SQL text that does not exist here, dual-book-door-scan checks
 *     the interceptor is wired but says nothing about shapes, and custody-scan
 *     never opens a .java file. 19 such call sites are in the tree today.
 *     There were 27. Eight of them had no runtime gate whatsoever — held off
 *     only by a `= null` assignment or an unconditional `return`, in a Kafka
 *     consumer, two Spring event listeners and a service, none of which an
 *     HTTP interceptor can reach. Those eight were reward MINTS with no ledger
 *     recipe to redirect to, so they were DELETED rather than left disabled:
 *     a short-circuit one line restores is a booby trap, not a control.
 *
 * ── WHY IT DOES NOT CRY WOLF ──────────────────────────────────────────────
 *
 * A gate that fires on prose gets disabled, and then the real failure goes
 * through it unnoticed. `workspace-sync.mjs` carries the standard: its check-6
 * regex matched an English sentence in a comment and went red on `main` for
 * everyone, on prose. Two mechanisms here, both load-bearing on THIS tree —
 * neither is speculative, both were measured before being written:
 *
 *  1. Comments are stripped by a real tokeniser before any rule runs. The old
 *     line filter was `trimmed.startsWith('//' | '*' | '/*')`, which is fooled
 *     by a trailing comment and by any line of a /* *\/ block that does not
 *     happen to begin with a star. `ExchangeOrderService` has a commented-out
 *     `increaseBalance` call at line 444 and `CoinController` two commented
 *     `setBalance` lines at 434-435 — all three would be counted by a naive
 *     name match, and all three are correctly dropped here.
 *
 *  2. String literal contents are BLANKED for the name and entity rules and
 *     KEPT for the SQL rules. The asymmetry is the whole trick and it is not
 *     optional in either direction:
 *       · `MemberWalletService` throws `"freezeBalance is disabled: Java shell
 *         must not freeze balances (INTAFACED dual-book)"` — four such
 *         messages. Match inside strings and the gate fires on the very code
 *         that proves the mutator is off.
 *       · JPQL and native SQL exist ONLY inside @Query("...") literals. Blank
 *         strings for those rules and check 1 matches nothing at all — a green
 *         light that means nothing.
 *     "Strip strings before matching" is the right instinct and the wrong
 *     rule; the view is chosen per rule instead.
 *
 * Vendor `src/test/` is skipped: a test asserting a mutator throws has to be
 * able to say its name. `.sql` files are not walked — `db_patch.sql` and
 * `member_wallet_trigger.sql` document the upstream schema we replaced.
 *
 * ── LANDING GREEN WITHOUT LYING ───────────────────────────────────────────
 *
 * The tree is not clean. Narrowing the rules until it went green would rebuild
 * the exact blindness being fixed, so the known debt is an allowlist carrying a
 * per-file, per-rule COUNT and a written reason. The count is a ratchet:
 *   · more hits than listed  → fail (a new second-book write)
 *   · fewer hits than listed → fail, asking for the number to come down
 * so removals lock in and cannot silently leave room to regress. Every entry is
 * ADOPT-AND-ADAPT work queue (ADR 2026-08-02), not an exemption anyone should
 * be comfortable with.
 *
 * Exit 0 = clean. Exit 1 = live second-book write still present.
 *
 * ── FAIL-CLOSED FIXTURE (D26-P2-08) ────────────────────────────────────────
 *
 * A ratchet that is only ever green on the production tree cannot prove it
 * would go red on a NEW write. Every invocation plants `setBalance` and a
 * live `member_wallet` UPDATE in a temp vendor tree (empty allowlist, so
 * known-site budgets cannot absorb it) and demands the scan fail. Production
 * `vendor/` is then scanned as before — still a ratchet, still exit 0 today.
 *
 * ── SOURCE ONLY (D-S-17 / D26-P2-07) ───────────────────────────────────────
 *
 * A clean run proves what the SCANNED SOURCE says. It is not jar/runtime proof.
 * Compose may still launch gitignored, pre-neutering jars. Do not claim Java
 * runtime safety from this scan alone — see `vendor-java-jar-truth.mjs` and
 * `pnpm vendor-java:rebuild`.
 *
 * ── D26-P3-11 · SCAN OBJECT = THE JAVA TREE (not a missing walk) ──────────
 *
 * Empty-denominator already refuses a missing `vendor/`. That is not enough:
 * `vendor/` can exist while `vendor/upstream-exchange` is skipped and this gate
 * would print clean over zero production Java. Before money rules run we assert
 * the walk covered that tree: production-Java floor, Maven pom floor, NOTICE
 * pin, vendor-compile.yml / Dependabot maven-directory pins. `--self-test`
 * plants `VENDOR_JAVA_EXTRA_SKIP=upstream-exchange` and requires a non-zero exit.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const VENDOR = join(ROOT, 'vendor');
const UPSTREAM_REL = 'vendor/upstream-exchange';
const UPSTREAM = join(ROOT, 'vendor', 'upstream-exchange');
const NOTICE = join(UPSTREAM, 'NOTICE');
const COMPILE_WORKFLOW = join(ROOT, '.github', 'workflows', 'vendor-compile.yml');
const DEPENDABOT = join(ROOT, '.github', 'dependabot.yml');
const THIS_FILE = fileURLToPath(import.meta.url);

/**
 * Measured 2026-08-15 on origin/main: 871 production Java, 30 pom.xml under
 * vendor/upstream-exchange. Floors sit below those counts so honest deletes of
 * a few files do not trip the gate; skipping the directory cannot clear either
 * floor (zero files). Raise, do not lower, if the tree grows a lot.
 */
const MIN_PRODUCTION_JAVA = 800;
const MIN_MAVEN_POMS = 20;

/** Repo-relative path with forward slashes — CI is Linux, half of us are on Windows. */
const relPath = (file, root = ROOT) => relative(root, file).replace(/\\/g, '/');

/** Whole-file skips for the SQL rules (legacy shape, kept). */
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
  {
    id: 'native-to-released-write',
    // Live credit/debit of to_released (not SELECT). Hibernate setToReleased is
    // covered by CODE_RULES; this catches native/JPQL re-arms the balance rules miss.
    re: /SET\s+to_released\s*=/i,
    reason: 'native/JPQL live to_released write — second-book column',
  },
];

/**
 * Banned wallet mutator names (ADR 2026-07-28 hard-ban + dual-book residual).
 * The classic four debit/credit/freeze/thaw plus freeze-path siblings that
 * still move value (increaseFrozen / decreaseFrozen). Call sites throw today;
 * the scan must still ratchet them so a re-arm cannot hide off-list.
 */
const WALLET_MUTATORS = ['increaseBalance', 'decreaseBalance', 'freezeBalance', 'thawBalance', 'increaseFrozen', 'decreaseFrozen'];

/**
 * The sanctioned disabled body. Anything else attached to one of the four
 * declarations is a live second book regardless of how it is phrased.
 * A trailing `AND …` is allowed: the no-op is already dead at `WHERE 1 = 0`.
 */
const NOOP_QUERY = /^\s*UPDATE\s+member_wallet\s+SET\s+id\s*=\s*id\s+WHERE\s+1\s*=\s*0\b/i;

/**
 * Rules over the CODE view (comments stripped, string contents blanked).
 * These are ratcheted per file by VENDOR_JAVA_ALLOWLIST.
 * @type {{ id: string, re: RegExp, reason: string }[]}
 */
const CODE_RULES = [
  {
    id: 'wallet-mutator-name',
    re: new RegExp(`\\b(${WALLET_MUTATORS.join('|')})\\s*\\(`, 'g'),
    reason: 'names a banned MemberWalletDao balance mutator (ADR 2026-07-28: hard-banned by scan)',
  },
  {
    id: 'jpa-entity-balance-mutation',
    // Deliberately shape-agnostic about the ARGUMENT. The three forms in this
    // tree are `w.getBalance().add(x)`, `BigDecimalUtils.add(w.getBalance(), x)`
    // and a static `add(x.getBalance(), va)` — pinning the argument would have
    // caught the first and missed the other two, which is how the Kafka
    // consumer and both event listeners stayed invisible. What makes this a
    // write is the SETTER, so the setter is what is matched.
    re: /\.\s*set(?:Frozen)?Balance\s*\(/g,
    reason: 'assigns a wallet balance field — Hibernate flushes a managed entity to member_wallet at commit',
  },
  {
    id: 'jpa-entity-to-released-mutation',
    // member_wallet.to_released is a real column Hibernate flushes. The balance
    // setter rule never saw it (mega-audit 2026-08-07 MemberEvent). Empty
    // allowlist on purpose — zero hits is the only green state.
    re: /\.\s*setToReleased\s*\(/g,
    reason: 'assigns member_wallet.to_released — second-book credit invisible to setBalance rules',
  },
];

/**
 * Allowlist entries are keyed by MAVEN MODULE + CLASS FILENAME rather than by
 * full path, and matched on path SEGMENTS rather than a prefix string. Both
 * choices are forced by `brand-scan`: naming the vendor in this repo's own
 * source is a §0.7 violation, and a full path would embed both the upstream
 * Java package and the vendor directory name. `dual-book-setbalance-classify`
 * hit the same wall and answered it the same way — "discover by class filename
 * only; do not embed vendor package path literals".
 *
 * It turns out to be the better rule regardless: `<module>/src/main/java/…` is
 * Maven layout, so this key survives the vendor tree being moved or renamed,
 * which a hardcoded prefix would not.
 *
 * The key is unambiguous here, and that is PROVED on every run rather than
 * assumed. Every basename collision in this tree is ACROSS modules (OrderEvent
 * in admin and otc-api, OrderController in exchange-api and otc-api, six more),
 * never within one — so module+basename separates them. The resolution step
 * below fails the build if an entry ever matches zero files or more than one:
 * an entry silently covering two files would hand a budget to a file nobody
 * reviewed, which is exactly the failure an allowlist exists to make
 * impossible.
 *
 * @param {string} path @param {{module: string, file: string}} entry
 */
function entryMatches(path, entry) {
  const segments = path.split('/');
  if (segments[segments.length - 1] !== entry.file) return false;
  // The module directory is the one immediately above `src/main/java`.
  return segments.some((seg, i) => seg === entry.module && segments[i + 1] === 'src');
}

/** Human-readable key for messages — never a package path. */
const entryKey = (entry) => `${entry.module}:${entry.file}`;

/**
 * Known debt, as a ratchet. EVERY ENTRY IS WORK QUEUE, not an exemption.
 * ADR 2026-08-02 "ADOPT AND ADAPT": keep the controller and its business logic,
 * redirect the balance write to `ledger-client` through an adapter.
 *
 * 54 hits across 20 file/rule pairs (classic four + frozen mutators + zero-init listings), all of them pre-existing and all of them
 * verified individually before being listed. Three grades of dead, weakest last
 * — and one grade that is deliberately empty:
 *
 *   A. NO-OP AT THE DAO — the declaration itself. Proved dead by check 2 on
 *      every run, not by this list.
 *   B. THROWS — the service stub raises IllegalStateException, so every caller
 *      dies on the call. The 32 call sites below are all of this grade: each
 *      was read, and each goes through `memberWalletService`, never the DAO.
 *   C. BEHIND THE 410 DOOR — a controller whose URI fragment is in
 *      DualBookMoneyDoorInterceptor. Runtime-only, and only for HTTP callers.
 *   D. DEAD BY A ONE-LINE EDIT — `= null` short-circuits and code after an
 *      unconditional `return`. THIS WAS THE WEAK GRADE: no runtime gate at all,
 *      restorable by one line, and in a Kafka consumer, two Spring event
 *      listeners and a service that no HTTP door reaches. It is now EMPTY, and
 *      that is the point — the eight sites were registration/promotion reward
 *      MINTS with no ledger recipe to redirect to, so ADOPT-AND-ADAPT had
 *      nothing to adapt them into and they were deleted outright. An entry
 *      reappearing under this grade means someone wrote a new one.
 *
 * A note the deletion turned up, recorded because it changes what "rebuild the
 * jars" costs: two of those sites sat AFTER an unconditional `return;` in the
 * same block. JLS 14.21 makes that an unreachable statement — a compile ERROR.
 * The `core` module could not have compiled since that edit landed, so no build
 * of these jars has ever included the disabling campaign. Both are gone now,
 * and a tree-wide sweep found no third instance.
 *
 * @type {{ module: string, file: string, rules: Record<string, number>, reason: string }[]}
 */
const VENDOR_JAVA_ALLOWLIST = [
  // ── Grade A: the declarations themselves ─────────────────────────────────
  {
    module: 'core',
    file: 'MemberWalletDao.java',
    rules: { 'wallet-mutator-name': 6 },
    reason:
      'Grade A. The six named mutators (classic four + increaseFrozen/decreaseFrozen). Each carries UPDATE member_wallet ' +
      'SET id = id WHERE 1 = 0 and is re-proved by dao-mutator-noop-integrity — that check has no allowlist, so this ' +
      'entry cannot hide a re-arm. All other @Modifying UPDATE member_wallet queries on this DAO are also proved no-op ' +
      'by the same check (absolute SET balance = :x cannot sneak past via a non-named method). Queue: delete once no ' +
      'caller remains.',
  },
  {
    module: 'core',
    file: 'MemberWalletService.java',
    rules: { 'wallet-mutator-name': 5 },
    reason:
      'Grade A. freezeBalance/thawBalance/increaseBalance/increaseFrozen/decreaseFrozen stubs that throw ' +
      'IllegalStateException("… is disabled: Java shell must not … (INTAFACED dual-book)"). These declarations make ' +
      'every Grade B call site dead. Queue: replace with ledger-client adapter calls.',
  },

  // ── Grade B: call sites of a method that throws ──────────────────────────
  {
    module: 'exchange-core',
    file: 'ExchangeOrderService.java',
    rules: { 'wallet-mutator-name': 9 },
    reason:
      'Grade B. Spot/exchange order lifecycle — freeze on place (113, 126, 746, 755), credit on fill (378, 472, 502), ' +
      'decreaseFrozen on fill (387), thaw on cancel (619). Largest seam → tradeFill / escrowLock. Queue: highest priority.',
  },
  {
    module: 'otc-api',
    file: 'OrderController.java',
    rules: { 'wallet-mutator-name': 3 },
    reason: 'Grade B. OTC order place/cancel/complete. Queue: escrowLock / escrowRelease.',
  },
  {
    module: 'admin',
    file: 'ActivityController.java',
    rules: { 'wallet-mutator-name': 5 },
    reason: 'Grade B. Activity/IEO order freeze/thaw + decreaseFrozen on admin cancel/distribute. Queue: escrowRelease.',
  },
  {
    module: 'otc-api',
    file: 'AdvertiseController.java',
    rules: { 'wallet-mutator-name': 2 },
    reason: 'Grade B. OTC advert put-up/take-down freeze and thaw. Queue: escrowLock / escrowRelease.',
  },
  {
    module: 'admin',
    file: 'AdminCtcOrderController.java',
    rules: { 'wallet-mutator-name': 3 },
    reason: 'Grade B. CTC order admin release/refund including decreaseFrozen. Queue: escrowRelease.',
  },
  {
    module: 'ucenter-api',
    file: 'CtcController.java',
    rules: { 'wallet-mutator-name': 2 },
    reason: 'Grade B. CTC buy/sell user path. Queue: escrowLock / escrowRelease.',
  },
  {
    module: 'core',
    file: 'OrderService.java',
    rules: { 'wallet-mutator-name': 2 },
    reason: 'Grade B. OTC order thaw on cancel and on appeal resolution. Queue: escrowRelease.',
  },
  {
    module: 'admin',
    file: 'CheckRedEnvelopeJob.java',
    rules: { 'wallet-mutator-name': 4 },
    reason:
      'Grade B, scheduled — NOT behind the HTTP door. Refunds unclaimed red-envelope amounts (thaw + decreaseFrozen). ' +
      'Dead only because the service throws. Queue: rewardPay reversal.',
  },
  {
    module: 'admin',
    file: 'CheckCtcOrderJob.java',
    rules: { 'wallet-mutator-name': 1 },
    reason: 'Grade B, scheduled — NOT behind the HTTP door. Auto-cancels stale CTC orders and thaws. Queue: escrowRelease.',
  },
  {
    module: 'ucenter-api',
    file: 'WithdrawController.java',
    rules: { 'wallet-mutator-name': 1 },
    reason: 'Grade B. Freeze on withdrawal request. Queue: withdrawHold.',
  },
  {
    module: 'ucenter-api',
    file: 'PromotionController.java',
    rules: { 'wallet-mutator-name': 1 },
    reason:
      'Grade B. Promotion card exchange freezes via increaseFrozen — was invisible to the classic-four name ban. ' +
      'Service throws; door fragment /promotion added for defense-in-depth. Queue: escrowLock.',
  },
  {
    module: 'admin',
    file: 'AdminAppealController.java',
    rules: { 'wallet-mutator-name': 1 },
    reason: 'Grade B. Thaw on OTC appeal decision. Queue: escrowRelease.',
  },
  {
    module: 'core',
    file: 'AdvertiseService.java',
    rules: { 'wallet-mutator-name': 1 },
    reason: 'Grade B. Thaw of an advert remainder. Queue: escrowRelease.',
  },
  {
    module: 'core',
    file: 'ActivityOrderService.java',
    rules: { 'wallet-mutator-name': 1 },
    reason: 'Grade B. Activity order freeze. Queue: escrowLock.',
  },

  // ── Grade C: entity mutation behind the 410 door ─────────────────────────
  // EMPTY after L16 W5/W6: admin remittance/auth/cancel (#1324) + ucenter freeze/red-envelope
  // (#1328) throw IllegalStateException instead of mutating managed wallets. Queue remains
  // ledger-adapter redirect when product law lands; no Grade C rows left to ratchet.

  // ── Grade D: EMPTY, and it stays empty ──────────────────────────────────
  // The four files that used to sit here — core:MemberApplicationService (3),
  // wallet:MemberConsumer (1 of 3), admin:OrderEvent (2), otc-api:OrderEvent (2) —
  // held eight reward mints with NO runtime gate: a `= null` assignment or an
  // unconditional `return`, in a service, a Kafka consumer and two Spring event
  // listeners that no HTTP door reaches. They were reward MINTS with no ledger
  // recipe to redirect to, so they were deleted outright, along with the wallet
  // and reward services those classes injected only in order to mint. The
  // surrounding workflow — KYC status, inviter tree counters, wallet creation at
  // registration, transaction counters — is untouched.
  // Queue (unchanged, now honest): rebuild on a rewardPay recipe when the reward
  // product is specified. Nothing is disabled-in-place waiting to be re-armed.
  // A NEW entry under this heading means a new ungated mint, not old debt.

  // ── Not a balance write, but listed rather than excluded by pattern ──────
  {
    module: 'wallet',
    file: 'MemberConsumer.java',
    rules: { 'jpa-entity-balance-mutation': 2 },
    reason:
      'Zero-init of a NEW wallet at member registration: `new MemberWallet()` is constructed in the loop, set to zero, ' +
      'then saved — the entity is never a row that already exists, so nothing is moved. Was 3: the third was a live ' +
      'registration-reward credit onto an EXISTING wallet, held off only by `RewardActivitySetting … = null` inside a ' +
      'KAFKA CONSUMER the 410 interceptor cannot reach. That one is deleted. These two stay listed rather than ' +
      'pattern-excluded so a non-zero value here fails. Queue: none, unless the constructor moves.',
  },
  {
    module: 'wallet',
    file: 'CoinConsumer.java',
    rules: { 'jpa-entity-balance-mutation': 2 },
    reason:
      'Zero-init of a NEW wallet when a coin is added. Not a balance write. Listed, not pattern-excluded: ' +
      '"setBalance(ZERO) is always safe" stops being true the moment it runs against an EXISTING wallet, and the ' +
      'ratchet is what would catch that edit. Queue: none, unless the constructor moves.',
  },
  {
    module: 'admin',
    file: 'ForkJoinWork.java',
    rules: { 'jpa-entity-balance-mutation': 2 },
    reason: 'Zero-init of new wallets during a bulk coin backfill. Same reasoning as CoinConsumer. Queue: none.',
  },
  {
    module: 'admin',
    file: 'CoinController.java',
    rules: { 'jpa-entity-balance-mutation': 1 },
    reason:
      'Not a wallet at all: `hotTransferRecord.setBalance(...)` writes a hot-wallet TRANSFER LOG row, a different ' +
      'entity that happens to share the setter name. Listed rather than excluded by receiver name — matching on ' +
      '`hotTransferRecord` would be a rule about a variable name, and the next author may pick a different one.',
  },
];

/**
 * Blank Java comments, and optionally string/char literal contents, without
 * moving any other character. Length and newlines are preserved, so a match
 * offset still maps to the original line number and a per-line rule still sees
 * the same line it always saw.
 * @param {string} source
 * @param {{ blankStrings: boolean }} options
 */
function stripJava(source, { blankStrings }) {
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
          out += blankStrings ? '  ' : source.slice(i, i + 2);
          i += 2;
          continue;
        }
        // A raw newline cannot appear in a Java literal; treat it as unterminated
        // rather than swallowing the rest of the file.
        if (source[i] === '\n') break;
        out += blankStrings ? ' ' : source[i];
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

/** 1-based line number of a character offset. */
function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === '\n') line++;
  return line;
}

function extraSkipDirs() {
  const extra = (process.env.VENDOR_JAVA_EXTRA_SKIP ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set(extra);
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  const extra = extraSkipDirs();
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'target' || name === '.git' || extra.has(name)) continue;
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

function walkNamed(dir, predicate, out = []) {
  if (!existsSync(dir)) return out;
  const extra = extraSkipDirs();
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'target' || name === '.git' || extra.has(name)) continue;
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkNamed(p, predicate, out);
    else if (predicate(name)) out.push(p);
  }
  return out;
}

function isTestJava(path) {
  return /\/src\/test\//.test(path);
}

function isUpstreamPath(path) {
  return path === UPSTREAM_REL || path.startsWith(`${UPSTREAM_REL}/`);
}

/**
 * Failures that mean the walk did not cover Maven/vendor Java.
 * @param {{ java: string[], poms: string[] }} counts
 */
function scopeFailures(counts) {
  /** @type {string[]} */
  const failures = [];
  const production = counts.java.filter((p) => !isTestJava(p));
  const inTree = production.filter(isUpstreamPath);
  const orphans = production.filter((p) => !isUpstreamPath(p));
  const pomsInTree = counts.poms.filter(isUpstreamPath);

  if (inTree.length < MIN_PRODUCTION_JAVA) {
    failures.push(
      `vendor/upstream-exchange production Java below floor (${inTree.length} file(s), need >= ${MIN_PRODUCTION_JAVA}) — planted skip or empty walk, not coverage`,
    );
  }
  if (pomsInTree.length < MIN_MAVEN_POMS) {
    failures.push(
      `vendor/upstream-exchange Maven pom.xml below floor (${pomsInTree.length} file(s), need >= ${MIN_MAVEN_POMS}) — Maven is a blind spot if the walk skipped the tree`,
    );
  }
  for (const p of orphans) {
    failures.push(`${p} is production Java outside ${UPSTREAM_REL} — Maven/NOTICE/compile pin does not cover it`);
  }
  return failures;
}

function pinFailures() {
  /** @type {string[]} */
  const failures = [];
  if (!statSync(UPSTREAM, { throwIfNoEntry: false })?.isDirectory()) {
    failures.push('vendor/upstream-exchange missing — cannot prove vendor Java is in scan scope');
  }
  if (!existsSync(NOTICE) || readFileSync(NOTICE, 'utf8').trim().length < 200) {
    failures.push('vendor/upstream-exchange/NOTICE missing or empty — Apache pin is not in scope');
  }
  if (!existsSync(COMPILE_WORKFLOW)) {
    failures.push('.github/workflows/vendor-compile.yml missing — compile probe of vendor Java is gone');
  } else {
    const wf = readFileSync(COMPILE_WORKFLOW, 'utf8');
    if (!wf.includes('vendor/upstream-exchange')) {
      failures.push('vendor-compile.yml no longer names vendor/upstream-exchange — compile probe walked off the Java tree');
    }
    if (!/\bmvn\b/.test(wf) || !/\bcompile\b/.test(wf)) {
      failures.push('vendor-compile.yml lost `mvn` compile — the probe no longer compiles vendor Java');
    }
  }
  if (!existsSync(DEPENDABOT)) {
    failures.push('.github/dependabot.yml missing — Maven ecosystem pin unreadable');
  } else {
    const dep = readFileSync(DEPENDABOT, 'utf8');
    for (const dir of ['/vendor/upstream-exchange/00_framework', '/vendor/upstream-exchange/01_wallet_rpc']) {
      if (!dep.includes(dir)) {
        failures.push(`dependabot.yml lost maven directory ${dir} — vendor jars would not be advisory-scanned`);
      }
    }
  }
  return failures;
}

function assertProductionScanScope() {
  const files = walk(VENDOR);
  const poms = walkNamed(VENDOR, (name) => name === 'pom.xml');
  const scopeHits = [...scopeFailures({ java: files.map((f) => relPath(f)), poms: poms.map((f) => relPath(f)) }), ...pinFailures()];
  if (scopeHits.length) {
    console.error('✖ vendor-java-money-scan failed — vendor Java is out of scan scope:\n');
    for (const s of scopeHits) console.error(`  · ${s}`);
    console.error('');
    process.exit(1);
  }
  return { files, poms };
}

function provePlantedSkip() {
  /** @type {string[]} */
  const fails = [];
  const empty = scopeFailures({ java: [], poms: [] });
  if (empty.length < 2) {
    fails.push(`empty walk must fail both Java and pom floors, got ${empty.length} failure(s)`);
  }
  if (!empty.some((f) => /planted skip or empty walk/.test(f))) {
    fails.push('empty Java walk did not phrase the skip refusal');
  }

  let code = 0;
  let out = '';
  try {
    out = execFileSync(process.execPath, [THIS_FILE], {
      encoding: 'utf8',
      cwd: ROOT,
      env: { ...process.env, VENDOR_JAVA_EXTRA_SKIP: 'upstream-exchange' },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 180000,
    });
  } catch (err) {
    code = err.status ?? 1;
    out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
  }
  if (code === 0) {
    fails.push('planted skip of upstream-exchange exited 0 — Maven/vendor Java is still a blind spot');
  }
  if (!/planted skip or empty walk/.test(out)) {
    fails.push(`planted skip did not print the floor refusal (exit ${code}): ${out.slice(0, 400)}`);
  }

  if (fails.length) {
    console.error('✖ vendor-java-money-scan planted-skip FAIL:');
    for (const f of fails) console.error(`  · ${f}`);
    process.exit(1);
  }
  console.log(
    `✓ vendor-java-money-scan planted-skip OK — skip of upstream-exchange refused (floors Java >= ${MIN_PRODUCTION_JAVA}, poms >= ${MIN_MAVEN_POMS})`,
  );
}

function isAllowlisted(relPath) {
  return ALLOWLIST.some((e) => relPath === e.path || relPath.startsWith(e.path + sep));
}

/**
 * Walk a vendor tree. `allowlist: []` is for the fail-closed fixture so
 * production budgets cannot absorb a planted write.
 *
 * @param {{ root: string, vendorDir: string, allowlist?: typeof VENDOR_JAVA_ALLOWLIST }} opts
 */
function scanVendorTree({ root, vendorDir, allowlist = VENDOR_JAVA_ALLOWLIST }) {
  if (!statSync(vendorDir, { throwIfNoEntry: false })?.isDirectory()) {
    return { kind: 'missing-vendor', failed: true };
  }

  const files = walk(vendorDir);
  const hits = [];
  let javaScanned = 0;
  let javaSkippedTests = 0;
  /** @type {Map<string, Map<string, {count: number, lines: number[], reason: string}>>} */
  const codeHits = new Map();
  /** @type {{ path: string, line: number, mutator: string, query: string }[]} */
  const daoIntegrityFailures = [];
  let daoDeclarationsVerified = 0;
  const scannedPaths = [];

  for (const file of files) {
    const rel = relative(root, file);
    const path = relPath(file, root);
    if (/\/src\/test\//.test(path)) {
      javaSkippedTests++;
      continue;
    }
    if (isAllowlisted(rel)) continue;
    javaScanned++;
    scannedPaths.push(path);
    const source = readFileSync(file, 'utf8');

    const sqlView = stripJava(source, { blankStrings: false });
    const codeView = stripJava(source, { blankStrings: true });

    const sqlLines = sqlView.split(/\r?\n/);
    const rawLines = source.split(/\r?\n/);
    for (let i = 0; i < sqlLines.length; i++) {
      for (const rule of FORBIDDEN) {
        if (rule.re.test(sqlLines[i])) {
          hits.push({ rel, line: i + 1, id: rule.id, reason: rule.reason, text: (rawLines[i] ?? '').trim().slice(0, 160) });
          break;
        }
      }
    }

    if (/(?:Dao|Repository)\.java$/.test(path)) {
      for (const m of [...codeView.matchAll(/@Query\s*\(([\s\S]{0,400}?)\)\s*([\s\S]{0,200}?);/g)]) {
        const [, annotation, signature] = m;
        const sqlAnnotation = sqlView.slice(m.index, m.index + annotation.length + 8);
        const value = /"([^"]*)"/.exec(sqlAnnotation)?.[1] ?? '';
        const mutator = WALLET_MUTATORS.find((name) => new RegExp(`(?<![.\\w])${name}\\s*\\(`).test(signature));
        const isMemberWalletDao = /MemberWalletDao\.java$/.test(path);
        const isWalletUpdate = /UPDATE\s+member_wallet\b/i.test(value);
        if (!mutator && !(isMemberWalletDao && isWalletUpdate)) continue;
        const label = mutator ?? signature.match(/\b(\w+)\s*\(/)?.[1] ?? 'unnamed-wallet-update';
        daoDeclarationsVerified++;
        if (!NOOP_QUERY.test(value)) {
          daoIntegrityFailures.push({ path, line: lineAt(codeView, m.index), mutator: label, query: value.slice(0, 160) });
        }
      }
    }

    if (!/[Bb]alance|[Ff]rozen|member_wallet|[Tt]oReleased|to_released|setToReleased/.test(source)) continue;
    for (const rule of CODE_RULES) {
      rule.re.lastIndex = 0;
      let match;
      while ((match = rule.re.exec(codeView)) !== null) {
        if (!codeHits.has(path)) codeHits.set(path, new Map());
        const perRule = codeHits.get(path);
        if (!perRule.has(rule.id)) perRule.set(rule.id, { count: 0, lines: [], reason: rule.reason });
        const entry = perRule.get(rule.id);
        entry.count++;
        entry.lines.push(lineAt(codeView, match.index));
        if (match.index === rule.re.lastIndex) rule.re.lastIndex++;
      }
    }
  }

  /** @type {Map<object, string>} */
  const resolved = new Map();
  /** @type {string[]} */
  const keyFailures = [];
  for (const entry of allowlist) {
    const matches = scannedPaths.filter((p) => entryMatches(p, entry));
    if (matches.length === 1) resolved.set(entry, matches[0]);
    else if (matches.length === 0) keyFailures.push(`${entryKey(entry)} matches no scanned file — stale entry, delete it`);
    else keyFailures.push(`${entryKey(entry)} matches ${matches.length} files — ambiguous key, it must identify exactly one`);
  }

  const budgetsByPath = new Map();
  for (const [entry, path] of resolved) budgetsByPath.set(path, entry);

  /** @type {{ path: string, ruleId: string, reason: string }[]} */
  const ratchetFailures = [];

  for (const [path, perRule] of codeHits) {
    const allowed = budgetsByPath.get(path)?.rules ?? {};
    for (const [ruleId, entry] of perRule) {
      const budget = allowed[ruleId] ?? 0;
      if (entry.count > budget) {
        ratchetFailures.push({
          path,
          ruleId,
          reason: `${entry.reason} — ${entry.count} occurrence(s) at line(s) ${entry.lines.join(', ')}, allowed ${budget}`,
        });
      }
    }
  }

  for (const [entry, path] of resolved) {
    for (const [ruleId, budget] of Object.entries(entry.rules)) {
      const actual = codeHits.get(path)?.get(ruleId)?.count ?? 0;
      if (actual < budget) {
        ratchetFailures.push({
          path,
          ruleId,
          reason: `allowlist reserves ${budget} "${ruleId}" hit(s) but only ${actual} remain — lower it to ${actual} (or drop the entry) so the removal cannot silently regress`,
        });
      }
    }
  }

  const seen = new Set();
  const unique = hits.filter((h) => {
    const k = `${h.rel}:${h.line}:${h.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const gradeDAllowRows = allowlist.filter((e) => /Grade D/i.test(e.reason ?? ''));
  const failed =
    unique.length > 0 ||
    daoIntegrityFailures.length > 0 ||
    ratchetFailures.length > 0 ||
    keyFailures.length > 0 ||
    gradeDAllowRows.length > 0;

  return {
    kind: 'scanned',
    failed,
    unique,
    daoIntegrityFailures,
    ratchetFailures,
    keyFailures,
    gradeDAllowRows,
    javaScanned,
    javaSkippedTests,
    daoDeclarationsVerified,
    allowlist,
  };
}

const PLANTED_SET_BALANCE = `public class PlantedWalletService {
  public void credit(MemberWallet wallet, java.math.BigDecimal amount) {
    wallet.setBalance(wallet.getBalance().add(amount));
  }
}
`;

const PLANTED_MEMBER_WALLET = `public interface PlantedWalletDao {
  @Query("UPDATE member_wallet SET balance = balance + :amount")
  int increaseBalance(Long walletId, java.math.BigDecimal amount);
}
`;

/**
 * Plant a dual-book write in a temp vendor tree. Empty allowlist so production
 * ratchet budgets cannot hide it. Must fail on both shapes or the gate is
 * fail-open and this process exits 1 before the real tree is considered.
 */
function proveFailClosedFixture() {
  const tmp = mkdtempSync(join(tmpdir(), 'vendor-java-money-failclosed-'));
  try {
    const vendorDir = join(tmp, 'vendor');
    const javaDir = join(vendorDir, 'probe', 'src', 'main', 'java');
    mkdirSync(javaDir, { recursive: true });
    writeFileSync(join(javaDir, 'PlantedWalletService.java'), PLANTED_SET_BALANCE);
    writeFileSync(join(javaDir, 'PlantedWalletDao.java'), PLANTED_MEMBER_WALLET);

    const result = scanVendorTree({ root: tmp, vendorDir, allowlist: [] });
    const setBalance = result.kind === 'scanned' && result.ratchetFailures.some((r) => r.ruleId === 'jpa-entity-balance-mutation');
    const sqlWrite =
      result.kind === 'scanned' &&
      (result.unique.some((h) => h.id === 'native-balance-plus') ||
        result.daoIntegrityFailures.some((d) => /member_wallet/i.test(d.query)));

    if (!result.failed || !setBalance || !sqlWrite) {
      console.error('✖ vendor-java-money-scan fail-closed fixture did not trip — a new dual-book write would go green');
      console.error(`  failed=${Boolean(result.failed)} setBalance=${Boolean(setBalance)} member_wallet=${Boolean(sqlWrite)}`);
      process.exit(1);
    }
    console.log('✓ vendor-java-money-scan fail-closed fixture — planted setBalance + member_wallet write both exit 1');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function reportProductionFailure(result) {
  console.error('✖ vendor-java-money-scan failed — the Java tree can write a second book:\n');

  if (result.keyFailures.length) {
    console.error('  ── allowlist keys ──');
    for (const k of result.keyFailures) console.error(`  · ${k}`);
    console.error('');
  }

  if (result.unique.length) {
    console.error('  ── live SQL/JPQL balance writes ──');
    for (const h of result.unique) {
      console.error(`  ${h.rel}:${h.line}  [${h.id}] ${h.reason}`);
      console.error(`    ${h.text}`);
    }
    console.error('');
  }

  if (result.daoIntegrityFailures.length) {
    console.error('  ── DAO mutator re-armed ──');
    for (const d of result.daoIntegrityFailures) {
      console.error(`  ${d.path}:${d.line}  [dao-mutator-noop-integrity] ${d.mutator} no longer carries the sanctioned no-op`);
      console.error(`    @Query: ${d.query}`);
      console.error('    Required: UPDATE member_wallet SET id = id WHERE 1 = 0');
    }
    console.error('');
  }

  if (result.ratchetFailures.length) {
    console.error('  ── second-book write shapes (ratchet) ──');
    for (const r of result.ratchetFailures) {
      console.error(`  ${r.path}  [${r.ruleId}]`);
      console.error(`    → ${r.reason}`);
    }
    console.error('');
  }

  if (result.gradeDAllowRows.length > 0) {
    console.error('  ── Grade D allowlist band must stay EMPTY ──');
    for (const e of result.gradeDAllowRows) console.error(`  · ${entryKey(e)} — ${e.reason}`);
    console.error('');
  }

  console.error('  ledger.* is the only book (ADR 2026-07-28, Accepted, Option B). member_wallet is a read-only');
  console.error('  projection — nothing in Java writes it (§0.6). Redirect the balance write to ledger-client');
  console.error('  through an adapter (ADR 2026-08-02, ADOPT AND ADAPT); do not rewrite the controller around it.');
  console.error('  Inventory: node tooling/scripts/vendor-money-inventory.mjs\n');
  process.exit(1);
}

function runProductionScan() {
  if (!statSync(VENDOR, { throwIfNoEntry: false })?.isDirectory()) {
    console.error('✖ vendor-java-money-scan: vendor/ tree missing — cannot prove dual-book mutators banned');
    process.exit(1);
  }

  const scope = assertProductionScanScope();
  const result = scanVendorTree({ root: ROOT, vendorDir: VENDOR });
  if (result.failed) reportProductionFailure(result);

  const allowedTotal = VENDOR_JAVA_ALLOWLIST.reduce((sum, e) => sum + Object.values(e.rules).reduce((a, b) => a + b, 0), 0);
  const pomCount = scope.poms.filter((f) => isUpstreamPath(relPath(f))).length;
  console.log(
    `✓ vendor-java-money-scan clean — ${result.javaScanned} Java file(s) in ${UPSTREAM_REL} (floor ${MIN_PRODUCTION_JAVA}), ` +
      `${pomCount} pom.xml (floor ${MIN_MAVEN_POMS}), ${FORBIDDEN.length} live-write pattern(s) + ` +
      `${CODE_RULES.length} second-book shape(s), ${result.daoDeclarationsVerified} DAO mutator declaration(s) proved no-op` +
      `${allowedTotal > 0 ? `, ${allowedTotal} known write(s) held by the ratchet across ${VENDOR_JAVA_ALLOWLIST.length} file(s)` : ''}` +
      `${result.javaSkippedTests > 0 ? ` (${result.javaSkippedTests} vendor test source(s) skipped)` : ''}` +
      ` · SOURCE ONLY — not jar/runtime proof (see vendor-java-jar-truth / pnpm vendor-java:rebuild)`,
  );
}

proveFailClosedFixture();
if (process.argv.includes('--self-test')) {
  provePlantedSkip();
  process.exit(0);
}
runProductionScan();
