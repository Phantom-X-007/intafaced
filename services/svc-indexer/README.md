# svc-indexer

**Chain → Postgres read models for `apps/web` — books, fills, positions (§17.5).**

The Protocol Plane keeps its state on chain, not in our ledger. A UI cannot query a chain fast enough to render an order book, so this service follows chain state and projects it into tables the app can query. It is the read path, and only the read path.

**This service is non-custodial and read-only, and that is structural rather than a policy.** It holds no key, posts no ledger transaction, originates no chain transaction, and has no function anywhere in it that can move a user's funds. `pnpm scan:custody` asserts it on every build (Doctrine §16.10), and `src/sovereignty.test.ts` asserts it again from inside the service.

> **What, structurally, prevents this service from moving a user's funds?**
>
> 1. **It has no key.** `src/env.ts` declares no private key, no mnemonic and no signer, and a test fails the build if that changes. There is no `createWalletClient` and no `privateKeyToAccount` anywhere in it.
> 2. **It never writes to the chain.** The only interface it holds against a chain is `ChainSource`, which has exactly two methods and both are reads.
> 3. **It posts nothing to the ledger.** `@intafaced/ledger-client` is reachable from here only through its `/money` subpath — pure decimal arithmetic — and a test asserts that per file. No recipe, no `LedgerClient`, no `ledger.post`.
> 4. **Nothing here is load-bearing for anyone.** Every row in this database is a copy of public chain state. If this service, this database and this company all vanished, every fact it serves would still be readable from any node.

---

## API

Internal tRPC (`createIndexerRouter`), self-mounted at `/trpc` behind `createEdgeContext` per [`docs/decisions/mount-boundary.md`](../../docs/decisions/mount-boundary.md).

**Every data procedure is `publicJurisdictionProcedure('indexer', 'protocol')` — no login, no KYC tier, no account gate.** That is §22 as code: `MODULES.indexer` is `custodial: false` on the `protocol` plane, so `checkAccess` returns `allowed.permissionless`. `src/index.ts` re-asserts it at boot and **refuses to start** if it ever returns anything else.

There is no scoped procedure in this router and there could not usefully be one. Every fact served is a copy of public chain state — the book, the tape, and a position at an address anyone can already query from any node. An account gate in front of a mirror of public data does not protect a user; it only makes the mirror worse than the original.

| Procedure      | Guard          | Input                 | Output                                                      |
| -------------- | -------------- | --------------------- | ----------------------------------------------------------- |
| `health`       | —              | —                     | `{ ok, service, chainId, custodial: false, ingestEnabled }` |
| `status`       | permissionless | —                     | cursor, finality horizon, chain source, **`halted`**        |
| `markets`      | permissionless | —                     | `string[]`                                                  |
| `book`         | permissionless | `{ market, depth? }`  | `{ asOfHeight, asOfHash, bids: [price, qty][], asks: … }`   |
| `fills`        | permissionless | `{ market, limit? }`  | recent trades, newest first                                 |
| `accountFills` | permissionless | `{ account, limit? }` | an address's tape, from either side of a fill               |
| `position`     | permissionless | `{ market, account }` | signed size + entry price, or `null`                        |
| `positions`    | permissionless | `{ account }`         | every market that address has a position in                 |

HTTP: `GET /health` (liveness) · `GET /ready`.

**`/ready` returns 503 when the indexer is halted**, not only when the database is down. A halted indexer has hit a reorg deeper than its retained history: it knows its book is wrong and cannot repair it. Leaving the rotation is the correct response — being unreachable costs a user nothing they cannot get from any node, and a wrong price costs them a trade.

**Money is a decimal string on the wire and a scaled bigint in memory**, everywhere. `formatAmount` is the only thing in the router that renders a price. Nothing constructs a `number` from an amount: an order book is nothing but sums, and a float sums `0.1 + 0.2` to something that is not `0.3`. There is a test that round-trips 18 decimal places through Postgres and back.

