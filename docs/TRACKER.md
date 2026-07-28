# Project tracker

> **Generated — do not edit by hand.** Source of truth is `tooling/tracker/features.mjs`.
> Run `pnpm tracker` after changing it. CI fails if this file is stale.

**18 of 103 shipped (17%)** · 0 in progress · 33 ready to claim · 52 blocked · 13 deliberate §13 sockets

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
| 100+ languages — keyed from day one (§9) | `core-ops` | 0 | `infra.i18n` |
| Scoped API keys, sub-accounts | `identity` | 1 | `identity.apikeys` |
| KYC tiers wired to JURISDICTION_MATRIX | `identity` | 1 | `identity.kyc` |
| WebAuthn registration + assertion (§9) | `identity` | 1 | `identity.webauthn` |
| Emission curve, halving, single-minter guarantee | `token` | 1 | `token.emissions` |
| Stake tiers, locks, access gating | `token` | 1 | `token.staking` |
| Real-yield distribution from platform fees | `token` | 1 | `token.yield` |
| Buyback & burn split | `token` | 1 | `token.buyback` |
| One-tap Convert — the retail on-ramp | `trade` | 2 | `trade.convert` |
| Perps: cross/isolated margin, funding, liquidation ladder | `trade` | 2 | `trade.futures` |
| Copy trading, audited leaders, profit share | `trade` | 2 | `trade.copy` |
| TWAP / VWAP / POV execution | `trade` | 2 | `trade.algo` |
| CCXT-compatible public API (bots + terminals connect) | `trade` | 2 | `trade.ccxt-api` |
| Internal market-maker seeding books at launch | `trade` | 2 | `trade.mm-bot` |
| External venue adapters via CCXT (cross-venue) | `trade` | 2 | `venue.aggregation` |
| Pro terminal — depth, charts, hotkeys, sub-accounts | `trade` | 2 | `web.terminal` |
| apps/web scaffold on the design system | `core-ops` | 2 | `web.shell` |
| WebSocket fan-out: depth, trades, orders, positions | `trade` | 2 | `ws.gateway` |
| Branded gateway, hosted checkout, payment links | `pay` | 3 | `pay.gateway` |
| Offers, maker/taker, 100+ fiat currencies | `p2p` | 3 | `p2p.offers` |
| Passkey smart accounts, session keys (§17.4) | `protocol` | 3P | `protocol.smart-accounts` |
| Blueprint session → profile JSON | `blueprint` | 4 | `blueprint.onboarding` |
| Multi-currency account UX over the ledger | `bank` | 5 | `bank.accounts` |
| Navigator — tool-calling inside user guardrails | `agents` | 5 | `agents.navigator` |
| Support agent — KB + account-state grounded | `agents` | 5 | `agents.support` |
| Market Scanner — ranked signals by tier | `agents` | 5 | `agents.scanner` |
| Live lobbies, LiveKit SFU, capacity tiers | `academy` | 5 | `academy.lobbies` |
| Paper-trading market flag for workbooks | `academy` | 5 | `academy.paper-trading` |
| Support desk, tickets, KB | `core-ops` | 5 | `ops.support` |
| Multi-tier affiliate / IB trees, payout automation | `core-ops` | 5 | `ops.affiliates` |
| Warehouse — read replica + cube layer | `core-ops` | 5 | `ops.analytics` |
| apps/admin — listings, fee params, treasury, kill-switches | `core-ops` | 5 | `ops.admin` |
| Event-driven fan-out: in-app, push, email, SMS | `core-ops` | 5 | `ops.notifications` |

## Highest leverage

What each unshipped feature would unblock, transitively. **This is what should drive build order** — a feature that frees 26 others is worth more than one that frees none, whatever else is louder.

| Unblocks | Feature | Status | id |
|---:|---|---|---|
| **25** | Passkey smart accounts, session keys (§17.4) | 🟢 ready | `protocol.smart-accounts` |
| **13** | Branded gateway, hosted checkout, payment links | 🟢 ready | `pay.gateway` |
| **9** | AMM pools from audited templates | ⛔ blocked | `protocol.amm` |
| **8** | Stake tiers, locks, access gating | 🟢 ready | `token.staking` |
| **6** | RailAdapter interface + crypto-native + card-sandbox | ⛔ blocked | `pay.rails` |
| **6** | Live lobbies, LiveKit SFU, capacity tiers | 🟢 ready | `academy.lobbies` |
| **5** | INTACHAIN — CometBFT + native CLOB module | ⛔ blocked | `chain.mainnet` |
| **5** | Multi-currency account UX over the ledger | 🟢 ready | `bank.accounts` |

