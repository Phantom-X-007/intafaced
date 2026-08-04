# ADR: an unconsumed event is a socket only when nothing was promised

**Status:** **Accepted — 2026-08-04.** Owner decision, stated and confirmed.
**Decision owner:** repo owner. **Written by:** Denon.
**Spec id:** D-S-13.
**Ground truth:** `event-wiring` reports **32 declared events: 14 wired end to end, 18 recorded sockets with a written reason.** The gate is good and the reasons in `packages/events/src/catalog.ts` are unusually honest. This ADR does not ask for more discipline — it asks for the eighteen to be **sorted**, because they are not all the same thing.

---

## The decision

> **An unconsumed event is a §13 socket when nothing depends on the consumer existing. It is a defect when a user already believes something the missing consumer would have to be true for.**
>
> The test is not "is there a consumer". It is: **does anyone — user or operator — currently hold a belief that the missing wiring would have to deliver?** If yes, the feature is broken and the socket entry is concealing it.

This is settled. Agents and engineers implement it; they do not re-litigate it.

---

## Why the current record is not enough

Every one of the eighteen carries a written reason, and the reasons are candid to the point of shouting — "PUBLISHED INTO THE VOID", "and NEITHER EXISTS". That is the honesty doctrine working.

But `event-wiring` counts them identically, so the gate's clean line covers both **"the stream is a durable record ahead of its first reader"** and **"a borrower is never told their loan is being margin-called."** Those are not the same fact, and a check that reports them with one number is a check that will let the second one sit forever.

**A written reason proves someone thought about it. It does not prove the answer was yes.**

---

## The three classes

### Class A — record ahead of its reader. A true socket. Fine indefinitely.

The event exists, is durable, and **nothing anywhere claims it does more**. Building the consumer later is additive.

By the catalog's own reasoning, these qualify:

- `ledgerTxPosted` — "THE money event... the stream retains 90 days and carries the hash chain, so an audit or read-model consumer can be built later and replay from the start. **Nothing today derives state from it, and nothing claims to.**" That last clause is the whole test, passed.
- `ledgerFreezeUpdated` — "Freeze state is DURABLE, not a process signal: every replica reads the same row, **which is precisely why nothing has to subscribe to stay correct.**"
- `orderAccepted` — "acceptance moves no money and releases no hold, and svc-trade already knows it submitted the order... **Genuinely nothing to do with it today.**"
- `userCreated` — every module resolves users through `packages/contracts` instead, "so **nothing is missing a fact it needs**".
- `buybackExecuted` — settled through the ledger before publication, "so **no consumer is load-bearing**".
- `ledgerReconciliationFailed` — the freeze is performed in-process; "the event is the external announcement, not the mechanism", and "**the freeze does not depend on that path existing.**"

Each states, in its own words, that no behaviour depends on the gap. That is what a socket looks like.

### Class B — a promise with no delivery. Not a socket. A defect.

Something a user or operator can observe is already premised on the missing consumer. The reason field describes a **bug**, accurately, in the register of a design note.

- **`bankMarginCalled`** — "svc-bank raises the call durably... **svc-notify's consumer is complete and parks on it at every boot.**" A margin call is raised, a grace clock starts gating liquidation, and the borrower is never told. `risk.ts` argues at length that liquidating without prior notice means "the borrower's first notice of the loan would be its liquidation receipt" — **and that is the current behaviour**, because the notice has no transport. The consumer is finished and waiting. This is not deferred work; it is a broken safety property with the fix already half-built.
- **`xpEarned`** — "**PUBLISHED INTO THE VOID.** svc-p2p and svc-trade both publish... svc-identity subscribes only to blueprintCreated/blueprintDeleted... P2P and trade XP is retained by JetStream and read by nobody. **The idempotency keys are even shaped to match `identity.xp_events.idempotency_key`, a handshake with a consumer that does not exist.**" Users earn XP that never counts. If any surface shows a rank or an XP total, it is wrong for everyone who earned it through P2P or trading.
- **`crewMemberCreated`** — "The description above names two consumers — 'svc-academy routes the lobby, svc-agents opens the crew channel' — and **NEITHER EXISTS.**" The catalog is explicit that it kept the description _as the specification those services owe_ rather than softening it. Correct instinct, wrong register: an owed specification is a work item, not a socket.

### Class C — owned and unbuilt. A socket with a name on it.

