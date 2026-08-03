# svc-p2p

**Peer-to-peer trading with escrow (§6.2).** Phase 3, alongside svc-pay.

Direct maker/taker trading in 100+ fiat currencies, ledger-backed escrow, moderated disputes, and a reputation record that feeds the same XP graph as everything else — so a spotless P2P history raises limits platform-wide (§6.2 → §4.1).

**What this service is not:** it does not hold balances. `p2p_trades.amount` is the quantity that was locked, recorded once and never mutated. The value itself lives in svc-ledger's `escrow` account kind. `escrowIntegrity()` exists so those two independent answers can be compared, and a test asserts they agree.

**What it does hold, and holds carefully:** a seller's **payment instrument** — the account the buyer actually sends money to. It is the only personal data in the service and the most attractive row in it to steal. One rule governs it: _an instrument is disclosed only while the escrow it is attached to is held, and a disclosure that is not logged cannot happen._

---

## The one thing this service is for

> Locked funds must always reach exactly one terminal state. Not usually. Not after an operator intervenes. Always, including when the process dies at the worst possible instruction.

Two properties do the work. Everything else is bookkeeping around them.

### 1 · Decide, then post

A terminal decision is written and **committed** to `p2p_trades.resolution` _before_ the ledger post that acts on it. The database allows exactly one resolution per trade (`p2p_trades_resolution_matches_status_ck`), so "released to both parties" is not a race to lose — it is a row that cannot be written.

Crash between the decision and the post and the funds are **late, not stranded**: `sweepSettlements()` finds `resolved_at IS NOT NULL AND settled_at IS NULL` and re-posts. Every recipe is keyed on the trade id, so re-posting moves nothing twice.

This is also why §5's rule about moderators falls out for free — the ruling _is_ the decision record, and it commits in the same transaction as the trade's resolution. There is no movement the audit trail cannot explain, because the explanation is written first.

### 2 · Re-drive, don't interrogate

"Did the escrow lock post?" is answered by **calling `escrowLock` again**. Its business key `p2p.escrow.lock:<tradeId>` makes a retry return the original transaction if it did, and fail on `ledger.insufficient_funds` if it did not — because the ledger checks idempotency _before_ it checks funds.

So a trade stuck in `created` is never ambiguous. This matters more than it looks: escrow is pooled per `(user, asset)`, so a refund posted against a lock that never happened would not fail — it would quietly pay the seller out of a **different trade's** escrow. The refund path is therefore unreachable from `created`, and `created` is the only state where the lock is not provably done.

---

## Trade state machine

```
                     ┌──────────── cancelled (voided) ──────────┐
                     │              nothing was ever locked      │
 created ─── lock ──▶ escrowed ─── buyer marks paid ──▶ fiat_sent
    │                    │                                  │
    │                    ├──── cancel / payment timeout ────┤
    │                    │            ▼                     │
    │                    └──▶ cancelled (refunded) ◀────────┤
    │                                                        │
    │                    seller confirms fiat received       │
    │                             ▼                          │
    │                        released ◀──────────────────────┘
    │                             ▲
    └── escrow-lock failed        │  moderator: release
        (voided)             disputed ── moderator: refund ──▶ cancelled
                                  ▲
                     either party, or the release timeout
```

The six states are §6.2's enum exactly. `resolution` (`released` · `refunded` · `voided`) records where the value went; `voided` means the lock never happened, so nothing had to move.

| State       | Holds escrow? | Deadline | What the clock does about it                                   |
| ----------- | ------------- | -------- | -------------------------------------------------------------- |
| `created`   | not provably  | 2 min    | re-drive the lock, then refund or void                         |
| `escrowed`  | yes           | 15 min   | **refund** — the buyer never even claimed to pay               |
| `fiat_sent` | yes           | 30 min   | **open a dispute** — never auto-release                        |
| `disputed`  | yes           | 7 days   | **escalate and re-arm** — nothing moves without a human ruling |
| `released`  | no            | —        | terminal                                                       |
| `cancelled` | no            | —        | terminal                                                       |