---

## Everything, by phase

### Phase 0 — Foundations (10/11)

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
| 🟢 | 100+ languages — keyed from day one (§9) <br/>_Downgraded 2026-07-28: `@intafaced/i18n` is imported by zero files outside its own package. apps/web hardcodes English in a `copy` object whose comment calls i18n "being built in a separate worktree". "Keyed from day one" is not true of any surface._ | F |  | `infra.i18n` |

### Phase 1 — THE CORE (4/12)

| | Feature | Plane | Blocked by | id |
|---|---|---|---|---|
| ✅ | Double-entry ledger, hash chain, reconciliation | F |  | `ledger.double-entry` |
| ✅ | Money recipes — every value path in the OS | F |  | `ledger.recipes` |
| ✅ | Accounts, sessions, argon2id, TOTP | F |  | `identity.accounts` |
| ✅ | XP graph, rank ladder, machine-readable perks | F |  | `identity.rank` |
| 🟢 | Scoped API keys, sub-accounts <br/>_Downgraded 2026-07-28: create/list/revoke are reachable on the mounted router, but `verifyApiKey` (auth-service.ts:328) is called by nothing outside identity.test.ts. A key can be issued and never opens anything — no service accepts one._ | F |  | `identity.apikeys` |
| 🟢 | KYC tiers wired to JURISDICTION_MATRIX <br/>_Downgraded 2026-07-28: the READ side is wired (kycTier feeds the session tier the matrix reads), but `approveKyc` is exposed by no procedure and no HTTP route. Nothing in the repo can write identity.kyc_records, so every real user is tier `none` forever._ | F |  | `identity.kyc` |
| 🟢 | WebAuthn registration + assertion (§9) | F |  | `identity.webauthn` |
| 🟢 | Emission curve, halving, single-minter guarantee <br/>_Downgraded 2026-07-28: `mintEpoch` is called by token-service.test.ts and nothing else. svc-token/src/router.ts exposes exactly three procedures (health, stakeOf, accessOf) and index.ts starts no scheduler. No epoch can ever be minted on a running system._ | F |  | `token.emissions` |
| 🟢 | Stake tiers, locks, access gating <br/>_Downgraded 2026-07-28: the READS ship (stakeOf/accessOf on /trpc, /internal/stake/:userId for svc-trade), but `stake` and `unstake` are called only by tests. Nobody can stake, so every access tier this gates resolves to the unstaked one._ | F |  | `token.staking` |
| 🟢 | Real-yield distribution from platform fees <br/>_Downgraded 2026-07-28: `distributeRevenue` is called only by token-service.test.ts. No route, no consumer, no schedule — fees accrue nowhere and no yield is ever distributed._ | F |  | `token.yield` |
| 🟢 | Buyback & burn split <br/>_Downgraded 2026-07-28: `recordBuyback` and `burnedSupply` are called only by token-service.test.ts. Same shape as token.yield — the maths is tested, the trigger does not exist._ | F |  | `token.buyback` |
| ⛔ | Proposals + IFC-weighted voting (§4.3) | F | `token.staking` | `token.governance` |

### Phase 2 — Trade (3/16)

