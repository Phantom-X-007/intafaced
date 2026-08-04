# INTAFACED — Sovereign OS

> The law is [`INTAFACED_DEFINITIVE_BUILD.md`](INTAFACED_DEFINITIVE_BUILD.md).
> The working rules are [`tooling/agent-protocol/AGENT_PROTOCOL.md`](tooling/agent-protocol/AGENT_PROTOCOL.md).
> This file only tells you how to run it.

---

## Status

<!-- tracker:start -->

`████████░░░░░░░░░░░░` **42%** — 45 of 108 features shipped

Phases: **0** 10/11 · **1** ✅ · **2** 6/17 · **3** 6/16 · **3P** 1/8 · **4** 4/5 · **4P** 0/3 · **5** 7/35 · **5P** 0/2

**In progress:** Pro terminal — depth, charts, hotkeys, sub-accounts (Nitro) · WebSocket fan-out: depth, trades, orders, positions (Nitro) · Branded gateway, hosted checkout, payment links (Nitro)

**🟢 31 ready to claim** — nothing blocks these:

- `infra.i18n` — 100+ languages — keyed from day one (§9)
- `trade.futures` — Perps: cross/isolated margin, funding, liquidation ladder
- `trade.otc` — OTC RFQ desk, staked-tier gate
- `trade.copy` — Copy trading, audited leaders, profit share
- `trade.forex` — Fiat pairs on the same engine
- `trade.algo` — TWAP / VWAP / POV execution
- `trade.ccxt-api` — CCXT-compatible public API (bots + terminals connect)
- `trade.mm-bot` — Internal market-maker seeding books at launch
- …and 23 more

Full board: **[docs/TRACKER.md](docs/TRACKER.md)** · `pnpm tracker ready`

<!-- tracker:end -->

---

## Run it

**The whole platform — eleven services, both apps, and the infrastructure:**

```bash
pnpm install
cp .env.example .env        # read the header — two secrets must match fleet-wide
pnpm platform:up            # everything, migrations included
```

Ports, boot order, and what to do when it does not come up:
**[docs/RUNNING.md](docs/RUNNING.md)**.

**Just a database, for tests:**

```bash
pnpm infra:up               # postgres · redis · nats · otel · tempo · prometheus · grafana
pnpm build
pnpm test
pnpm gate                   # the §14 Definition of Done gate
```

| Service    | URL                                | Credentials               |
| ---------- | ---------------------------------- | ------------------------- |
| Postgres   | `localhost:5433`                   | `intafaced` / `intafaced` |
| Redis      | `localhost:6380`                   | —                         |
| NATS       | `localhost:4222` (monitor `:8222`) | —                         |
| Grafana    | http://localhost:3001              | `intafaced` / `intafaced` |
| Prometheus | http://localhost:9090              | —                         |
| Tempo      | `localhost:3200`                   | —                         |

---

## What's built

**Phase 1 — THE CORE is complete.** `svc-ledger`, `svc-identity`, `svc-token` are on `main`, and Doctrine §0.2 no longer blocks Phase 2.

### The three Core services

**`svc-ledger`** — double-entry, hash-chained, reconciling. The invariants hold in three places: shared validation, the transaction, and database CHECK constraints, so a bug in the service still cannot create money. It runs the same conformance suite as the in-memory reference (§4.4).

**`svc-identity`** — accounts, argon2id, TOTP verified against the RFC's own published vectors, refresh rotation with reuse detection, and the XP graph. One rank, read by every module through a machine-readable perk table.

**`svc-token`** — emission curve, staking ladder, real-yield distribution from actual platform fees, buyback & burn. Holds no balances: the stake principal lives in the ledger, and a test asserts the two answers agree.

### `packages/config`

Typed env loading (fails loud, at boot, listing every problem at once), the feature-flag registry wired to the §11 drop sequence, the module registry, the fiat currency table, and `JURISDICTION_MATRIX` — where §22's sovereignty law is encoded as a function rather than a policy document:

```ts
checkAccess({ module: 'protocol', region: 'US', plane: 'protocol', kycTier: 'none' });
// → { allowed: true, code: 'allowed.permissionless' }   ← no custody, no gate

checkAccess({ module: 'bank', region: 'DE', plane: 'fiat', kycTier: 'basic' });
// → { allowed: false, code: 'denied.kyc_required', requiredTier: 'full' }
```

### `packages/ledger-client`

Doctrine §0.6, made mechanical.

- **`money.ts`** — decimals as scaled bigints. A float never touches a balance. Rounding mode is always explicit, and `proRata` distributions sum back to the exact total, dust included.
- **`client.ts`** — the three invariants, enforced before any implementation sees a transaction: sum-to-zero per asset, no negative `available`, locks funded from the owner's own balance.
- **`recipes/`** — every money path in the OS as a pure function. `deposit`, `tradeFill` (the six-entry atomic fill), `escrowLock/Release/Refund`, `stake`, `feeCharge` with the IFC discount branch, `rewardPay`, `collateralLock`, `liquidate`.
- **`memory-ledger.ts`** — the executable specification svc-ledger must match: idempotency, hash-chained journal, replay reconciliation.

84 tests, including the fill arithmetic, the hash chain's tamper detection, and the shared conformance suite both ledger implementations must pass.

### `packages/events`

The subject law — `intafaced.<service>.<entity>.<verb>` — as a validator, not a comment. Unregistered services and present-tense verbs are rejected at build time. Every event is declared in a catalog with a zod payload and a version; payloads are validated on publish _and_ on delivery, so a producer running an old build cannot poison a consumer.

### `packages/auth`, `packages/contracts`, `packages/db`, `packages/ui`

