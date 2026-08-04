# ADR: algo execution — a schedule is not a position, and progress is not a fill

**Status:** **Accepted — 2026-08-04.** Owner decision, stated and confirmed.
**Decision owner:** repo owner. **Written by:** Denon.
**Spec id:** D-S-04.
**Builds on:** [`DIRECTION-2026-07-31.md`](../DIRECTION-2026-07-31.md) §1, which already decided the scope: **"Algo v1 = TWAP only. Icebergs are OUT."** That stands. This states the product law underneath it.
**Ground truth at time of writing:** `trade.algo` has **zero lines of code**. `services/svc-trade/src/` holds `convert`, `futures`, `mm` and `spot` and nothing else. This is a greenfield law, not a description.

---

## The decision

> **An algo order is a schedule that emits child orders. It is not an order, it does not hold a position, and it never holds value.**
>
> The parent has no balance, no fill, and no P&L. Everything real that happens, happens on a child order that went to the book like any other. A user's position after an algo is exactly the sum of its children's fills — never a number the scheduler computed.

This is settled. Agents and engineers implement it; they do not re-litigate it.

---

## Why this is the load-bearing sentence

Every dishonest execution product in this category makes the same move: the parent starts to look like the thing that trades. Once it has its own average price, its own progress percentage and its own notion of "filled", there is a number on the user's screen that no fill produced. From there, showing a plausible number when the book was empty is a UI decision rather than a fabrication, and nobody notices the moment it crossed.

**So the parent is deliberately impoverished.** It knows its schedule, which children it has emitted, and what those children reported. It computes nothing else. If a user asks "how much have I bought", the answer is a sum over real fills or it is nothing.

`tooling/ci/fabricated-money-scan.mjs` exists to catch exactly this class, and it is currently at zero findings. An algo implementation is the most likely thing to reintroduce them.

---

## Scope for v1

**In:** TWAP — a total quantity, a duration, and a slice interval. Child orders sized by the schedule, placed on the real book.

**Out, and each for a reason:**

- **Icebergs.** `DIRECTION` §1: "a hidden order that leaks through matching-engine timing is worse than no hidden order, and proving it doesn't leak is its own project." A hidden order that is inferable is a false promise of privacy, which is worse than the honest absence of the feature.
- **VWAP and POV.** Both need a **volume** input the platform cannot currently produce honestly. `mm` seeded volume is excluded from every user-facing statistic by §1, so real volume on a young book is thin and often zero — and an algo that participates at 10% of a volume figure that is mostly our own bot is a machine for trading against ourselves. **These become buildable when a real volume series exists, not before.** The tracker row names them; the tracker row is aspirational and should say so.
- **Anything discretionary.** A schedule executes. It does not decide.

---

## The rules

### 1 · A child order is an ordinary order

It goes through the same path, the same risk checks, the same ownership gates, the same ledger recipes as a manually placed order. **There is no privileged path.** If an algo child can do something a user's own order cannot, the algo has become a way around a control.

It is attributable: a fill's provenance says which parent emitted it, and the user can see that.

### 2 · A slice that cannot fill is a refusal, not a skip

When the book cannot take a child at an acceptable price, the algo does not silently move on and quietly reduce what it will ever deliver. It records the miss, surfaces it, and continues or halts per policy — but the user's view shows **what was attempted and what happened**, not a schedule that appears on track.

An algo that shows 60% complete while 40% of its slices silently failed is lying with true numbers.

### 3 · Refuse cases

| Situation                                        | Correct answer                                                                      |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Market closed or not listed                      | **Refuse at creation**, naming the market. Never accept a schedule that cannot run. |
| No liquidity for this slice                      | **Record the miss**, do not fill, do not fabricate. Continue per policy.            |
| Price outside the acceptable band                | **Skip the slice and say so.** Never widen the band to make it fillable.            |
| Mark unusable (stale, non-positive, wrong class) | **Halt.** Reuse the `prices.ts` vocabulary — see below.                             |
| Insufficient balance mid-schedule                | **Halt and state it.** Never partially fund from elsewhere.                         |
| User cancels                                     | In-flight children are **cancelled or allowed to complete**, never orphaned.        |

### 4 · Cancellation and pause are exact

A cancelled algo emits no further children. Children already on the book have a stated disposition — cancelled, or left to fill — and it is the same disposition every time, not a race. **A paused algo is not a cancelled algo**; resuming does not re-run elapsed slices, because time has passed and the schedule was a claim about time.

### 5 · The price vocabulary is already written — do not respell it

`services/svc-bank/src/loans/prices.ts` decided when a price may move someone's money: `MarkQuality` (`'mid' | 'last' | 'index'`), the four-field `MarkPolicy`, the split accept/refuse gates. [`adr/2026-08-04-bank-vertical-law.md`](2026-08-04-bank-vertical-law.md) binds `trade.futures` to it and **binds algo to it too**.

A second vocabulary meaning the same thing is how two subsystems come to disagree about what a stale price is.

### 6 · Value moves only through fills

No algo state transition posts to the ledger. There is no "algo reserve", no parent-level hold, no scheduler account. Balance effects arrive when a child fills, through the recipe that child would have used anyway.

If a design needs the parent to hold value in order to work, the design is wrong.

---

## Non-goals

- **This is not a smart order router.** One market, one book. Routing across venues is `venue.aggregation` and is unspecced.
- **This does not make `trade.algo` a Done candidate.** Doing TWAP honestly is the whole v1; VWAP and POV stay out with the reason above recorded on the row.
- **This says nothing about algo on futures.** Futures risk law is D-S-01 and is still partial. Algo on a perp waits for it.

---

## Done bar

1. The parent holds no value, no position and no computed fill. Proven by a test that asserts the parent has no balance-bearing field at all.
2. Every user-visible quantity traces to a real fill. A test drives a schedule against an **empty book** and asserts the result is zero progress and a stated reason — not a spinner, not an error, not a plausible number.
3. Child orders take the identical path to manual orders, including every ownership and risk gate.
4. Every refuse case in the table has a test.
5. Cancel and pause have exactly one behaviour each for in-flight children, pinned by test.
6. `fabricated-money-scan` stays at zero.

---

## What agents may implement without asking again

- TWAP to the rules above, in `svc-trade`, against the real book.
- The child-order provenance link and its user-visible surface.
- Every refuse case and its test.

## What still needs the owner

- VWAP, POV, or any volume-participating algo — blocked on a real volume series, not on code.
- Icebergs, or any hidden-order product.
- Algo on futures — waits on D-S-01.
- Any fee or rebate specific to algo execution. `DIRECTION` §8 still holds every rate.
