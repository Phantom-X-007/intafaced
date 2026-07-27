# Project tracker

> **Generated — do not edit by hand.** Source of truth is `tooling/tracker/features.mjs`.
> Run `pnpm tracker` after changing it. CI fails if this file is stale.

**20 of 103 shipped (19%)** · 0 in progress · 20 ready to claim · 63 blocked · 8 deliberate §13 sockets

|            | meaning                                            |
| ---------- | -------------------------------------------------- |
| ✅ done    | on `main`, DoD gate green                          |
| 🔨 wip     | someone is on it — see owner                       |
| 🟢 ready   | **every dependency is done. Claim it.**            |
| ⛔ blocked | waiting on a dependency — computed, not declared   |
| 🔌 socket  | deliberately not in v1 (§13); the interface exists |

---

## 🟢 Claim these now

Nothing blocks these. Pick one, say so in Telegram, open a branch:

```bash
pnpm wt feat/<the-thing>
```

| Feature                                                    | Module        | Phase | id                        |
| ---------------------------------------------------------- | ------------- | ----- | ------------------------- |
| 100+ languages — keyed from day one (§9)                   | `core-ops`    | 0     | `infra.i18n`              |
| WebAuthn registration + assertion (§9)                     | `identity`    | 1     | `identity.webauthn`       |
| Proposals + IFC-weighted voting (§4.3)                     | `token`       | 1     | `token.governance`        |
| Orderbook + matching engine, journal, replay               | `matching`    | 2     | `matching.engine`         |
| apps/web scaffold on the design system                     | `core-ops`    | 2     | `web.shell`               |
| Branded gateway, hosted checkout, payment links            | `pay`         | 3     | `pay.gateway`             |
| Offers, maker/taker, 100+ fiat currencies                  | `p2p`         | 3     | `p2p.offers`              |
| Passkey smart accounts, session keys (§17.4)               | `protocol`    | 3P    | `protocol.smart-accounts` |
| Blueprint session → profile JSON                           | `blueprint`   | 4     | `blueprint.onboarding`    |
| Multi-currency account UX over the ledger                  | `bank`        | 5     | `bank.accounts`           |
| Model-agnostic gateway, per-user metering                  | `agents`      | 5     | `agents.gateway`          |
| Live lobbies, LiveKit SFU, capacity tiers                  | `academy`     | 5     | `academy.lobbies`         |
| Vendor lifecycle — apply, vet, list, stake-gated slots     | `market`      | 5     | `market.vendors`          |
| Stratum share protocol, PPLNS payouts                      | `mining-pool` | 5     | `mining.pool`             |
| Support desk, tickets, KB                                  | `core-ops`    | 5     | `ops.support`             |
| Multi-tier affiliate / IB trees, payout automation         | `core-ops`    | 5     | `ops.affiliates`          |
| Screening queues, geo-block, VPN/Tor detection             | `core-ops`    | 5     | `ops.compliance`          |
| Warehouse — read replica + cube layer                      | `core-ops`    | 5     | `ops.analytics`           |
| apps/admin — listings, fee params, treasury, kill-switches | `core-ops`    | 5     | `ops.admin`               |
| Event-driven fan-out: in-app, push, email, SMS             | `core-ops`    | 5     | `ops.notifications`       |

---

## Everything, by phase

### Phase 0 — Foundations (10/11)

|     | Feature                                              | Plane | Blocked by | id                |
| --- | ---------------------------------------------------- | ----- | ---------- | ----------------- |
| ✅  | Monorepo, Turborepo, CI pipeline                     | F     |            | `infra.monorepo`  |
| ✅  | docker compose: Postgres, Redis, NATS, OTel, Grafana | F     |            | `infra.compose`   |
| ✅  | Typed env, feature flags, JURISDICTION_MATRIX        | F     |            | `infra.config`    |
| ✅  | NATS subject law, versioned event catalog            | F     |            | `infra.events`    |
| ✅  | zod-first tRPC pattern                               | F     |            | `infra.contracts` |
| ✅  | Scopes, JWT verify, guards                           | F     |            | `infra.auth-pkg`  |
| ✅  | Drizzle primitives, isolation helpers, test harness  | F     |            | `infra.db-pkg`    |
| ✅  | Design tokens + console primitives                   | F     |            | `infra.ui-tokens` |
| ✅  | brand-scan, custody-scan, migration-check, DoD gate  | F     |            | `infra.gates`     |
| ✅  | Worktree tooling + GitHub Flow                       | F     |            | `infra.worktrees` |
| 🟢  | 100+ languages — keyed from day one (§9)             | F     |            | `infra.i18n`      |

### Phase 1 — THE CORE (10/12)