| | Feature | Plane | Blocked by | id |
|---|---|---|---|---|
| ✅ | Orderbook + matching engine, journal, replay | F |  | `matching.engine` |
| ✅ | Determinism test — replay yields identical book | F |  | `matching.determinism` |
| ✅ | Spot markets, order lifecycle, fees | F |  | `trade.spot` |
| 🟢 | One-tap Convert — the retail on-ramp | F |  | `trade.convert` |
| 🟢 | Perps: cross/isolated margin, funding, liquidation ladder | F |  | `trade.futures` |
| ⛔ | European options, cash-settled, full collateral in v1 | F | `trade.futures` | `trade.options` |
| ⛔ | OTC RFQ desk, staked-tier gate | F | `token.staking` | `trade.otc` |
| 🟢 | Copy trading, audited leaders, profit share | B |  | `trade.copy` |
| ⛔ | Fiat pairs on the same engine | F | `pay.rails` | `trade.forex` |
| 🟢 | TWAP / VWAP / POV execution | F |  | `trade.algo` |
| 🟢 | CCXT-compatible public API (bots + terminals connect) <br/>_contract already built in packages/exchange-contract_ | F |  | `trade.ccxt-api` |
| 🟢 | Internal market-maker seeding books at launch | F |  | `trade.mm-bot` |
| 🟢 | External venue adapters via CCXT (cross-venue) <br/>_Downgraded 2026-07-28: `@intafaced/venue-adapter` is imported by zero files outside its own package. There is no adapter for any real venue — `LiquiditySource` is an interface with no implementation, so nothing is aggregated._ | F |  | `venue.aggregation` |
| 🟢 | Pro terminal — depth, charts, hotkeys, sub-accounts | F |  | `web.terminal` |
| 🟢 | apps/web scaffold on the design system <br/>_Downgraded 2026-07-28: apps/web has ZERO test files, no `use client`, no state, no fetch and no websocket across all 7 tsx files. Every number on the page is a hardcoded string literal. It is a picture of the product, not the product._ | F |  | `web.shell` |
| 🟢 | WebSocket fan-out: depth, trades, orders, positions | F |  | `ws.gateway` |

### Phase 3 — Pay + P2P (0/15)

| | Feature | Plane | Blocked by | id |
|---|---|---|---|---|
| 🟢 | Branded gateway, hosted checkout, payment links <br/>_Downgraded 2026-07-28: all 13 procedures are unreachable. svc-pay/src/index.ts:67 builds the router "so the type is exported" and never registers fastifyTRPCPlugin — the only served routes are /health, /ready and POST /webhooks/:railId. No merchant can create a payment. There is no hosted checkout and no payment link in the repo at all._ | F |  | `pay.gateway` |
| ⛔ | PSP mode — own the merchant, digital KYB, custom pricing | F | `pay.gateway` | `pay.psp` |
| ⛔ | PayFac mode — sub-merchant trees, 14 permission areas | F | `pay.psp` | `pay.payfac` |
| ⛔ | RailAdapter interface + crypto-native + card-sandbox <br/>_Downgraded 2026-07-28: the interface and the conformance kit are real and well tested, but neither v1 rail can move real value — crypto-native runs on `MemoryChain`, an in-memory reference chain (index.ts:46, an explicit §13 socket), and the other is named card-SANDBOX. The only path that reaches a rail (the webhook route) can only be reached about a payment that pay.gateway cannot create._ | F | `pay.gateway` | `pay.rails` |
| ⛔ | Smart routing — geo, method, risk, approval rate | F | `pay.rails` | `pay.routing` |
| ⛔ | Dual settlement — bank or crypto | F | `pay.rails` | `pay.settlement` |
| ⛔ | Risk scoring, chargebacks, decline recovery | F | `pay.gateway` | `pay.fraud` |
| ⛔ | Recurring — card and crypto | F | `pay.gateway` | `pay.subscriptions` |
| ⛔ | Woo / Magento / OpenCart plugins | F | `pay.gateway` | `pay.plugins` |
| ⛔ | Public REST + webhooks + sandbox (§9) | B | `pay.gateway`, `identity.apikeys` | `pay.public-api` |
| 🟢 | Offers, maker/taker, 100+ fiat currencies <br/>_Downgraded 2026-07-28: svc-p2p/src/index.ts never even IMPORTS ./router.js. All 15 procedures are dead code at runtime; the served surface is /health, /ready and two unauthenticated /internal routes. 176 tests exercise the service class directly. There is no user-facing path to P2P or OTC of any kind._ | F |  | `p2p.offers` |
| ⛔ | Ledger escrow — lock, release, refund <br/>_Downgraded 2026-07-28: the escrow logic and the sweeps are real and do run, but nothing can enter escrow — the router that would create a trade is not mounted (see p2p.offers)._ | F | `p2p.offers` | `p2p.escrow` |
| ⛔ | Moderated dispute resolution <br/>_Downgraded 2026-07-28: `disputes.open` and `disputes.resolve` live on the unmounted router. No moderator can reach a dispute, and no user can raise one._ | F | `p2p.escrow` | `p2p.disputes` |
| ⛔ | Reputation feeding the same XP graph <br/>_Downgraded 2026-07-28: computed from trades that cannot happen. The only served read is GET /internal/reputation/:userId, which the 2026-07-27 audit flags as unauthenticated (F7) — that is a leak, not a feature._ | F | `p2p.offers` | `p2p.reputation` |
| ⛔ | P2P merchant programme — badges, limits, API | F | `p2p.reputation` | `p2p.merchants` |

