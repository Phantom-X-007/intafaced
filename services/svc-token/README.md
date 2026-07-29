# svc-token

**The native economy — IFC (§4.3).** Third and last of the Phase 1 Core services.

Owns the emission schedule, the staking ladder, real-yield distribution, and buyback & burn.

**What this service is not:** it does not hold balances and it does not price anything. `stakes` records who staked what and when; the value lives in the ledger's `stake` accounts. Pricing and execution are svc-trade's job — this service never decides a price.

---

## API

| Route / method                              | Scope / auth            | Purpose                                                                                                                   |
| ------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `GET /internal/stake/:userId`               | service headers         | **The hot path.** §4.3: other services call this to gate launchpad allocations, OTC access, premium lobbies, vendor slots |
| `POST /internal/emissions/mint-next`        | service headers         | Cron-friendly mint of the next sequential epoch (refuses when `EMISSIONS_ENABLED=false`)                                  |
| tRPC `stake`                                | `token:stake`           | Opens a stake for the signed principal — ledger first, then the record                                                    |
| tRPC `unstake`                              | `token:stake`           | Returns principal; enforces lock + ownership                                                                              |
| tRPC `listStakes`                           | `token:read`            | Stakes owned by the signed principal                                                                                      |
| tRPC `stakeOf` / `accessOf`                 | `token:read`            | Total active stake / access tier + fee discount                                                                           |
| tRPC `mintEpoch` / `nextEmissionEpoch`      | `admin:treasury` / read | Operator mint (optional `epoch`) and next index                                                                           |
| `distributeRevenue` / `recordBuyback` (svc) | internal                | Real-yield + buyback — still operator/job surface, not yet on /trpc                                                       |

Optional auto-tick: set `EMISSIONS_AUTO_TICK=true` (and leave `EMISSIONS_ENABLED=true`) to mint the next sequential epoch every `EMISSIONS_TICK_MS` (default 1 day). Prefer external cron → `/internal/emissions/mint-next` or tRPC `mintEpoch` so the job is pauseable.

---

## Events

**Publishes**

| Subject                             | When                                    |
| ----------------------------------- | --------------------------------------- |
| `intafaced.token.stake.created`     | a stake opens — gates unlock downstream |
| `intafaced.token.buyback.completed` | a buyback run settles                   |

**Consumes** — nothing yet. In Phase 2 it consumes trade fills to compute revenue windows automatically; today the window's revenue is supplied by the caller.

---

## Ledger

Every recipe this service invokes, and what it touches:

| Recipe               | Reason code               | Accounts                             |
| -------------------- | ------------------------- | ------------------------------------ |
| `stake`              | `token.stake`             | user available → user stake          |
| `unstake`            | `token.unstake`           | user stake → user available          |
| `sweepFeesToRewards` | `token.fee.swept`         | `houseFees(module)` → rewards engine |
| `rewardPay`          | `token.yield.distributed` | rewards engine → user available      |
| `burn`               | `token.burn`              | rewards engine → burn account        |
| `mintEmission`       | `token.emission`          | mint boundary → destination          |

> **This PR adds one recipe to `packages/ledger-client`:** `sweepFeesToRewards`. Strictly §15.2 says a shared-package change should be its own PR first — flagging it rather than burying it. It exists because real yield must demonstrably come from fees the platform earned, and the trail from `houseFees(module)` to a user's balance should be two queryable ledger transactions rather than one opaque one.

### Why staking value lives in the ledger

"How much IFC is staked" is answerable two independent ways — by summing `token.stakes`, and by reading the ledger's `stake` accounts. They must agree. A test asserts exactly that. If the principal lived only in this service's table, there would be nothing to reconcile against and Doctrine §0.6 would be a comment rather than a property.

`stakes.amount` is the principal recorded at stake time and **never changes after insert**. Yield goes to `available`, not to the principal. A mutating amount column would be a second source of truth for money.

---

## Ordering decisions that matter

**Stake: ledger first, then the row.** If the ledger post fails, no row is written. If the row write fails, the ledger post is idempotent and a retry reconciles. The reverse order would allow a `stakes` row with no value behind it — a stake we would owe yield on that nobody funded.

**Unstake: row lock for the whole operation.** Two concurrent unstakes cannot both post. The ledger's idempotency key would catch a double-post anyway, but relying on the last line of defence for ordinary correctness is how the last line stops being one.

**Yield: one ledger transaction per recipient**, keyed on `(window, user)`. A crash halfway through is resumable — re-running pays only whoever was missed. One giant transaction would be atomic but unresumable, and with thousands of stakers that is the worse trade.

---

## Database constraints as a backstop

The service checks these; the database enforces them regardless.

| Constraint                           | What it catches                                                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `emission_epochs_within_schedule_ck` | **the mint ceiling** — a retried allocation minting unauthorised supply                                   |
| `buyback_runs_split_conserved_ck`    | a rounding bug promising the rewards engine tokens that do not exist                                      |
| `buyback_runs_window_idx` (unique)   | a re-scheduled job spending the same revenue twice                                                        |
| `stakes_lock_required_ck`            | an m3/m12 stake with no `unlocks_at` — a lock multiplier on withdrawable-on-demand funds, i.e. free yield |
| `stakes_amount_positive_ck`          | a negative stake dragging the pro-rata denominator down and overpaying everyone else                      |
| `governance_votes_one_per_user_idx`  | ballot stuffing                                                                                           |
| `token_params_singleton_ck`          | two rows = two economies, whichever a job reads first wins                                                |

---

## Kill-switch

`EMISSIONS_ENABLED=false` halts minting on every path (tRPC, internal cron endpoint, auto-tick). This is the only thing between a mis-tuned curve and permanent supply inflation, and **inflation cannot be un-minted** — which is why it is a separate switch rather than a general service toggle. `EMISSIONS_AUTO_TICK` defaults off so a redeploy never silently opens the faucet.

---

## Running it

```bash
docker compose up -d
pnpm --filter @intafaced/svc-token db:migrate
pnpm --filter @intafaced/svc-token test
```

## Tests

115 tests. The economics (emission curve, staking multipliers, buyback split, yield distribution) are pure functions tested exhaustively without a database — including property-style checks that a split always sums back exactly and that 1,000 uneven stakers lose no dust.

The money paths run against real Postgres with the ledger's in-memory reference implementation, which the conformance suite proves equivalent to svc-ledger's Postgres engine (§4.4).

Failure branches covered: staking more than you hold, unstaking while locked, unstaking twice, concurrent unstakes, minting a closed epoch, minting past the schedule, distributing an empty window, and re-running a distribution.
