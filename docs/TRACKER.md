# Project tracker

> **Generated — do not edit by hand.** Source of truth is `tooling/tracker/features.mjs`.
> Run `pnpm tracker` after changing it. CI fails if this file is stale.

**37 of 107 shipped (35%)** · 2 in progress · 30 ready to claim · 38 blocked · 18 deliberate §13 sockets

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
| Perps: cross/isolated margin, funding, liquidation ladder | `trade` | 2 | `trade.futures` |
| OTC RFQ desk, staked-tier gate | `trade` | 2 | `trade.otc` |
| Copy trading, audited leaders, profit share | `trade` | 2 | `trade.copy` |
| TWAP / VWAP / POV execution | `trade` | 2 | `trade.algo` |
| CCXT-compatible public API (bots + terminals connect) | `trade` | 2 | `trade.ccxt-api` |
| Internal market-maker seeding books at launch | `trade` | 2 | `trade.mm-bot` |
| External venue adapters via CCXT (cross-venue) | `trade` | 2 | `venue.aggregation` |
| Pro terminal — depth, charts, hotkeys, sub-accounts | `trade` | 2 | `web.terminal` |
| P2P merchant programme — badges, limits, API | `p2p` | 3 | `p2p.merchants` |
| Passkey smart accounts, session keys (§17.4) | `protocol` | 3P | `protocol.smart-accounts` |
| Share card render (1080×1350, 1200×630) | `blueprint` | 4 | `blueprint.card` |
| Crew matching + mentor shortlist | `blueprint` | 4 | `blueprint.crews` |
| Export + hard delete, cascading | `blueprint` | 4 | `blueprint.ownership` |
| Collateralised loans, LTV, margin calls, liquidation | `bank` | 5 | `bank.loans` |
| Flexible + fixed yield pools | `bank` | 5 | `bank.earn` |
| CardIssuerAdapter + card-sim, <2s auth decision | `bank` | 5 | `bank.cards` |
| Navigator — tool-calling inside user guardrails | `agents` | 5 | `agents.navigator` |
| Support agent — KB + account-state grounded | `agents` | 5 | `agents.support` |
| Market Scanner — ranked signals by tier | `agents` | 5 | `agents.scanner` |
| Live lobbies, LiveKit SFU, capacity tiers | `academy` | 5 | `academy.lobbies` |
| Paper-trading market flag for workbooks | `academy` | 5 | `academy.paper-trading` |
| Vendor lifecycle — apply, vet, list, stake-gated slots | `market` | 5 | `market.vendors` |
| Stratum share protocol, PPLNS payouts | `mining-pool` | 5 | `mining.pool` |
| Support desk, tickets, KB | `core-ops` | 5 | `ops.support` |
| Multi-tier affiliate / IB trees, payout automation | `core-ops` | 5 | `ops.affiliates` |
| Screening queues, geo-block, VPN/Tor detection | `core-ops` | 5 | `ops.compliance` |
| Warehouse — read replica + cube layer | `core-ops` | 5 | `ops.analytics` |
| apps/admin — listings, fee params, treasury, kill-switches | `core-ops` | 5 | `ops.admin` |
| Event-driven fan-out: in-app, push, email, SMS | `notify` | 5 | `ops.notifications` |

## Highest leverage

What each unshipped feature would unblock, transitively. **This is what should drive build order** — a feature that frees 26 others is worth more than one that frees none, whatever else is louder.

| Unblocks | Feature | Status | id |
|---:|---|---|---|
| **27** | Passkey smart accounts, session keys (§17.4) | 🟢 ready | `protocol.smart-accounts` |
| **14** | Branded gateway, hosted checkout, payment links | 🔨 wip | `pay.gateway` |
| **9** | AMM pools from audited templates | ⛔ blocked | `protocol.amm` |
| **7** | RailAdapter interface + crypto-native + card-sandbox | ⛔ blocked | `pay.rails` |
| **6** | Live lobbies, LiveKit SFU, capacity tiers | 🟢 ready | `academy.lobbies` |
| **5** | INTACHAIN — CometBFT + native CLOB module | ⛔ blocked | `chain.mainnet` |
| **4** | ERC-20 deploy from audited templates | ⛔ blocked | `launch.token-factory` |
| **3** | Event-driven fan-out: in-app, push, email, SMS | 🟢 ready | `ops.notifications` |

## 🔨 In progress

| Feature | Owner | Module |
|---|---|---|
| WebSocket fan-out: depth, trades, orders, positions | **Nitro** | `trade` |
| Branded gateway, hosted checkout, payment links | **Nitro** | `pay` |

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

