# Project tracker

> **Generated — do not edit by hand.** Source of truth is `tooling/tracker/features.mjs`.
> Run `pnpm tracker` after changing it. CI fails if this file is stale.

**29 of 106 shipped (27%)** · 0 in progress · 39 ready to claim · 38 blocked · 15 deliberate §13 sockets

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
| WebSocket fan-out: depth, trades, orders, positions | `trade` | 2 | `ws.gateway` |
| Branded gateway, hosted checkout, payment links | `pay` | 3 | `pay.gateway` |
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
| CardIssuerAdapter + card-sim, <2s auth decision | `bank` | 5 | `bank.cards` |
| Navigator — tool-calling inside user guardrails | `agents` | 5 | `agents.navigator` |
| Support agent — KB + account-state grounded | `agents` | 5 | `agents.support` |
| Market Scanner — ranked signals by tier | `agents` | 5 | `agents.scanner` |
| Live lobbies, LiveKit SFU, capacity tiers | `academy` | 5 | `academy.lobbies` |
| Paper-trading market flag for workbooks | `academy` | 5 | `academy.paper-trading` |
| ERC-20 deploy from audited templates | `launch` | 5 | `launch.token-factory` |
| Support desk, tickets, KB | `core-ops` | 5 | `ops.support` |
| Multi-tier affiliate / IB trees, payout automation | `core-ops` | 5 | `ops.affiliates` |
| Screening queues, geo-block, VPN/Tor detection | `core-ops` | 5 | `ops.compliance` |
| Warehouse — read replica + cube layer | `core-ops` | 5 | `ops.analytics` |
| apps/admin — listings, fee params, treasury, kill-switches | `core-ops` | 5 | `ops.admin` |
| Event-driven fan-out: in-app, push, email, SMS | `core-ops` | 5 | `ops.notifications` |

## Highest leverage

What each unshipped feature would unblock, transitively. **This is what should drive build order** — a feature that frees 26 others is worth more than one that frees none, whatever else is louder.

| Unblocks | Feature | Status | id |
|---:|---|---|---|
| **14** | Branded gateway, hosted checkout, payment links | 🟢 ready | `pay.gateway` |
| **9** | AMM pools from audited templates | 🟢 ready | `protocol.amm` |
| **8** | Stake tiers, locks, access gating | 🟢 ready | `token.staking` |
| **7** | RailAdapter interface + crypto-native + card-sandbox | ⛔ blocked | `pay.rails` |
| **6** | Live lobbies, LiveKit SFU, capacity tiers | 🟢 ready | `academy.lobbies` |
| **5** | INTACHAIN — CometBFT + native CLOB module | ⛔ blocked | `chain.mainnet` |
| **4** | ERC-20 deploy from audited templates | 🟢 ready | `launch.token-factory` |
| **2** | Emission curve, halving, single-minter guarantee | 🟢 ready | `token.emissions` |

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

### Phase 1 — THE CORE (7/14)

| | Feature | Plane | Blocked by | id |
|---|---|---|---|---|
| ✅ | Double-entry ledger, hash chain, reconciliation | F |  | `ledger.double-entry` |
| ✅ | Money recipes — every value path in the OS | F |  | `ledger.recipes` |
| ✅ | Accounts, sessions, argon2id, TOTP | F |  | `identity.accounts` |
| ✅ | XP graph, rank ladder, machine-readable perks | F |  | `identity.rank` |
| 🟢 | Scoped API keys, sub-accounts <br/>_Downgraded 2026-07-28: create/list/revoke are reachable on the mounted router, but `verifyApiKey` (auth-service.ts:328) is called by nothing outside identity.test.ts. A key can be issued and never opens anything — no service accepts one._ | F |  | `identity.apikeys` |
| ✅ | KYC tiers wired to JURISDICTION_MATRIX <br/>_Restored to done 2026-07-28: the write side the audit called out now exists. `kyc.submit` / `kyc.approve` / `kyc.reject` / `kyc.pending` / `kyc.status` are served from svc-identity's mounted /trpc, so identity.kyc_records is writable and a real user can leave tier `none`. See identity.kyc-review._ | F |  | `identity.kyc` |
| ✅ | Routed KYC — submit, operator approve/reject, review queue <br/>_Reachable on svc-identity's mounted /trpc; tested in router.test.ts + identity.test.ts; nothing propped up — approval is an operator action against kyc_records, no provider stub. Custodial side only: §22 permissionless surfaces read no tier (docs/decisions/kyc-posture.md)._ | F |  | `identity.kyc-review` |
| ✅ | Step-up challenge minting trade:withdraw for five minutes <br/>_defaultScopes() withheld trade:withdraw "until a step-up challenge" that did not exist, so no session could reach any withdrawal. Reachable on the mounted router. Known limit, platform-wide and not introduced here: a TOTP code is replayable inside its validity window._ | F |  | `identity.step-up` |
| 🟢 | WebAuthn registration + assertion (§9) | F |  | `identity.webauthn` |
| 🟢 | Emission curve, halving, single-minter guarantee <br/>_Downgraded 2026-07-28: `mintEpoch` is called by token-service.test.ts and nothing else. svc-token/src/router.ts exposes exactly three procedures (health, stakeOf, accessOf) and index.ts starts no scheduler. No epoch can ever be minted on a running system._ | F |  | `token.emissions` |
| 🟢 | Stake tiers, locks, access gating <br/>_Downgraded 2026-07-28: the READS ship (stakeOf/accessOf on /trpc, /internal/stake/:userId for svc-trade), but `stake` and `unstake` are called only by tests. Nobody can stake, so every access tier this gates resolves to the unstaked one._ | F |  | `token.staking` |
| 🟢 | Real-yield distribution from platform fees <br/>_Downgraded 2026-07-28: `distributeRevenue` is called only by token-service.test.ts. No route, no consumer, no schedule — fees accrue nowhere and no yield is ever distributed._ | F |  | `token.yield` |
| 🟢 | Buyback & burn split <br/>_Downgraded 2026-07-28: `recordBuyback` and `burnedSupply` are called only by token-service.test.ts. Same shape as token.yield — the maths is tested, the trigger does not exist._ | F |  | `token.buyback` |
| ⛔ | Proposals + IFC-weighted voting (§4.3) | F | `token.staking` | `token.governance` |