### Phase 3P — Protocol P0 (0/7)

| | Feature | Plane | Blocked by | id |
|---|---|---|---|---|
| 🟢 | Passkey smart accounts, session keys (§17.4) <br/>_Downgraded 2026-07-28: svc-protocol/src/index.ts:68 exports appRouter for its TYPE and never registers fastifyTRPCPlugin — all nine procedures, relayUserOperation included, are unreachable. Separately, four open §13 sockets mean the Solidity is never compiled or executed (socket.contract-toolchain) and passkey ownership has no verifier (socket.p256-verifier). "Passkey smart accounts" is not something a user can do today._ | P |  | `protocol.smart-accounts` |
| ⛔ | AMM pools from audited templates | P | `protocol.smart-accounts` | `protocol.amm` |
| ⛔ | On-chain lending markets, keeper liquidations | P | `protocol.amm` | `protocol.lending` |
| ⛔ | Non-custodial P2P escrow contracts | P | `protocol.smart-accounts` | `protocol.escrow` |
| ⛔ | Sovereign router — book vs pool best execution | P | `protocol.amm` | `protocol.router` |
| ⛔ | Lane A merchant contracts — zero KYB (§24) | P | `protocol.smart-accounts` | `protocol.merchant` |
| ⛔ | Chain → Postgres read models | P | `protocol.smart-accounts` | `indexer.readmodels` |
| 🔌 | Foundry + contract test suite in CI <br/>_Solidity is written and cross-checked from TypeScript, but never executed. Blocks any mainnet deploy._ | P |  | `socket.contract-toolchain` |
| 🔌 | External audit of the account + factory suite | P |  | `socket.contract-audit` |
| 🔌 | getUserOperationHash checked against a live EntryPoint | P |  | `socket.userop-differential-test` |
| 🔌 | Passkey (P-256) owner verifier contract <br/>_SmartAccount already routes contract owners through ERC-1271; the verifier itself is not built._ | P |  | `socket.p256-verifier` |

### Phase 4 — Blueprint (0/5)

| | Feature | Plane | Blocked by | id |
|---|---|---|---|---|
| 🟢 | Blueprint session → profile JSON <br/>_Downgraded 2026-07-28: svc-blueprint/src/index.ts never imports ./router.js — onboard, me, mentors, export and erase are all unreachable. §7.2 export/erase being unreachable is the sharper half: the ownership promise has no door._ | F |  | `blueprint.onboarding` |
| ⛔ | Share card render (1080×1350, 1200×630) | F | `blueprint.onboarding` | `blueprint.card` |
| ⛔ | Crew matching + mentor shortlist | F | `blueprint.onboarding` | `blueprint.crews` |
| ⛔ | Export + hard delete, cascading | F | `blueprint.onboarding` | `blueprint.ownership` |
| ⛔ | On-chain rank attestations, zero PII (§19) | B | `blueprint.onboarding`, `protocol.smart-accounts` | `blueprint.attestations` |

### Phase 4P — INTACHAIN (0/3)

| | Feature | Plane | Blocked by | id |
|---|---|---|---|---|
| ⛔ | INTACHAIN — CometBFT + native CLOB module | P | `protocol.amm` | `chain.mainnet` |
| ⛔ | INTAEVM sharing validator set + state | P | `chain.mainnet` | `chain.evm` |
| ⛔ | Canonical IFC bridge + attestations | B | `chain.mainnet`, `token.emissions` | `bridge.canonical` |

### Phase 5 — Surfaces (1/32)