### Phase 1 — THE CORE ✅

| | Feature | Plane | Blocked by | id |
|---|---|---|---|---|
| ✅ | Double-entry ledger, hash chain, reconciliation | F |  | `ledger.double-entry` |
| ✅ | Money recipes — every value path in the OS | F |  | `ledger.recipes` |
| ✅ | Accounts, sessions, argon2id, TOTP | F |  | `identity.accounts` |
| ✅ | XP graph, rank ladder, machine-readable perks | F |  | `identity.rank` |
| ✅ | Scoped API keys, sub-accounts <br/>_API keys: create/list/revoke on /trpc + public apiKeys.exchange → short-lived access JWT the edge already verifies. Key scopes only; no refresh; interactive-only scopes stay off keys. Sub-accounts: create/list/revoke soft-disable (revoked flag; no hard DELETE — ledger owner id must survive)._ | F |  | `identity.apikeys` |
| ✅ | KYC tiers wired to JURISDICTION_MATRIX <br/>_Restored to done 2026-07-28: the write side the audit called out now exists. `kyc.submit` / `kyc.approve` / `kyc.reject` / `kyc.pending` / `kyc.status` are served from svc-identity's mounted /trpc, so identity.kyc_records is writable and a real user can leave tier `none`. See identity.kyc-review._ | F |  | `identity.kyc` |
| ✅ | Routed KYC — submit, operator approve/reject, review queue <br/>_Reachable on svc-identity's mounted /trpc; tested in router.test.ts + identity.test.ts; nothing propped up — approval is an operator action against kyc_records, no provider stub. Custodial side only: §22 permissionless surfaces read no tier (docs/decisions/kyc-posture.md)._ | F |  | `identity.kyc-review` |
| ✅ | Step-up challenge minting trade:withdraw for five minutes <br/>_defaultScopes() withheld trade:withdraw "until a step-up challenge" that did not exist, so no session could reach any withdrawal. Reachable on the mounted router. Known limit, platform-wide and not introduced here: a TOTP code is replayable inside its validity window._ | F |  | `identity.step-up` |
| ✅ | WebAuthn registration + assertion (§9) <br/>_PR #93: register/assert on mounted /trpc; soft-authenticator tests; session after assertion._ | F |  | `identity.webauthn` |
| ✅ | Emission curve, halving, single-minter guarantee <br/>_PR #94: mintEpoch live path + EMISSIONS_ENABLED kill-switch._ | F |  | `token.emissions` |
| ✅ | Stake tiers, locks, access gating <br/>_PR #94: stake/unstake/listStakes on /trpc; principal-bound._ | F |  | `token.staking` |
| ✅ | Real-yield distribution from platform fees <br/>_Live path: tRPC distributeRevenue (admin:treasury + MFA). Operator supplies fee window + sources until Phase 2 auto-consumes trade fills. Service maths + ledger recipes unchanged; mount tests cover scope/MFA._ | F |  | `token.yield` |
| ✅ | Buyback & burn split <br/>_Live path: tRPC recordBuyback + burnedSupply. tokensBought supplied by operator (pricing is svc-trade — §13 auto market-buy later). admin:treasury + MFA on the mutation._ | F |  | `token.buyback` |
| ✅ | Proposals + IFC-weighted voting (§4.3) <br/>_PR #97: createProposal / castVote / listProposals / getProposal on mounted /trpc (weight = stakeOf snapshot)._ | F |  | `token.governance` |

### Phase 2 — Trade (6/17)

