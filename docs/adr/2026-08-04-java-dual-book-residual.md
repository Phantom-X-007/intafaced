# ADR: what the Java dual-book neutering actually guarantees, and what it does not

**Status:** **Accepted — 2026-08-04.** Owner decision, stated and confirmed.
**Decision owner:** repo owner. **Written by:** Denon.
**Spec id:** D-S-17.
**Builds on:** [`2026-08-02-adopt-vendored-product-keep-our-ledger.md`](2026-08-02-adopt-vendored-product-keep-our-ledger.md) ("Yes for the product. No for the book."), which is unchanged. This ADR states the **residual** that decision left, because the residual has been read as smaller than it is.

---

## The decision

> **The Java shell's balance writes are neutralised by four mechanisms of very different strength, and only two of them hold at runtime. The scan is a source gate; the deployable artifact is not built from the scanned source. Neither fact may be described as "the Java book is closed."**

The adoption ADR is correct and stays. What follows is what an honest status line for it says.

This is settled. Agents and engineers implement it; they do not re-litigate it.

---

## What is actually true today

63 balance-write sites survive across 29 files. **Zero are redirected to `packages/ledger-client`.** The allowlist in `vendor-java-money-scan.mjs` is a work queue — each entry names a target recipe (`escrowLock`, `tradeFill`, `withdrawSettle`, `rewardPay`, `deposit`) and not one of those mappings has been implemented.

| Grade | Count | Held by                                                 | Holds at runtime?                                |
| ----- | ----- | ------------------------------------------------------- | ------------------------------------------------ |
| **A** | 7     | DAO `@Query` no-op `WHERE 1 = 0`; service `throw`       | **Yes.** Re-proved every scan run, no allowlist. |
| **B** | 29    | `IllegalStateException` from `MemberWalletService`      | **Yes.** The exception is real.                  |
| **C** | 12    | The HTTP 410 door interceptor only                      | **Partly.** See below.                           |
| **D** | 10    | A `= null` assignment or an unconditional `return;`     | **No. Nothing stands here.**                     |
| —     | 5     | Not balance writes; listed rather than pattern-excluded | n/a                                              |

---

## The four things this means, in the order they change the answer

### 1. The scanned source is not the running binary

Compose runs `<module>/target/<module>.jar`. Those jars are **gitignored and untracked**, built 2026-07-29. Every neutering commit landed **2026-07-31 → 2026-08-02**. The jars predate all of it, and the compose file itself records that this host "cannot do (no JDK, no mvn)" a rebuild.

So `✓ vendor-java-money-scan clean` is a true statement about source that nothing in this repo can compile into the thing that would execute. **This is the same defect class as a scan that walks zero files** — the check is real and its object is not the object that matters. Four gates were landed to close that class at the file level; this is it at the artifact level.

**Rule: no claim about Java runtime safety may cite a source scan as its evidence.** The gates prove what the source says. They prove nothing about the jar.

### 2. Ten sites are held by nothing, and four are beyond the door by construction

Grade D has no throw, no `WHERE 1=0`, no door — only a `= null` line and a static allowlist. Restore one assignment and the mint is live.

Four of those are not merely undoored but **undoorable**: `wallet:MemberConsumer:149` is a Kafka consumer; `admin:OrderEvent` and `otc-api:OrderEvent` are Spring event listeners. An HTTP interceptor cannot reach any of them, so no amount of door work fixes this. They must be **deleted**, not disabled.

### 3. The door covers less than it reads

- **`admin` has no compose service at all.** Eight of the twelve Grade C sites live there, so their 410 has never executed once. That includes `admin:MemberWalletController` — the most direct mint in the tree — and `admin:DividendController`, which credits every holder of a coin in one request and is the one Grade C site with an explicit `save()`.
- **`otc-api` is in compose but cannot boot** — three documented defects, one of them (shiro-quartz) deliberately not worked around, because "committing an unverifiable binary onto the classpath of a money service is the exact practice the adoption ADR objects to." That reasoning is right and stays.
- **The biggest seam is not HTTP.** `exchange-core:ExchangeOrderService` holds eight Grade B sites on the trading path, reached from `ExchangeTradeConsumer` over **Kafka**, from scheduled jobs, and from Spring events — never from `/order/add`. Only the service-level throw stands there.

### 4. The "four mutators" seam never covered debits

The adoption ADR names `increaseBalance`, `decreaseBalance`, `freezeBalance`, `thawBalance` as "the exact seam". **`decreaseBalance` has zero call sites.** It exists only as a DAO no-op declaration; `MemberWalletService` has no such method.