### Phase 2 — Trade (4/16)

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
| ⛔ | Pro terminal — depth, charts, hotkeys, sub-accounts <br/>_Order entry, market list, open orders and fills are wired to svc-trade through svc-edge, and the DEX/CEX plane switch is live against svc-protocol. The four words in this title are not: DEPTH has no browser-reachable feed (svc-matching is deliberately off the edge route table and ws.gateway is not built), CHARTS have no price-series source behind the edge, and HOTKEYS and SUB-ACCOUNTS are not started. All four render as §13 sockets with the reason on screen. `ws.gateway` added to dependsOn — depth is the load-bearing half of this feature and it is blocked, not merely unfinished._ | F | `ws.gateway` | `web.terminal` |
| ✅ | apps/web scaffold on the design system <br/>_Re-upgraded: apps/web now has a typed tRPC client against svc-edge (auth header, zod-validated responses, `Result` instead of throws), a tested depth state machine that resnapshots on a gap, and 45 tests. Every hardcoded price literal is gone — what cannot be fetched renders as a socket with a reason. The masthead status is a real `trade.health` probe rather than the constant "Systems nominal". Known limit, stated in the UI: the session is in-memory only, so a reload signs the user out; httpOnly refresh-cookie persistence is not built._ | F |  | `web.shell` |
| 🟢 | WebSocket fan-out: depth, trades, orders, positions | F |  | `ws.gateway` |

### Phase 3 — Pay + P2P (4/16)