| | Feature | Plane | Blocked by | id |
|---|---|---|---|---|
| ✅ | Orderbook + matching engine, journal, replay | F |  | `matching.engine` |
| ✅ | Determinism test — replay yields identical book | F |  | `matching.determinism` |
| ✅ | Spot markets, order lifecycle, fees | F |  | `trade.spot` |
| ✅ | One-tap Convert — the retail on-ramp <br/>_Shipped on main: convert.quote + convert.execute on mounted /trpc (RFQ + house spread → market IOC, same hold→fill; TRADE_CONVERT_ENABLED defaults on). Money-path suite in trade-service convert describe + convert/quote unit tests. Local svc-trade suite green (102 passed; money-path needs Postgres — skipped when DB down). CI org billing may block Actions re-prove; edge product-check optional remaining._ | F |  | `trade.convert` |
| 🟢 | Perps: cross/isolated margin, funding, liquidation ladder | F |  | `trade.futures` |
| ⛔ | European options, cash-settled, full collateral in v1 | F | `trade.futures` | `trade.options` |
| 🟢 | OTC RFQ desk, staked-tier gate | F |  | `trade.otc` |
| 🟢 | Copy trading, audited leaders, profit share | B |  | `trade.copy` |
| ⛔ | Fiat pairs on the same engine | F | `pay.rails` | `trade.forex` |
| 🟢 | TWAP / VWAP / POV execution | F |  | `trade.algo` |
| 🟢 | CCXT-compatible public API (bots + terminals connect) <br/>_partial — public REST: markets, orderbook, ticker, tickers, trades (tape; ?since= ms), ohlcv (route exists, always [] until candle aggregation job — no inventing candles; ohlcv empty); private REST (edge-signed principal, fail-closed): GET orders/open|closed (?since= ms on closed), GET orders/:id, POST orders (placeOrder money path, trade:write + jurisdiction), DELETE orders/:id (cancelOrder), DELETE orders[?symbol=] (cancelAllOrders, sequential money path), GET account/trades (myFills; ?symbol= filter + ?since= ms), GET account/fees (published maker/taker bps per symbol; {} when none), GET account/balance (ledger projection, real self-only balances — not stub), GET positions (positions empty [] until trade.futures; setLeverage/setMarginMode not mounted). Still open: OHLCV empty (no candle job), futures leverage/margin when trade.futures exists. Private WS is under `ws.gateway` (/private/stream), not this REST surface._ | F |  | `trade.ccxt-api` |
| 🟢 | Internal market-maker seeding books at launch | F |  | `trade.mm-bot` |
| 🟢 | External venue adapters via CCXT (cross-venue) <br/>_Downgraded 2026-07-28: `@intafaced/venue-adapter` is imported by zero files outside its own package. There is no adapter for any real venue — `LiquiditySource` is an interface with no implementation, so nothing is aggregated._ | F |  | `venue.aggregation` |
| 🟢 | Pro terminal — depth, charts, hotkeys, sub-accounts <br/>_Order entry, market list, open orders and fills are wired to svc-trade through svc-edge, and the DEX/CEX plane switch is live against svc-protocol. DEPTH is live: terminal streams snapshot+deltas from services/svc-ws and withholds the book on a gap. Public TRADE tape is now wired in the terminal (`LiveTradeTape` → svc-ws `channel=trades`, decimal-string prints only, no candles). Still missing from the four words in the title: CHARTS (no candle store / OHLCV always []; tape is live, chart socket remains honest), HOTKEYS and SUB-ACCOUNTS (not started). Those render as §13 sockets with the reason on screen. `dependsOn` is `ws.depth` not `ws.gateway` so the book is not blocked on positions._ | F |  | `web.terminal` |
| ✅ | apps/web scaffold on the design system <br/>_Re-upgraded: apps/web now has a typed tRPC client against svc-edge (auth header, zod-validated responses, `Result` instead of throws), a tested depth state machine that resnapshots on a gap, and 45 tests. Every hardcoded price literal is gone — what cannot be fetched renders as a socket with a reason. The masthead status is a real `trade.health` probe rather than the constant "Systems nominal". Known limit, stated in the UI: the session is in-memory only, so a reload signs the user out; httpOnly refresh-cookie persistence is not built._ | F |  | `web.shell` |
| ✅ | Live order book — snapshot + sequenced deltas to the browser <br/>_services/svc-ws polls svc-matching’s public depth endpoint, diffs it with `@intafaced/market-data`’s `diffDepth`, and fans snapshot+delta out over a websocket; apps/web applies them with `applyDelta` and resnapshots on a gap. Reachable (mounted routes + a real socket, wired into the terminal), tested (47 service tests, incl. a 200-tick stream rebuilt client-side through `applyDelta`, both backpressure stages, and an end-to-end socket suite), and unpropped (no stub upstream — it reads the real engine). Split out of `ws.gateway`: that entry names four streams and this is one of them._ | F |  | `ws.depth` |
| 🔨 | WebSocket fan-out: depth, trades, orders, positions <br/>_Depth done + public TRADE tape + private orders/fills on /private/stream (orderUpdated+fillSettled, JWT). Futures positions still missing — title names four streams; three of four is not done._ | F |  | `ws.gateway` |

### Phase 3 — Pay + P2P (4/16)