---

## Events

**Publishes — nothing. Consumes — nothing.** This service is not on the bus at all, and its compose entry declares no `nats` dependency for that reason.

That is a deliberate scope line rather than an omission. A `intafaced.indexer.book.updated` subject is an obvious future addition, and adding one is a `packages/events` PR first (§15.2) — the catalog is a contract, and this PR is one service. Until then the read path is pull-only: `apps/web` queries `book` / `fills` / `positions`, and a live feed is the ws-gateway's job (§5.2), fed from the same projection.

What this service does consume is a **chain**, through the `ChainSource` port (`src/chain/source.ts`) — not the event bus.

> **SOCKET §13 — `socket.evm-rpc`.** There is no EVM RPC in this stack and no deployed CLOB contracts to read. svc-protocol records the same gap (its `PROTOCOL_RPC_URL` points outside the compose network and a clean clone has none). Writing an adapter now would mean inventing event signatures for contracts that do not exist and shipping a mock behind a production-looking name. So the port is declared and `NullChainSource` is wired in production — it reports no chain, the ingest loop has nothing to do, and `status.chainSource` says `"null"` out loud. `MemoryChainSource` is the deterministic reference the adapter's conformance will be judged against, and it is **not selectable at boot**.

> **SOCKET §13 — `socket.indexer-stream`.** The ws-gateway feed described above. `packages/market-data`'s `diffDepth` already computes the deltas; what is missing is the subject and the transport.

---

## Ledger

**This service posts no ledger transactions and holds no user value. On this plane the user's keys are the only keys.**

There are no recipes to list, because there is no code path here that reaches one.

| Check                                                           | Where                                                                 |
| --------------------------------------------------------------- | --------------------------------------------------------------------- |
| No `ledger.post()`                                              | `tooling/ci/custody-scan.mjs`, and again in `src/sovereignty.test.ts` |
| No ledger write recipe, no writable `LedgerClient`              | same                                                                  |
| `@intafaced/ledger-client` reached ONLY via `/money`            | `src/sovereignty.test.ts`, per file                                   |
| No `LEDGER_URL`, no `PRIVATE_KEY`-shaped env var                | `src/sovereignty.test.ts`, over the declarations in `env.ts`          |
| No `createWalletClient` / `privateKeyToAccount` in shipped code | `src/sovereignty.test.ts`                                             |
| Writes reach no schema but `indexer`                            | `src/sovereignty.test.ts`, over the SQL in `postgres-store.ts`        |

### Why this service depends on `ledger-client` at all, when svc-protocol does not

It imports exactly one thing: the `/money` subpath — `parseAmount`, `formatAmount`, `Amount`. That module is pure arithmetic over scaled bigints with no I/O, no client and no recipe, and it is the canonical answer to _"never store money in a `number`"_. `packages/market-data` imports it for the same reason and ships to the browser.

The alternative was a second decimal parser living in this service, which is how two implementations of money end up disagreeing in the last decimal place. `src/sovereignty.test.ts` draws the line where it belongs and checks it per file: **the money subpath is allowed, the root export and the recipes are not.** The root export re-exports `recipes` and `LedgerClient`, so importing it would put the whole write surface one autocomplete away — and `custody-scan` only catches that once someone has already named a recipe.

`ReadOnlyLedgerClient` is permitted on this plane and is **not used**: nothing here needs a fiat-plane balance to answer a question about a chain.

---

## Reorg handling — the part that matters

Chain data is not final on arrival. A projection that applies a block by overwriting the current value **cannot undo it**, because the value it replaced is gone. After a reorg it serves a price that was never on the canonical chain — no error, no gap, no alert. The user just sees a number.

### The option not taken: confirmation depth alone

"Only project blocks that are N deep" is not a reorg strategy, it is a probability knob:

- it makes the read model N blocks stale, always, including the 99.9% of the time when nothing reorgs. For an order book that is the whole product;
- any N is still wrong for a reorg of depth N+1, and the failure mode is unchanged;
- it does not answer the question, it reduces how often the question is asked.

### The option taken: provenance + unwind

Every projected row records the block that wrote it, and the state tables are **versioned by block height** — one row per (key, block) rather than one row per key. "Current" is the newest version.

Repairing a reorg is then `unwindTo(forkHeight + 1)`: **delete the versions above the fork.** The previous version becomes current again by itself. No replay, no compensating writes, no arithmetic that can be off by one — the repair is a `DELETE`.

The projection is therefore correct at every depth, and blocks are projected the moment they are seen. **Confirmation depth survives as what it actually is:** the `prune` retention threshold — the deepest reorg repairable without a full re-index — plus a confidence number on reads. `INDEXER_FINALITY_DEPTH`, default 64.

The detection half is the part everybody skips. An indexer that only ever asks "what is the next block?" will happily extend a branch that no longer exists, because the source keeps answering. So **every pass re-reads the block at our own head and compares hashes before asking for anything newer** — that single extra read is what catches a reorg that replaces the tip without extending it, which is the common shape.

### What is deliberately NOT solved

A reorg deeper than retained history. `findForkPoint` **refuses rather than guesses**: it throws `ReorgTooDeepError`, sets `halted`, and `/ready` starts failing. A reorg that deep is a chain-level event, and the honest responses are "stop serving" and "re-index" — not "guess, and hope the guess is invisible."

### Idempotency

Re-processing a block is a no-op **by construction, not by a check someone can skip**:

- **Levels and positions carry absolute state**, never a delta. The upsert is an assignment, so applying it twice reaches the same value. A relative delta applied twice corrupts the level and no primary key can catch it. (A chain that only emits deltas is not excluded — its adapter reduces them to absolute state before yielding a block. That is the adapter's job because it is the part that needs the chain's own state reads.)
- **Fills are keyed on `(block hash, log index)`** — the chain's own identity for a log — with `ON CONFLICT DO NOTHING`. Note _hash_, not height: two competing blocks at one height are different blocks and their fills must not collide.
- `applyBlock` reports `duplicate` but **still performs its writes**. That is telemetry, not control flow: a skip branch would mean the idempotent path is the one that never runs in production, and therefore the one nothing proves.

### The invariant Postgres holds, not the code

```sql
CREATE UNIQUE INDEX blocks_canonical_height_idx
  ON indexer.blocks (chain_id, height) WHERE status = 'canonical';
```

Two canonical blocks at one height means two answers to every read below it, and a bug that produces one is otherwise invisible until a user sees the wrong price. The partial index makes the state unrepresentable — and orphans may still share the height, which is what lets the forensic record be written at all. Orphaned blocks are **kept**, not deleted, until `prune` ages them out: a projection that silently forgets it ever served a price cannot afterwards explain what a user saw.

---

## Schema

`indexer` schema, owned by the `svc_indexer` role, which holds no database-level `CREATE` (§2).

| Table         | Shape                                              | Why                                                                 |
| ------------- | -------------------------------------------------- | ------------------------------------------------------------------- |
| `blocks`      | PK `(chain_id, hash)`, partial unique on height    | Provenance. The only thing that can answer "is this row canonical?" |
| `book_levels` | PK `(chain_id, market, side, price, block_height)` | Versioned levels. Absolute quantity; `0` means empty, not deleted   |
| `fills`       | PK `(chain_id, block_hash, log_index)`             | Append-only tape, keyed by the chain's own log identity             |
| `positions`   | PK `(chain_id, market, account, block_height)`     | Versioned mirror of contract state. Signed size, never a balance    |

Price is `numeric(38,18)` rather than text so that equality is by **value** — `100` and `100.0` are one price level. Every money column is `numeric(38,18)`; there is no float anywhere in the schema, and a test asserts the column types rather than trusting the migration reads that way.

