# Project tracker

> **Generated — do not edit by hand.** Source of truth is `tooling/tracker/features.mjs`.
> Run `pnpm tracker` after changing it. CI fails if this file is stale.

**37 of 103 shipped (36%)** · 0 in progress · 45 ready to claim · 21 blocked · 13 deliberate §13 sockets

| | meaning |
|---|---|
| ✅ done | on `main`, DoD gate green |
| 🔨 wip | someone is on it — see owner |
| 🟢 ready | **every dependency is done. Claim it.** |
| ⛔ blocked | waiting on a dependency — computed, not declared |
| 🔌 socket | deliberately not in v1 (§13); the interface exists |

---

## 🟢 Claim these now

Nothing blocks these. Pick one, say so in Telegram, open a branch:

```bash
pnpm wt feat/<the-thing>
```

| Feature | Module | Phase | id |
|---|---|---|---|
| WebAuthn registration + assertion (§9) | `identity` | 1 | `identity.webauthn` |
| Proposals + IFC-weighted voting (§4.3) | `token` | 1 | `token.governance` |
| One-tap Convert — the retail on-ramp | `trade` | 2 | `trade.convert` |
| Perps: cross/isolated margin, funding, liquidation ladder | `trade` | 2 | `trade.futures` |
| OTC RFQ desk, staked-tier gate | `trade` | 2 | `trade.otc` |
| Copy trading, audited leaders, profit share | `trade` | 2 | `trade.copy` |
| Fiat pairs on the same engine | `trade` | 2 | `trade.forex` |
| TWAP / VWAP / POV execution | `trade` | 2 | `trade.algo` |
| CCXT-compatible public API (bots + terminals connect) | `trade` | 2 | `trade.ccxt-api` |
| Internal market-maker seeding books at launch | `trade` | 2 | `trade.mm-bot` |
| Pro terminal — depth, charts, hotkeys, sub-accounts | `trade` | 2 | `web.terminal` |
| WebSocket fan-out: depth, trades, orders, positions | `trade` | 2 | `ws.gateway` |
| PSP mode — own the merchant, digital KYB, custom pricing | `pay` | 3 | `pay.psp` |
| Smart routing — geo, method, risk, approval rate | `pay` | 3 | `pay.routing` |
| Dual settlement — bank or crypto | `pay` | 3 | `pay.settlement` |
| Risk scoring, chargebacks, decline recovery | `pay` | 3 | `pay.fraud` |
| Recurring — card and crypto | `pay` | 3 | `pay.subscriptions` |
| Woo / Magento / OpenCart plugins | `pay` | 3 | `pay.plugins` |
| Public REST + webhooks + sandbox (§9) | `pay` | 3 | `pay.public-api` |
| P2P merchant programme — badges, limits, API | `p2p` | 3 | `p2p.merchants` |
| AMM pools from audited templates | `protocol` | 3P | `protocol.amm` |
| Non-custodial P2P escrow contracts | `protocol` | 3P | `protocol.escrow` |
| Lane A merchant contracts — zero KYB (§24) | `protocol` | 3P | `protocol.merchant` |
| Chain → Postgres read models | `indexer` | 3P | `indexer.readmodels` |
| Share card render (1080×1350, 1200×630) | `blueprint` | 4 | `blueprint.card` |
| Crew matching + mentor shortlist | `blueprint` | 4 | `blueprint.crews` |
| Export + hard delete, cascading | `blueprint` | 4 | `blueprint.ownership` |
| On-chain rank attestations, zero PII (§19) | `blueprint` | 4 | `blueprint.attestations` |
| Collateralised loans, LTV, margin calls, liquidation | `bank` | 5 | `bank.loans` |
| Flexible + fixed yield pools | `bank` | 5 | `bank.earn` |
| CardIssuerAdapter + card-sim, <2s auth decision | `bank` | 5 | `bank.cards` |
| Fiat on/off ramp reusing svc-pay adapters | `bank` | 5 | `bank.ramps` |
| Navigator — tool-calling inside user guardrails | `agents` | 5 | `agents.navigator` |
| Support agent — KB + account-state grounded | `agents` | 5 | `agents.support` |
| Market Scanner — ranked signals by tier | `agents` | 5 | `agents.scanner` |
| Live lobbies, LiveKit SFU, capacity tiers | `academy` | 5 | `academy.lobbies` |
| Paper-trading market flag for workbooks | `academy` | 5 | `academy.paper-trading` |
| ERC-20 deploy from audited templates | `launch` | 5 | `launch.token-factory` |
| Vendor lifecycle — apply, vet, list, stake-gated slots | `market` | 5 | `market.vendors` |
| Stratum share protocol, PPLNS payouts | `mining-pool` | 5 | `mining.pool` |
| Support desk, tickets, KB | `core-ops` | 5 | `ops.support` |
| Multi-tier affiliate / IB trees, payout automation | `core-ops` | 5 | `ops.affiliates` |
| Screening queues, geo-block, VPN/Tor detection | `core-ops` | 5 | `ops.compliance` |
| Warehouse — read replica + cube layer | `core-ops` | 5 | `ops.analytics` |
| Event-driven fan-out: in-app, push, email, SMS | `core-ops` | 5 | `ops.notifications` |

