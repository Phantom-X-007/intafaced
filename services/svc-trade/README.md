# svc-trade

**THE PRODUCT LAYER (§5.2).** Listings, the order lifecycle, and fees.

**What this service is not:** it does not match orders and it does not hold balances. The book lives in
svc-matching; the money lives in svc-ledger. This service is the thing in between — the one that decides an order
is allowed, funds it, hands it to the engine, and turns what comes back into ledger transactions.

**Primary shipped surface here:** `trade.spot` + mounted Convert / OTC / CCXT REST / futures-orderable path (flagged).

| Surface                                     | Mount              | Default                                                                       |
| ------------------------------------------- | ------------------ | ----------------------------------------------------------------------------- |
| Convert                                     | tRPC `convert.*`   | ON (`TRADE_CONVERT_ENABLED`)                                                  |
| OTC                                         | tRPC `otc.*`       | mounted; blank §8 law → refuse-closed                                         |
| Algo TWAP create/ctrl                       | tRPC `algo.*`      | create ON; **scheduler job OFF** (`TRADE_ALGO_JOBS_ENABLED`, denylist enable) |
| Copy                                        | `src/copy/**` only | **unmounted** (no router/env — deliberate)                                    |
| Futures jobs / candle / MM seed / reconcile | job hosts          | **OFF**                                                                       |

