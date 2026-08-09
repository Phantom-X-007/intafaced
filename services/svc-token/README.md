# svc-token

**The native economy — IFC (§4.3).** Third and last of the Phase 1 Core services.

Owns the emission schedule and the staking ladder. Holds the maths and the ledger recipes for real-yield distribution and burn — and, as of 2026-08-03, says plainly that those last two are operator actions rather than the §4.3 flywheel.

**What this service is not:** it does not hold balances and it does not price anything. `stakes` records who staked what and when; the value lives in the ledger's `stake` accounts. Pricing and execution are svc-trade's job — this service never decides a price.

---

## What is automatic, and what is a person (read before quoting §4.3 at a user)

Staking, access tiers and emissions are live end to end. The other three §4.3 economy surfaces are **§13 sockets** in `tooling/tracker/features.mjs`, corrected there from `done` on 2026-08-03 after an audit found the tracker describing operator mutations as live flywheels.

| §4.3 says                                                                       | What actually runs                                                                                                                                                                                                                                                                                                                                                      | Socket             |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| "weekly job aggregates house fee accounts per asset → distributes"              | `distributeRevenue`, invoked by hand. **No caller exists** outside tests — no cron, no bus subscriber, no admin form. `sources[].amount` is validated for decimal shape only; nothing reads the `houseFees` balance it claims to sweep (audit T-03).                                                                                                                    | `token.yield`      |
| "market-buy on internal book → split to burn + rewards. Structural, scheduled." | `recordBuyback`, invoked by hand. **Nothing is bought** — `tokensBought` is typed by the operator (must be positive; zero would still claim the revenue window). `revenueTotal` is validated as assetId → unsigned decimal strings before claim. The only ledger movement is the burn leg out of the rewards engine. `buybackBudget()` has no caller but its own tests. | `token.buyback`    |
| "IFC-weighted voting" with `proposals.status`                                   | Ballots are recorded and weighted correctly. **No proposal can change status.** `passed` / `rejected` / `executed` / `cancelled` are declared on the enum and written by no code in this repo; there is no quorum, threshold, tally job, close job or executor. `draft` is terminal too — a future `opensAt` can never open.                                            | `token.governance` |

None of the three is a rename away from working. Yield has a service-side **window header** (`token.yield_windows`, 0004) plus **plan claim** (`token.yield_payouts`, 0003) so a re-run cannot pay late joiners — including after an empty first run — but still needs the aggregation job that reads house fee balances (T-03) and a real caller. Buyback has claim-before-burn (0002) and validated `revenueTotal`, but still needs svc-trade to execute a real purchase. Governance needs an owner to set quorum and threshold (numbers an agent must not invent) and a decision on how each proposal kind executes — three cross a service boundary and `grant` moves value, which makes it a ledger recipe and a DIRECTION §3 carve-out.

### And IFC is a ledger asset, not a coin

Worth stating here because the word "token" invites the wrong inference. No `.sol` file in this repo mentions IFC; there is no contract, no chain, no deposit or withdrawal path. Supply is rows in `token.emission_epochs` and balances in svc-ledger. The "burn address" is `house/burn` (`packages/ledger-client/src/accounts.ts:155-157`) — an ordinary operator-owned internal account of kind `available`; "tokens debited to the burn account never move again" is a convention this codebase observes, not a constraint anything enforces. No holder can self-custody IFC, withdraw it, or verify total supply independently of us. `burnedSupply` is the only supply-side read on the router and it is `token:read` scoped.

---

## API

| Route / method                         | Scope / auth            | Purpose                                                                                                                   |
| -------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `GET /internal/stake/:userId`          | service headers         | **The hot path.** §4.3: other services call this to gate launchpad allocations, OTC access, premium lobbies, vendor slots |
| `POST /internal/emissions/mint-next`   | service headers         | Cron-friendly mint of the next sequential epoch (refuses when `EMISSIONS_ENABLED=false`)                                  |
| tRPC `stake`                           | `token:stake`           | Opens a stake for the signed principal — ledger first, then the record                                                    |
| tRPC `unstake`                         | `token:stake`           | Returns principal; enforces lock + ownership                                                                              |
| tRPC `listStakes`                      | `token:read`            | Stakes owned by the signed principal                                                                                      |
| tRPC `stakeOf` / `accessOf`            | `token:read`            | Total active stake / access tier + fee discount                                                                           |
| tRPC `mintEpoch` / `nextEmissionEpoch` | `admin:treasury` / read | Operator mint (optional `epoch`) and next index                                                                           |
| tRPC `distributeRevenue`               | `admin:treasury` + MFA  | **Operator action, no caller.** Sweeps the fee sources the operator names → pro-rata staker payouts. Not a scheduled job  |
| tRPC `recordBuyback`                   | `admin:treasury` + MFA  | **Operator action, no caller.** Records an asserted `tokensBought` and burns the split from rewards. Buys nothing         |
| tRPC `burnedSupply`                    | `token:read`            | Balance of the `house/burn` ledger account                                                                                |
| tRPC `createProposal` / `castVote`     | `token:stake` / admin   | Records a ballot, weight = `stakeOf` snapshot taken inside the vote transaction                                           |
| tRPC `listProposals` / `getProposal`   | `token:read`            | Reads proposals; `getProposal` recomputes a tally that **nothing acts on**                                                |