The consumer belongs to a service that is claimed, human-locked, or not yet started, and **the gap is disclosed wherever a user could otherwise be misled**. `bankMarginCalled` would be Class C rather than B if the loan surface said "notifications unavailable" — it does not, so it is B.

---

## The rule

**Class A and C may be sockets. Class B may not.**

A Class B entry is a defect and is tracked as one, with the reason field kept verbatim — it is already a better bug report than most. Reclassifying does not require fixing it today; it requires it to stop counting as clean.

### The consequence for the gate

`event-wiring` must report the three classes separately. Its clean line currently reads:

```
32 declared event(s): 14 wired end to end, 18 recorded socket(s) with a written reason
```

A socket declaration is a claim that nothing is broken, and **that claim needs to be checkable** — not merely accompanied by prose.

**The pre-existing Class B entries are pinned by a hand-written list, not failed unconditionally.** The gate goes red when a **new** Class B appears, when a pinned entry is silently reclassified or resolved, or when the list is edited without the entry changing. The pinned entries themselves print on every run and do not fail the build.

See the correction below for why. This is the same defect class the repo has closed four times already: a check that reports on something real, in a shape that gets read as evidence for something it never examined.

---

### Correction — 2026-08-04, same day. And it is the second time.

This ADR first said the gate _"must not be able to print a clean line while any Class B entry exists"_, flatly. An agent implemented it faithfully, and the result was `event-wiring` **red on main with no path to green** — because this same ADR puts `crewMemberCreated`'s consumers on the owner. No agent could ever clear it, and it would block every unrelated merge until a human ruled.

**I made the identical mistake in [D-S-14](2026-08-04-token-economics-outcomes.md) the same afternoon**, and the repetition is the useful part. The general rule I should have written both times:

> **A gate that freezes a pre-existing finding pins it by an explicit hand-written list. It does not fail unconditionally.**

This is not a new idea — **it is what this repo already does everywhere**. `fabricated-money-scan` froze 12 findings. `vendor-java-money-scan` froze 63, now 55. `wallet-rpc-mainnet-scan` froze 38. **Not one of them fails on its pre-existing set.** Each pins it and fails on deviation, and that is precisely why they are still in the build rather than disabled.

The reason the ratchet is right and the flat failure is wrong: a red that must be routed around to get any work done is a red that gets deleted, and it takes the honest part with it. The pin achieves the actual requirement — the finding cannot be shipped further, resolved silently, or forgotten — without holding the repo hostage to a decision that is not the gate's to make.

**Two ADRs, one mistake, one afternoon.** Recorded here rather than quietly fixed, because an author who states a rule twice and gets it wrong twice should say so where the rule lives.

---

## Non-goals

- **This does not require every event to have a consumer.** Class A is legitimate and permanent. An event bus whose every subject must be consumed is an event bus nobody will declare into.
- **This does not soften any description.** The catalog's choice to keep `crewMemberCreated`'s description as an owed spec is right and stays. Descriptions state what the system is for; sockets state what is not built. Neither is edited to match the other.
- **This does not decide which Class B item is fixed first.** `bankMarginCalled` is the obvious candidate — the consumer is complete, and the missing half is a publish in a service whose ownership is settled.

---

## Done bar

1. Every one of the 18 sockets carries an explicit class: A, B or C.
2. `event-wiring` reports the classes separately and **fails on any Class B**.
3. Zero Class B entries — each is fixed, or reclassified to C with the gap disclosed at every surface a user could read.
4. No surface displays a value derived from an event nobody consumes. Specifically: no XP total or rank is shown while `xpEarned` is unconsumed.
5. A new socket declaration must state its class; the gate rejects one that does not.
6. Reclassifying B to C requires the disclosure to exist in code, not in the reason field.

---

## What agents may implement without asking again

- Classifying all 18 entries and extending `event-wiring` to enforce it.
- The `bankMarginCalled` publisher in `svc-bank` — `svc-notify`'s consumer is already complete and the catalog docstring specifies the split.
- The `svc-identity` `xpEarned` consumer, whose idempotency-key shape is already agreed on both sides.
- Disclosing any Class C gap at the surface.

## What still needs the owner

- Whether XP surfaces are hidden or shown-as-incomplete while `xpEarned` is unconsumed. That is a product call.
- Any new event subject that moves money.
- The `crewMemberCreated` consumers, which belong to services with their own scope questions.