The three states that hold escrow are also **exactly** the three in which the seller's payment destination is disclosed to the buyer. That is not a coincidence and it is not two rules: the buyer needs somewhere to pay for precisely as long as the seller's asset is locked against that payment, and not one moment before or after. See the payment-instruments section below.

`fiat_sent` deliberately does **not** auto-release. The buyer says they paid and the seller has not confirmed: that is two people disagreeing, not a stall. Auto-releasing would hand the asset to anyone willing to click "I've paid" and wait out the clock.

`disputed` deliberately does **not** terminate on a clock, and this is the one behaviour in the service that changed rather than being added to.

It used to. A 7-day timer called `backstop_resolve` refunded the buyer and attributed the refund to `system:p2p-backstop` — an automated resolution of a disputed release, which [SPEC-OTC-RFQ-AND-EARN](../../docs/SPEC-OTC-RFQ-AND-EARN-2026-08-02.md) says is the one place in the platform where a human decision is the design rather than the fallback. It fired while there was **no queue** to find a dispute in, **no way to read the evidence** filed on it, and **no session that could hold `admin:compliance`**. A timer that acts because nobody could have looked is not a fallback; it is the only path.

Past its SLA a dispute now **escalates**: `escalated_at` is stamped, the count goes up, the dispute keeps its (now past) deadline so the moderator queue's "most overdue first" ordering keeps telling the truth, and the trade's own `deadline_at` re-arms on `P2P_DISPUTE_ESCALATION_RECHECK_SECONDS` so it stays visible to the sweeper. The escrow does not move.

That reads like a conflict with `p2p_trades_live_has_deadline_ck`, which makes "a trade sits in escrow with no clock on it" unrepresentable. It is not: **the constraint requires a live trade to carry a deadline; it does not require the deadline to dispose of value.**

And the database enforces the rest. `p2p_trades_disputed_needs_ruling_trg` refuses any write that terminates a `disputed` trade unless the dispute row is already `resolved` and attributed to a moderator id that is not a `system:` principal. A future timer cannot become a moderator again without impersonating a person, which is a thing a reviewer sees rather than a default nobody read.

---

## API

tRPC (`src/router.ts`). Money crosses the boundary as **decimal strings**, in and out — including the fiat leg. `Amount` (scaled bigint) in memory; a JS `number` never touches a P2P amount.

Every procedure is `scopedProcedure(scope, { module: 'p2p' })`, which checks the scope _and_ runs the jurisdiction matrix (§7). P2P is custodial on the Fiat Plane, so §22 puts it behind tiered verification — and that follows from `module: 'p2p'`, not from a check written in this service.