## Highest leverage

What each unshipped feature would unblock, transitively. **This is what should drive build order** — a feature that frees 26 others is worth more than one that frees none, whatever else is louder.

| Unblocks | Feature | Status | id |
|---:|---|---|---|
| **9** | AMM pools from audited templates | 🟢 ready | `protocol.amm` |
| **6** | Live lobbies, LiveKit SFU, capacity tiers | 🟢 ready | `academy.lobbies` |
| **5** | INTACHAIN — CometBFT + native CLOB module | ⛔ blocked | `chain.mainnet` |
| **4** | ERC-20 deploy from audited templates | 🟢 ready | `launch.token-factory` |
| **2** | CardIssuerAdapter + card-sim, <2s auth decision | 🟢 ready | `bank.cards` |
| **1** | Proposals + IFC-weighted voting (§4.3) | 🟢 ready | `token.governance` |
| **1** | Perps: cross/isolated margin, funding, liquidation ladder | 🟢 ready | `trade.futures` |
| **1** | Copy trading, audited leaders, profit share | 🟢 ready | `trade.copy` |

---

## Everything, by phase

### Phase 0 — Foundations ✅

| | Feature | Plane | Blocked by | id |
|---|---|---|---|---|
| ✅ | Monorepo, Turborepo, CI pipeline | F |  | `infra.monorepo` |
| ✅ | docker compose: Postgres, Redis, NATS, OTel, Grafana | F |  | `infra.compose` |
| ✅ | Typed env, feature flags, JURISDICTION_MATRIX | F |  | `infra.config` |
| ✅ | NATS subject law, versioned event catalog | F |  | `infra.events` |
| ✅ | zod-first tRPC pattern | F |  | `infra.contracts` |
| ✅ | Scopes, JWT verify, guards | F |  | `infra.auth-pkg` |
| ✅ | Drizzle primitives, isolation helpers, test harness | F |  | `infra.db-pkg` |
| ✅ | Design tokens + console primitives | F |  | `infra.ui-tokens` |
| ✅ | brand-scan, custody-scan, migration-check, DoD gate | F |  | `infra.gates` |
| ✅ | Worktree tooling + GitHub Flow | F |  | `infra.worktrees` |
| ✅ | 100+ languages — keyed from day one (§9) | F |  | `infra.i18n` |

### Phase 1 — THE CORE (10/12)

| | Feature | Plane | Blocked by | id |
|---|---|---|---|---|
| ✅ | Double-entry ledger, hash chain, reconciliation | F |  | `ledger.double-entry` |
| ✅ | Money recipes — every value path in the OS | F |  | `ledger.recipes` |
| ✅ | Accounts, sessions, argon2id, TOTP | F |  | `identity.accounts` |
| ✅ | XP graph, rank ladder, machine-readable perks | F |  | `identity.rank` |
| ✅ | Scoped API keys, sub-accounts | F |  | `identity.apikeys` |
| ✅ | KYC tiers wired to JURISDICTION_MATRIX | F |  | `identity.kyc` |
| 🟢 | WebAuthn registration + assertion (§9) | F |  | `identity.webauthn` |
| ✅ | Emission curve, halving, single-minter guarantee | F |  | `token.emissions` |
| ✅ | Stake tiers, locks, access gating | F |  | `token.staking` |
| ✅ | Real-yield distribution from platform fees | F |  | `token.yield` |
| ✅ | Buyback & burn split | F |  | `token.buyback` |
| 🟢 | Proposals + IFC-weighted voting (§4.3) | F |  | `token.governance` |