| | Feature | Plane | Blocked by | id |
|---|---|---|---|---|
| 🟢 | Multi-currency account UX over the ledger <br/>_Downgraded 2026-07-28: svc-bank/src/index.ts:36 builds appRouter and never registers fastifyTRPCPlugin, so all 17 procedures are unreachable. What IS served is two unauthenticated /internal/jobs/* POSTs that run other people's standing orders and interest accrual (2026-07-27 audit, F4). The only reachable half of svc-bank is the half that should not be reachable._ | F |  | `bank.accounts` |
| ⛔ | Collateralised loans, LTV, margin calls, liquidation | F | `bank.accounts` | `bank.loans` |
| ⛔ | Flexible + fixed yield pools | F | `bank.accounts`, `token.staking` | `bank.earn` |
| ⛔ | CardIssuerAdapter + card-sim, <2s auth decision | F | `bank.accounts` | `bank.cards` |
| ⛔ | Self-custody funded card, JIT conversion (§18) | P | `bank.cards`, `protocol.smart-accounts` | `bank.sovereign-card` |
| ⛔ | Fiat on/off ramp reusing svc-pay adapters | F | `pay.rails` | `bank.ramps` |
| ✅ | Model-agnostic gateway, per-user metering <br/>_Mounted and scoped; 5 test files. Note corrected 2026-07-28 — it is one of FOUR services that mount /trpc (agents, identity, trade, token), not the only one. Subject to the edge gap: every scoped procedure here is unreachable until something issues a signed principal header._ | F |  | `agents.gateway` |
| 🟢 | Navigator — tool-calling inside user guardrails | F |  | `agents.navigator` |
| 🟢 | Support agent — KB + account-state grounded | F |  | `agents.support` |
| 🟢 | Market Scanner — ranked signals by tier | F |  | `agents.scanner` |
| ⛔ | Merchant agent — approval-rate watch | F | `pay.routing` | `agents.merchant` |
| ⛔ | Copy-Intel — writes audited leader stats | F | `trade.copy` | `agents.copy-intel` |
| 🟢 | Live lobbies, LiveKit SFU, capacity tiers | F |  | `academy.lobbies` |
| ⛔ | 2D navigable room canvas, VR-ready scene state | F | `academy.lobbies` | `academy.spatial` |
| ⛔ | DERIV//DESK library import — 20 playbooks + 3 workbooks | F | `academy.lobbies` | `academy.curriculum` |
| ⛔ | Certifications → XP → real perks | F | `academy.curriculum` | `academy.certs` |
| ⛔ | Residencies, IFC pay, revenue share | F | `academy.lobbies`, `token.staking` | `academy.ambassadors` |
| ⛔ | Seasonal ladders, IFC prize pools | F | `academy.lobbies` | `academy.tournaments` |
| 🟢 | Paper-trading market flag for workbooks | F |  | `academy.paper-trading` |
| ⛔ | ERC-20 deploy from audited templates | B | `protocol.smart-accounts` | `launch.token-factory` |
| ⛔ | One-click meme launch + instant market + LP | P | `launch.token-factory`, `protocol.amm` | `launch.meme-factory` |
| ⛔ | Presale / fair launch, vesting, staked allocation tiers | F | `launch.token-factory`, `token.staking` | `launch.launchpad` |
| ⛔ | NFT mint / list / auction, on-chain royalties | P | `launch.token-factory` | `launch.nft` |
| 🔌 | RWA issuance registry, licence-gated | F |  | `launch.rwa` |
| ⛔ | Vendor lifecycle — apply, vet, list, stake-gated slots | F | `token.staking` | `market.vendors` |
| ⛔ | Listings, subscriptions, purchases, house commission | F | `market.vendors` | `market.commerce` |
| ⛔ | Stratum share protocol, PPLNS payouts | F | `token.emissions` | `mining.pool` |
| 🟢 | Support desk, tickets, KB | F |  | `ops.support` |
| 🟢 | Multi-tier affiliate / IB trees, payout automation | F |  | `ops.affiliates` |
| ⛔ | Screening queues, geo-block, VPN/Tor detection | F | `identity.kyc` | `ops.compliance` |
| 🟢 | Warehouse — read replica + cube layer | F |  | `ops.analytics` |
| 🟢 | apps/admin — listings, fee params, treasury, kill-switches <br/>_Downgraded 2026-07-28: apps/admin has ZERO test files and makes no network call of any kind. Every kill-switch, freeze and reconcile is React `useState` in the browser — flipping one changes a local boolean and nothing else. An operator console that appears to halt the ledger and does not is worse than no console._ | F |  | `ops.admin` |
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

