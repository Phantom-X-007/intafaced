# svc-bank

**Multi-currency accounts over the ledger (§8.1).** Spaces, standing orders, spend analytics, and earn pools.

> §8.1: _"Multi-currency account UX over existing ledger accounts (**no new balance system** — views + rails)."_

**What this service is not:** it is not a wallet, it does not hold balances, and it does not price anything. It stores names, policies, instructions, and records of jobs that already ran. Every "how much" question is answered by `ledger.balance(...)` at the moment it is asked.

This PR covers **accounts and earn only**. Loans, cards and the sovereign card are separate tracker features with their own risk profiles (`bank.loans`, `bank.cards`, `bank.sovereign-card`) and are not started here.

---

## Where does a balance live?

In svc-ledger. Nowhere else. Concretely:

| Question                             | Answered by                                                      |
| ------------------------------------ | ---------------------------------------------------------------- |
| How much is in my "Rent" space?      | `ledger.balance(subAccountAvailable(spaceId, asset))`            |
| How much is in my main account?      | `ledger.balance(userAvailable(userId, asset))`                   |
| How much have I got earning?         | `ledger.balance(userStake(userId, asset))`                       |
| How big is a pool?                   | `SUM(principal)` over open positions — a derived aggregate query |
| What can a pool still afford to pay? | `ledger.balance(earnPoolReserve(poolId, asset))`                 |
| What did I spend last month?         | a fold over ledger entries in the window                         |

**A space is a label over a ledger account.** The mapping is one function, `accountForSpace()`:

```
primary space  →  userAvailable(userId, assetId)          (ownerType 'user')
named space    →  subAccountAvailable(spaceId, assetId)   (ownerType 'subaccount')
```

Both account kinds already exist in §4.2. svc-bank adds no account kind, no owner type, and no storage of value — it adds names. That is what "views + rails" means, and it is why "a space's balance equals the ledger's" is true by construction rather than by a reconciliation job somebody could switch off.

### How would someone prove this service has not quietly started keeping its own?

Four ways, in increasing order of strength — all of them are tests that run on every build:

1. **Compare the two answers.** For every space, `spaces.balanceOf()` and `ledger.balance(accountForSpace(space))` must be identical strings. Same for earn: `earn.principalOf(user, asset)` (summed from this service's table) must equal `earn.stakedOf(user, asset)` (read from the ledger), and `earn.interestPaid(pool)` must equal what has actually left the pool reserve.
2. **Close the books.** After a mixed run — transfers, a standing order that fires, one that cannot, an earn deposit and withdrawal, two days of interest — `ledger.totalsByAsset()` is zero for every asset, `reconcile()` is clean, and `verifyChain()` verifies.
3. **Introspect the schema.** A test reads `information_schema.columns` for the `bank` schema and fails on any column name matching `balance`, `total`, `running`, `cached`, `available`, `held`, `accrued`, `outstanding`, … It then requires every `numeric(38,18)` column to be on an explicit allowlist with a written reason. Adding `spaces.balance` turns the build red with the doctrine quoted in the failure.
4. **Prove immutability behaviourally.** Every money column is snapshotted, every money path in the service is exercised, and the snapshot must be byte-identical afterwards. A column that accumulates cannot pass this.

Point 3 is the one that matters most, because it fails for a change nobody has made yet.

---

## API

tRPC, `packages/contracts`. All money crosses the wire as **decimal strings**.

### `spaces`

| Procedure        | Scope        | Purpose                                                                       |
| ---------------- | ------------ | ----------------------------------------------------------------------------- |
| `spaces.list`    | `bank:read`  | Spaces with their **ledger** balances, and the account ref they are a view of |
| `spaces.unnamed` | `bank:read`  | Assets held with no space yet — sourced from the ledger, not this table       |
| `spaces.create`  | `bank:write` | New named space (ensures the primary exists first)                            |
| `spaces.archive` | `bank:write` | Archive a named space. **Moves no value**                                     |

### `transfers`

| Procedure                 | Scope        | Purpose                                                                                      |
| ------------------------- | ------------ | -------------------------------------------------------------------------------------------- |
| `transfers.create`        | `bank:write` | One-off transfer; `transferId` is client-supplied, so a retried request is the same transfer |
| `transfers.schedule`      | `bank:write` | Standing order — daily, weekly, or monthly                                                   |
| `transfers.listSchedules` | `bank:read`  | The user's standing orders                                                                   |
| `transfers.executions`    | `bank:read`  | What ran, what did not, and **why** — the answer to "where is my rent"                       |
| `transfers.cancel`        | `bank:write` | Stop future firings. Never reverses ones that happened                                       |

### `earn`

| Procedure        | Scope        | Purpose                                |
| ---------------- | ------------ | -------------------------------------- |
| `earn.pools`     | `bank:read`  | Open flexible and fixed pools          |
| `earn.deposit`   | `bank:write` | Open a position                        |
| `earn.withdraw`  | `bank:write` | Close a position; fixed terms enforced |
| `earn.positions` | `bank:read`  | The user's open positions              |

### `analytics`

| Procedure         | Scope       | Purpose                                                     |
| ----------------- | ----------- | ----------------------------------------------------------- |
| `analytics.spend` | `bank:read` | Outflow by category over a window, computed from the ledger |

### `ops` — operator only

| Procedure             | Scope            | Purpose                                 |
| --------------------- | ---------------- | --------------------------------------- |
| `ops.runDueTransfers` | `admin:treasury` | Fire every due standing order           |
| `ops.accrueInterest`  | `admin:treasury` | One day's interest, one pool or all     |
| `ops.fundPool`        | `admin:treasury` | Move bank revenue into a pool's reserve |

The two jobs are deliberately **not user-callable**: a user who can trigger "run every due transfer" is a user who can choose when other people's money moves. `admin:treasury` is interactive-only (§4.1), so it can never be held by a long-lived API key.

HTTP, for the external scheduler: `POST /internal/jobs/run-due-transfers`, `POST /internal/jobs/accrue-interest`, plus `/health` and `/ready`.

---

## Events

**Publishes — `intafaced.bank.margin_call.created`. This service owns the `INTAFACED_BANK` stream and creates it at boot.**

One subject, and it was declared in `packages/events` long before anything sent it. `bankMarginCalled` had a schema, and a complete svc-notify consumer, parked on a stream no service had ever created — so a margin call wrote a `loan_margin_calls` row, started a grace clock that gates liquidation, and told the borrower nothing. `loans/risk.ts` argues at length against precisely that outcome — _"the borrower's first notice of the loan would be its liquidation receipt"_ — and it was the live behaviour, because the notice had no transport.

Raising the call and delivering it stay two facts. svc-bank publishes; whether the borrower was reached is svc-notify's answer, recorded per channel, and it is allowed to be "no". A failed publish is written to `loan_margin_calls.notify_error` and does **not** un-call the loan — see `loans/margin-call-publisher.ts`.

Publishing moves no value. Every recipe in the Ledger table below still goes through `packages/ledger-client` and nothing else.

The subjects below are still unwritten, and go in an events PR before svc-bank publishes any of them (AGENT_PROTOCOL §1: _"A `packages/contracts` and/or `packages/events` PR that declares the new interface or event. Reviewed on its own. … Never the reverse. Never both at once."_ §2 makes publishing an undeclared subject a hard prohibition):

| Planned subject                    | When                                                 |
| ---------------------------------- | ---------------------------------------------------- |
| `intafaced.bank.space.created`     | a user names a new space                             |
| `intafaced.bank.transfer.settled`  | a standing order fired and settled                   |
| `intafaced.bank.transfer.rejected` | a firing was refused — **the user needs to be told** |
| `intafaced.bank.position.opened`   | an earn position opened                              |
| `intafaced.bank.position.closed`   | an earn position closed                              |
| `intafaced.bank.interest.posted`   | a pool accrued a day of interest                     |

Until then, `transfers.executions` is the queryable record of every firing and every rejection, so nothing is unobservable — it is pull rather than push.

**Consumes** — nothing. Loan interest revenue will fund the pool reserves once `bank.loans` lands; today `ops.fundPool` is an operator action.

---

## Ledger

Every recipe this service invokes, and what it touches:

| Recipe         | Reason code               | Accounts                                      |
| -------------- | ------------------------- | --------------------------------------------- |
| `bankTransfer` | `bank.transfer.manual`    | space account → space account                 |
| `bankTransfer` | `bank.transfer.scheduled` | space account → space account                 |
| `earnDeposit`  | `bank.earn.deposited`     | user available → user stake                   |
| `earnWithdraw` | `bank.earn.withdrawn`     | user stake → user available                   |
| `earnPoolFund` | `bank.earn.pool.funded`   | `houseFees('bank')` → `earnPoolReserve(pool)` |
| `earnInterest` | `bank.earn.interest`      | `earnPoolReserve(pool)` → many user available |

> ⚠ **This PR adds five recipes and one account constructor to `packages/ledger-client`** — `bankTransfer`, `earnDeposit`, `earnWithdraw`, `earnPoolFund`, `earnInterest`, and `earnPoolReserve()`. Strictly §15.2 says a shared-package change should be its own PR first — flagging it rather than burying it. They live in their own file, `packages/ledger-client/src/recipes/bank.ts`, so the shared diff is reviewable and revertable on its own. Nothing else in the package changed except the re-export and one new account constructor in `accounts.ts`.
>
> They exist because §8.1's "views + rails" has no rails without them: an internal transfer, an earn deposit and withdrawal, funding a pool's yield reserve, and paying a day's interest are five value movements no existing recipe expresses. Everything §8.1 lists that is **not** here already existed — loans will use `collateralLock` / `collateralRelease` / `liquidate`, and native staking uses `stake` / `unstake` in svc-token.

### Idempotency keys

Business keys, never UUIDs, never clock readings (§5):

```
bank.transfer:<scheduleId>:<occurrence>     one firing of one standing order
bank.transfer:<transferId>:0                one-off transfer (a schedule that fires once)
bank.earn.deposit:<positionId>              one position opening
bank.earn.withdraw:<positionId>             one position closing
bank.earn.fund:<poolId>:<fundingId>         one reserve top-up
bank.interest:<poolId>:<date>               one day of one pool
```

`occurrence` is derived from `(startsAt, cadence, n)` — never from a counter. Two workers, a retry, and a catch-up run after an outage all compute the same index for the same intended transfer.

---

## Coordination with svc-token

§8.1: _"flexible/fixed pools as stake-kind ledger accounts; native staking already lives in svc-token."_

Both services move value into `userStake(userId, assetId)` — the **same ledger account** for a given user and asset. That is fine while they never share an asset and catastrophic the moment they do: svc-token's `stakeOf()` sums its own table and asserts the result equals that ledger account, and svc-bank does the same with `principalOf()`. If both wrote to `userStake(user, IFC)`, **neither** service's table could be reconciled against the ledger and both invariants would break at once.

So svc-bank refuses the native asset in earn pools (`bank.native_asset_not_earnable`) and points the caller at svc-token. One asset, one owner. The refusal is tested, because the failure it prevents is silent.

---

## Ordering decisions that matter

**Scheduled transfer: claim, post, settle — one database transaction.**

- crash before the claim commits → nothing happened; the next pass retries.
- crash after the ledger post, before the commit → the database rolls the claim back while the ledger transaction stands. The next pass re-claims and re-posts; the post is idempotent so it returns the **same** transaction and the row is written against it. Money moved once, the record catches up. **Nobody's funds are stranded** — the value is in the destination account the whole time; the only thing missing was our note about it.
- crash after the commit → done.

Holding a database transaction open across the ledger call is a deliberate cost: it is what makes "claimed" and "posted" inseparable. Committing the claim first would create a window where a claimed occurrence has no ledger transaction and no process left alive to make one — a transfer the user was told would happen, that never will. A committed `pending` row is swept explicitly anyway, because that is the one failure that would strand a transfer forever with no error anywhere.

**Advance `next_run_at` last.** If that update is lost, the next pass reconsiders occurrences the executions table already owns and skips them — wasted work, never a double transfer. The other order would let a crash advance past an occurrence that never fired.

**A rejected occurrence is consumed, not queued.** A monthly transfer that failed in March is a March transfer; silently making it up in April would move money the user is no longer expecting to move. The rejection is recorded with its code so the user gets a reason.

**Earn deposit: ledger first, then the row** — same as svc-token's `stake`, same reason. The reverse order would let a position exist with nothing behind it: a position we would pay interest on that nobody funded.

**Interest: claim the day, post, record.** If the reserve cannot cover the day, **nothing moves** and the claim rolls back so the day is re-runnable the moment the pool is funded. That is the loud failure §8.1 needs — a pool that cannot pay its advertised rate is an operator problem today, not a shortfall discovered at maturity.

**Interest is paid to `available`, never added to the principal.** Compounding would mean writing a new principal figure every day, and a money column that changes daily is a running total wearing a different name.

**Rounding is always down**, in the reserve's favour. A unit invented by rounding up has to come from somewhere, and the only somewhere available is a pool funded for a smaller number — so the bug surfaces months later as a pool that cannot pay.

---

## Database constraints as a backstop

The service checks these; the database enforces them regardless.

| Constraint                                 | What it catches                                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `transfer_executions_occurrence_idx`       | **the double-fire guard** — a retried, duplicated, or DST-rewound scheduler firing twice           |
| `interest_accruals_pool_date_idx`          | a daily cron that fires twice, or a catch-up run overlapping the live schedule                     |
| `spaces_one_primary_idx`                   | two labels claiming the same balance — a UI summing spaces would double-count the user's own money |
| `transfer_executions_settled_has_tx_ck`    | a "settled" firing with nothing in the book to point at — a phantom transfer                       |
| `transfer_executions_rejected_has_code_ck` | "your standing order did not run" with no "because"                                                |
| `earn_pools_term_matches_kind_ck`          | a fixed pool with no maturity (funds locked with no release date)                                  |
| `earn_positions_principal_positive_ck`     | a negative position dragging the interest base below the honest ones                               |
| `earn_pools_apr_sane_ck`                   | a bps/percent unit mix-up draining a pool reserve in a day                                         |
| `scheduled_transfers_amount_positive_ck`   | an instruction to pull money the other way that nobody authorised                                  |
| `interest_accruals_consistent_ck`          | money paid with nobody to pay it to, or recipients paid nothing                                    |

---

## What the schema stores — and deliberately does not

| Table                 | Stores                                          | Deliberately absent                |
| --------------------- | ----------------------------------------------- | ---------------------------------- |
| `spaces`              | name, kind, savings **goal**, self-imposed lock | any balance                        |
| `scheduled_transfers` | the **instruction**, immutable after insert     | a counter of firings               |
| `transfer_executions` | one **record** per (schedule, occurrence)       | a running sum of transferred value |
| `earn_pools`          | terms — APR, term length, minimum deposit       | `total_deposited`, `capacity_used` |
| `earn_positions`      | the deposit **record**; principal never changes | accrued interest, current value    |
| `interest_accruals`   | one **record** per (pool, day)                  | a lifetime interest total          |

Editing a standing order cancels it and writes a new one, so the history of what a user actually authorised survives.

---

## Kill-switches

| Variable                                                                    | Guards                                                                                                             |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `SCHEDULED_TRANSFERS_ENABLED`                                               | A bad deploy mis-computing occurrence indices would fire every schedule in the book, and the ledger is append-only |
| `INTEREST_ACCRUAL_ENABLED`                                                  | A reserve drained by a runaway job cannot be un-paid without asking users to return money                          |
| `TRANSFER_BATCH_SIZE`                                                       | Bounds the blast radius of a single bad pass                                                                       |
| flags `bank.loans`, `bank.cards`, `bank.sovereignCard`, `bank.cardWaitlist` | Module kill-switch via `FLAG_REGISTRY` (§11)                                                                       |

The scheduler is external (an endpoint, not a `setInterval`) so it can be paused, inspected and re-run by an operator. Duplicate firing is safe — that is the whole point of the idempotency work — but "safe when it happens" is not a reason to make it happen on every deploy.

---

## Running it

```bash
docker compose up -d
pnpm --filter @intafaced/svc-bank db:migrate
pnpm --filter @intafaced/svc-bank test
```

## Tests

**77 tests**, all against real Postgres with `MemoryLedger` as the ledger — the reference implementation the conformance suite proves equivalent to svc-ledger's Postgres engine (§4.4). The suite skips itself cleanly when Postgres is unavailable.

Failure branches covered: insufficient funds on a one-off transfer and on a standing order, a cross-asset transfer, a debit from a user-locked space, a deposit larger than the user holds, a deposit below the pool minimum, an early withdrawal from a fixed term, a double withdrawal, eight concurrent withdrawals, eight concurrent job runs, a re-run of a rejected occurrence, an accrual from an unfunded pool (and its recovery once funded), a second accrual on the same day, six concurrent accruals, a position opened after the accrual moment, a schedule past its end date, a cancelled schedule, a native-asset earn pool, and a claim left stranded by a crashed run.

## Sockets (§13)

- **`ledger.history`** — spend analytics needs a transaction-history read that svc-ledger does not expose yet. Declaring it is a `packages/contracts` + svc-ledger PR that must land first (§1). `createLedgerHistory()` is written against the shape and **fails loudly** rather than returning an empty answer: a spend view that silently reports zero is worse than one that is unavailable, because the user cannot tell "you spent nothing" from "we could not ask".
- **Chunked interest keys** — one accrual is one ledger transaction per (pool, day). When a pool outgrows a single transaction the key gains a deterministic chunk index, `bank.interest:<poolId>:<date>:<chunk>`, which keeps the same property per chunk. The shape was chosen so that change is additive.