### Phase 2 — Trade (5/16)

| | Feature | Plane | Blocked by | id |
|---|---|---|---|---|
| ✅ | Orderbook + matching engine, journal, replay | F |  | `matching.engine` |
| ✅ | Determinism test — replay yields identical book | F |  | `matching.determinism` |
| ✅ | Spot markets, order lifecycle, fees | F |  | `trade.spot` |
| 🟢 | One-tap Convert — the retail on-ramp | F |  | `trade.convert` |
| 🟢 | Perps: cross/isolated margin, funding, liquidation ladder | F |  | `trade.futures` |
| ⛔ | European options, cash-settled, full collateral in v1 | F | `trade.futures` | `trade.options` |
| 🟢 | OTC RFQ desk, staked-tier gate | F |  | `trade.otc` |
| 🟢 | Copy trading, audited leaders, profit share | B |  | `trade.copy` |
| 🟢 | Fiat pairs on the same engine | F |  | `trade.forex` |
| 🟢 | TWAP / VWAP / POV execution | F |  | `trade.algo` |
| 🟢 | CCXT-compatible public API (bots + terminals connect) <br/>_contract already built in packages/exchange-contract_ | F |  | `trade.ccxt-api` |
| 🟢 | Internal market-maker seeding books at launch | F |  | `trade.mm-bot` |
| ✅ | External venue adapters via CCXT (cross-venue) <br/>_LiquiditySource + router package on main; live venue wiring still product work_ | F |  | `venue.aggregation` |
| 🟢 | Pro terminal — depth, charts, hotkeys, sub-accounts | F |  | `web.terminal` |
| ✅ | apps/web scaffold on the design system <br/>_Scaffold on main; trade UI still mock data until ws/terminal wire_ | F |  | `web.shell` |
| 🟢 | WebSocket fan-out: depth, trades, orders, positions | F |  | `ws.gateway` |

### Phase 3 — Pay + P2P (6/15)

| | Feature | Plane | Blocked by | id |
|---|---|---|---|---|
| ✅ | Branded gateway, hosted checkout, payment links <br/>_svc-pay core on main; tRPC mount deferred to §9 gateway; product checkout links may still expand_ | F |  | `pay.gateway` |
| 🟢 | PSP mode — own the merchant, digital KYB, custom pricing | F |  | `pay.psp` |
| ⛔ | PayFac mode — sub-merchant trees, 14 permission areas | F | `pay.psp` | `pay.payfac` |
| ✅ | RailAdapter interface + crypto-native + card-sandbox <br/>_Rails + conformance kit on main inside svc-pay_ | F |  | `pay.rails` |
| 🟢 | Smart routing — geo, method, risk, approval rate | F |  | `pay.routing` |
| 🟢 | Dual settlement — bank or crypto | F |  | `pay.settlement` |
| 🟢 | Risk scoring, chargebacks, decline recovery | F |  | `pay.fraud` |
| 🟢 | Recurring — card and crypto | F |  | `pay.subscriptions` |
| 🟢 | Woo / Magento / OpenCart plugins | F |  | `pay.plugins` |
| 🟢 | Public REST + webhooks + sandbox (§9) | B |  | `pay.public-api` |
| ✅ | Offers, maker/taker, 100+ fiat currencies <br/>_svc-p2p on main; self-mounts /trpc with an edge-verified principal_ | F |  | `p2p.offers` |
| ✅ | Ledger escrow — lock, release, refund <br/>_Escrow flows in svc-p2p; not a separate service_ | F |  | `p2p.escrow` |
| ✅ | Moderated dispute resolution <br/>_Dispute paths in svc-p2p core_ | F |  | `p2p.disputes` |
| ✅ | Reputation feeding the same XP graph <br/>_Reputation module on main_ | F |  | `p2p.reputation` |
| 🟢 | P2P merchant programme — badges, limits, API | F |  | `p2p.merchants` |