| | Feature | Plane | Blocked by | id |
|---|---|---|---|---|
| 🔨 | Branded gateway, hosted checkout, payment links <br/>_Updated 2026-07-30: payment links + minimal hosted page. createLink / resolveLink / listLinks / deactivateLink on tRPC; GET /checkout?token= and /pay/link/:token return HTML (label, amount, currency; honest expired/not-found; no card capture — CTA completes in merchant app). Edge: /api/pay/checkout?token=. Rails still sandbox (MemoryChain + card-sandbox)._ | F |  | `pay.gateway` |
| ⛔ | PSP mode — own the merchant, digital KYB, custom pricing | F | `pay.gateway` | `pay.psp` |
| ⛔ | PayFac mode — sub-merchant trees, 14 permission areas | F | `pay.psp` | `pay.payfac` |
| ⛔ | RailAdapter interface + crypto-native + card-sandbox <br/>_Interface + conformance kit are real and tested; neither v1 rail moves real value — crypto-native runs on `MemoryChain` (index.ts, §13 socket), the other is card-SANDBOX. Merchant payments and webhooks can exercise these adapters now that /trpc is mounted; production rails are still sockets._ | F | `pay.gateway` | `pay.rails` |
| ⛔ | User deposit + withdrawal — the two paths off the merchant path <br/>_Updated 2026-07-29: deposit.credit (admin:treasury) and withdrawal.* (trade:withdraw INTERACTIVE_ONLY + 2FA / trade:read) are reachable on mounted /trpc via svc-edge /api/pay — edge-signed principal required (router.mount.test.ts). Money-path suite against real Postgres remains. Still not `done`: depends on pay.rails which is MemoryChain + card-sandbox, so real value cannot leave/enter production rails._ | F | `pay.rails` | `pay.user-money` |
| ⛔ | Smart routing — geo, method, risk, approval rate | F | `pay.rails` | `pay.routing` |
| ⛔ | Dual settlement — bank or crypto | F | `pay.rails` | `pay.settlement` |
| ⛔ | Risk scoring, chargebacks, decline recovery | F | `pay.gateway` | `pay.fraud` |
| ⛔ | Recurring — card and crypto | F | `pay.gateway` | `pay.subscriptions` |
| ⛔ | Woo / Magento / OpenCart plugins | F | `pay.gateway` | `pay.plugins` |
| ⛔ | Public REST + webhooks + sandbox (§9) | B | `pay.gateway` | `pay.public-api` |
| ✅ | Offers, maker/taker, 100+ fiat currencies <br/>_svc-p2p on main; self-mounts /trpc with an edge-verified principal_ | F |  | `p2p.offers` |
| ✅ | Ledger escrow — lock, release, refund <br/>_Escrow flows in svc-p2p; not a separate service_ | F |  | `p2p.escrow` |
| ✅ | Moderated dispute resolution <br/>_Dispute paths in svc-p2p core_ | F |  | `p2p.disputes` |
| ✅ | Reputation feeding the same XP graph <br/>_Reputation module on main_ | F |  | `p2p.reputation` |
| 🟢 | P2P merchant programme — badges, limits, API | F |  | `p2p.merchants` |

### Phase 3P — Protocol P0 (0/7)

| | Feature | Plane | Blocked by | id |
|---|---|---|---|---|
| 🟢 | Passkey smart accounts, session keys (§17.4) <br/>_Core + contracts on main; /trpc mounted; edge /api/protocol + web health/predictAddress product path. Factory/impl default 0x0 and PROTOCOL_RPC_URL is outside compose (no chain in stack). predict/buildDeployment refuse zero factory/impl. NOT done until factory+impl non-zero, RPC answers, and product path proves real chain config. Sockets: socket.evm-rpc, socket.contract-toolchain, socket.p256-verifier._ | P |  | `protocol.smart-accounts` |
| ⛔ | AMM pools from audited templates <br/>_WIP 2026-07-29: ConstantProductPool + PoolFactory Solidity, pure quote math + unsigned calldata builders on svc-protocol (amm.quoteExactIn / buildCreatePool / buildSwapExactIn / buildMintLiquidity). Not done until factory is deployed on a real chain (PROTOCOL_AMM_FACTORY_ADDRESS non-zero) and forge/runtime contract tests run — Foundry still §13 socket.contract-toolchain._ | P | `protocol.smart-accounts` | `protocol.amm` |
| ⛔ | On-chain lending markets, keeper liquidations | P | `protocol.amm` | `protocol.lending` |
| ⛔ | Non-custodial P2P escrow contracts | P | `protocol.smart-accounts` | `protocol.escrow` |
| ⛔ | Sovereign router — book vs pool best execution | P | `protocol.amm` | `protocol.router` |
| ⛔ | Lane A merchant contracts — zero KYB (§24) | P | `protocol.smart-accounts` | `protocol.merchant` |
| ⛔ | Chain → Postgres read models <br/>_Everything downstream of the chain is on main and mounted: schema-per-service read models (books, fills, positions), block-versioned rows with reorg unwind, idempotent projection, and a permissionless /trpc read API. 81 tests, 27 against real Postgres, reorg handling mutation-tested. NOT `done` because the "chain →" half is propped: `NullChainSource` is what boots, since there is no EVM RPC in this stack and no deployed CLOB to read — socket.evm-rpc. Also not yet routed at svc-edge._ | P | `protocol.smart-accounts` | `indexer.readmodels` |
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
| ⛔ | On-chain rank attestations, zero PII (§19) | B | `protocol.smart-accounts` | `blueprint.attestations` |

