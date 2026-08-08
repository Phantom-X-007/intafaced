# AFK residual STOP — Claude session, 2026-08-08

**Tip at writing:** `18755dd9` — `fix(ledger-client): delete a hold builder every post refuses, and guard the rest (#1054)`
**Peer:** a second agent session ran the same night in `svc-ledger` / `svc-trade` (#1047, #1049, #1050, #1051, #1055, #1057, #1058).

This session took the two lanes the peer was not in: `svc-notify` durability and
`packages/ledger-client` / `packages/events`. Everything below is re-derived from
`git`, from `gh`, and from CI runs — where something could not be checked here,
it says so.

---

## 1 · What landed

| PR    | What it fixed, in plain terms                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------ |
| #1053 | A margin call nothing was retrying still read as **"pending"** on the screen its own recipient reads         |
| #1054 | An account builder whose every output the ledger refuses — deleted, plus the check that would have caught it |

Both were the same failure class, which is the one this repo keeps producing:
**something the code promised in writing that it did not do in some reachable
state.**

### #1053 — the sweep that had to exist

`abandoned` had exactly one writer: the retire branch inside `claim()`, which
runs only when a **later** bus redelivery arrives. There is not always a later
one. `max_deliver` is 5 and `NOTIFY_MAX_DELIVERY_ATTEMPTS` accepts 1–5 — the
README's own env table blesses "1–5, at or below the bus `maxDeliver`" — so the
delivery that spends the last attempt can be the same delivery JetStream then
parks. No sixth message arrives, `claim()` is never called again for that pair,
and the row sits `pending` forever.

The README says the opposite, and says why it matters: `notify.deliveries` is
user-facing on purpose, because _"if a margin call's email never went out, the
person whose collateral is at risk is the one who most needs to see it."_
`pending` on that screen means help is still on the way.

The sweep retires those rows on **the same predicate `claim()` retires on**, so
it writes only what the next claim would have written — never a send, never an
ack, never an `accepted_at`, and never a row whose lease is still live.

### #1054 — a constructor that could not have worked

`subAccountHold` returned `kind: 'hold'` with no purpose, and
`assertPurposedLocks` refuses every unpurposed lock account. Zero callers,
because it could not have had a working one.

It was the only one, and that was re-derived rather than assumed: of nineteen
account literals in `accounts.ts`, five build a lock kind and four already
require a purpose; a repo-wide grep for lock-kind literals outside that file
finds nothing. The deletion ships with a sweep over the module's **own exports**
— not a list somebody maintains — plus two anti-vacuity assertions, because a
sweep that silently matches nothing passes forever.

---

## 2 · In flight when this was written

| PR    | State                                                                                    |
| ----- | ---------------------------------------------------------------------------------------- |
| #1056 | `svc-notify` inbox — memory engine fixed to match Postgres, two-engine conformance suite |
| #1059 | `packages/events` — the bus announces a message it has given up on                       |

Both had `pnpm verify` pass locally with the run labelled INCOMPLETE (no local
Postgres, no local NATS). Their gates are CI's to report, not this note's.

---

## 3 · Findings raised and NOT fixed — each with the reason

### 3.1 `money.ts` states a rule its own file breaks

`packages/ledger-client/src/money.ts`, file header:

> Rounding is always explicit. **There is no default rounding mode**, because
> "whichever way the language rounds" is how a book drifts.

There are three. `mul` and `div` default to `'half-up'` while their own
docstrings say _"Rounding must be stated."_ (`mulBps`'s `'ceil'` default is
different — it is documented and deliberate, and is not part of this finding.)

Four call sites take the silent default today, and they are not test code:

- `packages/venue-adapter/src/consolidated-book.ts:141` — cost accumulation
- `packages/venue-adapter/src/router.ts:232,233` — routed cost and average price
- `packages/venue-adapter/src/fabric/cross-check.ts:201` — a bps computation
- `services/svc-trade/src/private-rest.ts:197` — cost basis, formatted straight
  to a user

Nothing is provably wrong today; `'half-up'` is a defensible neutral. What is
wrong is that a reader who trusts the header will not check call sites, which is
the entire purpose of writing the rule down.

**The fix that would make the promise true is to make `rounding` a required
parameter**, so the compiler enforces it permanently. That is a cross-package
change, and one of the four callers is in `services/svc-trade` — which
`claim-check` reports human-claimed, and where the gate's own wording is "an
agent must NOT implement here." Reporting is allowed; implementing is not. Same
posture as §4.1 of the 2026-08-08 stop note.

**Needs:** either an `agents free on services/svc-trade` ruling, or a human to
take it. It is a two-line change per call site once the gate is settled.

### 3.2 The two ledger engines still disagree on ordering — and the memory rationale is provably wrong

This is §4.2b finding 4 of the previous stop note, re-read at the source. Two
things are now established that were not before.

**Both engines justify their own order, in comments, and the comments
contradict each other.**

`MemoryLedger.post` (`packages/ledger-client/src/memory-ledger.ts`):

> Idempotency first: a retry must never re-run the invariant checks against a
> book that already contains its effects.

`PostgresLedger.post` (`services/svc-ledger/src/ledger/postgres-ledger.ts`):

> Pure validation first: sum-to-zero, funded locks, key length. No point opening
> a transaction for a request that can never be legal.

**The memory comment is false about its own code.** `assertValidPost` is a pure
function of the request — it reads no balances and no book state. The
book-dependent checks run later, in the staging step, after the idempotency
return. So the reason memory gives for its ordering protects nothing that was
ever at risk, and the divergence exists for no stated reason at all.

**But the safer BEHAVIOUR is memory's, and production runs Postgres.** Replaying
a committed idempotency key with a body that a tightened rule now rejects:

- memory returns the original transaction — the retry learns the work is done
- Postgres throws — the caller may read a **committed** post as failed, and a
  caller that then compensates or re-posts under a new key double-posts

That is a deploy-boundary scenario, not a today scenario, and it is the only
direction in which this costs money.

**Why it is not fixed here:** making them agree is a correctness fix, but
choosing _which_ order is a money judgement with a real asymmetry, and the
Postgres side lives in `services/svc-ledger`, where the peer session had open
PRs all night. Changing only the memory side would make the reference
implementation match production while making it **less** money-safe — a silent
downgrade dressed as a conformance fix.

**Needs:** an owner's call on the order, then one change on each side plus a
conformance case that replays an invalid body after commit. The existing
conformance suite only ever replays a _valid_ request, which is why the
divergence has been invisible to the one suite whose whole job is forbidding it.

### 3.3 A non-`Error` throw from a handler takes the consumer down

`packages/events/src/jetstream-bus.ts`, in the subscribe pump:

```ts
msg.nak(nakBackoffMs(attempt));
if (!(err instanceof Error)) throw err;
```

That `throw` escapes the `for await` loop. `pump` is a floating promise with no
handler attached until `unsubscribe()` is called, so a non-`Error` throw either
ends the consumer loop or reaches Node's unhandled-rejection handling — and
`/ready` keeps reporting `consumers: subscriptions.length`, which does not change
when a pump dies.

**Not fixed because it is not proven.** A handler that throws a non-`Error` is
reachable in principle (`throw 'boom'`, a library rejecting with a string) and
was not found anywhere in this repo. The nak happens first, so no message is
acked either way. Worth a test before a fix — the fix depends on which of the
two behaviours it actually produces, and that needs the real NATS container to
answer.

---

## 4 · A process finding, stated as fact rather than blame

**#1056 and #1057 are the same residual item, opened two minutes apart by the
two sessions.** Both close "the second half of §4.3". They touch no file in
common — #1057 adds `store.pg.test.ts`, #1056 adds `store.conformance.test.ts`
and edits `store.ts` — so both can land, and the duplicated coverage is waste
rather than damage.

Path-level claim checking did not prevent it and could not have: neither branch
existed when the other was planned, and `claim-check` answers about **open PRs
and human claims**, not about what another agent is holding in a worktree. The
two sessions partitioned by _path_; this collision was on a _finding_.

Worth recording because the same shape will recur: when both sessions read the
same stop note, the residual list is a shared work queue with no claim mechanism
on it.

Also worth recording: the peer independently derived the same non-obvious cause
this session hit — Postgres `now()` is the _transaction_ timestamp, so a burst of
inserts shares `created_at` exactly and only the id separates the rows. That
broke a first-draft paging assertion here (CI caught it, the split was asserting
the clock rather than the contract) and is the state the peer's burst test builds
on purpose. Two independent arrivals at the same fact is the strongest evidence
either note carries.

---

## 5 · For the next session

The method that produced both merges is the one the previous note named, and it
is still not exhausted: **read a service's own written promises and check each
one against a reachable state.** Every finding above came from a comment, a
README line or a docstring that claimed something, and then from asking what
state would make it false.

Three specific leads, in order of expected value:

1. **`services/svc-bank`** — never audited this way. Loans, cards, ramps,
   transfers, and the freeze-cascade interaction all carry the same style of
   load-bearing comment. The known-recent fix (#1021, loan retry) suggests the
   area is live.
2. **`services/svc-pay` / public-api** — webhook journal, sandbox keys,
   idempotency. No live acquirer work (Class X).
3. **"tested by nothing"** — two of the ten merges in the previous wave were
   exactly this, and both were money-adjacent. `packages/venue-adapter` carries
   money arithmetic with the default-rounding exposure named in §3.1 above and
   has not been checked from that angle.

**Not agent-decidable, unchanged from the previous note:**
`NOTIFY_GATEWAY_TIMEOUT_MS` at its 30s ceiling breaks the lease bound; real
out-of-app delivery needs Class X credentials; §8 rates, leverage maxima, and
anything on the Shehzad chain/protocol path.
