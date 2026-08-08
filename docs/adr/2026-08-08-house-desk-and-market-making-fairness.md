# ADR: the house desk and the market-making engine — what may be built before the owner rules

**Status:** **Partially Accepted — 2026-08-08.** The mechanism rules below are Accepted and agents implement them. The three questions in "What still needs the owner" are **not decided**, and until they are, `execution.house-tenant` and the internal half of `execution.market-making` **may not be built**.
**Decision owner:** repo owner. **Written by:** Denon.
**Law:** [`INTAFACED_DEFINITIVE_BUILD.md`](../../INTAFACED_DEFINITIVE_BUILD.md) §28 (`:770`–`:777`), the Throne Law at `:777`.
**Board:** `execution.sor`, `execution.arbitrage`, `execution.market-making`, `execution.house-tenant` — all boarded 2026-08-08 (#1127), all `blocked`.
**Binds:** [`adr/2026-08-05-futures-risk-and-mark-law.md`](2026-08-05-futures-risk-and-mark-law.md), [`adr/2026-08-04-matching-dual-target.md`](2026-08-04-matching-dual-target.md) (D-S-06).

---

## Why this ADR exists before any code

§28 says two things that are, as written, in tension with law we already Accepted.

**The Throne Law (`:777`):**

> "svc-execution is multi-tenant. The **house desk** runs as a sealed private tenant: separate keys, separate deployment namespace, strategies never in the product repo, never listed, never disclosed. The platform sells the rails, never the alpha."

**The HFT posture (`:774`):**

> "true microsecond HFT exists only where we own the venue: INTACORE and svc-matching, where our engine has structural first-class access."

**And the market-making engine (`:773`):**

> "the same engine seeds our books and works the street"

Put together: **a sealed, undisclosed house desk with structural first-class access to the venue our customers trade on, quoting both sides of the book we settle their trades against.**

Against that, this repo already decided:

> **A price that moves money is never supplied by the party it pays.**

That sentence was not abstract. It cost five findings in `svc-trade` in a single week, and one of them is exactly this shape at small scale: `futures/mark-from-depth.ts` discarded order size, so **two dust orders minted a payout-grade mark and moved 2,000 USDT** against a book worth femto-cents. An internal market maker is that same actor, institutionalised, funded, and running continuously.

**None of this means the house desk is wrong.** Every serious venue runs one, and §28's separation-of-keys posture is stronger than most. It means the fairness boundary is a product decision with money and reputation attached, and it must be made deliberately rather than discovered in an implementation.

---

## What is settled, and binds regardless of how the owner rules

Agents implement these now. They are not open.

**1. Internal quotes may seed liquidity. They may never become a mark.**
This follows from law already Accepted and needs no new ruling. A mark that moves money is subject to the `prices.ts` gates — `MarkQuality`, staleness, the deviation breaker armed against a stored basis, and `bestLevelIsQuotable`'s minimum resting notional. **A quote posted by the platform cannot be an input to a price the platform then pays out on**, whatever the tenancy arrangement. If the internal MM is the only resting size, the book is not payout-grade and the mark refuses — exactly as it does today for a dust book.

**2. No structural queue advantage may be implemented.**
§28`:774`'s "structural first-class access" describes owning the venue — colocation-by-construction, no network hop. It is **not** authority to give the house tenant earlier order visibility, priority in the matching sequence, cancel privileges customers lack, or a lower latency path _inside_ the engine. Those are different things and only the first is settled. **Until the owner rules, matching treats the house tenant as an ordinary participant.** An agent that finds itself writing a branch on tenant identity inside the matching path has left the settled zone and must stop.

**3. D-S-06 stands: one book, and the router may not favour us structurally.**
`packages/venue-adapter/src/router.ts`'s bounded, tested **5 bps** internal tie-break is the whole of the permitted preference. The SOR extends the _cost model_ with §28`:770`'s missing terms — fees, expected impact, latency grade, transfer cost — it does not add a second preference rule. No second book, no second ranking.

**4. Sealed does not mean unaudited.**
"Strategies never in the product repo, never listed, never disclosed" is about **alpha**, not about **money**. The house desk's positions and fills move value, so they are ledger movements under Doctrine §0.6 like everyone else's: `packages/ledger-client` recipes, the same invariants, the same reconciliation. **A tenant whose fills do not reconcile is a second book**, which D-S-06 forbids by name. Secrecy of strategy is compatible with full accounting; secrecy of balances is not.

**5. Kill-switches and risk spine apply to the house tenant first.**
§28`:775` requires pre-trade checks, exposure caps, drawdown halts and a global admin kill-switch. §14.6 already requires every route killable and failing closed. **The sealed tenant is not exempt from the kill-switch**, and the admin console must be able to halt it. A tenant that cannot be stopped from the console is not a tenant, it is a second platform.

---

## What still needs the owner

Three questions. Each changes what gets built, so none can be defaulted.

### Q1 — Does the house desk trade on our own venue at all, or only external ones?

The MM engine `:773` explicitly does both — "seeds our books **and** works the street." These are very different products:

- **External-only** removes the conflict entirely. The house desk becomes a customer of other venues; our book stays customer-only; the fairness question disappears rather than being managed.
- **Internal too** is what §28 says, and is standard for real venues, but it means the operator trades against its own users on infrastructure it controls. That is a disclosure and possibly a licensing question in the compliant plane, not only an engineering one.

**Recommendation: external-only for v1, internal seeding behind an explicit later ruling.** The reason is not squeamishness — it is that everything else in §28 (SOR, arbitrage, cost model, execution reports) can be built and proven against external venues with no fairness surface at all, and the internal question can then be answered with a working engine in hand instead of in the abstract. **This is a recommendation, not a decision.**

### Q2 — If the house desk trades our venue, is that disclosed to users?

The Throne Law says "never listed, never disclosed." That is unambiguous about **strategies**. It is silent about **existence**.

Not the same choice:

- **Strategy secret, existence disclosed** — "the platform operates a market-making desk on this venue" in the terms. Compatible with the Throne Law as written, and it is what regulated venues do.
- **Existence also secret** — defensible for pure alpha, much harder to defend if a user later discovers the counterparty to their fill was the operator.

This one has real downside risk and honesty doctrine points hard at disclosure. **It is still the owner's to rule** because it is a positioning decision, not a correctness one.

### Q3 — Where is the boundary between "seeds our books" and "supplies a price that moves money"?

Even under the settled rule that internal quotes may not become a mark, there is a residual: an internal MM that is a large fraction of resting size **influences** the mark that other participants' liquidations settle against, without ever "supplying" it in the direct sense the futures ADR forbids.

The honest options are a cap ("the internal MM may be at most N% of resting notional at the best level before its quotes are excluded from mark derivation") or a hard exclusion (internal quotes never counted in mark derivation at all, at the cost of a thinner mark on young markets).

**Recommendation: hard exclusion, and accept the thinner mark** — because a percentage cap requires picking N, and this repo already has one unruled parameter (`DEFAULT_MIN_BEST_LEVEL_NOTIONAL = '100'`) waiting on the owner. Two unruled numbers governing the same path is drift. **Owner's call.**

---

## What agents may implement without asking again

- `execution.sor` — the router, cost model and execution reports, **against external venues**, extending D-S-06's existing tie-break rather than replacing it.
- `execution.arbitrage` — the opportunity scanner, risk-checked sizing, leg execution and per-class PnL attribution, **on external venues**.
- The **external-venue** half of `execution.market-making` — quoting models, cross-venue hedging, kill-switches on volatility and inventory breach.
- The risk spine, pre-trade checks, exposure caps, drawdown halts and the admin kill-switch — for every tenant including the house one.
- Multi-tenancy as a **mechanism** — separate keys, separate namespace, per-tenant scoping and audit — with **no tenant granted any matching-path privilege**.

## What may not be built until the owner rules

- `execution.house-tenant` **on our own venue**. The tenancy mechanism may be built; pointing it at our book may not.
- The **internal** half of `execution.market-making`.
- Any mark-derivation change that counts internal quotes.
- Any branch on tenant identity inside `svc-matching`'s ordering or visibility.

---

## Done bar for the parts that are Accepted

1. The SOR ranks on the D-S-06 cost model with no internal preference beyond the tested 5 bps. Proven by a test that puts our book at a worse price and asserts it loses.
2. Internal quotes are excluded from, or provably cannot dominate, any payout-grade mark. Tested with an internal quote as the only resting size, asserting the mark **refuses**.
3. The house tenant's fills reconcile through `packages/ledger-client` like any other participant. Tested by `reconcile()`, not by inspection.
4. The admin kill-switch halts the house tenant. Tested by halting it, not by asserting the button exists.
5. No code path branches on tenant identity inside matching. **Asserted by a test, not by a comment** — this repo produced five guards this week that were correct in isolation and unreachable in place, each with a comment claiming the property the code lacked.