### Phase 4P — INTACHAIN (0/3)

| | Feature | Plane | Blocked by | id |
|---|---|---|---|---|
| ⛔ | INTACHAIN — CometBFT + native CLOB module | P | `protocol.amm` | `chain.mainnet` |
| ⛔ | INTAEVM sharing validator set + state | P | `chain.mainnet` | `chain.evm` |
| ⛔ | Canonical IFC bridge + attestations | B | `chain.mainnet` | `bridge.canonical` |

### Phase 5 — Surfaces (2/32)

| | Feature | Plane | Blocked by | id |
|---|---|---|---|---|
| ✅ | Multi-currency account UX over the ledger <br/>_svc-bank on main; self-mounts /trpc with an edge-verified principal; UX product may expand_ | F |  | `bank.accounts` |
| 🟢 | Collateralised loans, LTV, margin calls, liquidation | F |  | `bank.loans` |
| 🟢 | Flexible + fixed yield pools | F |  | `bank.earn` |
| 🟢 | CardIssuerAdapter + card-sim, <2s auth decision | F |  | `bank.cards` |
| ⛔ | Self-custody funded card, JIT conversion (§18) | P | `bank.cards`, `protocol.smart-accounts` | `bank.sovereign-card` |
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
| ⛔ | Residencies, IFC pay, revenue share | F | `academy.lobbies` | `academy.ambassadors` |
| ⛔ | Seasonal ladders, IFC prize pools | F | `academy.lobbies` | `academy.tournaments` |
| 🟢 | Paper-trading market flag for workbooks | F |  | `academy.paper-trading` |
| ⛔ | ERC-20 deploy from audited templates | B | `protocol.smart-accounts` | `launch.token-factory` |
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
| 🟢 | apps/admin — listings, fee params, treasury, kill-switches <br/>_Downgraded 2026-07-28: apps/admin has ZERO test files and makes no network call of any kind. Every kill-switch, freeze and reconcile is React `useState` in the browser — flipping one changes a local boolean and nothing else. An operator console that appears to halt the ledger and does not is worse than no console._ | F |  | `ops.admin` |
| 🟢 | Event-driven fan-out: in-app, push, email, SMS <br/>_In-app inbox shipped (svc-notify: list/unreadCount/markRead/markAllRead; bus consumers: fillSettled, p2pEscrowLocked, p2pEscrowReleased, p2pEscrowRefunded, p2pTradeDisputed (openedBy only #157), kycApproved, rankUpdated, stakeCreated; ON CONFLICT dedupe). Push / email / SMS remain §13 sockets — no channel senders in this service. Not done until those channels exist._ | F |  | `ops.notifications` |
| 🔌 | Push notification channel (device tokens + provider) <br/>_§13 — interface is the in-app inbox row; push delivery not in v1._ | F |  | `socket.notify-push` |
| 🔌 | Email notification channel <br/>_§13 — outbound mail rail not wired._ | F |  | `socket.notify-email` |
| 🔌 | SMS notification channel <br/>_§13 — outbound SMS rail not wired._ | F |  | `socket.notify-sms` |
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
| ⛔ | Governance parameter handover | P | `chain.validators` | `chain.governance` |
| 🔌 | MPC custody for self-custody wallets | P |  | `socket.mpc-custody` |
| 🔌 | Guardian-based account recovery <br/>_Deliberately absent: a guardian is a second party who can take the account, and the platform must never be one._ | P |  | `socket.social-recovery` |

---

## How to use this

**To claim something:** find it in 🟢, set `owner` and `status: "wip"` in `tooling/tracker/features.mjs`, run `pnpm tracker`, and include both files in your first PR. That way nobody duplicates you.

**To ship something:** set `status: "done"` and list the paths it created in `requires`. The check will refuse the claim if those paths are missing.

**Plane:** `F` = Fiat (custodial, compliant) · `P` = Protocol (non-custodial, zero-KYC) · `B` = both. See §22.

**Why blocked is computed:** so the tracker cannot lie about readiness. If you think something is wrongly blocked, the fix is in `dependsOn`, and that edit is reviewable.

