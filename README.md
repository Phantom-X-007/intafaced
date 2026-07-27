# INTAFACED — Sovereign OS

> The law is [`INTAFACED_DEFINITIVE_BUILD.md`](INTAFACED_DEFINITIVE_BUILD.md).
> The working rules are [`tooling/agent-protocol/AGENT_PROTOCOL.md`](tooling/agent-protocol/AGENT_PROTOCOL.md).
> This file only tells you how to run it.

---

## Status

**Phase 0 — Foundations: complete.** Phase 1 (the Core: identity, ledger, token) is next and unstarted.

| Phase | Scope                                                          | State       |
| ----- | -------------------------------------------------------------- | ----------- |
| **0** | Foundations, design system, doctrine gates                     | ✅ complete |
| 1     | THE CORE — svc-identity, svc-ledger, svc-token                 | ⬜ next     |
| 2     | svc-matching, svc-trade, terminal                              | ⬜          |
| 3     | svc-pay, svc-p2p (adapter architecture)                        | ⬜          |
| 3P    | Protocol P0 — contract suite, smart accounts, sovereign escrow | ⬜          |
| 4     | svc-blueprint                                                  | ⬜          |
| 4P    | Protocol P1 — INTACHAIN mainnet                                | ⬜          |
| 5     | Remaining surfaces + sovereign card                            | ⬜          |
| 5P    | Protocol P2–P3 — Rust core, validator opening                  | ⬜          |

---

## Run it

```bash
pnpm install
cp .env.example .env
docker compose up -d        # postgres · redis · nats · otel · tempo · prometheus · grafana
pnpm build
pnpm test
pnpm gate                   # the §14 Definition of Done gate
```

| Service    | URL                                | Credentials               |
| ---------- | ---------------------------------- | ------------------------- |
| Postgres   | `localhost:5433`                   | `intafaced` / `intafaced` |
| Redis      | `localhost:6379`                   | —                         |
| NATS       | `localhost:4222` (monitor `:8222`) | —                         |
| Grafana    | http://localhost:3001              | `intafaced` / `intafaced` |
| Prometheus | http://localhost:9090              | —                         |
| Tempo      | `localhost:3200`                   | —                         |

---

## What Phase 0 built

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

61 tests, including the fill arithmetic and the hash chain's tamper detection.

### `packages/events`

The subject law — `intafaced.<service>.<entity>.<verb>` — as a validator, not a comment. Unregistered services and present-tense verbs are rejected at build time. Every event is declared in a catalog with a zod payload and a version; payloads are validated on publish _and_ on delivery, so a producer running an old build cannot poison a consumer.

### `packages/auth`, `packages/contracts`, `packages/db`, `packages/ui`

Scopes (note: there is no `ledger:write` — balances never move on a user token), the zod-first tRPC pattern with a working reference router, Drizzle primitives with SERIALIZABLE retry semantics and a per-test-schema harness, and the locked design system: pure black, phosphor `#00FF41`, glass surfaces, Orbitron + Inter, with `Panel · Ticker · RankBadge · StatBlock · LobbyCard`.

### `tooling/ci` — the doctrines, enforced

| Gate                | Doctrine | What it does                                                                                                    |
| ------------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| `pnpm scan:brand`   | §0.7     | Fails the build if a vendor name reaches user-facing copy                                                       |
| `pnpm scan:custody` | §16.10   | Fails if a Protocol Plane service imports a ledger write recipe, or a contract grants platform withdrawal power |
| `pnpm db:check`     | §14      | Every migration has a reversal; destructive statements must be declared                                         |
| `pnpm gate`         | §14      | The full Definition of Done, per service                                                                        |

All four are verified against deliberate violations, not just against a clean tree.

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
               terminal-desktop                    (licensed — see docs/)
services/      svc-* — one per module              (Phase 1+)
packages/      config · events · contracts · db · auth · ledger-client · ui
               exchange-contract                   (CCXT-shaped public API)
tooling/       agent-protocol · ci · infra
docs/          TERMINAL_INTEGRATION.md
```

---

## Pro terminal

`packages/exchange-contract` publishes a **CCXT-compatible exchange API** — the unified
interface every trading bot, algo framework, and third-party terminal already speaks.
Serving this shape makes INTAFACED a first-class venue for software written before we
existed, and it is the seam the licensed desktop pro terminal connects through without a
line of its source being modified.

Money crosses that boundary as a decimal string, never a float — CCXT's own structures use
JS numbers, and the ledger reconciles to 18 decimal places. Full rationale and the
integration architecture: [`docs/TERMINAL_INTEGRATION.md`](docs/TERMINAL_INTEGRATION.md).