### Phase 3P — Protocol P0 (1/7)

| | Feature | Plane | Blocked by | id |
|---|---|---|---|---|
| ✅ | Passkey smart accounts, session keys (§17.4) <br/>_svc-protocol on main; self-mounts /trpc with an edge-verified principal; open contract sockets remain elsewhere_ | P |  | `protocol.smart-accounts` |
| 🟢 | AMM pools from audited templates | P |  | `protocol.amm` |
| ⛔ | On-chain lending markets, keeper liquidations | P | `protocol.amm` | `protocol.lending` |
| 🟢 | Non-custodial P2P escrow contracts | P |  | `protocol.escrow` |
| ⛔ | Sovereign router — book vs pool best execution | P | `protocol.amm` | `protocol.router` |
| 🟢 | Lane A merchant contracts — zero KYB (§24) | P |  | `protocol.merchant` |
| 🟢 | Chain → Postgres read models | P |  | `indexer.readmodels` |
| 🔌 | Foundry + contract test suite in CI <br/>_Solidity is written and cross-checked from TypeScript, but never executed. Blocks any mainnet deploy._ | P |  | `socket.contract-toolchain` |
| 🔌 | External audit of the account + factory suite | P |  | `socket.contract-audit` |
| 🔌 | getUserOperationHash checked against a live EntryPoint | P |  | `socket.userop-differential-test` |
| 🔌 | Passkey (P-256) owner verifier contract <br/>_SmartAccount already routes contract owners through ERC-1271; the verifier itself is not built._ | P |  | `socket.p256-verifier` |

### Phase 4 — Blueprint (1/5)

| | Feature | Plane | Blocked by | id |
|---|---|---|---|---|
| ✅ | Blueprint session → profile JSON <br/>_svc-blueprint on main; self-mounts /trpc with an edge-verified principal_ | F |  | `blueprint.onboarding` |
| 🟢 | Share card render (1080×1350, 1200×630) | F |  | `blueprint.card` |
| 🟢 | Crew matching + mentor shortlist | F |  | `blueprint.crews` |
| 🟢 | Export + hard delete, cascading | F |  | `blueprint.ownership` |
| 🟢 | On-chain rank attestations, zero PII (§19) | B |  | `blueprint.attestations` |

### Phase 4P — INTACHAIN (0/3)

| | Feature | Plane | Blocked by | id |
|---|---|---|---|---|
| ⛔ | INTACHAIN — CometBFT + native CLOB module | P | `protocol.amm` | `chain.mainnet` |
| ⛔ | INTAEVM sharing validator set + state | P | `chain.mainnet` | `chain.evm` |
| ⛔ | Canonical IFC bridge + attestations | B | `chain.mainnet` | `bridge.canonical` |

### Phase 5 — Surfaces (3/32)