|     | Feature                                          | Plane | Blocked by | id                    |
| --- | ------------------------------------------------ | ----- | ---------- | --------------------- |
| ✅  | Double-entry ledger, hash chain, reconciliation  | F     |            | `ledger.double-entry` |
| ✅  | Money recipes — every value path in the OS       | F     |            | `ledger.recipes`      |
| ✅  | Accounts, sessions, argon2id, TOTP               | F     |            | `identity.accounts`   |
| ✅  | XP graph, rank ladder, machine-readable perks    | F     |            | `identity.rank`       |
| ✅  | Scoped API keys, sub-accounts                    | F     |            | `identity.apikeys`    |
| ✅  | KYC tiers wired to JURISDICTION_MATRIX           | F     |            | `identity.kyc`        |
| 🟢  | WebAuthn registration + assertion (§9)           | F     |            | `identity.webauthn`   |
| ✅  | Emission curve, halving, single-minter guarantee | F     |            | `token.emissions`     |
| ✅  | Stake tiers, locks, access gating                | F     |            | `token.staking`       |
| ✅  | Real-yield distribution from platform fees       | F     |            | `token.yield`         |
| ✅  | Buyback & burn split                             | F     |            | `token.buyback`       |
| 🟢  | Proposals + IFC-weighted voting (§4.3)           | F     |            | `token.governance`    |

### Phase 2 — Trade (0/16)

|     | Feature                                                                                                           | Plane | Blocked by                | id                     |
| --- | ----------------------------------------------------------------------------------------------------------------- | ----- | ------------------------- | ---------------------- |
| 🟢  | Orderbook + matching engine, journal, replay                                                                      | F     |                           | `matching.engine`      |
| ⛔  | Determinism test — replay yields identical book                                                                   | F     | `matching.engine`         | `matching.determinism` |
| ⛔  | Spot markets, order lifecycle, fees                                                                               | F     | `matching.engine`         | `trade.spot`           |
| ⛔  | One-tap Convert — the retail on-ramp                                                                              | F     | `trade.spot`              | `trade.convert`        |
| ⛔  | Perps: cross/isolated margin, funding, liquidation ladder                                                         | F     | `trade.spot`              | `trade.futures`        |
| ⛔  | European options, cash-settled, full collateral in v1                                                             | F     | `trade.futures`           | `trade.options`        |
| ⛔  | OTC RFQ desk, staked-tier gate                                                                                    | F     | `trade.spot`              | `trade.otc`            |
| ⛔  | Copy trading, audited leaders, profit share                                                                       | B     | `trade.spot`              | `trade.copy`           |
| ⛔  | Fiat pairs on the same engine                                                                                     | F     | `trade.spot`, `pay.rails` | `trade.forex`          |
| ⛔  | TWAP / VWAP / POV execution                                                                                       | F     | `trade.spot`              | `trade.algo`           |
| ⛔  | CCXT-compatible public API (bots + terminals connect) <br/>_contract already built in packages/exchange-contract_ | F     | `trade.spot`              | `trade.ccxt-api`       |
| ⛔  | Internal market-maker seeding books at launch                                                                     | F     | `trade.spot`              | `trade.mm-bot`         |
| ⛔  | External venue adapters via CCXT (cross-venue) <br/>_LiquiditySource interface + router already built_            | F     | `trade.spot`              | `venue.aggregation`    |
| ⛔  | Pro terminal — depth, charts, hotkeys, sub-accounts                                                               | F     | `trade.spot`              | `web.terminal`         |
| 🟢  | apps/web scaffold on the design system                                                                            | F     |                           | `web.shell`            |
| ⛔  | WebSocket fan-out: depth, trades, orders, positions                                                               | F     | `matching.engine`         | `ws.gateway`           |

### Phase 3 — Pay + P2P (0/15)

|     | Feature                                                  | Plane | Blocked by       | id                  |
| --- | -------------------------------------------------------- | ----- | ---------------- | ------------------- |
| 🟢  | Branded gateway, hosted checkout, payment links          | F     |                  | `pay.gateway`       |
| ⛔  | PSP mode — own the merchant, digital KYB, custom pricing | F     | `pay.gateway`    | `pay.psp`           |
| ⛔  | PayFac mode — sub-merchant trees, 14 permission areas    | F     | `pay.psp`        | `pay.payfac`        |
| ⛔  | RailAdapter interface + crypto-native + card-sandbox     | F     | `pay.gateway`    | `pay.rails`         |
| ⛔  | Smart routing — geo, method, risk, approval rate         | F     | `pay.rails`      | `pay.routing`       |
| ⛔  | Dual settlement — bank or crypto                         | F     | `pay.rails`      | `pay.settlement`    |
| ⛔  | Risk scoring, chargebacks, decline recovery              | F     | `pay.gateway`    | `pay.fraud`         |
| ⛔  | Recurring — card and crypto                              | F     | `pay.gateway`    | `pay.subscriptions` |
| ⛔  | Woo / Magento / OpenCart plugins                         | F     | `pay.gateway`    | `pay.plugins`       |
| ⛔  | Public REST + webhooks + sandbox (§9)                    | B     | `pay.gateway`    | `pay.public-api`    |
| 🟢  | Offers, maker/taker, 100+ fiat currencies                | F     |                  | `p2p.offers`        |
| ⛔  | Ledger escrow — lock, release, refund                    | F     | `p2p.offers`     | `p2p.escrow`        |
| ⛔  | Moderated dispute resolution                             | F     | `p2p.escrow`     | `p2p.disputes`      |
| ⛔  | Reputation feeding the same XP graph                     | F     | `p2p.offers`     | `p2p.reputation`    |
| ⛔  | P2P merchant programme — badges, limits, API             | F     | `p2p.reputation` | `p2p.merchants`     |