Scopes (note: there is no `ledger:write` — balances never move on a user token), the zod-first tRPC pattern with a working reference router, Drizzle primitives with SERIALIZABLE retry semantics and a per-test-schema harness, and the locked design system: pure black, phosphor `#00FF41`, glass surfaces, Orbitron + Inter, with `Panel · Ticker · RankBadge · StatBlock · LobbyCard`.

### `tooling/ci` — the doctrines, enforced

`pnpm gates` runs all fourteen in about two seconds, from **one list — `tooling/ci/gates.mjs` — that `pnpm verify` and CI's `gates` job both consume.** One list is the point: they were previously maintained separately and drifted, so two gates ran in CI and nowhere local.

| Gate                             | Doctrine  | What it does                                                                                                    |
| -------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------- |
| `pnpm scan:brand`                | §0.7      | Fails the build if a vendor name reaches user-facing copy                                                       |
| `pnpm scan:custody`              | §16.10    | Fails if a Protocol Plane service imports a ledger write recipe, or a contract grants platform withdrawal power |
| `pnpm scan:secrets`              | §16       | Fails on a credential-shaped assignment that is not a declared placeholder                                      |
| `pnpm scan:vendor-shell`         | vendor    | Mass-credit endpoints and `CORS *` inherited from the vendored shell                                            |
| `pnpm scan:vendor-java-money`    | dual-book | A Java money mutator is a second book, and there is only one book                                               |
| `pnpm scan:dual-book-door`       | A1        | The door-kill interceptor is registered on every vendored app                                                   |
| `pnpm scan:dual-book-door-paths` | A1        | Proves the door-kill path fragments block what they claim, without a JVM                                        |
| `pnpm scan:test-db`              | isolation | Every Postgres-capable suite is on a `*_test` database, never the shared one                                    |
| `pnpm db:check`                  | §14       | Every migration has a reversal; destructive statements must be declared                                         |
| _killswitch reachability_        | §14.6     | Every route killable, enforced at the door, failing closed, reachable from `apps/admin`                         |
| `pnpm scan:workspace`            | fleet     | No service that builds but never reaches the image or the fleet                                                 |
| `pnpm tracker:check`             | honesty   | `docs/TRACKER.md` matches the code; nothing claims `done` without the service existing                          |
| `pnpm scan:agent-autoload`       | multi-dev | Coordination law stays in the files a cold agent auto-loads                                                     |
| `pnpm scan:i18n`                 | §9        | Reports hardcoded user-facing strings. **Advisory** — runs and prints, does not fail                            |
| `pnpm gate`                      | §14       | The full Definition of Done, per service. Runs separately, after build and test                                 |

They are verified against deliberate violations, not just against a clean tree.

**`scan:custody` is narrower than its name suggests** — it walks four named Protocol Plane services (three exist today) and `svc-protocol`'s Solidity, 97 files. It covers no Java and no other service. The header of `tooling/ci/custody-scan.mjs` states the coverage exactly; read it before citing the gate.

---

## The three shared systems

Doctrine §0.3: **Identity, Balance, Token.** Every cross-module link runs through one of these three. A feature that needs a fourth is a feature whose design is wrong.

```
                    ┌─────────────┐
                    │  IDENTITY   │  one account · one verification · one rank
                    │ svc-identity│  XP events in → perks table out
                    └──────┬──────┘
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
┌──────▼──────┐     ┌──────▼──────┐     ┌──────▼──────┐
│   BALANCE   │     │    TOKEN    │     │  SURFACES   │
│  svc-ledger │◄────┤  svc-token  │     │ trade · pay │
│             │     │             │     │ p2p · bank  │
│ double-entry│     │ stake · burn│     │ launch · …  │
│ hash-chained│     │  buyback    │     │             │
└─────────────┘     └─────────────┘     └──────┬──────┘
       ▲                                        │
       └────────────────────────────────────────┘
              every value movement, no exceptions
```

---

## Known dependency note

`nats@2.x` is published as deprecated in favour of the split `@nats-io/*` v3 packages. The 2.x client is functional and is what `packages/events` uses today; the migration is isolated to `jetstream-bus.ts` because nothing else imports `nats` directly. Worth doing before Phase 2 puts real order flow on the bus.

---

## Layout

```
apps/          web · admin · ws-gateway            (Phase 2+)
services/      svc-ledger · svc-identity · svc-token   ✅ the Core
               svc-matching · svc-trade · svc-pay · …  (Phase 2+)
packages/      config · events · contracts · db · auth · ledger-client · ui
               exchange-contract   CCXT-shaped API we serve
               venue-adapter       cross-venue routing
tooling/       agent-protocol · ci · infra · tracker
docs/          TRACKER.md · TERMINAL.md · ONBOARDING.md
```

---

## Pro terminal — ours, and cross-venue

We build our own terminal (Next.js, one design system, one language). The symmetry that makes it work:

**CCXT out** — `packages/exchange-contract` publishes a CCXT-compatible API, the interface every trading bot and third-party terminal already speaks. Serving that shape makes INTAFACED a venue for software written before we existed.

**CCXT in** — `packages/venue-adapter` consumes external venues through the same standard, behind the §5.2 `LiquiditySource` interface. The internal book implements that interface too, so the router cannot favour us structurally; it ranks on price, and wins ties by a bounded, tested 5 bps preference.

Money crosses both boundaries as a decimal string, never a float — CCXT's own structures use JS numbers and the ledger reconciles to 18 places.

Architecture: [`docs/TERMINAL.md`](docs/TERMINAL.md). Why we didn't licence an existing one: [`docs/TERMINAL_INTEGRATION.md`](docs/TERMINAL_INTEGRATION.md).