| | Feature | Plane | Blocked by | id |
|---|---|---|---|---|
| ✅ | Multi-currency account UX over the ledger <br/>_svc-bank on main; self-mounts /trpc with an edge-verified principal; UX product may expand_ | F |  | `bank.accounts` |
| 🟢 | Collateralised loans, LTV, margin calls, liquidation | F |  | `bank.loans` |
| 🟢 | Flexible + fixed yield pools | F |  | `bank.earn` |
| 🟢 | CardIssuerAdapter + card-sim, <2s auth decision | F |  | `bank.cards` |
| ⛔ | Self-custody funded card, JIT conversion (§18) | P | `bank.cards` | `bank.sovereign-card` |
| 🟢 | Fiat on/off ramp reusing svc-pay adapters | F |  | `bank.ramps` |
| ✅ | Model-agnostic gateway, per-user metering <br/>_Reference mount — the /trpc + createEdgeContext recipe every other service copies_ | F |  | `agents.gateway` |
| 🟢 | Navigator — tool-calling inside user guardrails | F |  | `agents.navigator` |
| 🟢 | Support agent — KB + account-state grounded | F |  | `agents.support` |
| 🟢 | Market Scanner — ranked signals by tier | F |  | `agents.scanner` |
| ⛔ | Merchant agent — approval-rate watch | F | `pay.routing` | `agents.merchant` |
| ⛔ | Copy-Intel — writes audited leader stats | F | `trade.copy` | `agents.copy-intel` |
| 🟢 | Live lobbies, LiveKit SFU, capacity tiers | F |  | `academy.lobbies` |
| ⛔ | 2D navigable room canvas, VR-ready scene state | F | `academy.lobbies` | `academy.spatial` |
| ⛔ | DERIV//DESK library import — 20 playbooks + 3 workbooks | F | `academy.lobbies` | `academy.curriculum` |
| ⛔ | Certifications → XP → real perks | F | `academy.curriculum` | `academy.certs` |
| ⛔ | Residencies, IFC pay, revenue share | F | `academy.lobbies` | `academy.ambassadors` |
| ⛔ | Seasonal ladders, IFC prize pools | F | `academy.lobbies` | `academy.tournaments` |
| 🟢 | Paper-trading market flag for workbooks | F |  | `academy.paper-trading` |
| 🟢 | ERC-20 deploy from audited templates | B |  | `launch.token-factory` |
| ⛔ | One-click meme launch + instant market + LP | P | `launch.token-factory`, `protocol.amm` | `launch.meme-factory` |
| ⛔ | Presale / fair launch, vesting, staked allocation tiers | F | `launch.token-factory` | `launch.launchpad` |
| ⛔ | NFT mint / list / auction, on-chain royalties | P | `launch.token-factory` | `launch.nft` |
| 🔌 | RWA issuance registry, licence-gated | F |  | `launch.rwa` |
| 🟢 | Vendor lifecycle — apply, vet, list, stake-gated slots | F |  | `market.vendors` |
| ⛔ | Listings, subscriptions, purchases, house commission | F | `market.vendors` | `market.commerce` |
| 🟢 | Stratum share protocol, PPLNS payouts | F |  | `mining.pool` |
| 🟢 | Support desk, tickets, KB | F |  | `ops.support` |
| 🟢 | Multi-tier affiliate / IB trees, payout automation | F |  | `ops.affiliates` |
| 🟢 | Screening queues, geo-block, VPN/Tor detection | F |  | `ops.compliance` |
| 🟢 | Warehouse — read replica + cube layer | F |  | `ops.analytics` |
| ✅ | apps/admin — listings, fee params, treasury, kill-switches <br/>_Console scaffold on main; freeze/reconcile still simulated until wired_ | F |  | `ops.admin` |
| 🟢 | Event-driven fan-out: in-app, push, email, SMS | F |  | `ops.notifications` |
| 🔌 | Rust port of svc-matching | F |  | `socket.rust-matching` |
| 🔌 | Live card issuer rail | F |  | `socket.live-issuer` |
| 🔌 | PayPal / Stripe / live acquiring rails | F |  | `socket.psp-partners` |
| 🔌 | VR lobby client | F |  | `socket.vr-client` |
| 🔌 | Per-asset hash chains with cross-shard anchor | F |  | `socket.ledger-sharding` |

### Phase 5P — Protocol P2–P3 (0/2)

| | Feature | Plane | Blocked by | id |
|---|---|---|---|---|
| 🔌 | Rust CLOB execution engine | P |  | `chain.rust-core` |
| ⛔ | Validator set opening, published schedule | P | `chain.mainnet` | `chain.validators` |
| ⛔ | Governance parameter handover | P | `chain.validators`, `token.governance` | `chain.governance` |
| 🔌 | MPC custody for self-custody wallets | P |  | `socket.mpc-custody` |
| 🔌 | Guardian-based account recovery <br/>_Deliberately absent: a guardian is a second party who can take the account, and the platform must never be one._ | P |  | `socket.social-recovery` |

---

## How to use this

**To claim something:** find it in 🟢, set `owner` and `status: "wip"` in `tooling/tracker/features.mjs`, run `pnpm tracker`, and include both files in your first PR. That way nobody duplicates you.

**To ship something:** set `status: "done"` and list the paths it created in `requires`. The check will refuse the claim if those paths are missing.

**Plane:** `F` = Fiat (custodial, compliant) · `P` = Protocol (non-custodial, zero-KYC) · `B` = both. See §22.

**Why blocked is computed:** so the tracker cannot lie about readiness. If you think something is wrongly blocked, the fix is in `dependsOn`, and that edit is reviewable.

