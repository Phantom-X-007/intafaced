# svc-p2p

**Peer-to-peer trading with escrow (§6.2).** Phase 3, alongside svc-pay.

Direct maker/taker trading in 100+ fiat currencies, ledger-backed escrow, moderated disputes, and a reputation record that feeds the same XP graph as everything else — so a spotless P2P history raises limits platform-wide (§6.2 → §4.1).

**What this service is not:** it does not hold balances. `p2p_trades.amount` is the quantity that was locked, recorded once and never mutated. The value itself lives in svc-ledger's `escrow` account kind. `escrowIntegrity()` exists so those two independent answers can be compared, and a test asserts they agree.

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

| State       | Holds escrow? | Deadline | What the clock does about it                          |
| ----------- | ------------- | -------- | ----------------------------------------------------- |
| `created`   | not provably  | 2 min    | re-drive the lock, then refund or void                |
| `escrowed`  | yes           | 15 min   | **refund** — the buyer never even claimed to pay      |
| `fiat_sent` | yes           | 30 min   | **open a dispute** — never auto-release               |
| `disputed`  | yes           | 7 days   | **backstop-resolve** — a named system moderator rules |
| `released`  | no            | —        | terminal                                              |
| `cancelled` | no            | —        | terminal                                              |

`fiat_sent` deliberately does **not** auto-release. The buyer says they paid and the seller has not confirmed: that is two people disagreeing, not a stall. Auto-releasing would hand the asset to anyone willing to click "I've paid" and wait out the clock.

`disputed` deliberately **does** terminate. A dispute that can stay open forever is the same bug as an escrow that can stay locked forever; it just has a person's name attached to the delay. The backstop defaults to **refund**, and the asymmetry is on purpose: releasing to a buyer who never paid destroys the seller's asset irrecoverably, while refunding a buyer who did pay leaves them a fiat claim they can still pursue through their bank. When we must decide without evidence, we decide the recoverable way.

---

## API

tRPC (`src/router.ts`). Money crosses the boundary as **decimal strings**, in and out — including the fiat leg. `Amount` (scaled bigint) in memory; a JS `number` never touches a P2P amount.

Every procedure is `scopedProcedure(scope, { module: 'p2p' })`, which checks the scope _and_ runs the jurisdiction matrix (§7). P2P is custodial on the Fiat Plane, so §22 puts it behind tiered verification — and that follows from `module: 'p2p'`, not from a check written in this service.

| Procedure                     | Scope                    | Purpose                                                          |
| ----------------------------- | ------------------------ | ---------------------------------------------------------------- |
| `fiat.list`                   | public                   | The enabled currency registry, straight from `packages/config`   |
| `offers.create`               | `p2p:write`              | Publish an offer, fixed or floating price                        |
| `offers.list`                 | `p2p:read`               | The board — active offers with liquidity left to take            |
| `offers.get` / `offers.close` | `p2p:read` / `p2p:write` | Closing withdraws remaining liquidity; open trades continue      |
| `trades.take`                 | `p2p:write`              | **→ `escrowLock`.** Bounds and liquidity checked before any lock |
| `trades.markFiatSent`         | `p2p:write`              | Buyer only                                                       |
| `trades.confirmReceived`      | `p2p:write`              | Seller only. **→ `escrowRelease`**                               |
| `trades.cancel`               | `p2p:write`              | **→ `escrowRefund`**, in full                                    |
| `trades.get` / `trades.list`  | `p2p:read`               |                                                                  |
| `disputes.open`               | `p2p:write`              | Either party                                                     |
| `disputes.get`                | `p2p:read`               |                                                                  |
| `disputes.resolve`            | `admin:compliance`       | **Moderator only** — release or refund, no third option          |
| `reputation.get`              | `p2p:read`               | Completion rate, average release time, disputes lost, badges     |

HTTP (`src/index.ts`):

| Route                              | Purpose                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `GET /health`, `GET /ready`        | liveness / readiness                                                                                  |
| `GET /internal/escrow-integrity`   | Doctrine §0.6 as an endpoint — this service's escrow view vs the ledger's. Non-zero drift returns 500 |
| `GET /internal/reputation/:userId` | the hot path other modules read for `p2pLimitMultiplier`                                              |

Two background sweeps start before the HTTP listener, because if they do not run, escrow eventually strands:

- **timeout sweep** — resolves any trade whose deadline has passed
- **settlement sweep** — posts any resolution that was decided but not yet acted on