| Procedure                        | Scope                    | Purpose                                                                   |
| -------------------------------- | ------------------------ | ------------------------------------------------------------------------- |
| `fiat.list`                      | public                   | The enabled currency registry, straight from `packages/config`            |
| `offers.create`                  | `p2p:write`              | Publish an offer, fixed or floating price                                 |
| `offers.list`                    | `p2p:read`               | The board — active offers with liquidity left to take                     |
| `offers.get` / `offers.close`    | `p2p:read` / `p2p:write` | Closing withdraws remaining liquidity; open trades continue               |
| `trades.take`                    | `p2p:write`              | **→ `escrowLock`.** Bounds, liquidity **and destination** before any lock |
| `trades.markFiatSent`            | `p2p:write`              | Buyer only                                                                |
| `trades.confirmReceived`         | `p2p:write`              | Seller only. **→ `escrowRelease`**                                        |
| `trades.cancel`                  | `p2p:write`              | **→ `escrowRefund`**, in full                                             |
| `trades.get` / `trades.list`     | `p2p:read`               | Never carry a payment instrument — see below                              |
| `trades.paymentInstrument`       | `p2p:read`               | **Where to send the money.** Party-or-moderator, live escrow only, logged |
| `disputes.open`                  | `p2p:write`              | Either party. Discloses what happens if nobody rules                      |
| `disputes.appendEvidence`        | `p2p:write`              | Either party, while open. **Append-only** — no edit, no remove            |
| `disputes.get`                   | `p2p:read`               | Party sees their own evidence; moderator sees all of it                   |
| `disputes.list`                  | `admin:compliance`       | **The queue** — open disputes, most overdue first, paginated              |
| `disputes.resolve`               | `admin:compliance`       | **Moderator only** — release or refund, no third option                   |
| `reputation.get`                 | `p2p:read`               | Completion rate, average release time, disputes lost, badges              |
| `instruments.methods.list`       | `p2p:read`               | What each method needs, per country. About methods, never about people    |
| `instruments.methods.register`   | `admin:compliance`       | **Operator only** — declare a market's field requirements                 |
| `instruments.methods.setEnabled` | `admin:compliance`       | Stop accepting new instruments for a method/country                       |
| `instruments.create`             | `p2p:write`              | Register a destination                                                    |
| `instruments.update`             | `p2p:write`              | Edit. Does not reach a trade already holding a snapshot                   |
| `instruments.remove`             | `p2p:write`              | A state change, never a DELETE                                            |
| `instruments.list`               | `p2p:read`               | The caller's own — **headers only, no field values, ever**                |
| `instruments.reveal`             | `p2p:write`              | The owner reads their own values. Logged like anyone else's read          |
| `instruments.accessLog`          | `p2p:read`               | "Who has looked at my account details, and when"                          |

HTTP (`src/index.ts`):

| Route                              | Purpose                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `GET /health`, `GET /ready`        | liveness / readiness                                                                                  |
| `GET /internal/escrow-integrity`   | Doctrine §0.6 as an endpoint — this service's escrow view vs the ledger's. Non-zero drift returns 500 |
| `GET /internal/reputation/:userId` | the hot path other modules read for `p2pLimitMultiplier`                                              |
| `GET /internal/moderation-backlog` | open / overdue / escalated / **never seen by a moderator**. Nothing drains this on a timer any more   |

Three background sweeps start before the HTTP listener. The first two are why escrow cannot strand; the third is why we do not keep personal data after we need it:

- **timeout sweep** — resolves any trade whose deadline has passed
- **settlement sweep** — posts any resolution that was decided but not yet acted on
- **retention sweep** — wipes the payment details off closed trades past `P2P_INSTRUMENT_RETENTION_DAYS`

---

## Payment instruments — where the buyer actually sends the money

Escrow could lock, release, refund and go to a moderator, and a trade still could not complete: at the moment the buyer had to pay, there was no bank account, no wallet handle, no destination of any kind. The payment leg was a `method` string and a `terms` paragraph.

### The model, and why it is data rather than code

Three tables, and the split is the design:

| Table                       | What it is                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| `payment_method_schemas`    | **What a method needs, per country** — operator-supplied. Ships **empty**                        |
| `payment_instruments`       | A seller's destination. The live one they maintain                                               |
| `trade_payment_instruments` | **What the buyer was told to pay**, frozen at take. One row per trade                            |
| `instrument_access_log`     | Who looked at whose details, when, and whether they were allowed to. **Append-only, by trigger** |

What a payer needs in order to send money differs by method and by country, and **it is not this repo's knowledge to invent.** A hardcoded list of methods with hardcoded field names would be this codebase asserting what a bank transfer requires in one market or what a mobile-money handle looks like in another — assertions nobody here is entitled to make, and which would be wrong silently rather than loudly.

So the registry is data, and it ships with **no rows**. An operator with `admin:compliance` registers what a market actually requires; until they do, that market refuses instruments and no trade can be opened in it. That refusal is the honest behaviour — the alternative is a plausible-looking guess that produces instruments which pass validation and cannot be paid, discovered by a buyer after escrow is already locked.

An exact country always beats the `*` wildcard, and never falls back past it: a country-specific entry is the operator saying "this market is different", and ignoring that is how a complete-looking instrument turns out to be unpayable.

