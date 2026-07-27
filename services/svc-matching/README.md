# svc-matching

**THE ENGINE (§5.1).** Orderbooks and matching. Nothing else.

**What this service is not:** it has no users, no balances, no assets, and no database. It receives orders that
another service has already decided are allowed and already funded, matches them against an in-memory book, and
says what happened. It speaks in **account ids** and quantities. It cannot tell you who owns `acct-7f3a`, what
they hold, or whether they can afford anything — and that ignorance is the design, not a gap in it.

Every input is journalled before it is processed, so replaying the journal rebuilds the exact book the process
died holding (§5.1), and replaying it twice produces byte-identical state (§5.4).

---

## API

HTTP + JSON. Amounts in and out are **decimal strings**, never JSON numbers.

| Route                                       | Input                                                              | Output                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `POST /markets/:marketId/orders`            | `{ orderId, accountId, type, side, qty, price?, stopPrice?, tif }` | `{ accepted, sequence, fills[], resting, rejected, cancellations[], triggered[] }` |
| `DELETE /markets/:marketId/orders/:orderId` | —                                                                  | `{ cancelled, orderId, sequence, cancellation }` · `404` if not live               |
| `GET /markets/:marketId/depth?limit=`       | —                                                                  | `{ marketId, bids: [price, qty][], asks: [price, qty][], sequence }`               |
| `GET /markets`                              | —                                                                  | `{ markets: string[] }`                                                            |
| `GET /health`                               | —                                                                  | `{ ok, service, enabled, markets, journalRecords }`                                |
| `GET /ready`                                | —                                                                  | `503` when the engine is disabled                                                  |

A **rejection is a 200 with `accepted: false`**, not a 4xx. Post-only refusing to cross is the feature working; a
bot's retry logic must not read it as an outage. Only a malformed body is a `400`.

**Order types** — `limit`, `market`, `stop`, `stop_limit`. **TIF** — `GTC`, `IOC`, `FOK`, `PO` (post-only).
Both come from `@intafaced/exchange-contract`; the engine does not declare its own copy. `take_profit` exists in
the public contract but is a svc-trade concern — it is a stop with inverted trigger semantics, mapped down to
`stop`/`stop_limit` before it reaches here, so the engine keeps exactly one trigger rule.

> **SOCKET §13 — gRPC transport.** §5.1 specifies gRPC, and the Rust port depends on the interface staying narrow.
> The callable surface is already exactly `submit` and `cancel`, already decimal-string in and out. A `.proto` in
> `packages/contracts` plus a thin server in front of the same `MatchingEngine` is the whole change; nothing under
> `src/engine/` moves. That proto is a contracts PR (§15.2) and cannot ship inside a service PR.

---

## Events

**Publishes** — all declared in `packages/events/src/catalog.ts`. This service adds no subject of its own.

| Subject                              | When                                                          | Idempotency key                                |
| ------------------------------------ | ------------------------------------------------------------- | ---------------------------------------------- |
| `intafaced.matching.order.accepted`  | an order is admitted (once, at admission)                     | `matching.order.accepted:<market>:<orderId>`   |
| `intafaced.matching.order.filled`    | every match                                                   | `matching.order.filled:<market>:<sequence>`    |
| `intafaced.matching.order.cancelled` | requested cancel, IOC/market remainder, self-trade prevention | `matching.order.cancelled:<market>:<sequence>` |

Events for one submission are emitted **in engine-sequence order**, so a consumer reading the subject sees the
order the book applied. The engine sequence is the business key: one fill has one sequence, forever, which is
what makes a JetStream redelivery a no-op rather than a second `tradeFill`.

A stop order emits `order.accepted` **once**, when it enters the stop book. Triggering an hour later does not
emit a second acceptance — it was accepted an hour ago. Its activation shows up as fills and cancellations.

**Consumes** — nothing. Like the ledger, the engine reacts to no one; it is driven by its API and its own journal.

