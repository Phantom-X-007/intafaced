# svc-bank

**Multi-currency accounts over the ledger (§8.1).** Spaces, standing orders, spend analytics, and earn pools.

> §8.1: _"Multi-currency account UX over existing ledger accounts (**no new balance system** — views + rails)."_

**What this service is not:** it is not a wallet, it does not hold balances, and it does not price anything. It stores names, policies, instructions, and records of jobs that already ran. Every "how much" question is answered by `ledger.balance(...)` at the moment it is asked.

Also here: **loans** (§8.1), the **ledger half of cards**, and the **crypto ledger half of ramps**. `bank.sovereign-card` is a separate tracker feature and is not started. The card **live rail** and the ramp **fiat leg** are §13 sockets — see [Cards](#cards-what-is-built-and-what-is-a-contract) and [Ramps](#ramps-crypto-ledger-half-vs-fiat-socket).

---

## Where does a balance live?

In svc-ledger. Nowhere else. Concretely:

| Question                             | Answered by                                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| How much is in my "Rent" space?      | `ledger.balance(subAccountAvailable(spaceId, asset))`                                                 |
| How much is in my main account?      | `ledger.balance(userAvailable(userId, asset))`                                                        |
| How much have I got earning?         | a sum of `ledger.balance(earnStakeAccount(userId, asset, positionId))` over the user's open positions |
| How big is a pool?                   | `SUM(principal)` over open positions — a derived aggregate query                                      |
| What can a pool still afford to pay? | `ledger.balance(earnPoolReserve(poolId, asset))`                                                      |
| What did I spend last month?         | a fold over ledger entries in the window                                                              |

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

### `cards` — **the ledger half. There is no card programme.**

| Procedure              | Scope        | Purpose                                                                       |
| ---------------------- | ------------ | ----------------------------------------------------------------------------- |
| `cards.programme`      | `bank:read`  | What this deployment's issuer is — including that it is a **simulator**       |
| `cards.list`           | `bank:read`  | The user's cards. Every row carries `simulated`, never optional               |
| `cards.issue`          | `bank:write` | Issue a card against one of the user's asset balances                         |
| `cards.setStatus`      | `bank:write` | Freeze, unfreeze, close. The gesture a user reaches for first                 |
| `cards.authorizations` | `bank:read`  | Every decision on the card, **approvals and declines alike**, with the reason |

`authorize`, `capture` and `reverse` are **not** here. They are the issuer speaking, not the user — a user who can call `cardAuthorize` approves their own purchase — so they sit in `ops` behind `admin:treasury`. On a live rail they do not become user procedures either; they become a signed webhook owned by the issuer integration.

**None of these do anything until a deployment names an issuer** — see [`BANK_CARD_ISSUER`](#turning-the-card-surface-on-and-what-that-does-not-mean) below. That is the setting, and until it landed there was no setting: `index.ts` passed no issuer, so every deployment ran `noCardIssuer` and refused with a code no operator could act on. The procedures were mounted, scoped and tested, and unreachable — which reads exactly like working, and is the state D-S-15 calls **UNFINISHED**.

**`bank:card` is a real scope and nothing uses it, on purpose.** `packages/auth/src/scopes.ts` defines it, withholds it from every session, and bars it from API keys as "card spend authority — interactive-only step-up surface (§9, §18)". Nothing grants it, because the surface it names — a **user** initiating a card spend — deliberately does not exist here: spend is the issuer's side, and the issuer's side is `admin:treasury`. It becomes live with `socket.live-issuer`, alongside the signed webhook that replaces the three `ops` procedures. Recorded here rather than quietly repurposed for issuance, which is not spend.

### `analytics`

| Procedure         | Scope       | Purpose                                                     |
| ----------------- | ----------- | ----------------------------------------------------------- |
| `analytics.spend` | `bank:read` | Outflow by category over a window, computed from the ledger |

### `ramps` — **crypto ledger half. Fiat is a socket.**

| Procedure         | Scope        | Purpose                                                                |
| ----------------- | ------------ | ---------------------------------------------------------------------- |
| `ramps.programme` | `bank:read`  | What this deployment's ramp is — including that it is a ledger sandbox |
| `ramps.onramps`   | `bank:read`  | The user's on-ramp credits. Every row carries `simulated`              |
| `ramps.offramps`  | `bank:read`  | The user's off-ramps. Every row carries `simulated`                    |
| `ramps.offramp`   | `bank:write` | Hold then settle to `bank-crypto-ledger`. Does **not** broadcast       |

`ops.creditOnramp` (admin:treasury) is the inbound credit for the ledger half — same reason deposit.credit lives under ops in svc-pay: a user who credits themselves does not need a ramp. Fiat always refuses `bank.fiat_ramp_socket` → `socket.psp-partners`.

```bash
BANK_RAMP_MODE=none            # default — every ramp money path refuses bank.no_ramp_rail
BANK_RAMP_MODE=crypto-ledger   # ledger half only; simulated: true always
```

### `ops` — operator only

| Procedure             | Scope            | Purpose                                                             |
| --------------------- | ---------------- | ------------------------------------------------------------------- |
| `ops.runDueTransfers` | `admin:treasury` | Fire every due standing order                                       |
| `ops.accrueInterest`  | `admin:treasury` | One day's interest, one pool or all                                 |
| `ops.fundPool`        | `admin:treasury` | Move bank revenue into a pool's reserve                             |
| `ops.cardAuthorize`   | `admin:treasury` | The authorisation "webhook" — decide, and hold if the answer is yes |
| `ops.cardCapture`     | `admin:treasury` | The merchant took this much; the remainder of the hold goes back    |
| `ops.cardReverse`     | `admin:treasury` | The authorisation expired or was voided; the whole hold goes back   |
| `ops.fundCashbackPot` | `admin:treasury` | Sweep bank revenue into the pot cashback is paid from               |
| `ops.creditOnramp`    | `admin:treasury` | Crypto ledger-half on-ramp credit (never user-callable)             |

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

**A key that is already taken is a retry only if the terms match.** `positionId` and `loanId` are client-supplied, so the id alone cannot separate "the same request arriving twice" from "a different request wearing an id somebody has already used" — and `ON CONFLICT (id) DO NOTHING` silently keeps the first row while every guard runs on the new input. Both paths therefore compare before they proceed, and refuse on a mismatch: `bank.position_conflict`, `bank.loan_principal_mismatch`, `bank.loan_borrower_mismatch`. Same id + same terms stays idempotent, which is the whole reason the id is the client's to choose.

---

## Coordination with svc-token

§8.1: _"flexible/fixed pools as stake-kind ledger accounts; native staking already lives in svc-token."_

Both services move value into stake accounts for the same user, and there was a
time when that meant the **same ledger account**: `userStake(userId, assetId)`
was one pot per (user, asset), so the two services sharing an asset would have
left neither able to reconcile its own table against the ledger.

**That collision is now structurally impossible, and this section used to say
otherwise.** `purpose` is part of an account's identity — enforced by the unique
index `accounts_identity_purpose_idx` — and `userStake` requires one, throwing
without it. The two services reach it through different constructors:

| Constructor                                 | Purpose            |
| ------------------------------------------- | ------------------ |
| `tokenStakeAccount(user, asset, stakeId)`   | `token:stake:<id>` |
| `earnStakeAccount(user, asset, positionId)` | `bank:earn:<id>`   |

Different purpose, different account — not merely per service but per position,
so two earn positions do not share a pot either. Nothing in this repo can build
an unpurposed stake account: the sweep in `packages/ledger-client/src/accounts.purposed.test.ts`
calls every exported builder and fails on any that returns a lock kind without a
purpose.

svc-bank still refuses the native asset in earn pools
(`bank.native_asset_not_earnable`), and should: the reason is §8.1 — native
staking belongs to svc-token — and not the account collision, which no longer
needs preventing. One asset, one owner. The refusal is tested.

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

## Who may be named in a refusal

**A refusal may only describe objects the caller was already entitled to see. Where it cannot, it says `NOT_FOUND` and names nothing.** ([ADR, 2026-08-04](../../docs/adr/2026-08-04-authority-and-refusal-shape.md))

`transfers.create` and `transfers.schedule` each name **two** spaces and owner-check **one**. That is deliberate and it stays: the debit side is the side that can lose value, and paying another user is the product — a transfer moves value between two different users' spaces, and a test pins it.

What was wrong was what a **failure** said. `space-service.ts` writes its refusals for the person who owns the space (`Space "Holiday fund" is archived`, `Cannot transfer USDT into a EUR space`) and the router's mapper returned `err.message` verbatim. So transferring one atomic unit into a guessed uuid revealed whether that space existed, what its owner had **named** it, and which asset it held — for somebody else's account, without the transfer needing to succeed.

Three changes, none of which removes cross-user transfer:

| Where               | What it does now                                                                                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gateDestination`   | Resolves the destination. Not the caller's, or absent → `NOT_FOUND`, **naming nothing**, from one construction site so the two cases cannot drift apart by a byte. Somebody else's live space in the right asset proceeds. |
| `SpaceService.find` | The lookup that does **not** throw, so "absent" and "not yours" issue the same single query. An exception is a message, and whether one was produced is itself an oracle.                                                  |
| `toTrpcError`       | Exhaustive over `BankErrorCode`, with a `never` in the default. Unmapped errors get `Bank operation failed (ref …)`; the detail goes to stderr as `bank.undisclosed_error` with that correlation id.                       |

**Owners are unaffected.** They still get `Space "Holiday fund" is archived` and `Cannot transfer USDT into a EUR space — convert first`, and tests pin both — a service so cautious the owner cannot act is a worse bug than the leak it was written for.

`assertSelf` keeps `FORBIDDEN` rather than `NOT_FOUND`, and the docblock argues why at length. Its message names nothing, so the ADR's rule is satisfied either way; the status-code half is a change to who may see what, which the ADR reserves to the owner.

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

**234 across six files** (`bank-service` 91 · `loans` 85 · `cards` 36 · `cards.reachable` 11 · `margin-call-publisher` 6 · `router.mount` 5), all against real Postgres with `MemoryLedger` as the ledger — the reference implementation the conformance suite proves equivalent to svc-ledger's Postgres engine (§4.4). Each file takes its **own database** rather than its own schema (#429), so concurrent worktrees do not truncate each other. The suite skips itself cleanly when Postgres is unavailable.

The 91 below are `bank-service.test.ts`'s.

Failure branches covered: insufficient funds on a one-off transfer and on a standing order, a cross-asset transfer, a debit from a user-locked space, a deposit larger than the user holds, a deposit below the pool minimum, an early withdrawal from a fixed term, a double withdrawal, eight concurrent withdrawals, eight concurrent job runs, a re-run of a rejected occurrence, an accrual from an unfunded pool (and its recovery once funded), a second accrual on the same day, six concurrent accruals, a position opened after the accrual moment, a schedule past its end date, a cancelled schedule, a native-asset earn pool, and a claim left stranded by a crashed run.

## Cards: what is built, and what is a contract

`bank.cards` splits in two, and the halves fail for unrelated reasons. **They are split, not resolved.**

| Half          | Missing in the WORLD                                     | Verdict                                        |
| ------------- | -------------------------------------------------------- | ---------------------------------------------- |
| **Ledger**    | Nothing. Auth decision, balance check, decline, cashback | **Built.** `src/cards/`, 36 tests              |
| **Live rail** | A card-scheme sponsor and an issuing BIN                 | **§13 forever.** Lands on `socket.live-issuer` |

`CardIssuerAdapter` (`src/cards/issuer.ts`) is the seam. Everything above it is finished; everything below it is a licence and a contract that no amount of engineering time produces.

**No new ledger recipe was needed, and that is the design.** A card spend **is a withdrawal**, so the four postings already existed:

| Step                   | Recipe            | Effect                                           |
| ---------------------- | ----------------- | ------------------------------------------------ |
| authorisation approved | `withdrawHold`    | available → a hold account **per authorisation** |
| capture (clearing)     | `withdrawSettle`  | hold → `railBoundary('card-sim', asset)`         |
| the unspent remainder  | `withdrawReverse` | hold → available, in the same pass               |
| cashback               | `rewardPay`       | `rewardsEngine(asset)` → available               |

A `cardSpend` recipe would have been `withdrawSettle` with a different string in it — a second way to spell one movement, which is how two subsystems come to disagree about what happened.

### `card-sim` is a simulator. What it is **not**

- **NOT a card.** Nothing here can be presented at a terminal, added to a wallet, or used online. `panTail` is four digits derived from a uuid, and there is no column a card number could be stored in.
- **NOT a connection** to a card scheme, issuer, processor or bank. It makes no network call and has no credentials to make one with.
- **NOT a settlement rail.** `railBoundary('card-sim', asset)` records that value left **our** book; nothing is on the other side of it.
- **NOT a decision engine.** No fraud scoring, no velocity check, no 3-D Secure, no MCC policy. There are exactly four decline reasons and each is a fact somebody can check afterwards.
- **NOT refunds, disputes, chargebacks, or incremental authorisations.** A refund is `recipes.deposit` over the same rail and is deliberately unbuilt: it brings a product question — whether cashback on the original capture is clawed back — that inventing an answer to would make the module look finished while paying for returned purchases.

`simulated: true` is on the card row, on the port, and on every router output. A deployment with **no** issuer configured refuses every card procedure with `bank.no_card_issuer` rather than falling back to the simulator — the same posture as the loan price source, and for the same reason: the dangerous default is the plausible one.

### Turning the card surface on, and what that does not mean

One variable, two values, and `none` is the default.

```bash
BANK_CARD_ISSUER=none      # this deployment has NO card programme  (default)
BANK_CARD_ISSUER=card-sim  # the SIMULATOR — see immediately above
```

`/ready` reports which one is in force, so nobody has to trust an env file:

```jsonc
// BANK_CARD_ISSUER=none
"cardProgramme": { "id": "none", "simulated": true, "displayName": "No card programme" }
// BANK_CARD_ISSUER=card-sim
"cardProgramme": { "id": "card-sim", "simulated": true, "displayName": "Simulated card (no card programme)" }
```

`simulated` is `true` in **both**, and there is no value of this variable that makes it false. That is not an oversight — a live rail cannot be selected here at all, because it is `socket.live-issuer`: a card-scheme sponsor and an issuing BIN, which is a licence and a contract. The same fact appears in four places on purpose (`/ready`, the boot log line, `cards.programme`, and `simulated` on every card), so an operator, a user and an auditor each meet it without having to go looking.

What `card-sim` **does** get you is the ledger half, end to end, over real postings: issue a card, authorise against a real balance, be declined by name when the money is not there, capture, get the remainder back, and be paid cashback out of a pot that was really funded. What it does not get you is a card.

`cards.reachable.test.ts` is the suite that holds this: it enters through `createBankRouter(...).createCaller` over a context built by the real `createEdgeContext` from a **signed** principal — the composition root and the router, never a `CardService` — so if the wiring, the mounting or the scopes regress, it fails rather than the module quietly going unreachable again.

**Cashback has a named source.** It is paid from `rewardsEngine(asset)`, funded by `ops.fundCashbackPot` sweeping `houseFees('bank', asset)` — fees the platform really charged. An empty pot refuses by name (`bank.cashback_pot_unfunded`) on a row, and the capture still stands: undoing a purchase the merchant already has, because a marketing promise could not be kept, would be the worse failure.

---

## Sockets (§13)

- **`socket.live-issuer`** — a card programme needs a **card-scheme sponsor and an issuing BIN**. That is a licence and a commercial relationship, not code: no amount of engineering time produces one, which is precisely the §13 test. `CardIssuerAdapter` is written against the shape a live issuer would implement, and the only implementation in the tree is `cardSim()`, which says on every surface that it is a simulator. Pointing working code at real money is additionally Class X.
- **`socket.psp-partners`** — fiat on/off ramp needs a **bank/PSP partner and money-transmission permission**. Same §13 test. `bank.ramps` crypto ledger half does not claim this function; fiat refuses `bank.fiat_ramp_socket` by name.
- **`ledger.history`** — spend analytics needs a transaction-history read that svc-ledger does not expose yet. Declaring it is a `packages/contracts` + svc-ledger PR that must land first (§1). `createLedgerHistory()` is written against the shape and **fails loudly** rather than returning an empty answer: a spend view that silently reports zero is worse than one that is unavailable, because the user cannot tell "you spent nothing" from "we could not ask".
- **Chunked interest keys** — one accrual is one ledger transaction per (pool, day). When a pool outgrows a single transaction the key gains a deterministic chunk index, `bank.interest:<poolId>:<date>:<chunk>`, which keeps the same property per chunk. The shape was chosen so that change is additive.

## Ramps: crypto ledger half vs fiat socket

| Half       | Missing in the WORLD                                    | Verdict                                            |
| ---------- | ------------------------------------------------------- | -------------------------------------------------- |
| **Crypto** | Nothing for the ledger half. Chain confirm/send is pay. | **Built** as ledger sandbox (`bank-crypto-ledger`) |
| **Fiat**   | A bank/PSP partner and money-transmission permission    | **§13 forever.** Lands on `socket.psp-partners`    |

`BANK_RAMP_MODE=crypto-ledger` books deposits/withdrawals against rail `bank-crypto-ledger` — deliberately distinct from svc-pay's `crypto-native` boundary so an operator credit here cannot desync pay's chain reconciliation. `simulated: true` is never omitted. Live broadcast and inbound confirmation stay in svc-pay; Class X is pointing working code at real money.
