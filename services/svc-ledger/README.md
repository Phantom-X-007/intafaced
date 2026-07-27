# svc-ledger

**THE BALANCE (§4.2).** The single wallet graph for the entire OS. Every value movement anywhere in INTAFACED is a double-entry transaction here.

**What this service is not:** it does not decide whether a movement is _allowed_. That is the calling module's job — svc-trade decides an order may be placed, svc-p2p decides an escrow may release. This service decides only whether a transaction is _legal_: balanced, funded, and idempotent. It will refuse an illegal one from any caller, including one of ours.

---

## API

Internal tRPC. Note there is no user-facing write path, and `packages/auth` has no `ledger:write` scope at all — a user moves value by asking a module to act, never by calling the ledger.

| Procedure   | Scope               | Input                                  | Output                                                   |
| ----------- | ------------------- | -------------------------------------- | -------------------------------------------------------- |
| `health`    | —                   | —                                      | `{ ok, service, postingEnabled }`                        |
| `post`      | service credentials | `PostRequest` (decimal-string amounts) | `{ txId, hash, postedAt }`                               |
| `balance`   | `ledger:read`       | `AccountRef`                           | `{ accountId, assetId, kind, amount }`                   |
| `balances`  | `ledger:read`       | `{ ownerType, ownerId }`               | `Balance[]` — own account only                           |
| `reconcile` | `admin:treasury`    | —                                      | `{ ok, accountsChecked, chainLength, unbalancedAssets }` |
| `freeze`    | `admin:treasury`    | `{ reason }`                           | `{ postingEnabled: false }`                              |
| `unfreeze`  | `admin:treasury`    | —                                      | `{ postingEnabled: true }`                               |

HTTP: `GET /health` (liveness) · `GET /ready` — returns **503 when frozen**, so a frozen ledger leaves the load balancer rotation instead of refusing posts one by one.

---

## Events

**Publishes**

| Subject                                  | When                          | Payload                                             |
| ---------------------------------------- | ----------------------------- | --------------------------------------------------- |
| `intafaced.ledger.tx.posted`             | after every commit            | tx id, module, reason, hash chain link, all entries |
| `intafaced.ledger.reconciliation.failed` | drift or chain break detected | account, cached vs replayed balance, difference     |

`tx.posted` is emitted **after** commit, never inside the transaction. A consumer must never observe a transaction that could still roll back: at-least-once delivery of a fact that happened beats at-most-once delivery of one that might not have. Idempotency key is `ledger.tx:<txId>`.

**Consumes** — nothing. The ledger is the bottom of the stack; it reacts to no one.

---

## Ledger

This service _is_ the ledger, so rather than recipes it invokes, here is what it enforces. Every recipe in `@intafaced/ledger-client` passes through `post()`.

| Invariant                                           | Enforced where                                                |
| --------------------------------------------------- | ------------------------------------------------------------- |
| Σ debits = Σ credits, per asset                     | `assertValidPost` (shared with the reference impl)            |
| `available` never negative (except `treasury`)      | service check on locked rows **+** `accounts_non_negative_ck` |
| Locks funded from the owner's own available balance | `assertPairedLocks`                                           |
| Entry amounts strictly positive                     | `assertBalanced` **+** `ledger_entries_positive_ck`           |
| Idempotency — a retry returns the original          | `ledger_tx_idempotency_idx` unique index                      |
| Hash chain unbroken                                 | `chain_tip` `FOR UPDATE` + `verifyChain`                      |

Enforced in three layers on purpose: shared pure validation, the transaction, and database CHECK constraints. **A bug in this service still cannot create money.** There is a test that proves it, by trying to write a negative balance with raw SQL.

### Account boundaries

`treasury` accounts are the seam with the outside world and the only ones permitted to run negative. A negative balance there is exactly our obligation:

| Boundary         | Negative balance means                    |
| ---------------- | ----------------------------------------- |
| `rail:<rail>`    | value users have deposited and we custody |
| `venue:<venue>`  | user value sitting at an external venue   |
| `bridge:<chain>` | value bridged to the Protocol Plane       |
| `mint`           | IFC in circulation                        |

---

## Concurrency

Every post takes `SELECT … FOR UPDATE` on the singleton `chain_tip` row **before** reading any balance it will write. That lock establishes a total order over all posts by itself, which is why the transaction runs at **READ COMMITTED** rather than SERIALIZABLE: transactions queue on the lock instead of aborting one another.

This was measured, not assumed. Under SERIALIZABLE, 50 concurrent posts aborted each other faster than the retry budget could absorb (`40001` storm). Queuing is correct _and_ predictable.

**Consequence:** posting throughput is globally serial — one transaction at a time, platform-wide. Accepted at soft-launch volume.

> **§13 socket — chain sharding.** When posting rate becomes the constraint, shard the chain per asset (independent `chain_tip` rows) with a periodic cross-shard anchor transaction. The hash-chain guarantee narrows from "one total order" to "one total order per asset, anchored", which is sufficient for audit. `hashTx` and the reconciliation replay are already per-transaction and need no change.

---

## Reconciliation

Runs hourly (`RECONCILE_CRON_MINUTES`), and on demand from apps/admin. Three independent checks:

1. **`reconcileBalances`** — cached `accounts.balance` vs a full replay of `ledger_entries`. Catches a bug in the posting path.
2. **`verifyChain`** — every hash recomputed from its predecessor. Catches tampering, _including by someone with database access_.
3. **`totalsByAsset`** — every asset must net to exactly zero across all accounts. Catches value created or destroyed by any means.

On failure the service **freezes itself** and emits `reconciliation.failed`. That is §4.2's requirement: a book we cannot verify must not accept more writes while someone decides what to do about it.

### The one denormalisation

`accounts.balance` is a cache of the entry sum, so a balance read is O(1) rather than a table scan. It is written only inside the same transaction as its entries, and check (1) above is what earns it the right to exist. Per the agent protocol, a balance-shaped column is a doctrine violation _unless_ it comes with a documented reconciliation job. This one does.

---

## Kill-switch

`ledger.posting` in the admin console, or `LEDGER_POSTING_ENABLED=false`.

**Effect when off:** every `post()` throws `ledger.frozen`; reads continue to work. This halts all value movement across the entire platform — trading, payments, escrow, staking, rewards. It is the most consequential switch in the OS and exists because §4.2 demands it.

`ledger.reconciliation` disables the scheduled job only. It does not disable the freeze-on-failure behaviour.

---

## Running it

```bash
docker compose up -d
pnpm --filter @intafaced/svc-ledger db:migrate     # runs as svc_ledger, which owns the schema
pnpm --filter @intafaced/svc-ledger test           # conformance suite vs real Postgres
pnpm --filter @intafaced/svc-ledger dev
```

Migrations run as the schema's **owner**, not an admin role — this role deliberately holds no database-level `CREATE`, so a migration physically cannot reach outside `ledger` (§2).

## Tests

`postgres-ledger.test.ts` runs `runLedgerConformance` from `@intafaced/ledger-client/testing` — **the same suite the in-memory reference runs.** If the two ever disagree, one is wrong and the suite decides which (§4.4).

Beyond conformance it proves what only a real database can: CHECK constraints rejecting direct SQL, 18-decimal round trips, tamper detection, drift detection, and 50 concurrent posts leaving the chain intact. Skips cleanly when Postgres is unreachable.