**Recovery emits nothing.** Replaying the journal at boot rebuilds the books silently. Republishing those events
would hand svc-trade a second ledger recipe for a trade that already settled.

---

## Ledger

**This service posts no ledger transactions and holds no balances.** It speaks in account ids only.

| Recipe | Reason code | Accounts |
| ------ | ----------- | -------- |
| _none_ | —           | —        |

That row is the contract. §5.1 draws the boundary — "orderbooks and matching only. No balances, no users" — and
Doctrine §0.6 draws the other half: no module holds its own balance. The money path lives one layer up, in
svc-trade: it takes `ledger.hold` before submitting, turns `order.filled` into the 6-entry `tradeFill` recipe, and
releases the hold on `order.cancelled`. The engine never sees an asset code, a fee, or a user id.

`@intafaced/ledger-client` **is** a dependency, but only its `/money` subpath — `Amount`, `parseAmount`,
`formatAmount`. That is the money _representation_, not the money _path_: prices and quantities are scaled
bigints so the engine and the book agree to 18 decimal places. If a future change here imports a write recipe,
the design has gone wrong; delete the import, not the boundary.

Consequently the tracing helper sets `intafaced.money_path=false` explicitly rather than leaving it unset, so a
trace reader can tell "not a money path" from "someone forgot".

---

## The book

`src/engine/book.ts` is **pure**: no I/O, no async, no clock, no randomness. `submit(order)` is a function of
(book state, order) and nothing else. That is not a style preference — §5.4's determinism requirement dies to any
one of `Date.now()`, `Math.random()`, or iteration over a Map in a way that reaches the output. Price levels are
kept in a **sorted array with binary-search insertion**, not a Map, because a Map iterates in insertion order and
a book whose best price depends on what was inserted first is not a book.

**Price-time priority.** Best bid is the highest price, best ask the lowest; within a price level, orders fill in
arrival order and a partial fill does not lose its place in the queue. A level that empties exactly is removed in
the same pass, so an empty level is never observable as the best price.

**Sequence numbers.** One monotonic counter per book. Every accepted order, every fill, and every cancellation
takes one. A **rejected order takes none** — it never touched the book, and it must leave the counter exactly as
it found it, or a replay of the same inputs would diverge.

**Fill price is always the maker's price.** The taker crossed the spread; it does not also get to set the price it
crossed to.

### Behaviours worth stating plainly

| Case                                   | Behaviour                                                                                                                                                              |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Post-only that would cross             | Rejected. No fill, no rest, book untouched — including the sequence counter.                                                                                           |
| FOK that cannot fill completely        | Rejected entirely. Not one unit trades. The check is non-mutating, so nothing is half-done to find out.                                                                |
| IOC with a partial fill                | Fills what it can; remainder cancelled (`ioc_remainder`), never rested.                                                                                                |
| Market order into an empty book        | **Accepted**, zero fills, whole quantity cancelled (`market_remainder`). Uniform with a market order that exhausts the book — the caller releases the hold either way. |
| Market order with `GTC`                | Behaves as IOC. A market order can never rest, whatever TIF it carried.                                                                                                |
| Post-only on anything that cannot rest | Rejected `invalid_tif` rather than reinterpreted.                                                                                                                      |
| Duplicate order id                     | Rejected. Bots retry; a retry that opens a second order is the worst bug this service could have.                                                                      |
| Cancel of an unknown id                | No-op, not an error. A cancel racing a fill is normal.                                                                                                                 |

### Self-trade prevention — cancel-oldest

When an aggressor meets its own resting order, **the resting order is pulled** and matching continues past it.
The cancellation is reported as `self_trade_prevention` and emitted as `order.cancelled` so svc-trade releases the
hold.

The alternative — cancelling the incoming remainder — lets an account wedge its own access to the book behind a
stale quote it has forgotten about. Cancel-oldest keeps the aggressor's intent and costs the account only the
order it had already decided to replace. Either way the invariant holds: **no account is ever both maker and taker
of the same fill**, and a FOK viability check does not count the account's own resting liquidity, because that
liquidity will be pulled rather than filled.