**Undeclared keys are refused, not dropped.** Silently ignoring an unknown field lets a client push arbitrary personal data into a blob nobody designed, nobody validates, and everybody then has to protect and eventually delete. Refusing it is what makes "what personal data do we hold about this person" a question with a finite answer.

### One active destination per `(owner, method, currency)`

A partial unique index. Not a limit for its own sake — it is what makes "which account does the buyer pay?" have exactly one answer.

The seller is resolved _from the trade_, because on a `buy` offer the seller is the **taker**, so the offer cannot carry the instrument. That makes it a lookup rather than a choice, and a lookup that can return two rows picks one by an ordering nobody designed — on the single field where the wrong choice sends a stranger's money to the wrong bank account. Rotation is sequential: remove, then add.

### Who can see an instrument, and when

> **An instrument is disclosed only while the escrow it is attached to is HELD — and a disclosure that is not logged cannot happen.**

| Who                                          | Sees it?                                       | Where                                                             |
| -------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| A browsing user / a public offer             | **No**                                         | Offers carry method **ids**, never a destination                  |
| Any `p2p:read` holder who is not a party     | **No** — `NOT_FOUND`                           | And the attempt is logged                                         |
| The buyer, `escrowed`/`fiat_sent`/`disputed` | **Yes**                                        | `trades.paymentInstrument` only                                   |
| The buyer, `created` (pre-lock)              | **No**                                         | Nothing is committed yet; disclosing here would be a free harvest |
| Either party, `released`/`cancelled`         | **No**                                         | A finished trade is not a permanent licence                       |
| The owner, their own                         | **Yes**, and logged                            | `instruments.reveal` — never on any list                          |
| A moderator (`admin:compliance`)             | **Only while a dispute on that trade is open** | Logged as `viewer_role = 'moderator'`                             |

`escrowed | fiat_sent | disputed` is exactly `ESCROW_HOLDING_STATUSES`. It is a better boundary than "while the trade exists" in both directions: not before the lock, so a taker cannot harvest details in the pre-escrow window; not after settlement, so dealing with someone once does not buy permanent access to their account.

**The moderator case is the one judgement call**, and it is deliberate. §A2 requires a human to resolve a disputed release and requires both sides to see the same evidence set; a human asked to rule on "I paid" / "nothing arrived" without seeing the account the payment was meant to reach is being asked to guess. It is bounded to an **open** dispute on that specific trade, and it shows up in the owner's own access log — compliance access nobody can see afterwards would be the thing to object to.

**Every refusal is `NOT_FOUND`, never `FORBIDDEN`.** "This exists but is not yours" tells a stranger that a trade with that id exists and that its seller has an account on file, which is the first half of what they were trying to learn.

### Why it is its own procedure, not a field on `trades.get`

Three bugs stop being possible:

1. `trades.get` and `trades.list` cannot leak an instrument, because they never load one. A routine trade read is not a disclosure.
2. Every disclosure is an explicit call, so the log has one row per intent rather than one per screen refresh.
3. The authorisation for reading account details is written in one place, instead of being a clause inside a trade serialiser.

`instruments.list` returns **no field values at all** — not even a masked hint. A mask is still the data, it rides a path that is not access-logged, and it is one helpful refactor away from being the whole value. The owner tells two destinations apart by the label they chose. The `fingerprint` is not exposed either: it is a hash of the account details, and a hash handed to a caller is an oracle a guessed account number can be checked against.

### The snapshot: removal cannot break a live trade, and neither can an edit

`trade_payment_instruments` freezes the destination in the **same transaction** that creates the trade. Two things follow, and the second is the bigger one:

1. The owner may edit or remove their instrument at any time without blanking the screen a buyer is halfway through copying an account number out of. Removal is a state change (`status = 'removed'`), never a `DELETE`, because the snapshot, the access log and any future appeal all still point at that row.
2. **The destination cannot change mid-trade.** Show account A, wait for the buyer to start the transfer, switch to account B, then truthfully report that nothing arrived at B — that is a scam with a clean audit trail, and a live pointer instead of a snapshot is exactly what makes it work.