Debits were never done through a mutator. They were done as `setBalance(x.subtract(y))` on a Hibernate-managed entity, which flushes at commit — and that is the entire 27-site class PR #422 discovered. The seam was true of the **names** and false of the **coverage**, and the sentence should be read that way from here.

---

## Corrections to the record

- **Jar count is 32, not 31.** The "31" at `vendor/.gitignore:11` and in the adoption ADR is wrong; `docs/UPSTREAM-ADOPTION-QUEUE-2026-08-02.md` already carries the right figure. Eighteen sit inside `01_wallet_rpc`, including **`bitcoinj-core-0.13-alice-SNAPSHOT.jar`** — a snapshot build of an unnamed fork, on the classpath of the two modules that mint keys with `new ECKey()`.
- **`*.jar` is not marked binary** in `.gitattributes`; `git check-attr` returns `text: auto` on a wallet jar.
- **The adoption ADR's "32 call sites are all of this grade" is an overcount.** The Grade B budget is 29; 32 is reached only by including the three Grade A declarations. The new ratchet arithmetic should reconcile to 29.
- **`core` may not compile from source.** `MemberApplicationService` has a comment, an unconditional `return;`, then a further statement in the same block. Under JLS §14.21 that is an _unreachable statement_ — a compile **error**. Unverified here because nothing in this environment can run `mvn`; verifying it is a precondition for any plan that rebuilds the jars.

---

## What "done" for the Java residual requires

In order. Each step is independently landable.

1. **Delete the ten Grade D sites.** They are reward mints with no ledger equivalent built, so there is nothing to redirect them to. Deleting the mint and keeping the surrounding workflow is the honest move; a `= null` short-circuit is a booby trap for the next author.
2. **Resolve the compile question.** If `core` does not build, nothing downstream is real.
3. **A reproducible build.** A source scan that cannot be tied to the artifact is a claim about a file, not a system. Until a jar can be built from scanned source in CI, the runtime posture is unverified — say so rather than implying otherwise.
4. **Move the Grade C twelve off the door.** A door on a module with no compose service is not a control. Either give `admin` the same service-level throw the mutators have, or delete the sites.
5. **Implement the queue.** Thirty-six sites currently throw. Each `Queue:` target is a real recipe; a throw is a holding position, not an outcome.

---

## A stale instruction in a live law document

[`DIRECTION-2026-07-31.md`](../DIRECTION-2026-07-31.md) §4 made this decision ("**DECIDED. Option B**") and named two enforcement gaps that must close with it. The first reads:

> "**`custody-scan` walks `.ts`/`.tsx` only — it has never read a line of Java.** Fix it, or this decision is unenforced."

**That instruction is wrong and must not be followed.** `custody-scan` is a **Protocol Plane** gate; it derives its service list from `packages/config/src/modules.ts` and enforces §16.10 non-custody. Java custody is a different question with a different gate — `vendor-java-money-scan`, which now exists and does the job. Extending `custody-scan` to Java would extend the wrong gate and weaken both.

This was already proposed twice and corrected twice; the correction is recorded in `custody-scan.mjs`'s own header. It is repeated here because **§4 is still on main saying the opposite**, and an agent reading the law document rather than the gate will do the wrong thing in good faith. §4's second gap (invert `vendor-shell-scan`) was real and is closed.

---

## Standing rules

- **Do not extend `custody-scan` to Java.** See above. Do not propose it a third time.
- **The ratchet freezes by exact matched text, never by count.** A count-based ratchet lets one site be removed and another added.
- **A gate whose walk can be empty must fail loudly.** Applies to every scan in `tooling/ci/`, and is the reason `custody-scan` exits 1 on an empty derivation rather than printing a tick.
- **Do not add a jar to make something boot.** Stated once for `otc-api`; it holds generally.

---

## What agents may implement without asking again

- Deleting Grade D sites and tightening the ratchet accordingly.
- Adding a service-level throw where only a door stands.
- Implementing any queued recipe redirect, to the money law.
- Correcting the jar count, `.gitattributes`, and the ratchet arithmetic.

## What still needs the owner

- Running `01_wallet_rpc` against real value — untouched, owner-gated, and the security review of that tree is commissioned to nobody, sized XL, and unstarted.
- Any decision to vendor a prebuilt jar.
- Retiring the vendored shell, or committing to rebuild its jars in CI.