---

## Events

**Publishes**

| Subject                          | When                                                            |
| -------------------------------- | --------------------------------------------------------------- |
| `intafaced.p2p.offer.created`    | a maker publishes an offer                                      |
| `intafaced.p2p.escrow.locked`    | taker accepted; the seller's asset is in escrow                 |
| `intafaced.p2p.escrow.released`  | escrow went to the buyer, minus the fee. Terminal               |
| `intafaced.p2p.escrow.refunded`  | escrow went back to the seller, in full. Terminal               |
| `intafaced.p2p.trade.disputed`   | a trade entered dispute; funds hold until a moderator decides   |
| `intafaced.p2p.dispute.resolved` | a moderator (or the SLA backstop) ruled                         |
| `intafaced.p2p.trade.expired`    | a deadline elapsed and the sweeper resolved the trade           |
| `intafaced.identity.xp.earned`   | §6.2 → §4.1 — completion and dispute-loss into the one XP graph |

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

| Constraint                                | What it catches                                                     |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `p2p_trades_resolution_matches_status_ck` | **released to both parties** — the state cannot be written down     |
| `p2p_trades_live_has_deadline_ck`         | a live trade invisible to the sweeper, i.e. funds stranded          |
| `p2p_trades_terminal_has_no_deadline_ck`  | the sweeper picking up a trade it would resolve twice               |
| `p2p_trades_settled_implies_resolved_ck`  | value that moved with no recorded reason                            |
| `p2p_trades_escrow_timestamp_ck`          | a trade claiming to be past escrow with no lock behind it           |
| `p2p_trades_distinct_parties_ck`          | self-trading a flawless record, which raises limits platform-wide   |
| `p2p_trades_fee_bps_ck`                   | a fee above 100% crediting the buyer a negative amount              |
| `offers_bounds_ordered_ck`                | inverted bounds, or an offer promising more per trade than it holds |
| `offers_remaining_in_range_ck`            | two takers reserving the same units                                 |
| `p2p_disputes_trade_idx` (unique)         | two moderators reaching two decisions about one escrow              |
| `p2p_disputes_resolved_is_attributed_ck`  | a ruling with no moderator, decision, or timestamp                  |
| `p2p_reputation_counters_conserved_ck`    | a completion rate above 1 turning into a raised limit               |

---

## Fiat

§6.2: _"100+ fiat currencies = config, not code."_ The registry is `packages/config/src/fiat.ts` and this service has **no currency table**. Adding a currency is a data change in that file; nothing here is touched.

Minor units come from the registry too, and the fiat leg is quantised to them at take time — a trade for ¥1234.56 is a trade for an amount no bank will move, and "which way did you round" is a dispute nobody can adjudicate. `fiat_amount` is written once and frozen, so a floating offer cannot re-price a trade already in escrow.

---

## Kill-switch

`P2P_TRADING_ENABLED=false` stops new offers and new takes.

It deliberately does **not** stop release, refund, dispute resolution, or either sweep. A switch that could freeze settlement would be a switch that strands every open escrow — the exact failure this service exists to make impossible. A test asserts settlement still works with the switch off.

---

## Out of scope for this PR

`p2p_merchants` (§6.2's fifth table — the merchant programme: badges, limits, API access) is tracker feature `p2p.merchants` and is not built here. No half-written table was left behind for it; it arrives with its own migration.

---

## Running it

```bash
docker compose up -d
pnpm --filter @intafaced/svc-p2p db:migrate
pnpm --filter @intafaced/svc-p2p test
```

## Tests

**176 tests.** The state machine, pricing and reputation are pure functions tested by enumeration without a database — every state, every edge, every timeout, plus graph properties (reachability of a terminal state from every state; acyclicity among live states) that are the machine-checkable form of "funds cannot be stranded".

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
- timeout from `escrowed` → refund; from `fiat_sent` → dispute, never auto-release; from `disputed` → backstop rules
- timeout from `created` where the lock **had** posted → re-driven and refunded
- timeout from `created` where the lock **never** posted → voided, nothing moved
- a resolution recorded but never settled → the sweep posts it, once
- moderator ruling twice → rejected
- two disputes on one trade → rejected
- a non-party cancelling, or a buyer cancelling after declaring payment → rejected
- kill-switch on → new takes blocked, settlement unaffected
- a full mixed run across every branch → every trade terminal, every terminal trade settled, `escrowIntegrity()` and `reconcile()` clean, total value conserved to the unit