### The access log, and why it cannot be avoided

The reveal is **one SQL statement** in which the `SELECT` of the details is cross-joined to a data-modifying CTE that writes the log row. The details are only produced when the log row was produced. There is no ordering of a crash, no early return, and no future edit to the file that reads the details and forgets the log — they are the same statement. The status test lives inside that statement too, so a trade that terminated a millisecond ago discloses nothing.

The database holds up the other end: `instrument_access_log` has a `BEFORE UPDATE OR DELETE` trigger that raises. A log the service could tidy is a log whose value depends on the service not having been the thing that was compromised. A test issues raw `UPDATE` and `DELETE` behind the service's back and the database refuses both.

**Refusals are recorded too, and they are the more interesting half.** One reveal is a buyer paying. Eleven refusals against eleven different sellers in an hour is someone harvesting, and that looks like nothing at all in a table that only records successes. The owner can read their own log (`instruments.accessLog`) — a log only compliance can see is a log the person whose data it is cannot use, and they are the one who knows whether a look was expected.

### Retention

`P2P_INSTRUMENT_RETENTION_DAYS` (default 90). The API already refuses to disclose a terminal trade's snapshot; the sweep is the other half of the same promise, because "you cannot read it" and "we no longer have it" are different statements and only the second survives a database being copied. The purge nulls `details` and keeps the `fingerprint`, so a late appeal can still be told whether the account a seller now names is the one the buyer was shown — without us holding the account in order to say so.

The **number** is an operator decision, not an engineering one, and where a market imposes its own retention rule that rule wins. The floor is set well clear of the 7-day dispute SLA so a purge can never race an open appeal.

### The residual risk, stated

A taker who genuinely takes an offer becomes a counterparty and is entitled to the seller's destination. Someone willing to open small trades can therefore collect account details from many sellers. That is inherent to P2P — a buyer who cannot see where to pay cannot pay — and it is not solved here. What exists against it is the access log (every look attributed, visible to the seller), the minimum-amount bound on every offer, and the reputation record. It is named here so nobody assumes it was overlooked.

**Not encrypted at rest.** `details` is `jsonb` in Postgres. Envelope encryption is the right next step and it needs a key-management decision that is owner-gated (Class X, `AGENTS.md`); doing it with a key improvised in this service would be the appearance of the protection without the substance. §13 socket: **payment-instrument encryption at rest**.

---

## Events

**Publishes**

| Subject                          | When                                                                     |
| -------------------------------- | ------------------------------------------------------------------------ |
| `intafaced.p2p.offer.created`    | a maker publishes an offer                                               |
| `intafaced.p2p.escrow.locked`    | taker accepted; the seller's asset is in escrow                          |
| `intafaced.p2p.escrow.released`  | escrow went to the buyer, minus the fee. Terminal                        |
| `intafaced.p2p.escrow.refunded`  | escrow went back to the seller, in full. Terminal                        |
| `intafaced.p2p.trade.disputed`   | a trade entered dispute; funds hold until a moderator decides            |
| `intafaced.p2p.dispute.resolved` | a moderator ruled. `automatic` is always `false` — nothing else can rule |
| `intafaced.p2p.trade.expired`    | a deadline elapsed and the sweeper resolved the trade                    |
| `intafaced.identity.xp.earned`   | §6.2 → §4.1 — completion and dispute-loss into the one XP graph          |

Every publish carries a **business** idempotency key (`p2p.escrow.release:<tradeId>`, `p2p:trade.completed.seller:<tradeId>:<userId>`), never a random uuid. A redelivered envelope finds the original, which is what makes svc-identity's XP dedupe work.

**Consumes** — nothing yet. When svc-trade's mark-price surface lands it supplies the `ReferencePriceSource` that floating offers need; until then a floating offer is **refused** rather than priced from a stale number (§13 socket: cross-venue pricing).

> **This PR adds seven events to `packages/events/src/catalog.ts`.** Strictly §15.2 says a shared-package change should be its own PR first — flagging it rather than burying it. The payloads are additive and no existing subject changed.

