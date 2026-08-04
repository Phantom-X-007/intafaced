# ADR: what `socket.psp-partners` actually is, and why an orchestrator does not close it

**Status:** **Accepted — 2026-08-04.** Owner decision, stated and confirmed.
**Decision owner:** repo owner. **Written by:** Denon.
**Spec id:** D-S-10, **completing** it rather than opening it.
**Builds on:** [`SPEC-PAY-VERTICALS-2026-08-02.md`](../SPEC-PAY-VERTICALS-2026-08-02.md), which already decided the licence line for all six verticals — _"whose money is it while we are touching it, and are we ever the counterparty?"_ That spec stands unchanged and is the senior document. It did not cover the board's remaining column: **what Nitro may ship after #346, merchant durability, and card sandbox vs go-live.** That is what this adds, plus the Hyperswitch answer.
**Answers:** the standing question of whether to adopt [Hyperswitch](https://github.com/juspay/hyperswitch).

---

## The decision

> **`socket.psp-partners` is a commercial relationship, not a code gap. No library closes it. We do not adopt Hyperswitch.**

The socket's content is named in `posture.ts`: _card acquiring — a sponsor bank / acquiring BIN._ Hyperswitch is a payment **orchestrator**. It supplies connector code, a lifecycle and a vault. It does not supply a sponsor bank and it does not supply a BIN.

Adopting it would give us a hundred and twenty ways to reach acquirers we still have no relationship with. §24 Lane B already fixes the endgame: _"path to principal membership / own acquiring licences is the §13 socket."_ A library cannot be on that path.

This is settled. Agents and engineers implement it; they do not re-litigate it.

---

## Why this needed deciding rather than assuming

The first read of Hyperswitch against Doctrine §0.6 was wrong in an interesting way, and the correction is worth keeping because the same reasoning will recur with the next vendored system.

§0.6 says no module holds its own **balance**. Hyperswitch's schema is 45 tables carrying per-transaction amounts and statuses, and **no balance column anywhere**. It is an authority on what a PSP did, not a book of what anyone owns. So the letter of §0.6 does not forbid it — and the two vendoring ADRs already adjudicated exactly this tension: **"Yes for the product. No for the book."**

The thing that actually forbids it is elsewhere, and it is narrower and firmer:

- **Doctrine line 755** — _"No third-party connectivity library in the money path — Doctrine 5 applies."_ Directly on point.
- **The connectors are not extractable.** They are clean of the DB and Redis crates, but they speak `hyperswitch_domain_models`. "Connectors without the router" means porting the domain layer, in Rust, into a pnpm monorepo. There is no embeddable path; integration is necessarily a process boundary — which is to say, running their product, not using their code.
- **It does not close the socket.** Even granting every technical point, the blocker is unmoved.

The vault is separable — `locker_enabled` is a config flag and an external-vault mode exists — so "take the connectors, not the vault" was a real option. It is refused on the three grounds above, not on the vault.

---

## What actually blocks a card rail here

Two structural gaps, both ours, neither solved by any vendor.

**`RailAdapter` cannot express what a card rail does.** Ours knows `authorized | captured | refunded | failed | payout.completed`. A card rail needs partial capture, void, 3DS/SCA next-action, disputes, mandates and FX. `capture(ref)` takes a reference and nothing else — there is no shape for capturing less than was authorised. For scale: Hyperswitch's `IntentStatus` has seventeen variants and its `DisputeStatus` has seven.

**There is no chargeback recipe and no `disputes` table.** A card rail's most characteristic event has no compensating entry to post. The `disputed` status exists in the transition map as a dead end with no writer. **Until a chargeback can be posted, a card rail cannot be honest about what it did** — which is a §0.6 problem after all, arriving from the direction nobody was watching.

---

## Three defects in the current pay surface

**`socket.psp-partners` has no note.** Four keys, no `note` field — the least-documented socket on the board, and the only major one whose blocker is recorded solely inside a runtime error string. §13 requires a written reason. It gets one: _a sponsor bank and acquiring BIN are a commercial relationship; no code closes this._

**The posture vocabulary is two-level and asymmetric.** `ChainPosture` is three-valued on the port; `RailMode` is two-valued on the adapter; `absent` collapses to `sandbox`. A rail that is _missing_ and a rail that is _deliberately simulated_ therefore report the same thing, and the collapse runs in the unsafe direction — absence reads as a working sandbox. Make `RailMode` carry `absent` distinctly, or state in the type why it may not.

**Merchant state has no history and no writer.** `status='suspended'` is read and enforced by a code path that nothing writes. Merchant _money_ is already irreversible while merchant _state_ is unrecorded — so a suspension cannot be explained, dated, or undone, and an operator cannot answer "why is this merchant suspended" from the database.

---

## PR #346 lands. It is not closed.

Its conflicts are **entirely in generated board files** — a `features.mjs` row it flips to `done` that main has since rewritten. `git diff $MERGE_BASE origin/main` over its svc-pay paths is empty: in 364 commits nobody touched `payment-service.ts`, `router.ts`, `db/schema.ts` or any test underneath it.

It holds the **only KYB state machine in the repo**, plus `merchant.me`, `payment.list`, and the only card-acquiring E2E. Closing it loses all of that to save a generated-file merge. Resolve the board file and land it.

---

## A live contradiction in CI

`tooling/ci/unreported-suites.mjs` and `tooling/ci/gates.mjs` still name `svc-pay` as M1–M7 human-locked. Tip law says reclaimed. Two sources disagree inside the same CI run right now; one of them is wrong and neither knows it.

---

## Done bar for `pay.rails`

1. `crypto-native` is real and stays the day-one rail. It is not a placeholder for cards.
2. Any card work extends `RailAdapter` to carry partial capture, void, next-action and dispute **before** an adapter is written against it — not after.
3. A chargeback recipe exists in `packages/ledger-client` before any rail can report a dispute.
4. `RailMode` distinguishes absent from sandbox, or states why it may not.
5. No rail claims a capability its posture cannot back. Empty renders empty; unavailable is stated.
6. Sandbox is never reported as live, by any collapse, at any layer.

---

## What agents may implement without asking again

- Widening `RailAdapter` and `RailMode` as above, with tests.
- The chargeback and dispute recipes, to the money law.
- Writing the `socket.psp-partners` note.
- Merchant state history and its writer.
- Resolving #346's board-file conflict.

## What still needs the owner

- Any PSP or acquiring relationship. This is the socket.
- Reopening the Hyperswitch question.
- Pointing any rail at real money — Class X.
- Whether `svc-pay` is human-locked or reclaimed, which CI currently answers both ways.