### Stops

A buy stop fires when the market trades **up to** its stop price; a sell stop when it trades **down to** it. Until
the market has printed a price at all, nothing triggers. Activation converts `stop` → market and `stop_limit` →
limit, through the same matcher, and the resting remainder takes its **activation** sequence — a stop that sat for
an hour does not jump the queue when it fires.

Triggers **cascade**: prints from an activated stop can arm the next one. The drain loop terminates because every
pass removes exactly one order from the stop book and nothing puts one back, and it fires the **oldest** armed stop
first — the same tie-break the limit book uses.

---

## Journal and recovery

`engine_journal` is append-only NDJSON, `fsync`'d per record (`MATCHING_JOURNAL_PATH`). Two properties do all the
work:

1. **Inputs only, never outcomes.** A journal of outcomes would be a transcript: a bug in the matcher would replay
   perfectly while the book stayed wrong. Replaying inputs through the same matcher is what makes the state
   _verifiable_ rather than merely reproducible.
2. **Written before the book moves.** A crash between the two costs a duplicate replay of one input, which is
   idempotent — the order id is already live, so it comes back `duplicate_order_id`. A crash the other way round
   would cost a fill nobody can reconstruct.

Amounts are decimal strings on disk. A journal is read years after it is written, possibly by a process that does
not share this build; a scaled bigint is our private representation, not an archival format.

Snapshots every `MATCHING_SNAPSHOT_EVERY` records (§5.1) via the `SnapshotSink` port. `replayFrom(snapshot, records)`
resumes at `seq > journalSeq` and lands on exactly the state a full replay reaches — there is a test for that.

> **SOCKET §13 — durable journal transport.** `FileJournal` is real durability for a single replica. A replicated
> log (a `matching.engine_journal` table, or a JetStream work queue) drops in behind `EngineJournal`'s three
> methods when the engine goes multi-replica. The Redis snapshot sink for ws-gateway depth streaming lands the same
> way: `SnapshotSink` is one method.

---

## Kill-switch

`matching.engine` in the admin console, or `MATCHING_ENGINE_ENABLED=false`.

**Effect when off:** every submission is refused with `engine_disabled` **before it is journalled** — the journal
means "these were processed, in this order", and an input that was never processed does not belong in it. Cancels
and depth reads keep working, so operators can drain a book rather than freeze it. `/ready` returns 503 so the load
balancer takes the instance out of rotation instead of letting every order bounce.

---

## No database

There is no `DATABASE_URL` in this service's env, and the omission is deliberate. §5.1 gives the engine in-memory
books and an append-only journal, and nothing else. A service that demands a connection it never opens is a service
someone will eventually give a table to — and a table here would be a second place trading state lives.

---

## Running it

```bash
pnpm --filter @intafaced/svc-matching build
pnpm --filter @intafaced/svc-matching test
pnpm --filter @intafaced/svc-matching dev
pnpm gate svc-matching
```

## Tests

`book.test.ts` covers the matcher: price-time priority in both directions, queue position across partial fills,
every order type and TIF, self-trade prevention across levels, levels emptying exactly, a multi-level market sweep
checked fill-by-fill and against an exact weighted average, 18-decimal round trips, and a scan asserting the
serialised book contains **no floating-point value anywhere** — every amount is a decimal string, and the only JSON
numbers are integer sequences.

`engine.test.ts` covers the journal-first ordering (including: a journal write that throws leaves the book
untouched), the event contract, recovery emitting nothing, snapshot cadence, and **§5.4's determinism test** —
~1000 mixed operations across two markets driven by a seeded PRNG, replayed twice, compared as strings. Byte
identity, not deep equality: two different Map iteration orders would pass a deep-equal and still stream different
depth to every client. Three further tests keep that one honest — replay must equal the live engine's state, a
different seed must produce a different book, and the workload must actually fill, rest, and reject rather than
comparing two empty books.