Reversal: `drizzle/0000_indexer_init.down.sql`. It strands nothing — every row here is derived from chain state and is rebuilt by re-indexing. Round-trip proven by `src/projection/postgres-store.test.ts`, which applies every down, asserts the tables are gone, re-applies every up, and asserts they are back.

---

## Tests

`pnpm --filter @intafaced/svc-indexer test` — **81 tests.** 54 need nothing at all; 27 need Postgres and skip cleanly when it is unreachable.

| File                                | Covers                                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `testing/conformance.ts`            | **The shared suite.** Both stores run it unmodified — reorg, idempotency, absolute levels, pruning, kill-switch, ordering, 18-decimal round trip       |
| `projection/memory-store.test.ts`   | The reference store under that suite. No database, so the reorg property is checked on every `pnpm test`                                               |
| `projection/postgres-store.test.ts` | The same suite against real Postgres, plus the partial unique index, the numeric column types, and the migration down/up round trip                    |
| `chain/source.test.ts`              | Port validation — malformed hashes, duplicate log indexes, lossy prices, negative entry prices — and that `MemoryChainSource` hashes deterministically |
| `router.mount.test.ts`              | The mount boundary over real `createEdgeContext` headers: anonymous reads succeed, a forged principal confers nothing, `status` surfaces a halt        |
| `sovereignty.test.ts`               | §22 for every region × tier with a custodial control, and the §16.10 custody assertions listed under **Ledger**                                        |

**Two implementations is the point.** A single implementation tested against itself proves the tests match the code, not that the code matches the design. The memory store is short enough to check by eye; `unwindTo` is a `DELETE` and `prune` is a `DELETE` with a correlated subquery — the kind of SQL that looks right and is off by one row.

### Mutation testing

The reorg suite was checked by breaking it, four ways. Each mutation was reverted; the numbers are what the run printed.

| Mutation                                                    | Result                                                           |
| ----------------------------------------------------------- | ---------------------------------------------------------------- |
| Disable the "is our head still canonical?" check in `sync`  | **17 failures**, every reorg test in both stores + the halt test |
| `unwindTo` off by one (`> height` instead of `>= height`)   | **10 failures**, both stores                                     |
| Move `quantity > 0` inside the `DISTINCT ON`                | **1 failure**: "removes a level at quantity zero"                |
| Accumulate instead of assign on conflict (levels and fills) | **1 failure**: "re-applying the same block changes nothing"      |

The last two are the interesting ones: a suite that only fails in bulk is not localising anything.

---

## Kill-switch

`indexer.ingest` in the admin console, or `INDEXER_INGEST_ENABLED=false`.

**Effect when off:** the ingest loop stops advancing; `status.ingestEnabled` reports it. Every read keeps serving what is already projected.

Note what a kill-switch can and cannot do on this plane. It pauses **our** ingestion. It does not stop anyone reading the chain: every fact in this database is public and available from any node. **A kill-switch here is a switch on our convenience, never on a user's access.** A kill-switch that could do more than that would mean this service was load-bearing for someone's funds, and it is not.

---

## Running it

```bash
docker compose up -d
pnpm --filter @intafaced/svc-indexer db:migrate          # runs as svc_indexer, which owns the schema
pnpm --filter @intafaced/svc-indexer db:migrate -- --down # and back again — the round trip is real
pnpm --filter @intafaced/svc-indexer test
pnpm --filter @intafaced/svc-indexer dev
```

Configuration lives in `src/env.ts`: chain id, finality depth, poll interval, batch size, ingest switch. There is no key to configure and there never should be.

**Not yet routed at `svc-edge`.** `services/svc-edge/src/routes.ts` has no `/api/indexer` prefix, so nothing reaches this service through the perimeter yet. That is a one-line change in another service and belongs in its own PR (§15.2, one service per PR).
