# svc-trade

**THE PRODUCT LAYER (§5.2).** Listings, the order lifecycle, and fees.

**What this service is not:** it does not match orders and it does not hold balances. The book lives in
svc-matching; the money lives in svc-ledger. This service is the thing in between — the one that decides an order
is allowed, funds it, hands it to the engine, and turns what comes back into ledger transactions.

**Scope of this PR:** `trade.spot`. Futures, options, OTC, Convert, copy trading and algo execution are separate
tracker features with their own PRs. See [Not in this PR](#not-in-this-pr).

---

## The one thing that matters

svc-matching is allowed to be pure — no balances, no users, no affordability checks — on exactly one condition:
**every order it ever sees is already funded.** This service is that condition.

```
1 · auth + scope check (trade:write)
2 · risk checks — market status, tick/lot grid, size limits, min notional
3 · ledger.post(recipes.orderHold(...))     ← quote for buys, base for sells
4 · submit to the matching engine
5 · on Fill    → ledger.post(recipes.tradeFill(...))
6 · on Cancel  → ledger.post(recipes.orderHoldRelease(...))
```

Step 3 before step 4 is the whole design. Reverse them and a fill can print against money that is not there — and
a printed fill cannot be un-printed, because the counterparty has already been told they traded.

---

## API

tRPC, `src/router.ts`. Every amount on this boundary is a **decimal string**, in and out: `Amount` is a scaled
bigint and bigint does not survive JSON, while a JS number would round away the 18th decimal place — which is
where the ledger reconciles.

| Procedure       | Scope                        | Input                                                                              | Output     |
| --------------- | ---------------------------- | ---------------------------------------------------------------------------------- | ---------- |
| `health`        | —                            | —                                                                                  | `{ ok }`   |
| `markets.list`  | — (public)                   | —                                                                                  | `Market[]` |
| `markets.get`   | — (public)                   | `{ symbol }`                                                                       | `Market`   |
| `orders.create` | `trade:write` + jurisdiction | `{ symbol, side, type, qty, price?, timeInForce?, clientOrderId?, subAccountId? }` | `Order`    |
| `orders.cancel` | `trade:write`                | `{ orderId }`                                                                      | `Order`    |
| `orders.get`    | `trade:read`                 | `{ orderId }`                                                                      | `Order`    |
| `orders.open`   | `trade:read`                 | `{ marketId? }`                                                                    | `Order[]`  |
| `fills.mine`    | `trade:read`                 | `{ limit? }`                                                                       | `Fill[]`   |

`trade:withdraw` appears nowhere, deliberately: it is an `INTERACTIVE_ONLY_SCOPE` that no API key may hold, which
is what protects a leaked bot key from moving value off the platform.

**Order types:** `limit` and `market`. **TIF:** `GTC`, `IOC`, `FOK`, `PO`. Reading a listing is public; placing
an order is `trade:write` and goes through the jurisdiction matrix. Cancelling deliberately is **not** gated on
the market being tradable or on the kill-switch — an operator who halts a market must still let users out, and a
control that traps funds is not a safety control.

### Operator surface

`listMarket()` and `setMarketStatus()` are service methods with no user-facing route. A listing decides the tick
and lot grid and therefore decides whether a legal fill on that market can be worth nothing.

---

## Events

**Publishes**

| Subject                        | When                                                                          | Idempotency key            |
| ------------------------------ | ----------------------------------------------------------------------------- | -------------------------- |
| `intafaced.identity.xp.earned` | an order reaches a terminal state having filled at least partly (§5.2 step 4) | `trade.order.xp:<orderId>` |

This service publishes **no subject of its own**. `intafaced.trade.*` is not in `packages/events/src/catalog.ts`,
and adding one is a contracts/events PR that comes first (§15.2) — so the only thing emitted here is a subject the
catalog already declares. svc-identity is the only writer of rank state (§4.1); this service says what happened
and has no opinion about what it is worth.

**Consumes**

| Subject                              | Consumer (durable) | Effect                                         |
| ------------------------------------ | ------------------ | ---------------------------------------------- |
| `intafaced.matching.order.filled`    | `trade-fills`      | `tradeFill` recipe, then close out both orders |
| `intafaced.matching.order.cancelled` | `trade-cancels`    | release the remainder of that order's hold     |

These are the **recovery path**. A submission settles its own fills inline from the engine's response; the engine
also publishes every match to NATS regardless, so a process that died between the engine printing a fill and this
service settling it heals when the event is delivered. Both handlers are idempotent twice over — `idempotent()`
around the handler, and business keys underneath — because at-least-once is the only delivery there is, and a
redelivered fill that settled twice would pay a counterparty out of a hold that only funded one trade.

---

## Ledger

Every recipe this service invokes, and what it touches. **No new recipes were added** — `orderHold`,
`orderHoldRelease` and `tradeFill` already existed in `packages/ledger-client/src/recipes/`.

| Recipe             | Reason code           | Accounts                                                                                                 | Idempotency key             |
| ------------------ | --------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------- |
| `orderHold`        | `order.hold`          | user available → user hold                                                                               | `order.hold:<orderId>`      |
| `tradeFill`        | `trade.fill`          | taker hold → maker available + `houseFees('trade')`; maker hold → taker available + `houseFees('trade')` | `trade.fill:<fillId>`       |
| `orderHoldRelease` | `order.hold.released` | user hold → user available                                                                               | `order.release:<orderId>:0` |

**Every key is a business key.** `fillId` derives from `(marketId, engineSequence)` — the engine's own business
key for a match — and `orderId` derives from `(userId, marketId, clientOrderId)` when the caller supplies one, so
a retry from a bot, a redelivery from JetStream, or an operator replaying a day all compute the same key and the
ledger returns the original transaction. `crypto.randomUUID()` appears exactly once in this service, for an order
whose caller chose not to supply a client id — and that order is the only one a retry can double.

### Where the money is, at every point

| State                               | Where the funds are                                       |
| ----------------------------------- | --------------------------------------------------------- |
| `pending`                           | still in the user's `available` — nothing has been posted |
| `open`                              | `hold`, minus whatever fills have already drawn down      |
| `filled` / `cancelled` / `rejected` | back in `available`, or paid to the counterparty          |

**One release per order, ever** — sequence `0`, fixed. An order reaches a terminal state exactly once, so the key
never needs to vary, and a fixed key is what makes a double-release impossible rather than merely unlikely.

---

## If this crashes exactly here, whose funds are stranded?

The question asked of every step, and the answers the code is shaped around.

| Crash point                                   | Whose funds | Why not                                                                                                                                                                                                                                                                               |
| --------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| After the risk checks, before the intent row  | nobody      | Nothing has been written and nothing posted.                                                                                                                                                                                                                                          |
| After the intent row, before the hold         | nobody      | A `pending` row has no ledger post behind it and no engine presence. The only correct recovery is to delete it — and that is the only thing it can do. This is why the row comes **before** the hold: a hold posted against an order id that exists nowhere is money nobody can find. |
| After the hold, before the engine             | nobody      | The row is `open` with its hold intact. Cancelling it releases in full; svc-matching answers `404` for an order it never took, which is an answer, not an error.                                                                                                                      |
| The engine submission fails at the transport  | nobody      | **Indeterminate** — the engine may hold the order. The hold is deliberately _kept_, because releasing funds for an order that might be live in the book is exactly the failure this ordering exists to prevent. Recovery is a cancel.                                                 |
| After a fill row, before the `tradeFill` post | nobody      | The fills table can only ever be **ahead** of the ledger, so `consumed` is never understated and a release is never overstated. Worst case the funds stay in `hold`; re-running the fill re-posts the same idempotency key and heals it.                                              |
| After the release, before the terminal status | nobody      | Terminal status is what makes `finalize` return early, so the release happens **first**. A crash leaves a non-terminal row, a retry recomputes the same remainder, and the fixed release key makes the second post a no-op.                                                           |

The one ordering that is **not** safe, and is therefore not used: posting `tradeFill` before recording the fill.
A crash there understates `consumed`, and the next release hands back money the fill already spent — drawn out of
whatever else that user has in `hold`. That is one order silently paying for another.

---

## Funding a market buy

A market order carries no price, so there is no honest amount to hold for it. The order is funded at
`bestAsk × (1 + TRADE_MARKET_SLIPPAGE_CAP_BPS)`, rounded up to the tick, and submitted to the engine as a
**marketable IOC limit at exactly that price**. The engine therefore physically cannot fill it above what was
held — the funding invariant survives even if the book moves between the depth read and the submission, because a
book that moved up simply fills less. Anything the fill did not spend comes back with the remainder.

A market **sell** needs none of this: the hold is base quantity, which is known exactly whatever the price does.

## Rounding, stated

| Quantity               | Direction | Why                                                                                                                                                                                        |
| ---------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| buy hold `price × qty` | **ceil**  | A hold one wei short is a fill the ledger will refuse at settlement, after the book has already moved on.                                                                                  |
| fill `price × qty`     | **floor** | A sum of floored parts can never exceed the ceiling of the whole, so a partial fill can never out-spend its hold. The leftover wei is released with the remainder — it is not left behind. |
| fee rate discount      | **floor** | Value credited to a user is floored so rounding never invents value that has to come from somewhere.                                                                                       |

---

## Fee tiers

svc-identity publishes a machine-readable perk table; this service applies the one field it cares about,
`feeDiscountBps`, without knowing what a rank means. The effective rate is
`published − floor(published × discountBps / 10000)`.

It is read **once, at order placement**, and snapshotted onto the order row. Two consequences, both deliberate:

1. A rank change cannot retroactively re-price an order that was already accepted on the old terms — the same
   reason `token.stakes` snapshots its multiplier at open.
2. The fill path makes **no network call**. A fill must settle even when svc-identity is down, because by then
   the match has printed and the counterparty is already owed.

The read fails **closed**: an order is refused if the perk table cannot be read. Nothing has moved at that point,
which is exactly why it is the right place to be strict.

> **Known limitation, stated rather than hidden.** `tradeFill` takes fee rates as integer basis points, so a
> small discount on a small published fee rounds away entirely — 25 bps of discount on a 10 bps maker fee is
> 0.025 bps, which is not representable. **SOCKET §13 — amount-level fee discounting**: applying the discount to
> the fee _amount_ keeps all 18 decimal places and is exactly what `feeCharge`'s token branch already does. It
> needs `tradeFill` to accept fee amounts instead of bps, which is a `packages/ledger-client` change and
> therefore its own PR first (§15.2).

---

## Database constraints as a backstop

The service checks these; the database enforces them regardless.

| Constraint                                | What it catches                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `orders_hold_positive_ck`                 | **an order row with no hold behind it** — the one thing that would let the engine match unfunded value |
| `orders_not_overfilled_ck`                | this service and the engine disagreeing about a book                                                   |
| `orders_client_id_idx` (unique)           | a retried bot request opening a second position                                                        |
| `fills_market_sequence_role_idx` (unique) | a redelivered fill event settling a match twice                                                        |
| `markets_dust_free_ck`                    | a listing whose smallest legal fill is worth zero — the ledger will not post a movement of nothing     |
| `markets_fee_bounds_ck`                   | a fee at or above 100%, which `tradeFill` would refuse to build entries for                            |
| `orders_price_shape_ck`                   | a limit order with no price, or a market order carrying one                                            |

---

## Not in this PR

`trade.spot` only. §5.2 also specifies tables and behaviour that belong to other tracker features:

| §5.2 item                                                          | Where it goes                                                                             |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `positions`, `funding_rates`, `insurance_fund`, liquidation ladder | `trade.futures`                                                                           |
| options (European, cash-settled, full collateral)                  | `trade.options`                                                                           |
| `copy_leaders`, `copy_follows`, profit share                       | `trade.copy`                                                                              |
| `otc_quotes`, RFQ, staked-tier gate                                | `trade.otc`                                                                               |
| Convert one-tap                                                    | `trade.convert`                                                                           |
| TWAP / VWAP / POV                                                  | `trade.algo`                                                                              |
| internal market-maker bot, venue aggregation                       | `trade.mm-bot`, `venue.aggregation`                                                       |
| CCXT REST/ws surface over this router                              | `trade.ccxt-api`                                                                          |
| volume aggregates per user per window feeding fee tiers            | SOCKET §13 — a windowed job over `fills`; the fills it needs are all written here already |

The `market_kind` enum already carries `futures` and `options`, so listing one later is an `INSERT`, not a
migration.

**Stop and take-profit orders are refused** (`trade.order_type_unsupported`). The engine already matches them and
the public contract already carries `take_profit`, but funding them honestly is not solved: a stop _buy_ has no
price until it triggers, possibly days later, so either it is funded at submission against a price nobody can
predict, or it reaches the engine unfunded — and an unfunded order in the book is the one thing this whole design
exists to prevent. **SOCKET §13** — the fix is a trigger-time funding callback from svc-matching, which is a
change to that service's contract and therefore its own PR.

---

## Kill-switch

`trade.spot` in the admin console, or `TRADE_SPOT_ENABLED=false`.

**Effect when off:** new orders are refused with `trade.spot_disabled` before anything is read or held. Cancels,
reads and listings keep working, and `/ready` returns 503 so the load balancer takes the instance out of the
order-placement rotation. Halting an individual market (`setMarketStatus`) is the finer-grained version and
behaves the same way: it stops new risk, it does not confiscate positions.

---

## Running it

```bash
docker compose up -d
pnpm --filter @intafaced/svc-trade db:migrate
pnpm --filter @intafaced/svc-trade test
pnpm gate svc-trade
```

## Tests

70 tests. 31 are pure — fee rate arithmetic and every risk check — and run without a database, because the rate
they compute is the number handed to a six-entry ledger recipe and getting it wrong fails silently rather than
loudly.

The remaining 39 run the money paths against **real Postgres** with the ledger's in-memory reference
implementation, which the conformance suite proves equivalent to svc-ledger's Postgres engine (§4.4). Postgres is
real because the release amount is derived from the fills table, so "what does the database actually contain" is
load-bearing.

The matching engine is a **stub**, and deliberately: §15.2 forbids one service importing another's source,
svc-matching has 76 tests of its own covering the book, and what is under test here is svc-trade's _ordering_ —
not whether price-time priority works. The stub speaks svc-matching's published wire shapes, decimal strings and
all.

**Failure branches covered:** insufficient funds on a buy and on a sell (no row, no engine submission), a refused
hold retried, cancel before any fill, cancel after a partial fill (only the remainder, exactly once), a second
cancel, a redelivered cancel event, a redelivered fill event, an IOC remainder, a resting order pulled by
self-trade prevention, an engine rejection, an unreachable engine mid-submission, a halted market, cancelling out
of a halted market, the kill-switch, a missing scope, off-grid price, off-grid quantity, sub-minimum notional, a
stop order, a market buy with no ask to price against, a perk table that cannot be read, and six concurrent
identical submissions.

**Invariants asserted:** `ledger.totalsByAsset()` is zero for every asset after every settlement path;
`ledger.reconcile()` and `ledger.verifyChain()` are clean after a run of mixed operations; `orders.filled_qty`
always equals `SUM(fills.qty)`; the sum of open orders' `hold_amount` always equals the ledger's `hold` balance,
per asset; no `available` or `hold` balance ever goes negative; and no terminal order consumed more than it held.