---

## Ledger

**All three escrow recipes already existed in `packages/ledger-client`.** This service adds none.

| Recipe          | Reason code          | Accounts                                             | Idempotency key                |
| --------------- | -------------------- | ---------------------------------------------------- | ------------------------------ |
| `escrowLock`    | `p2p.escrow.lock`    | seller available → seller escrow                     | `p2p.escrow.lock:<tradeId>`    |
| `escrowRelease` | `p2p.escrow.release` | seller escrow → buyer available + `houseFees('p2p')` | `p2p.escrow.release:<tradeId>` |
| `escrowRefund`  | `p2p.escrow.refund`  | seller escrow → seller available                     | `p2p.escrow.refund:<tradeId>`  |

The keys are business keys and are **not** overridden. They are load-bearing in three separate ways:

1. a retried release cannot pay twice;
2. a re-driven lock tells us whether the original posted;
3. the settlement sweep can re-post any decision without checking whether it already did.

**The fee comes out of the escrowed amount**, before the buyer is credited — never as a second post. A separate fee charge could fail after the release succeeded, leaving the house short of a fee it had already accounted for and the books needing a manual repair. `buyerReceives + fee == amountLocked`, exactly, and a test asserts it.

**No fee is taken on a refund.** The platform did not provide the service it charges for.

---

## Can funds ever be stranded?

No. Three things have to hold, and each is enforced somewhere the service cannot bypass.

**Every live state has a clock, and every clock does something.** `p2p_trades_live_has_deadline_ck` refuses to store a live trade without a deadline, so a trade invisible to the sweeper cannot be written. `timeoutActionFor()` is total over the status enum, so there is no live state the sweeper picks up and leaves unchanged. A test walks the graph breadth-first from every state and asserts a terminal state is reachable, and asserts the live subgraph is acyclic.

**Every terminal state has exactly one resolution, and it is immutable.** `p2p_trades_resolution_matches_status_ck` allows `released`+`released`, `cancelled`+`refunded|voided`, or live+NULL — nothing else. A test tries to write the double resolution with raw SQL, behind the service's back, and the database refuses it.

**Every recorded decision is eventually posted.** `resolved_at IS NOT NULL AND settled_at IS NULL` is a queryable work list, `settled_at` is only stamped after the post returns, and every recipe is idempotent on the trade id. A test simulates the crash — writes the resolution, leaves `settled_at` null, leaves the escrow held — and shows the sweep converging.

The remaining question is the one worth stating plainly: **funds can be late.** Between a recorded decision and its ledger post, the value is still in escrow and neither party can spend it. That window is bounded by the sweep interval (30s by default) and is the deliberate trade for the alternative, which is posting first and discovering afterwards that we cannot say why.

_If it crashes exactly here, whose funds are stranded?_

| Crash point                                        | Whose funds                 | Why not                                                                                                             |
| -------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| after the inventory reserve, before `escrowLock`   | nobody's                    | nothing is locked; `created` expires in 2 min and voids                                                             |
| after `escrowLock`, before the row says `escrowed` | nobody's, but non-obviously | the sweep re-calls `escrowLock`, which is idempotent, so the lock becomes a fact rather than a guess — then refunds |
| after the resolution is recorded, before the post  | nobody's, but they are late | `sweepSettlements()` re-posts; the recipe key stops it doubling                                                     |
| after the post, before `settled_at`                | nobody's                    | the re-post is idempotent and the stamp is retried                                                                  |
| during a concurrent release/refund race            | nobody's                    | both take the trade's row lock; the loser sees a terminal status and posts nothing at all                           |

---

## Database constraints as a backstop

The service checks these. The database enforces them regardless.