| | Feature | Plane | Blocked by | id |
|---|---|---|---|---|
| 🟢 | Branded gateway, hosted checkout, payment links <br/>_Downgraded 2026-07-28: all 13 procedures are unreachable. svc-pay/src/index.ts:67 builds the router "so the type is exported" and never registers fastifyTRPCPlugin — the only served routes are /health, /ready and POST /webhooks/:railId. No merchant can create a payment. There is no hosted checkout and no payment link in the repo at all._ | F |  | `pay.gateway` |
| ⛔ | PSP mode — own the merchant, digital KYB, custom pricing | F | `pay.gateway` | `pay.psp` |
| ⛔ | PayFac mode — sub-merchant trees, 14 permission areas | F | `pay.psp` | `pay.payfac` |
| ⛔ | RailAdapter interface + crypto-native + card-sandbox <br/>_Downgraded 2026-07-28: the interface and the conformance kit are real and well tested, but neither v1 rail can move real value — crypto-native runs on `MemoryChain`, an in-memory reference chain (index.ts:46, an explicit §13 socket), and the other is named card-SANDBOX. The only path that reaches a rail (the webhook route) can only be reached about a payment that pay.gateway cannot create._ | F | `pay.gateway` | `pay.rails` |
| ⛔ | User deposit + withdrawal — the two paths off the merchant path <br/>_Code-complete and tested, NOT reachable. recipes.deposit had no production caller and there was no user withdrawal anywhere, so register → deposit → order → fill → withdraw could not complete; deposit.credit (admin:treasury) and withdrawal.create (trade:withdraw, INTERACTIVE_ONLY + 2FA) now exist and are covered by 28 money-path tests against real Postgres. The one thing between them and a caller is that svc-pay still does not register fastifyTRPCPlugin — svc-edge already routes /api/pay to it, so the edge forwards to a service with no /trpc. `ready`, not `done`, until svc-pay mounts per docs/decisions/mount-boundary.md._ | F | `pay.rails` | `pay.user-money` |
| ⛔ | Smart routing — geo, method, risk, approval rate | F | `pay.rails` | `pay.routing` |
| ⛔ | Dual settlement — bank or crypto | F | `pay.rails` | `pay.settlement` |
| ⛔ | Risk scoring, chargebacks, decline recovery | F | `pay.gateway` | `pay.fraud` |
| ⛔ | Recurring — card and crypto | F | `pay.gateway` | `pay.subscriptions` |
| ⛔ | Woo / Magento / OpenCart plugins | F | `pay.gateway` | `pay.plugins` |
| ⛔ | Public REST + webhooks + sandbox (§9) | B | `pay.gateway`, `identity.apikeys` | `pay.public-api` |
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
| 🟢 | Chain → Postgres read models <br/>_Everything downstream of the chain is on main and mounted: schema-per-service read models (books, fills, positions), block-versioned rows with reorg unwind, idempotent projection, and a permissionless /trpc read API. 81 tests, 27 against real Postgres, reorg handling mutation-tested. NOT `done` because the "chain →" half is propped: `NullChainSource` is what boots, since there is no EVM RPC in this stack and no deployed CLOB to read — socket.evm-rpc. Also not yet routed at svc-edge._ | P |  | `indexer.readmodels` |
| 🔌 | Foundry + contract test suite in CI <br/>_Solidity is written and cross-checked from TypeScript, but never executed. Blocks any mainnet deploy._ | P |  | `socket.contract-toolchain` |
| 🔌 | External audit of the account + factory suite | P |  | `socket.contract-audit` |
| 🔌 | getUserOperationHash checked against a live EntryPoint | P |  | `socket.userop-differential-test` |
| 🔌 | Passkey (P-256) owner verifier contract <br/>_SmartAccount already routes contract owners through ERC-1271; the verifier itself is not built._ | P |  | `socket.p256-verifier` |
| 🔌 | A real EVM ChainSource — RPC + deployed CLOB contracts <br/>_The ChainSource port (services/svc-indexer/src/chain/source.ts) is the shape the adapter must satisfy; MemoryChainSource is the deterministic reference its conformance is judged against. Blocked on there being contracts to read, not on the indexer._ | P |  | `socket.evm-rpc` |
| 🔌 | Live book/tape feed from the projection (§5.2 ws-gateway) <br/>_The read path is pull-only today. packages/market-data already computes the deltas; what is missing is a subject in packages/events and the transport._ | P |  | `socket.indexer-stream` |

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
| ⛔ | Canonical IFC bridge + attestations | B | `chain.mainnet`, `token.emissions` | `bridge.canonical` |

### Phase 5 — Surfaces (2/32)

| | Feature | Plane | Blocked by | id |
|---|---|---|---|---|
| ✅ | Multi-currency account UX over the ledger <br/>_svc-bank on main; self-mounts /trpc with an edge-verified principal; UX product may expand_ | F |  | `bank.accounts` |
| 🟢 | Collateralised loans, LTV, margin calls, liquidation | F |  | `bank.loans` |
| ⛔ | Flexible + fixed yield pools | F | `token.staking` | `bank.earn` |
| 🟢 | CardIssuerAdapter + card-sim, <2s auth decision | F |  | `bank.cards` |
| ⛔ | Self-custody funded card, JIT conversion (§18) | P | `bank.cards` | `bank.sovereign-card` |
| ⛔ | Fiat on/off ramp reusing svc-pay adapters | F | `pay.rails` | `bank.ramps` |
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
| ⛔ | Residencies, IFC pay, revenue share | F | `academy.lobbies`, `token.staking` | `academy.ambassadors` |
| ⛔ | Seasonal ladders, IFC prize pools | F | `academy.lobbies` | `academy.tournaments` |
| 🟢 | Paper-trading market flag for workbooks | F |  | `academy.paper-trading` |
| 🟢 | ERC-20 deploy from audited templates | B |  | `launch.token-factory` |
| ⛔ | One-click meme launch + instant market + LP | P | `launch.token-factory`, `protocol.amm` | `launch.meme-factory` |
| ⛔ | Presale / fair launch, vesting, staked allocation tiers | F | `launch.token-factory`, `token.staking` | `launch.launchpad` |
| ⛔ | NFT mint / list / auction, on-chain royalties | P | `launch.token-factory` | `launch.nft` |
| 🔌 | RWA issuance registry, licence-gated | F |  | `launch.rwa` |
| ⛔ | Vendor lifecycle — apply, vet, list, stake-gated slots | F | `token.staking` | `market.vendors` |
| ⛔ | Listings, subscriptions, purchases, house commission | F | `market.vendors` | `market.commerce` |
| ⛔ | Stratum share protocol, PPLNS payouts | F | `token.emissions` | `mining.pool` |
| 🟢 | Support desk, tickets, KB | F |  | `ops.support` |
| 🟢 | Multi-tier affiliate / IB trees, payout automation | F |  | `ops.affiliates` |
| 🟢 | Screening queues, geo-block, VPN/Tor detection | F |  | `ops.compliance` |
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

