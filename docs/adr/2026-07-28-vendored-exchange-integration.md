# ADR: integrating the vendored exchange platform

**Status:** In progress — source vendored, infrastructure running, build in flight.
**Decision owner:** repo owner (directed). **Written by:** Denon.
**Source:** https://github.com/jammy928/CoinExchange_CryptoExchange_Java · Apache-2.0 · 1.7k★ · 10 commits, inactive.

---

## What was actually done

the vendored exchange tree — all 1,835 files, complete: `00_framework` (15 Maven modules), `01_wallet_rpc`, Android and iOS apps, admin and front-end Vue apps, the trading robot, and the docs.

`the vendored exchange compose file` — MySQL 8, MongoDB 6, Redis 7, Kafka 3.7 (KRaft, no Zookeeper), on ports offset into 55xx/56xx/9094 so nothing collides with the existing Postgres 5433 / Redis 6380 / NATS 4222.

**Versions are deliberately not the ones the README asks for.** It specifies MySQL 5.5.16 (2011), Redis 3.2 (EOL 2018), MongoDB 3.6 (EOL 2021) and Kafka 2.11-2.2.1. Every one is past end of life with published CVEs. Pinning them to run an exchange would be choosing to deploy known-vulnerable infrastructure. MySQL 8 and MongoDB 6 are **not** drop-in for 5.5 and 3.6; expect driver and schema work, and record it here rather than downgrading around it.

---

## Findings from getting it running

### 1. The repository does not contain a database schema

Nine `CREATE TABLE` statements in the entire tree. **`exchange_order`, `member` and `member_transaction` — the core tables of an exchange — are defined nowhere.** `00_framework/sql/db_patch.sql` is a _patch_ against a schema that was never published.

What creates the tables is `spring.jpa.hibernate.ddl-auto=update` across 63 `@Entity` classes. So it does run — but the schema is whatever the entity annotations happen to produce, and `ddl-auto=update` never drops or narrows a column. That is the mechanism by which environments silently diverge: dev, staging and production end up with different schemas and nothing reports it.

**Consequence for startup order:** MySQL starts empty → Java services boot and Hibernate builds the schema → _then_ `db_patch.sql` and `member_wallet_trigger.sql` can be applied. Both reference tables that do not exist until Hibernate has run. Mounting them at `docker-entrypoint-initdb.d` is what killed the container on first start (the trigger also needs a `DELIMITER` change the entrypoint does not perform).

### 2. Money is a mutable column, not a ledger

`member_wallet` carries `balance` and `frozen_balance`, updated in place. The "history" is an `AFTER UPDATE` trigger writing before/after values to `member_wallet_history`.

That is an audit log, not a ledger. There is no double-entry, no sum-to-zero invariant, no hash chain, no idempotency key. If a balance is wrong, the trigger tells you _when it changed_; it cannot tell you whether the change was legitimate, and nothing can reconstruct the correct value.

Doctrine §0.6 exists to forbid exactly this shape.

### 3. Precision does not survive the boundary

|                           | scale            | decimal places |
| ------------------------- | ---------------- | -------------- |
| `member_wallet.balance`   | `decimal(18,8)`  | **8**          |
| `ledger.accounts.balance` | `numeric(38,18)` | **18**         |

Any amount crossing between the two systems **truncates at the 8th decimal place.** This is arithmetic, not preference.

It is not hypothetical for this platform: `proRata` distributes dust so shares sum back exactly, fee remainders live in the low decimals, and the ledger's own conformance suite asserts round-tripping `0.000000000000000001`. All of that is below `decimal(18,8)`'s resolution.

### 4. 31 committed `.jar` binaries

`apns-http2-core`, `aqmd-netty-*`, `spark-core` and others are checked into the tree as compiled artifacts rather than declared dependencies. They cannot be verified against an upstream source or a published checksum, and they are on the classpath of services that hold custody. They should be replaced with declared Maven coordinates, or removed, before anything here touches real value.

### 5. No JDK or Maven on this machine

Neither `java`, `javac` nor `mvn` is installed. The build runs in a `maven:3.8-openjdk-8` container, which is the right answer anyway — it pins the toolchain instead of depending on what a developer happens to have.

---

## THE decision that has to be made — who owns a balance

This is not a preference and it cannot be deferred, because both systems are willing to believe they are authoritative. Running both without deciding produces two balances for one user and no way to say which is right.

### Option A — the upstream platform owns balances; our ledger is retired

Simplest to run: the platform works as shipped. Cost: the double-entry ledger, hash-chained journal, replay reconciliation, purpose-keyed holds, conformance suite and four doctrine gates all become dead code. Every §4.2 property is given up, and the 8-decimal limit becomes the platform-wide precision.

### Option B — our ledger owns balances; the upstream platform's `member_wallet` becomes a projection

`member_wallet` is written *only* by a consumer of our ledger's journal, never by the upstream platform's own service code. Trading, OTC and wallet flows call our ledger through an adapter.

Keeps every §4.2 property. Cost: real surgery — every path in the upstream platform that writes `member_wallet` has to be redirected, and the 8-decimal column still truncates unless it is widened to `decimal(38,18)`.

### Option C — separate domains, one boundary account, reconciled

the upstream platform runs its own book for the products it owns; our ledger holds a `treasury`-kind boundary account representing the platform's net position in it, reconciled on a schedule. Both systems are internally consistent; the seam is explicit and auditable.

Cheapest to stand up and the only option that does not require rewriting one side. Cost: two books, and a reconciliation job that must be watched — a silent divergence is a real loss.

**Recommendation: C to get running, B as the target.** C makes the seam visible instead of pretending it does not exist; B is where this has to end up if the ledger's guarantees are worth anything. A is a decision to abandon the strongest part of the platform, and should only be taken deliberately.

**Whichever is chosen, `decimal(18,8)` must be widened to `decimal(38,18)`** anywhere value crosses the boundary. Otherwise the seam silently rounds money away, and the ledger's reconciliation will report a drift nobody can explain.

---

## Not yet done

- Maven build has not completed; nothing has been compiled or run.
- No service has been started. No claim is made that this platform works.
- The Vue front-ends and the mobile apps have not been examined.
- `01_wallet_rpc` handles private keys for BTC/ETH/USDT/EOS. **It has not been read.** Nothing in it should touch a chain holding value until it has been, and `custody-scan` does not cover Java.
- No security review of 878 Java files. The two P0s found in our own code this week (`ledger.post` and svc-matching order writes, both unauthenticated) were each _"a guard was written, then bypassed by a second door"_ — the failure mode that is invisible without reading everything.

---

## Links

- Source: the vendored exchange tree
- Infrastructure: `the vendored exchange compose file`
- Ledger doctrine: §0.6, §4.2 of `INTAFACED_DEFINITIVE_BUILD.md`
- Precedent: the FinceptTerminal decision (build our own, aggregate others)