Wave-3 sealed money on tip (#1193 TWAP respace+jobs OFF, #1191/#1199 copy races, #1202–#1207 funding/insurance/reconcile, #1211 margin-call). See tracker `trade.copy` / `trade.algo` and [Not in this PR](#not-in-this-pr).

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
ledger returns the original transaction. On the **spot live place path**, `crypto.randomUUID()` is used only when
the caller omits `clientOrderId` — and that order is the only live place a retry can double-hold. Elsewhere in this
service UUID generation is used for paper place, OTC quote ids, copy follow ids, and futures position ids (position
open has no client idempotency key — see audit residual).

### Seed / mm honesty (Spec SD-2…SD-4)

| Rule              | Behavior                                                                       |
| ----------------- | ------------------------------------------------------------------------------ |
| **Flag**          | `orders.seeded` + `OrderRecord.seeded` (migration `0004_order_seeded`)         |
| **Place**         | `placeOrder({ seeded: true })` only when `seedPlaceEnabled` (kill-switch SD-4) |
| **Public volume** | `publicTape` / candles exclude fills involving any seeded order (SD-3)         |
| **F8**            | seed↔seed prints never inflate public tape                                     |

### OHLCV / candles (A-TRADE-SPOT-1 + A-TRADE-SPOT-OPS)

| Path                                 | Behavior                                                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **REST** `GET /api/v1/ohlcv/:symbol` | Live SQL aggregation from non-seeded taker fills (`queryCandlesFromFills`). Empty market → `[]`. Gaps stay gaps — never zero-filled.             |
| **Job** `TRADE_CANDLE_JOBS_*`        | Default **OFF**. When enabled + market ids set, materializes _closed_ buckets into `trade.spot_candles`. Never invents markets or empty candles. |

#### Ops enable path (default safe)

Job stays **OFF** until an operator deliberately enables it. Missing market list or empty mids → job host not scheduled (never invent a market list).

| Env                             | Default | Meaning                                                           |
| ------------------------------- | ------- | ----------------------------------------------------------------- |
| `TRADE_CANDLE_JOBS_ENABLED`     | `false` | Master kill. Only `1` / `true` / `on` / `yes` turns on.           |
| `TRADE_CANDLE_JOBS_INTERVAL_MS` | `60000` | Tick interval when enabled (5s–1h).                               |
| `TRADE_CANDLE_JOBS_MARKET_IDS`  | `""`    | Comma-separated **market UUIDs**. Empty → no job even if enabled. |
| `TRADE_CANDLE_JOBS_TIMEFRAMES`  | `1m`    | e.g. `1m,5m,1h`. Invalid tokens dropped.                          |

**Enable checklist (ops):**

1. Confirm REST ohlcv already honest for a traded symbol (`[]` if never filled — not fake zeros).
2. Set `TRADE_CANDLE_JOBS_MARKET_IDS` to real `trade.markets.id` values only.
3. Set `TRADE_CANDLE_JOBS_ENABLED=true` on the svc-trade process you intend to materialize (not every replica blindly).
4. Watch logs for `candle materialize ok` with `written > 0` only when closed buckets have real fill volume.
5. Kill: set enabled false or clear market ids — REST path keeps working from fills.

**Honesty bans:** invent candles, invent markets, zero-fill gaps, include seed volume in public ohlcv (seeded fills excluded — SD-3).

### Venue fabric mark (A-TRADE-VENUE-1 + A-TRADE-VENUE-OPS)

Public mid from §27 venue fabric (`packages/venue-adapter`) preferred over matching depth for futures mark ticks when configured. **Default OFF** — empty venue id means depth-only marks (or null when book empty). Never invents a mid.

| Path                                      | Behavior                                                                                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Mark** `TRADE_VENUE_MARK_*`             | When venue id + symbol map set, `createConfiguredVenueMarkSource` builds a `MarkSource` from public book snapshot; futures jobs prefer it, then depth. |
| **MM mid** `TRADE_MM_SEED_MID_FROM_VENUE` | Default **OFF**. When true, after env mid map miss, MM seed may use the **same** venue adapter + symbol map. Still skips market if mid null.           |

#### Ops enable path (default safe)

| Env                            | Default | Meaning                                                                                                                                                       |
| ------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TRADE_VENUE_MARK_VENUE`       | `""`    | Venue id. Empty = mark port off. Known public adapters: **`binance-spot`**, **`bybit-spot`** — both keyless. Unknown id → warn once, stay off (never invent). |
| `TRADE_VENUE_MARK_SYMBOLS`     | `""`    | `marketId:BTC/USDT,other:ETH/USDT` — our market UUID → venue unified symbol. Unmapped market → null mark for that id.                                         |
| `TRADE_MM_SEED_MID_FROM_VENUE` | `false` | Optional MM mid fallback from the same venue map. Only `1` / `true` / `on` / `yes` turns on.                                                                  |

**Enable checklist (ops):**

1. Pick the venue and confirm its public path is acceptable for this environment (egress, rate limits). `binance-spot` spends request WEIGHT against a 6000/min IP budget; `bybit-spot` spends one REQUEST against a 600-per-5s IP budget. Both governors reserve 20% headroom, and both refuse rather than silently waiting.
2. Set `TRADE_VENUE_MARK_SYMBOLS` to real `trade.markets.id` → venue symbols only (never invent symbols). The symbol format is the unified one (`BTC/USDT`) for either venue — the venue's own spelling is produced inside the adapter and nowhere else.
3. Set `TRADE_VENUE_MARK_VENUE=binance-spot` **or** `bybit-spot` on the svc-trade process that runs futures mark / MM (not every replica blindly if you do not want external polls). One venue at a time: this mount takes a single id, and a mark is preferred-then-fallback, not a cross-venue median.
4. Health: process log / ready payload includes `venueMark: { venueId, symbols }` when configured; absent when off.
5. Optional MM: after env mids map is trusted or deliberately empty, set `TRADE_MM_SEED_MID_FROM_VENUE=true` — still skips any market with no mid.
6. Kill: clear `TRADE_VENUE_MARK_VENUE` or symbols — marks fall back to matching depth mid only; never invent.

**Honesty bans:** invent mid, invent second venue adapter without fabric support, treat empty/one-sided book as a price, treat account observations as ledger truth, enable trading half of venue (credentials / Vault) as if public mark worked.

**Second venue:** shipped 2026-08-08 as `bybit-spot` (public market data only; no trade or account half exists for it, and no credential is read anywhere in it). The bar was and remains: a real `MarketDataAdapter` in the fabric **and** `createVenueMarketDataAdapter` knowing the id — do not stub a name. A THIRD venue is not needed by any open residual on `venue.aggregation`.

Seeder process resume (SD-1/SD-6) is a separate eng residual.

### Reconcile open ↔ hold ↔ engine (Spec CX-9)

Operator recovery for a **single** suspect order (not cancel-all):

| Case                    | Detection                              | Action                                                     |
| ----------------------- | -------------------------------------- | ---------------------------------------------------------- |
| **orphan pending**      | `pending` + ledger hold 0              | delete row                                                 |
| **open+hold no engine** | `open` + hold > 0 + engine cancel miss | release remainder once                                     |
| **open+engine no hold** | `open` + hold 0                        | **fail closed** — never invent hold; cancel free book risk |

```ts
await trade.reconcileOrder(orderId);
// tests: src/spot/order-route-reconcile.test.ts
```

### Scheduled engine ↔ ledger reconcile (A10)

Default **OFF**. Builds the counterpart view from `trade.orders` (open/pending) + **live** hold balances, POSTs matching `POST /reconcile`, and:

| Engine finding                         | Local action                              |
| -------------------------------------- | ----------------------------------------- |
| **refuse** (incl. open+hold no engine) | **write nothing** — warn log / alert only |
| **auto** unfunded **pending**          | DELETE intent row only (moves no value)   |

Does **not** call `reconcileOrder` (which still releases on open+hold no engine — operator single-order tool; handoff flags that risk). Env: `TRADE_RECONCILE_JOBS_ENABLED`, `TRADE_RECONCILE_JOBS_INTERVAL_MS`.

```ts
// pure + tick: src/spot/engine-ledger-reconcile.ts
// job host:   src/spot/engine-ledger-reconcile-jobs.ts
// tests:      src/spot/engine-ledger-reconcile.test.ts
```

### Order-path smoke (Spec CX-8)

Assembled health probe (trade + matching + ledger HTTP):

```bash
pnpm order-path-smoke
# fleet up → PROOF_OK assembled-health
# fleet down → HONEST_SKIP exit 0 (set ORDER_PATH_SMOKE_STRICT=1 to fail CI when down)
```

In-process chaos + property suites (`order-route-chaos.test.ts`, `order-route-properties.test.ts`) are the CI seal for hold/fill/idempotency without inventing live fills.

### clientOrderId policy (Spec CX-11)

| Rule                   | Guidance                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Recommend**          | Always send a unique `clientOrderId` per intent (global unique or day-scoped + user+market is enough). Retries must reuse the **same** id. |
| **Exactly-once place** | Same `(userId, marketId, clientOrderId)` → one order, one hold, one engine submit (chaos F1).                                              |
| **Unsafe**             | Place without `clientOrderId` then retry on timeout — a second UUID is a second hold.                                                      |
| **Constraint**         | Uniqueness is enforced by deterministic order id derivation + order row insert; DB unique on client id is optional hardening residual.     |

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

| Crash point                                   | Whose funds | Why not                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| After the risk checks, before the intent row  | nobody      | Nothing has been written and nothing posted.                                                                                                                                                                                                                                                                           |
| After the intent row, before the hold         | nobody      | A `pending` row has no ledger post behind it and no engine presence. The only correct recovery is to delete it — and that is the only thing it can do. This is why the row comes **before** the hold: a hold posted against an order id that exists nowhere is money nobody can find.                                  |
| After the hold, before the engine             | nobody      | The row is `open` with its hold intact. Cancelling it releases in full; svc-matching answers `404` for an order it never took, which is an answer, not an error.                                                                                                                                                       |
| The engine submission fails at the transport  | nobody      | **Indeterminate** — the engine may hold the order. The hold is deliberately _kept_, because releasing funds for an order that might be live in the book is exactly the failure this ordering exists to prevent. Recovery is a cancel.                                                                                  |
| After a fill row, before the `tradeFill` post | nobody      | Fills stay ahead of the ledger so `consumed` is never understated. **Fee-exhaust class is different:** if fees leave a side with nothing, `tradeFill` throws forever — so `settleFill` now refuses with `trade.fee_exceeds_fill` _before_ inserting rows. Ordinary post failures still heal on re-run of the same key. |
| After the release, before the terminal status | nobody      | Terminal status is what makes `finalize` return early, so the release happens **first**. A crash leaves a non-terminal row, a retry recomputes the same remainder, and the fixed release key makes the second post a no-op.                                                                                            |

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

| Constraint                                | What it catches                                                                                                                                                                                                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `orders_hold_positive_ck`                 | **live orders must carry a non-negative hold** — was `> 0` at init; paper markets (`0006`) widened to `>= 0` so sim rows need no ledger post. Live `placeOrder` still posts `hold_amount > 0`; the CHECK alone no longer forbids an unfunded open row (service + paper isolation own that) |
| `orders_not_overfilled_ck`                | this service and the engine disagreeing about a book                                                                                                                                                                                                                                       |
| `orders_client_id_idx` (unique)           | a retried bot request opening a second position                                                                                                                                                                                                                                            |
| `fills_market_sequence_role_idx` (unique) | a redelivered fill event settling a match twice                                                                                                                                                                                                                                            |
| `markets_dust_free_ck`                    | a listing whose smallest legal fill is worth zero — the ledger will not post a movement of nothing                                                                                                                                                                                         |
| `markets_fee_bounds_ck`                   | a fee at or above 100%, which `tradeFill` would refuse to build entries for                                                                                                                                                                                                                |
| `orders_price_shape_ck`                   | a limit order with no price, or a market order carrying one                                                                                                                                                                                                                                |

---

## Not in this PR

`trade.spot` only. §5.2 also specifies tables and behaviour that belong to other tracker features:

| §5.2 item                                                               | Where it goes                                                                                                                                           |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `positions`, `funding_rates`, `insurance_fund`, liquidation ladder      | `trade.futures`                                                                                                                                         |
| options (European, cash-settled, full collateral)                       | `trade.options`                                                                                                                                         |
| `copy_leaders`, `copy_follows`, **fee-share** (P&L profit-share banned) | `trade.copy` — code under `src/copy/**` exists; product mount residual (unreachable from router today)                                                  |
| `otc_quotes`, RFQ, staked-tier gate                                     | `trade.otc`                                                                                                                                             |
| Convert one-tap                                                         | `trade.convert` — **quote + execute on this service** (`convert.quote` / `convert.execute`; market IOC + house RFQ spread; same hold→fill path as spot) |
| TWAP / VWAP / POV                                                       | `trade.algo`                                                                                                                                            |
| internal market-maker bot, venue aggregation                            | `trade.mm-bot`, `venue.aggregation`                                                                                                                     |
| CCXT REST/ws surface over this router                                   | `trade.ccxt-api`                                                                                                                                        |
| volume aggregates per user per window feeding fee tiers                 | SOCKET §13 — a windowed job over `fills`; the fills it needs are all written here already                                                               |

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

**One switch per plane.** `TRADE_SPOT_ENABLED` governs spot, `TRADE_FUTURES_ENABLED` governs futures, and neither
halts the other — an operator stopping spot has not stopped futures, and there is no version of a single boolean
standing for both that is the honest answer. Both refuse only NEW orders; a cancel is never refused by either,
because a switch that traps funds is not a safety control.

---

## Futures orderability (`TRADE_FUTURES_ENABLED`)

**Default off, and off is a product state rather than an outage.** With the flag off a futures market may be
listed, appears in `fetchMarkets`, answers its ticker and orderbook, and refuses an ORDER with
`trade.futures_disabled` — CCXT `NotSupported`, HTTP 403. Not `BadSymbol`, because the symbol is real and an
operator can turn the switch on; not `OnMaintenance`, because nothing is degraded or coming back on its own.

With it on, futures orders match on the **same** svc-matching book as spot, under the futures market's own id
(D-S-06 is Accepted — there is no second book), and settle through `packages/ledger-client` like any other fill.

**What the flag does not do**, because a name like `FUTURES_ENABLED` invites all three assumptions:

- **No leverage.** A futures order is funded by the same `holdFor` as a spot order — quote for buys, base for
  sells, in full. Orderability creates no margin position and picks no risk parameter; leverage and margin defaults
  beyond `DIRECTION` §1's are owner-only (§8 item 8). Leveraged entry remains `PositionService`'s path, behind its
  own gate and its own named profit source.
- **No funding.** Turning funding on for a market at all is reserved to the owner
  (`docs/adr/2026-08-05-futures-risk-and-mark-law.md`), and it still needs `TRADE_FUTURES_JOBS_ENABLED` plus an
  explicit `TRADE_FUTURES_FUNDING_MARKET_IDS`.
- **No payout source.** `TRADE_FUTURES_PROFIT_SOURCE` still has no default, on purpose.

**Convert and TWAP stay spot-only on both settings** (`assertSpotSurface`). They were spot-only for free while
`assertTradable` refused every non-spot market; now that it does not, they refuse by name, because neither has been
designed or tested against a market whose position is a margin row rather than a base-asset balance.

**Why this could not land before 2026-08-08.** The mark was size-blind, so two dust orders on a futures book minted
a payout-grade mid — `assertTradable`'s flat refusal was the only thing making that unreachable, and
`futures/mark-from-depth.ts` said so in its own header: "a different file's accident, not a control". `c7dfb5e4`
and `cc90c2f4` made both the internal-depth and venue mids size-aware and armed the deviation breaker against a
stored `accepted_mark`. `futures/orderable-path.test.ts` rests the dust through the real order path and asserts the
profit pot does not move.

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