### Phase 3P — Protocol P0 (0/7)

|     | Feature                                        | Plane | Blocked by                | id                        |
| --- | ---------------------------------------------- | ----- | ------------------------- | ------------------------- |
| 🟢  | Passkey smart accounts, session keys (§17.4)   | P     |                           | `protocol.smart-accounts` |
| ⛔  | AMM pools from audited templates               | P     | `protocol.smart-accounts` | `protocol.amm`            |
| ⛔  | On-chain lending markets, keeper liquidations  | P     | `protocol.amm`            | `protocol.lending`        |
| ⛔  | Non-custodial P2P escrow contracts             | P     | `protocol.smart-accounts` | `protocol.escrow`         |
| ⛔  | Sovereign router — book vs pool best execution | P     | `protocol.amm`            | `protocol.router`         |
| ⛔  | Lane A merchant contracts — zero KYB (§24)     | P     | `protocol.smart-accounts` | `protocol.merchant`       |
| ⛔  | Chain → Postgres read models                   | P     | `protocol.smart-accounts` | `indexer.readmodels`      |

### Phase 4 — Blueprint (0/5)

|     | Feature                                    | Plane | Blocked by                                        | id                       |
| --- | ------------------------------------------ | ----- | ------------------------------------------------- | ------------------------ |
| 🟢  | Blueprint session → profile JSON           | F     |                                                   | `blueprint.onboarding`   |
| ⛔  | Share card render (1080×1350, 1200×630)    | F     | `blueprint.onboarding`                            | `blueprint.card`         |
| ⛔  | Crew matching + mentor shortlist           | F     | `blueprint.onboarding`                            | `blueprint.crews`        |
| ⛔  | Export + hard delete, cascading            | F     | `blueprint.onboarding`                            | `blueprint.ownership`    |
| ⛔  | On-chain rank attestations, zero PII (§19) | B     | `blueprint.onboarding`, `protocol.smart-accounts` | `blueprint.attestations` |

### Phase 4P — INTACHAIN (0/3)

|     | Feature                                   | Plane | Blocked by                        | id                 |
| --- | ----------------------------------------- | ----- | --------------------------------- | ------------------ |
| ⛔  | INTACHAIN — CometBFT + native CLOB module | P     | `matching.engine`, `protocol.amm` | `chain.mainnet`    |
| ⛔  | INTAEVM sharing validator set + state     | P     | `chain.mainnet`                   | `chain.evm`        |
| ⛔  | Canonical IFC bridge + attestations       | B     | `chain.mainnet`                   | `bridge.canonical` |

### Phase 5 — Surfaces (0/32)