| Constraint                                  | What it catches                                                     |
| ------------------------------------------- | ------------------------------------------------------------------- |
| `p2p_trades_resolution_matches_status_ck`   | **released to both parties** — the state cannot be written down     |
| `p2p_trades_live_has_deadline_ck`           | a live trade invisible to the sweeper, i.e. funds stranded          |
| `p2p_trades_terminal_has_no_deadline_ck`    | the sweeper picking up a trade it would resolve twice               |
| `p2p_trades_settled_implies_resolved_ck`    | value that moved with no recorded reason                            |
| `p2p_trades_escrow_timestamp_ck`            | a trade claiming to be past escrow with no lock behind it           |
| `p2p_trades_distinct_parties_ck`            | self-trading a flawless record, which raises limits platform-wide   |
| `p2p_trades_fee_bps_ck`                     | a fee above 100% crediting the buyer a negative amount              |
| `offers_bounds_ordered_ck`                  | inverted bounds, or an offer promising more per trade than it holds |
| `offers_remaining_in_range_ck`              | two takers reserving the same units                                 |
| `p2p_disputes_trade_idx` (unique)           | two moderators reaching two decisions about one escrow              |
| `p2p_disputes_resolved_is_attributed_ck`    | a ruling with no moderator, decision, or timestamp                  |
| `p2p_reputation_counters_conserved_ck`      | a completion rate above 1 turning into a raised limit               |
| `payment_instruments_active_slot_idx`       | two destinations for one slot — a coin-flip over whose bank is paid |
| `payment_instruments_removed_paired_ck`     | a row that is removed to one reader and active to another           |
| `payment_method_schemas_fields_ck`          | a schema with no fields, i.e. a destination with no address         |
| `trade_payment_instruments_purge_paired_ck` | a retention claim we could not defend either way                    |
| `instrument_access_log_append_only`         | **the record of who saw account details being tidied afterwards**   |

---

## Fiat

§6.2: _"100+ fiat currencies = config, not code."_ The registry is `packages/config/src/fiat.ts` and this service has **no currency table**. Adding a currency is a data change in that file; nothing here is touched.

Minor units come from the registry too, and the fiat leg is quantised to them at take time — a trade for ¥1234.56 is a trade for an amount no bank will move, and "which way did you round" is a dispute nobody can adjudicate. `fiat_amount` is written once and frozen, so a floating offer cannot re-price a trade already in escrow.

---

## Kill-switch

`P2P_TRADING_ENABLED=false` stops new offers and new takes.

It deliberately does **not** stop release, refund, dispute resolution, or either sweep. A switch that could freeze settlement would be a switch that strands every open escrow — the exact failure this service exists to make impossible. A test asserts settlement still works with the switch off.

---

## Out of scope