Optional auto-tick: set `EMISSIONS_AUTO_TICK=true` (and leave `EMISSIONS_ENABLED=true`) to mint the next sequential epoch every `EMISSIONS_TICK_MS` (default 1 day). Prefer external cron → `/internal/emissions/mint-next` or tRPC `mintEpoch` so the job is pauseable.

---

## Events

**Publishes**

| Subject                             | When                                    |
| ----------------------------------- | --------------------------------------- |
| `intafaced.token.stake.created`     | a stake opens — gates unlock downstream |
| `intafaced.token.buyback.completed` | a burn record is written (no purchase)  |

**Consumes — nothing, and that is the gap, not a phase.** §4.3's yield job and buyback schedule would both be consumers; neither exists. Today every revenue figure this service acts on is supplied by an operator on the wire, and no subscriber anywhere turns a trade fill into one.

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

**Yield: claim `(window_id, total)` before the fee sweep, then plan who is paid.** That resumability sentence is only true while the recipient list stands still, and the list was recomputed from `stakes WHERE status = 'active'` on every call. Re-run a settled window after one new stake opened and the list grew: the users already paid had spent their `(window, user)` keys, so their posts were silent no-ops — and the newcomer's key was fresh, so the newcomer was paid in full out of a window whose revenue was already gone. So the plan is written once into `token.yield_payouts` and read thereafter (0003). A window pays the stakers it had, not the stakers it has; a re-run naming a different revenue total is refused (`token.yield_window_mismatch`) rather than guessed at. `distributeRevenue` now reports `alreadyPaid` alongside `recipients`, so a re-run reads as "already settled" instead of as a second payout.

**Yield: an empty pool is still a settled window (0004).** #1076 left zero-staker runs unclaimed so the first staker could re-use the same window id. That re-opened the late-joiner class under a different shape: empty run swept fees, a user staked, re-run planned them and paid out of already-swept revenue. `token.yield_windows` claims `(window_id, total)` before the sweep — including when nobody is staked. Late joiners use a **new** window id; the undistributed revenue sits in the rewards engine until then.

---

## Database constraints as a backstop

The service checks these; the database enforces them regardless.

| Constraint                                | What it catches                                                                                                                                                               |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `emission_epochs_within_schedule_ck`      | one epoch minting more than its own scheduled amount. **Not the supply ceiling** — that is the emitted-total check in `mintEpoch`, because a per-row bound cannot see a total |
| `buyback_runs_split_conserved_ck`         | a rounding bug promising the rewards engine tokens that do not exist                                                                                                          |
| `buyback_runs_window_no_overlap_ex`       | two runs covering the same instant — identical, nested or partial. Claimed BEFORE the burn posts (0002)                                                                       |
| `stakes_lock_required_ck`                 | an m3/m12 stake with no `unlocks_at` — a lock multiplier on withdrawable-on-demand funds, i.e. free yield                                                                     |
| `stakes_amount_positive_ck`               | a negative stake dragging the pro-rata denominator down and overpaying everyone else                                                                                          |
| `governance_votes_one_per_user_idx`       | ballot stuffing                                                                                                                                                               |
| `token_params_singleton_ck`               | two rows = two economies, whichever a job reads first wins                                                                                                                    |
| `yield_windows` PK `window_id`            | two claims for one window id — freezes empty settlements so a late staker cannot re-plan the same id (0004)                                                                   |
| `yield_windows_total_positive_ck`         | a claimed window of nothing — free key for a later real total                                                                                                                 |
| `yield_payouts` PK `(window_id, user_id)` | two payouts to one staker for one window — the pair the reward key already assumed                                                                                            |
| `yield_payouts_paid_has_tx_ck`            | a payout marked paid with nothing in the book to point at, or a transaction nobody recorded finishing                                                                         |
| `yield_payouts_amount_positive_ck`        | a planned payout of nothing — an instruction the ledger would refuse and no run could ever clear                                                                              |

> **Fixed — this paragraph used to say it was not.** `recordBuyback` posted the burn to the ledger _before_ inserting the `buyback_runs` row, and that insert was `ON CONFLICT (id) DO NOTHING`, which dedupes only on the run id — so a second call over the same `revenueWindow` under a _different_ `runId` burned for real and only then tripped an index its conflict clause did not name: tokens irreversibly gone, no row, no event, an opaque 500. **#767 and migration `0002_buyback_window_claim.sql` closed it**: the window is now claimed `pending` before the burn posts and settled after, the same claim-before-post shape `stake` uses, and the unique index was replaced by the exclusion constraint above — which also refuses the nested and partial overlaps the old index never saw. The text above stayed stale for months of merges, which is its own lesson: a README that says a money path is unsafe, about a path that is now safe, invites somebody to fix it a second time.

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