|     | Feature                                                    | Plane | Blocked by                              | id                       |
| --- | ---------------------------------------------------------- | ----- | --------------------------------------- | ------------------------ |
| 🟢  | Multi-currency account UX over the ledger                  | F     |                                         | `bank.accounts`          |
| ⛔  | Collateralised loans, LTV, margin calls, liquidation       | F     | `bank.accounts`, `trade.spot`           | `bank.loans`             |
| ⛔  | Flexible + fixed yield pools                               | F     | `bank.accounts`                         | `bank.earn`              |
| ⛔  | CardIssuerAdapter + card-sim, <2s auth decision            | F     | `bank.accounts`                         | `bank.cards`             |
| ⛔  | Self-custody funded card, JIT conversion (§18)             | P     | `bank.cards`, `protocol.smart-accounts` | `bank.sovereign-card`    |
| ⛔  | Fiat on/off ramp reusing svc-pay adapters                  | F     | `pay.rails`                             | `bank.ramps`             |
| 🟢  | Model-agnostic gateway, per-user metering                  | F     |                                         | `agents.gateway`         |
| ⛔  | Navigator — tool-calling inside user guardrails            | F     | `agents.gateway`                        | `agents.navigator`       |
| ⛔  | Support agent — KB + account-state grounded                | F     | `agents.gateway`                        | `agents.support`         |
| ⛔  | Market Scanner — ranked signals by tier                    | F     | `agents.gateway`, `trade.spot`          | `agents.scanner`         |
| ⛔  | Merchant agent — approval-rate watch                       | F     | `agents.gateway`, `pay.routing`         | `agents.merchant`        |
| ⛔  | Copy-Intel — writes audited leader stats                   | F     | `agents.gateway`, `trade.copy`          | `agents.copy-intel`      |
| 🟢  | Live lobbies, LiveKit SFU, capacity tiers                  | F     |                                         | `academy.lobbies`        |
| ⛔  | 2D navigable room canvas, VR-ready scene state             | F     | `academy.lobbies`                       | `academy.spatial`        |
| ⛔  | DERIV//DESK library import — 20 playbooks + 3 workbooks    | F     | `academy.lobbies`                       | `academy.curriculum`     |
| ⛔  | Certifications → XP → real perks                           | F     | `academy.curriculum`                    | `academy.certs`          |
| ⛔  | Residencies, IFC pay, revenue share                        | F     | `academy.lobbies`                       | `academy.ambassadors`    |
| ⛔  | Seasonal ladders, IFC prize pools                          | F     | `academy.lobbies`, `trade.spot`         | `academy.tournaments`    |
| ⛔  | Paper-trading market flag for workbooks                    | F     | `trade.spot`                            | `academy.paper-trading`  |
| ⛔  | ERC-20 deploy from audited templates                       | B     | `protocol.smart-accounts`               | `launch.token-factory`   |
| ⛔  | One-click meme launch + instant market + LP                | P     | `launch.token-factory`, `protocol.amm`  | `launch.meme-factory`    |
| ⛔  | Presale / fair launch, vesting, staked allocation tiers    | F     | `launch.token-factory`                  | `launch.launchpad`       |
| ⛔  | NFT mint / list / auction, on-chain royalties              | P     | `launch.token-factory`                  | `launch.nft`             |
| 🔌  | RWA issuance registry, licence-gated                       | F     |                                         | `launch.rwa`             |
| 🟢  | Vendor lifecycle — apply, vet, list, stake-gated slots     | F     |                                         | `market.vendors`         |
| ⛔  | Listings, subscriptions, purchases, house commission       | F     | `market.vendors`                        | `market.commerce`        |
| 🟢  | Stratum share protocol, PPLNS payouts                      | F     |                                         | `mining.pool`            |
| 🟢  | Support desk, tickets, KB                                  | F     |                                         | `ops.support`            |
| 🟢  | Multi-tier affiliate / IB trees, payout automation         | F     |                                         | `ops.affiliates`         |
| 🟢  | Screening queues, geo-block, VPN/Tor detection             | F     |                                         | `ops.compliance`         |
| 🟢  | Warehouse — read replica + cube layer                      | F     |                                         | `ops.analytics`          |
| 🟢  | apps/admin — listings, fee params, treasury, kill-switches | F     |                                         | `ops.admin`              |
| 🟢  | Event-driven fan-out: in-app, push, email, SMS             | F     |                                         | `ops.notifications`      |
| 🔌  | Rust port of svc-matching                                  | F     |                                         | `socket.rust-matching`   |
| 🔌  | Live card issuer rail                                      | F     |                                         | `socket.live-issuer`     |
| 🔌  | PayPal / Stripe / live acquiring rails                     | F     |                                         | `socket.psp-partners`    |
| 🔌  | VR lobby client                                            | F     |                                         | `socket.vr-client`       |
| 🔌  | Per-asset hash chains with cross-shard anchor              | F     |                                         | `socket.ledger-sharding` |

### Phase 5P — Protocol P2–P3 (0/2)

|     | Feature                                   | Plane | Blocked by                             | id                   |
| --- | ----------------------------------------- | ----- | -------------------------------------- | -------------------- |
| 🔌  | Rust CLOB execution engine                | P     |                                        | `chain.rust-core`    |
| ⛔  | Validator set opening, published schedule | P     | `chain.mainnet`                        | `chain.validators`   |
| ⛔  | Governance parameter handover             | P     | `chain.validators`, `token.governance` | `chain.governance`   |
| 🔌  | MPC custody for self-custody wallets      | P     |                                        | `socket.mpc-custody` |

---

## How to use this

**To claim something:** find it in 🟢, set `owner` and `status: "wip"` in `tooling/tracker/features.mjs`, run `pnpm tracker`, and include both files in your first PR. That way nobody duplicates you.

**To ship something:** set `status: "done"` and list the paths it created in `requires`. The check will refuse the claim if those paths are missing.

**Plane:** `F` = Fiat (custodial, compliant) · `P` = Protocol (non-custodial, zero-KYC) · `B` = both. See §22.

**Why blocked is computed:** so the tracker cannot lie about readiness. If you think something is wrongly blocked, the fix is in `dependsOn`, and that edit is reviewable.