`p2p_merchants` (§6.2's fifth table — the merchant programme: badges, limits, API access) is tracker feature `p2p.merchants` and is not built here. No half-written table was left behind for it; it arrives with its own migration.

**The method registry is empty and stays empty until an operator fills it.** That is not a gap in the mechanism — it is where the mechanism ends and researched, jurisdictional content begins. Nobody can register a payment destination in a market until `instruments.methods.register` has been called for it, and any attempt to save that as engineering work by seeding a guess would produce destinations that validate and cannot be paid.

**Not encrypted at rest** — §13 socket, see the payment-instruments section above.

---

## Running it

```bash
docker compose up -d
pnpm --filter @intafaced/svc-p2p db:migrate
pnpm --filter @intafaced/svc-p2p test
```

## Tests

**236 tests.** The state machine, pricing, reputation and instrument field validation are pure functions tested by enumeration without a database — every state, every edge, every timeout, plus graph properties (reachability of a terminal state from every state; acyclicity among live states) that are the machine-checkable form of "funds cannot be stranded".

The two Postgres suites are serialised by `vitest.config.ts` (`fileParallelism: false`) and bring the schema up under a shared advisory lock. Both truncate the same connected set of tables — an instrument is attached to a trade, which belongs to an offer — and vitest runs test files in parallel by default, which deletes one suite's rows out from under the other mid-assertion. It does not fail cleanly: it surfaces as "trade not found" immediately after a successful take, in tests that have nothing to do with the change being made.

The money paths run against real Postgres with the ledger's in-memory reference implementation, which the conformance suite proves equivalent to svc-ledger's Postgres engine (§4.4). Almost every one of them ends by asserting `totalsByAsset()` is zero and `reconcile()` is clean — escrow is the one place value sits between two owners, and a book that does not close is a book where some of it went somewhere nobody asked for.

**Escrow failure branches covered:**

- double release attempted → rejected, value moves once (and eight concurrent releases → exactly one winner)
- release after refund, and refund after release → both rejected on the terminal guard
- a concurrent release/refund race → exactly one winner, total conserved
- the double resolution written with raw SQL behind the service → refused by the database
- release on an unescrowed trade → rejected; the trade was already voided by the failed take
- a never-locked trade refunded out of **another** trade's escrow → prevented, and tested directly
- a voided trade posting anything at all → zero `p2p` transactions on the book
- take above max, below min, above remaining liquidity → rejected before any lock, no trade row
- self-trade, unsupported payment method, closed offer, unavailable reference price → rejected before any lock
- concurrent takers on one offer → exactly one escrows; 12 racing takes never over-draw the inventory
- timeout from `escrowed` → refund; from `fiat_sent` → dispute, never auto-release; from `disputed` → **escalate, and move nothing** — five sweeps in a row leave the escrow exactly where it was
- the database refusing to terminate a disputed escrow without an attributed human ruling, including for a `system:` moderator id
- dispute evidence edited, reordered, truncated or removed by raw SQL → refused by the append-only trigger
- timeout from `created` where the lock **had** posted → re-driven and refunded
- timeout from `created` where the lock **never** posted → voided, nothing moved
- a resolution recorded but never settled → the sweep posts it, once
- moderator ruling twice → rejected
- two disputes on one trade → rejected
- a non-party cancelling, or a buyer cancelling after declaring payment → rejected
- kill-switch on → new takes blocked, settlement unaffected
- a full mixed run across every branch → every trade terminal, every terminal trade settled, `escrowIntegrity()` and `reconcile()` clean, total value conserved to the unit

**Payment-instrument disclosure covered:**

The device throughout is a **canary** — the seller's account details contain a string that appears nowhere else in the system — so "it does not leak" is a mechanical question rather than a judgement. Every one of these is driven through the tRPC router with a real edge-signed principal, not by calling the service directly: authorisation only ever tested a layer below the door is authorisation nobody has checked the door for.

- a stranger calling **every procedure the router exposes**, against the real trade, offer and instrument ids → the canary appears in no response. The input map is exhaustive by construction: a procedure the router has and the map does not fails the test, so the next list endpoint someone adds has to be considered here before it ships
- the counterparty's ordinary reads — `trades.get`, `trades.list`, `offers.get`, `offers.list`, `instruments.list`, `reputation.get` → no canary; the buyer gets it from `trades.paymentInstrument` and nowhere else
- the owner's own list → no values, no mask, no fingerprint
- the public board and every published event → no canary
- a non-counterparty revealing → `NOT_FOUND`, not `FORBIDDEN`, and the attempt is logged
- before the lock (`created`) → refused; after `released` and after `cancelled` → refused for **both** parties
- a moderator with `admin:compliance` → refused with no dispute, allowed while the dispute is open, refused again once it is ruled on
- the seller removing the instrument mid-trade → the buyer still sees it; new takes on that offer are refused
- the seller **editing** the instrument mid-trade → the buyer still sees the original. This is the account-swap scam, and the snapshot is what makes it fail
- a take where the seller has no destination for that currency → refused **before any lock**: no trade row, no snapshot, no reserved inventory, book at zero
- three reveals → exactly three access-log rows; the log cannot fall behind the reads
- refusals logged with their reason; the owner can read their own log and nobody else's
- raw `UPDATE` and `DELETE` on the access log, behind the service's back → refused by the database
- retention: nothing purged while live or before the window; past it, values gone, fingerprint kept, canary unfindable in the table
- the registry: empty → refuses; undeclared field → refused, not dropped; blank required field → missing; exact country beats the wildcard and does not fall back past it; a second active destination in one slot → `CONFLICT`, and rotation after removal works
