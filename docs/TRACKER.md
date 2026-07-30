# Project tracker

> **Generated — do not edit by hand.** Source of truth is `tooling/tracker/features.mjs`.
> Run `pnpm tracker` after changing it. CI fails if this file is stale.

**42 of 108 shipped (39%)** · 2 in progress · 31 ready to claim · 33 blocked · 19 deliberate §13 sockets

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
| Flexible + fixed yield pools | `bank` | 5 | `bank.earn` |
| CardIssuerAdapter + card-sim, <2s auth decision | `bank` | 5 | `bank.cards` |
| Navigator — tool-calling inside user guardrails | `agents` | 5 | `agents.navigator` |
| Support agent — KB + account-state grounded | `agents` | 5 | `agents.support` |
| Market Scanner — ranked signals by tier | `agents` | 5 | `agents.scanner` |
| 2D navigable room canvas, VR-ready scene state | `academy` | 5 | `academy.spatial` |
| DERIV//DESK library import — 20 playbooks + 3 workbooks | `academy` | 5 | `academy.curriculum` |
| Residencies, IFC pay, revenue share | `academy` | 5 | `academy.ambassadors` |
| Seasonal ladders, IFC prize pools | `academy` | 5 | `academy.tournaments` |
| Paper-trading market flag for workbooks | `academy` | 5 | `academy.paper-trading` |
| ERC-20 deploy from audited templates | `launch` | 5 | `launch.token-factory` |
| Vendor lifecycle — apply, vet, list, stake-gated slots | `market` | 5 | `market.vendors` |
| Stratum share protocol, PPLNS payouts | `mining-pool` | 5 | `mining.pool` |
| Support desk, tickets, KB | `core-ops` | 5 | `ops.support` |
| Multi-tier affiliate / IB trees, payout automation | `core-ops` | 5 | `ops.affiliates` |
| Screening queues, geo-block, VPN/Tor detection | `core-ops` | 5 | `ops.compliance` |
| Warehouse — read replica + cube layer | `core-ops` | 5 | `ops.analytics` |
| apps/admin — listings, fee params, treasury, kill-switches | `core-ops` | 5 | `ops.admin` |

## Highest leverage

What each unshipped feature would unblock, transitively. **This is what should drive build order** — a feature that frees 26 others is worth more than one that frees none, whatever else is louder.

| Unblocks | Feature | Status | id |
|---:|---|---|---|
| **24** | Passkey smart accounts, session keys (§17.4) | 🟢 ready | `protocol.smart-accounts` |
| **14** | Branded gateway, hosted checkout, payment links | 🔨 wip | `pay.gateway` |
| **9** | AMM pools from audited templates | ⛔ blocked | `protocol.amm` |
| **7** | RailAdapter interface + crypto-native + card-sandbox | ⛔ blocked | `pay.rails` |
| **5** | INTACHAIN — CometBFT + native CLOB module | ⛔ blocked | `chain.mainnet` |
| **4** | ERC-20 deploy from audited templates | 🟢 ready | `launch.token-factory` |
| **3** | Chain → Postgres read models | ⛔ blocked | `indexer.readmodels` |
| **2** | CardIssuerAdapter + card-sim, <2s auth decision | 🟢 ready | `bank.cards` |

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
| ⛔ | Fiat pairs on the same engine <br/>_NOT started as a product. What exists: the instrument model (asset_class + schedule on trade.markets) and venue-hours enforcement on order-create — #102 added assertMarketOpen before the hold, so a weekend EUR/USD order is refused with trade.market_closed rather than funded. Hours coverage completed since: the unrecognised-schedule fail-safe (rows.ts casts the DB enum with no runtime parse, so an enum added without a TRADING_SCHEDULES entry must refuse, not throw), the cme-globex daily settlement break, Chicago DST, and an end-to-end proof that a closed venue takes no hold and writes no intent row. Still missing for the actual feature: fiat settlement rails, so no forex market is listed in production._ | F | `pay.rails` | `trade.forex` |
| 🟢 | TWAP / VWAP / POV execution | F |  | `trade.algo` |
| 🟢 | CCXT-compatible public API (bots + terminals connect) <br/>_partial — public REST: markets, orderbook, ticker, tickers, trades (tape; ?since= ms), ohlcv (route exists, always [] until candle aggregation job — no inventing candles; ohlcv empty); private REST (edge-signed principal, fail-closed): GET orders/open|closed (?since= ms on closed), GET orders/:id, POST orders (placeOrder money path, trade:write + jurisdiction), DELETE orders/:id (cancelOrder), DELETE orders[?symbol=] (cancelAllOrders, sequential money path), GET account/trades (myFills; ?symbol= filter + ?since= ms), GET account/fees (published maker/taker bps per symbol; {} when none), GET account/balance (ledger projection, real self-only balances — not stub), GET positions (positions empty [] until trade.futures; setLeverage/setMarginMode not mounted). Still open: OHLCV empty (no candle job), futures leverage/margin when trade.futures exists. Private WS is under `ws.gateway` (/private/stream), not this REST surface. LIVE PROBE 2026-07-30 found orderbook/ticker **502 MatchingUnavailable** when matching returned 404 for never-journalled markets; **#185** fixed that code path — empty/missing book is now honest empty depth `[]` (not engine-down 502). Residual: svc-matching still derives markets from journal replay only, so books stay empty until an order lands or trade.mm-bot seeds depth — bots may still see empty books, not "exchange down", until seeding. OHLCV remains [] until candle job._ | F |  | `trade.ccxt-api` |
| 🟢 | Internal market-maker seeding books at launch | F |  | `trade.mm-bot` |
| 🟢 | External venue adapters via CCXT (cross-venue) <br/>_Updated 2026-07-30. NOT "via CCXT" — §27 forbids a third-party connectivity library in the money path and there is no `ccxt` in the workspace by design; we are that layer. What now exists: `packages/venue-contracts` (the §27 unified schema — markets carrying a TICK not a decimal count, sequenced books, funding/borrow/trade prints, account state typed explicitly as an OBSERVATION of a third party and never a ledger input, and a wire reader that REFUSES a JSON number rather than coercing it) and a fabric in `packages/venue-adapter/src/fabric`: a sequenced book tracker that WITHHOLDS the book on a gap instead of patching over it (mutation delegated to `@intafaced/market-data` `applyDelta`), a feed that subscribes-then-buffers-then-snapshots and refuses to join when the REST snapshot predates the stream, a per-venue weighted rate-limit governor that refuses rather than silently waits and believes a 429/418 over its own arithmetic, latency grading on p95 + reject rate + staleness fed into routing through `VenueHealth` alone, and median-based cross-venue divergence detection that reports INCONCLUSIVE on fewer than three venues rather than calling one venue a consensus. One real venue: Binance spot public market data (markets, depth snapshot, WS depth at 100ms with `U`/`u` ranges, trade tape) behind injected transport ports. 137 tests in the package. Still `ready`, not `done`: (1) nothing outside the package imports the fabric — no service mounts it, so nothing is aggregated in production; (2) the TRADING half is deliberately NOT BUILT — `BinanceSpotTrade`/`BinanceSpotAccount` throw `VenueCredentialsMissingError` with no key and `VenueUnavailableError(not_ready)` with one, because a plausible rejection would let a router report a fill that never happened; (3) the Venue Vault (per-user HSM-backed trade-only keys) does not exist; (4) one venue only, and no live-network test runs in CI._ | F |  | `venue.aggregation` |
| 🟢 | Pro terminal — depth, charts, hotkeys, sub-accounts <br/>_Order entry, market list, open orders and fills are wired to svc-trade through svc-edge, and the DEX/CEX plane switch is live against svc-protocol. DEPTH is live: terminal streams snapshot+deltas from services/svc-ws and withholds the book on a gap. Public TRADE tape is now wired in the terminal (`LiveTradeTape` → svc-ws `channel=trades`, decimal-string prints only, no candles). Still missing from the four words in the title: CHARTS (no candle store / OHLCV always []; tape is live, chart socket remains honest), HOTKEYS and SUB-ACCOUNTS (not started). Those render as §13 sockets with the reason on screen. `dependsOn` is `ws.depth` not `ws.gateway` so the book is not blocked on positions._ | F |  | `web.terminal` |
| ✅ | apps/web scaffold on the design system <br/>_Re-upgraded: apps/web now has a typed tRPC client against svc-edge (auth header, zod-validated responses, `Result` instead of throws), a tested depth state machine that resnapshots on a gap, and 45 tests. Every hardcoded price literal is gone — what cannot be fetched renders as a socket with a reason. The masthead status is a real `trade.health` probe rather than the constant "Systems nominal". Known limit, stated in the UI: the session is in-memory only, so a reload signs the user out; httpOnly refresh-cookie persistence is not built._ | F |  | `web.shell` |
| ✅ | Live order book — snapshot + sequenced deltas to the browser <br/>_services/svc-ws polls svc-matching’s public depth endpoint, diffs it with `@intafaced/market-data`’s `diffDepth`, and fans snapshot+delta out over a websocket; apps/web applies them with `applyDelta` and resnapshots on a gap. Reachable (mounted routes + a real socket, wired into the terminal), tested (47 service tests, incl. a 200-tick stream rebuilt client-side through `applyDelta`, both backpressure stages, and an end-to-end socket suite), and unpropped (no stub upstream — it reads the real engine). Split out of `ws.gateway`: that entry names four streams and this is one of them._ | F |  | `ws.depth` |
| 🔨 | WebSocket fan-out: depth, trades, orders, positions <br/>_Depth done + public TRADE tape + private orders/fills on /private/stream (orderUpdated+fillSettled, JWT). Futures positions still missing — title names four streams; three of four is not done._ | F |  | `ws.gateway` |

### Phase 3 — Pay + P2P (4/16)

| | Feature | Plane | Blocked by | id |
|---|---|---|---|---|
| 🔨 | Branded gateway, hosted checkout, payment links <br/>_Updated 2026-07-30 (2): the hosted PAGE is now a hosted CHECKOUT — pay.checkout_sessions turns a link into a payment. checkout.open / checkout.status on tRPC (publicProcedure — no principal, because a hosted checkout takes money from someone who is not logged in) plus POST /checkout/session and GET /checkout/session/:token as HTML. THE SESSION IS THE FRAUD BOUNDARY: the amount is frozen server-side at open and a payer-supplied amount on a fixed-amount link is IGNORED, not compared; there is no rail input anywhere and the rail comes from PAY_CHECKOUT_RAILS (default crypto-native ONLY — card-sandbox is deliberately absent); a session completes only when a verified rail webhook drives the payment to captured, never from the browser. NEW POSTURE GATE assertRailMayAcceptPublicPayment, stricter than assertRailMayMoveValue: sandbox authorize/capture stay allowed for a MERCHANT integration (platform goes short, reconciliation catches it) but are refused for an anonymous payer who is shown "paid" while the merchant is credited clearing they can settle and withdraw. So under live-only the public path refuses with pay.checkout_rail_not_live -> SERVICE_UNAVAILABLE BEFORE any row is written — meaning hosted checkout refuses every payer in staging/prod today. That is the honest state, not a regression. Links hardened: expiry defaulted (30d) and capped (365d), "never expires" refused, opt-in maxUses, revocation one-way and deliberately non-cancelling for payers already in flight. Page: no script at all (CSP default-src none, meta-refresh poll), frame-ancestors none, no-store, no-referrer, still no card fields. A SESSION EXPIRING DOES NOT EXPIRE THE PAYMENT — a late payer still books, proven end to end. Still wip: no live rail, no card acquiring, merchant onboarding still blocked on pay:write._ | F |  | `pay.gateway` |
| ⛔ | PSP mode — own the merchant, digital KYB, custom pricing | F | `pay.gateway` | `pay.psp` |
| ⛔ | PayFac mode — sub-merchant trees, 14 permission areas | F | `pay.psp` | `pay.payfac` |
| ⛔ | RailAdapter interface + crypto-native + card-sandbox <br/>_Updated 2026-07-30: interface + conformance kit are real and tested; NEITHER v1 RAIL MOVES REAL VALUE and the code now says so. Every adapter declares `mode: live|sandbox` (conformance kit refuses one that does not); crypto-native derives its mode from the chain port, so MemoryChain makes it a sandbox whatever §13 says. Two gates in rails/posture.ts: APP_ENV staging/prod REFUSES TO BOOT with any sandbox rail registered unless PAY_ALLOW_SANDBOX_RAILS=true, and payout/refund re-check at the call site before the ledger moves (pay.rail_not_live -> SERVICE_UNAVAILABLE). Production chain default is now UnconfiguredChain, which refuses every call instead of returning a fabricated txHash. /ready and railHealth carry mode. Still `ready` not `done`: no live rail exists — see README for exactly what the owner must obtain._ | F | `pay.gateway` | `pay.rails` |
| ⛔ | User deposit + withdrawal — the two paths off the merchant path <br/>_Updated 2026-07-30: deposit.credit (admin:treasury) and withdrawal.* (trade:withdraw INTERACTIVE_ONLY + 2FA / trade:read) are reachable on mounted /trpc via svc-edge /api/pay — edge-signed principal required (router.mount.test.ts). Double-submit now proven under CONCURRENCY, not just sequential retry: two identical withdrawals in flight at once debit once and carry ONE rail idempotency key; a redelivered deposit credits once; two concurrent affordable-alone withdrawals cannot overdraw. Money-path suite against real Postgres, now on intafaced_test (it was defaulting to the shared intafaced DB and TRUNCATE-ing live rows). Still not `done`: depends on pay.rails, which has no live rail — a sandbox payout is refused before anything moves rather than fabricating a `sent`._ | F | `pay.rails` | `pay.user-money` |
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

### Phase 3P — Protocol P0 (1/8)

| | Feature | Plane | Blocked by | id |
|---|---|---|---|---|
| 🟢 | Passkey smart accounts, session keys (§17.4) <br/>_Core + contracts on main; /trpc mounted; edge /api/protocol + web health/predictAddress product path. Factory/impl default 0x0 and PROTOCOL_RPC_URL is outside compose (no chain in stack). predict/buildDeployment refuse zero factory/impl. 2026-07-30 honesty pass: every chain-dependent path refuses with a typed code instead of an opaque 500. chain/availability.ts separates transport failure (protocol.chain_unreachable) from an absent contract (protocol.contract_not_deployed) and a wrong-chain RPC (protocol.chain_id_mismatch); router maps them to 503 with the code intact. sessionStatus had no try/catch and could answer exists:false — indistinguishable from "the owner granted nothing" — when nothing had been read; it now proves code at the address first. New chainStatus returns reachable/observedChainId/usable as DATA so a surface renders the outage instead of catching a throw. 2026-07-30 LOCAL DEV CHAIN: docker-compose.yml now runs anvil as the dev-only `evm` service (# no-deploy, ephemeral, port 8545) and the Solidity is COMPILED for the first time — solc 0.8.28 pinned as a devDependency, artefacts committed under contracts/out with a sourceHash the suite re-derives. CREATE2 CROSS-CHECK PROVEN: the TypeScript derivation in accounts/address.ts and AccountFactory.getAddress agree across 25 owner/salt pairs, run against the deployed factory (create2-onchain.test.ts); the account also lands at the predicted address, is owned by the user and not the relayer, and its runtime code is byte-identical to the EIP-1167 proxy the init code hashes. predictAddress / buildDeployment / sessionStatus / claimAccount now return real values through the real ProtocolChain (router.live-chain.test.ts, 13 tests) — including a session granted on chain and read back with a matching specHash. The hand-written abi.ts is now checked against the compiled ABI (inputs, outputs, stateMutability, indexed flags) — it agreed exactly. chainStatus.suiteDeployed is now an eth_getCode READ, with suiteConfigured split out, so wiring real addresses into compose cannot make the service claim contracts that are not there. Found and fixed: relayUserOperation returned an opaque 500 for a malformed signature envelope (SignatureEnvelopeError was unmapped) — now a 400. Refusals unchanged when the chain is absent, now proven against a real closed socket rather than a stub (refusal-without-chain.test.ts). CI runs anvil and sets REQUIRE_EVM_CHAIN=1 so the cross-check cannot silently skip. STILL NOT DONE: a dev chain is not a chain decision — no production network is chosen, no EntryPoint and no bundler exist here so relayUserOperation still refuses, and nothing is audited. Sockets: socket.evm-rpc (svc-indexer still boots NullChainSource), socket.p256-verifier, socket.contract-audit, socket.userop-differential-test._ | P |  | `protocol.smart-accounts` |
| ⛔ | AMM pools from audited templates <br/>_WIP 2026-07-29: ConstantProductPool + PoolFactory Solidity, pure quote math + unsigned calldata builders on svc-protocol (amm.quoteExactIn / buildCreatePool / buildSwapExactIn / buildMintLiquidity). 2026-07-30: quoteExactIn took reserves as an INPUT and nothing in the repo supplied them — getReserves was in the ABI and called from nowhere, so a correct AMM was a calculator with no inputs. Added chain reads (poolReserves/poolToken0/poolToken1/poolFeeBps) and amm.quoteFromPool, which sources its own reserves, orients them by token0, and refuses a tokenIn the pool does not trade (amm.token_not_in_pool) rather than assuming token1. Both quotes now carry reservesFromChain so a caller can tell a real quote from arithmetic. quoteFromPool refuses in this environment every time — there is no chain. 2026-07-30 THE CONTRACT DOES NOT COMPILE. First time anything ran a Solidity compiler over this tree: ConstantProductPool.swapExactIn calls `swap` at lines 177 and 179, `swap` is declared `external`, and Solidity does not permit an internal call to an external function. So the pool has never produced bytecode and could never have been deployed. Fix is `external` -> `public` or a shared internal `_swap`; deliberately NOT done as a side effect of standing up a dev chain, because it changes a money contract external surface. Pinned in scripts/contract-sources.mjs so the build fails if it starts compiling (or fails differently) without somebody deciding. Not done until that is fixed, the factory is deployed (PROTOCOL_AMM_FACTORY_ADDRESS non-zero) and pool tests run on chain._ | P | `protocol.smart-accounts` | `protocol.amm` |
| ⛔ | On-chain lending markets, keeper liquidations | P | `protocol.amm` | `protocol.lending` |
| ⛔ | Non-custodial P2P escrow contracts | P | `protocol.smart-accounts` | `protocol.escrow` |
| ⛔ | Sovereign router — book vs pool best execution | P | `protocol.amm` | `protocol.router` |
| ⛔ | Lane A merchant contracts — zero KYB (§24) | P | `protocol.smart-accounts` | `protocol.merchant` |
| ⛔ | Chain → Postgres read models <br/>_2026-07-31 honesty: stays `ready` not `done` — #218 shipped real reorg tests + edge route, but production venue contracts are still DevVenue-class. Everything downstream of the chain is on main and mounted: schema-per-service read models (books, fills, positions), block-versioned rows with reorg unwind, idempotent projection, and a permissionless /trpc read API. Routed at svc-edge (/api/indexer). 2026-07-30 THE "chain ->" HALF IS NO LONGER PROPPED — socket.evm-rpc is CLOSED. src/chain/evm/ is a real adapter over a real JSON-RPC (viem PublicClient, no wallet client, an ABI carrying three events and zero functions): real block hashes, real parent links, real eth_getLogs. 132 tests, up from 81 — 79 hermetic, 27 on Postgres, 26 on a live anvil. THE REORG IS NOW PROVEN ON A CHAIN THAT REALLY FORKS: every reorg assertion used to run against MemoryChainSource, a fake whose hashes this repo computes and whose forks it stages, so it could not disagree with the code in any way the code had not anticipated. reorg.live.test.ts uses evm_snapshot/evm_revert to make anvil DISCARD blocks the indexer has already read, projected and served, and asserts on both stores that the orphaned level is gone (not merged, not left at zero), that there is one fill and not two, that the position is the winner's, and that the block at that height is a different block. A fork that replaces the tip WITHOUT extending it is caught; a fork deeper than retained history halts instead of unwinding into pruned history. Idempotency proven against real chain data (fresh Indexer applies 0 blocks, byte-identical read model; re-applying every block reports duplicate and changes nothing). STALENESS IS NOW STATED: status carries a LIVE chain probe, behindBy (null when unknown, never zero-by-default) and lastError — a pass that ends in neither progress nor a halt was impossible before a real RPC and freezes the cursor at a plausible number. THREE DECISIONS: logs fetched by BLOCK HASH not block number (a reorg between header-read and log-read staples branch B's logs onto branch A's header); a failure NEVER returns null (that would make a dead endpoint indistinguishable from NullChainSource); the venue's code is re-read every pass (eth_getLogs against an absent contract returns [] forever, which is #210's suiteDeployed lesson in its worse form — a missing contract that makes a read SUCCEED with nothing in it). Money: an on-chain uint256 with 18 implied decimals IS the scaled bigint Amount, no conversion; Number() never touches an amount; amounts >= 10^38 refused because numeric(38,18) cannot hold them. Two bugs found by the new tests: viem memoises getBlockNumber, so the staleness probe could report a cached tip (behindBy lying about staleness); and the by-block-hash fetch had NO test — swapping it to fromBlock/toBlock was a one-line change the whole suite ignored until one was written. Solc toolchain SHARED with svc-protocol (#210) rather than forked — one EXPECTED_SOLC and one SETTINGS in the repo, with assertSolcPinAgrees() covering the one thing an import cannot. NOT `done`: socket.clob-contracts. The three event signatures in evm/abi.ts are declared by this repo and implemented only by contracts/dev/DevVenue.sol, a dev fixture with no book, no matching and no access control. No audited venue exists, INDEXER_VENUE_ADDRESS has no honest default (zero, and the adapter refuses to construct on it), and the compose default is still no chain. That is a contracts problem, not an indexer one — the adapter does not depend on which events it decodes._ | P | `protocol.smart-accounts` | `indexer.readmodels` |
| 🔌 | Foundry + contract test suite in CI <br/>_2026-07-30 PARTIALLY CLOSED. Solidity is compiled and executed now: solc 0.8.28 pinned in package.json, `contracts:build` emits committed artefacts, and the account suite runs against anvil in CI (REQUIRE_EVM_CHAIN=1) — 31 contract tests including the CREATE2 cross-check. FIRST COMPILE FOUND A BUG NOBODY COULD HAVE SEEN: ConstantProductPool.swapExactIn calls `swap`, which is `external`, so the AMM pool has never produced bytecode and is undeployable. That is pinned as a known-broken suite in scripts/contract-sources.mjs, not silently skipped. Remaining: no Foundry/forge invariant or fuzz suite, no gas snapshots, and no audit — this proves the contracts compile and behave, not that they are safe. Blocks any mainnet deploy._ | P |  | `socket.contract-toolchain` |
| 🔌 | External audit of the account + factory suite | P |  | `socket.contract-audit` |
| 🔌 | getUserOperationHash checked against a live EntryPoint | P |  | `socket.userop-differential-test` |
| 🔌 | Passkey (P-256) owner verifier contract <br/>_SmartAccount already routes contract owners through ERC-1271; the verifier itself is not built._ | P |  | `socket.p256-verifier` |
| ✅ | A real EVM ChainSource — RPC + log decoding <br/>_CLOSED. services/svc-indexer/src/chain/evm/ implements the ChainSource port over a real JSON-RPC: viem PublicClient (no wallet client anywhere under src/), blocks and parent hashes read from the node, logs fetched BY BLOCK HASH so a reorg between the header read and the log read cannot staple one branch's logs onto another's header, and typed refusals (indexer.chain_unreachable / chain_id_mismatch / venue_not_deployed / malformed_block) instead of a null that would be indistinguishable from "no chain configured". Proven against the anvil dev chain #210 stood up, including a real evm_snapshot/evm_revert fork on a dedicated second node (`evm-reorg`, port 8546 — evm_revert rewinds the whole node, so sharing 8545 would rewind svc-protocol's factory out from under its own live tests). What remains is socket.clob-contracts: the event signatures the adapter decodes are declared by this repo and no audited venue emits them._ | P |  | `socket.evm-rpc` |
| 🔌 | An audited venue contract emitting the indexed event surface <br/>_services/svc-indexer/src/chain/evm/abi.ts declares three events — BookLevel, Fill, Position — and abi.test.ts holds them to the compiled ABI of contracts/dev/DevVenue.sol. DevVenue is a DEV FIXTURE and says so in its own header: no order book, no matching, no custody, and no access control at all (anyone can publish any trade). It exists so the adapter decodes logs a real chain produced. INDEXER_VENUE_ADDRESS therefore has no honest default — it is the zero address, EvmChainSource refuses to construct on it (eth_getLogs against 0x0 returns [] forever, which would fill the read model with a confident permanent "no liquidity"), and docker-compose.apps.yml leaves INDEXER_RPC_URL empty so the shipped stack still boots NullChainSource. Blocked on there being a venue contract to read, which is a contracts decision and not an indexer one: the adapter does not depend on which events it decodes._ | P |  | `socket.clob-contracts` |
| 🔌 | Live book/tape feed from the projection (§5.2 ws-gateway) <br/>_The read path is pull-only today. packages/market-data already computes the deltas; what is missing is a subject in packages/events and the transport._ | P |  | `socket.indexer-stream` |

### Phase 4 — Blueprint (3/5)

| | Feature | Plane | Blocked by | id |
|---|---|---|---|---|
| ✅ | Blueprint session → profile JSON <br/>_svc-blueprint on main; self-mounts /trpc with an edge-verified principal_ | F |  | `blueprint.onboarding` |
| 🟢 | Share card render (1080×1350, 1200×630) <br/>_Composition is DONE and is ours: `card/compose.ts` is a pure function from profile+crew to SVG, mounted at `blueprint.card` (blueprint:read, self-only) and carried in the §7.2 export. Both §7.2 canvases are asserted as literals — 1080×1350 and 1200×630, width/height attributes AND a matching viewBox — plus determinism, in-canvas bounds, tag balance, and a palette check that fails on any hex not in packages/ui tokens. §7.2's copy-scan runs on the RENDERED OUTPUT (not only the source) across every profile value the contract allows, with a negative control. The card deliberately carries ZERO personal data — no name, id or date — which is asserted, and is what makes it safe to share. NOT `done` because the "→ PNG" half of §7.1 is a rail this environment does not have: `CardRenderer` is the §0.4 adapter, `UnconfiguredCardRenderer` is what boots without BLUEPRINT_CARD_RENDERER_URL, and it answers `{status:"unavailable", code:"blueprint.card_renderer_unconfigured"}` as DATA so a surface renders the honest state instead of catching a throw. Every HttpCardRenderer failure path is tested to return `unavailable` and NEVER a URL — a fabricated asset URL becomes an og:image and is found as a broken unfurl on someone else's timeline. Done when a rasterizer + object storage exist and a real PNG URL lands in `card_asset_url`. OWNER call outstanding: whether a user-supplied display name may appear on the card (it would make a public renderer of arbitrary text in our branding)._ | F |  | `blueprint.card` |
| ✅ | Crew matching + mentor shortlist <br/>_The tracker row was stale, the code was not — this is a re-score of work already on main, not new work. Reachable: placement runs inside the mounted `blueprint.onboard`, the shortlist is the mounted `blueprint.mentors`. Placement and mentor scoring are pure deterministic functions (`matching/`), so a re-run lands a user in the SAME crew — asserted, not hoped. Capacity is enforced under `serializable` with the crew row locked; crew ids are derived, so two concurrent "form a crew" calls collide into one instead of stranding two crews of one; and every run writes a `match_runs` row scoring EVERY open crew, so "why am I not with them" is answerable from a row. 38 pure matching tests (28 crew + 10 mentor) plus placement, capacity, concurrency and determinism tests against real Postgres. Self-contained: nothing here waits on another service. `crewMemberCreated` is published for svc-academy lobby routing and has no consumer yet — that is svc-academy's feature, not a hole in this one._ | F |  | `blueprint.crews` |
| ✅ | Export + hard delete, cascading <br/>_2026-07-31: cascade closed. svc-blueprint still owns erase/export; svc-identity now subscribes to blueprintCreated/blueprintDeleted and sets/clears profiles.blueprint_id (match-guarded clear so a redelivered delete cannot wipe a newer blueprint). Wired in index.ts with durable JetStream consumers + MemoryEventBus tests. Export/erase Postgres proofs already on main._ | F |  | `blueprint.ownership` |
| ⛔ | On-chain rank attestations, zero PII (§19) | B | `protocol.smart-accounts` | `blueprint.attestations` |

### Phase 4P — INTACHAIN (0/3)

| | Feature | Plane | Blocked by | id |
|---|---|---|---|---|
| ⛔ | INTACHAIN — CometBFT + native CLOB module | P | `protocol.amm` | `chain.mainnet` |
| ⛔ | INTAEVM sharing validator set + state | P | `chain.mainnet` | `chain.evm` |
| ⛔ | Canonical IFC bridge + attestations | B | `chain.mainnet` | `bridge.canonical` |

### Phase 5 — Surfaces (5/32)

| | Feature | Plane | Blocked by | id |
|---|---|---|---|---|
| ✅ | Multi-currency account UX over the ledger <br/>_svc-bank on main; self-mounts /trpc with an edge-verified principal; UX product may expand_ | F |  | `bank.accounts` |
| ✅ | Collateralised loans, LTV, margin calls, liquidation <br/>_DONE on main #202 (2026-07-30). Collateral is purposed per loan (assertPurposedLocks covers collateral) so two loans in one asset cannot unsecure each other. Principal draws from loanReserve (module account, hard non-negative — underfunded reserve fails to lend rather than printing). No stored outstanding column — debt event-sourced. Liquidation ladder + accrual with per-(loan,day) idempotency. Value only via ledger-client recipes; amounts decimal strings / scaled bigint, never money-as-number for principal. Residual product: bank.earn / bank.cards / live go-live policy still separate._ | F |  | `bank.loans` |
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
| ✅ | Live lobbies, LiveKit SFU, capacity tiers <br/>_svc-academy on 4016, mounted at /api/academy. §8.3 capacity tiers free/staked/invite in one pure decideSeat(); seat claimed under FOR UPDATE so a race cannot oversell the last seat; staked tier reads token.stakeOf and fails closed, and only for staked rooms. Hosting gated on §4.1 rank_thresholds.perks.lobbyHostRights read from svc-identity, NOT on the scope — academy:write is now issued to every session so a seat is takeable. Sessions carry a serializable jsonb scene (the §8.3 VR-ready 2D layer). NO SFU: ACADEMY_STREAM_PROVIDER=none, NullStreamProvider REFUSES a join credential rather than fabricating one — socket.stream-provider. Non-custodial: no LEDGER_URL, no ledger client; min_stake is a threshold, never a balance. Curriculum/certs/ambassador pay deliberately not built here._ | F |  | `academy.lobbies` |
| 🟢 | 2D navigable room canvas, VR-ready scene state | F |  | `academy.spatial` |
| 🟢 | DERIV//DESK library import — 20 playbooks + 3 workbooks | F |  | `academy.curriculum` |
| ⛔ | Certifications → XP → real perks | F | `academy.curriculum` | `academy.certs` |
| 🟢 | Residencies, IFC pay, revenue share | F |  | `academy.ambassadors` |
| 🟢 | Seasonal ladders, IFC prize pools | F |  | `academy.tournaments` |
| 🟢 | Paper-trading market flag for workbooks | F |  | `academy.paper-trading` |
| 🟢 | ERC-20 deploy from audited templates <br/>_NOT `done`, for the same reason protocol.smart-accounts is not: a local dev chain is not a chain decision, and the title says "audited templates" while nothing here has been audited. What DOES exist, on main and mounted: contracts/launch/SovereignToken.sol (fixed-supply ERC-20 — NO mint, NO owner, NO pause, NO blacklist, NO upgrade path; entire supply minted once in the constructor to a named recipient) and TokenFactory.sol (CREATE2; the salt binds the creator and every parameter binds via the init code, so "this address, these parameters, this creator" is one claim; a repeat launch REVERTS rather than returning the existing token, unlike AccountFactory, because the supply was already minted by the first call). Compiled as its own pinned suite (solc 0.8.28, paris, artefacts committed with a sourceHash the suite re-derives). Service surface on svc-protocol: launch.status / predictTokenAddress / buildTokenDeployment / tokenInfo, permissionless per §22, unsigned calldata only — the service holds no key and never originates a launch. PROVEN ON THE REAL DEV CHAIN: the TypeScript CREATE2 derivation agrees with TokenFactory.getAddress over 20 creator/salt pairs and 5 parameter sets; our init code equals the factory own initCode(); the token lands at the predicted address; the deployed runtime IS the compiled template; the full supply reaches the recipient and NOTHING reaches the creator; no mint/owner/pause/upgrade selector appears anywhere in the deployed bytecode. End to end through the router: predict, build, broadcast exactly the bytes the service returned, token is at the predicted address (router-launch-live.test.ts) — which is what rules out predicting one address while handing out calldata that deploys to another. FOUND AND FIXED: comparing a deployed contract against artifact.deployedBytecode is WRONG and looks right — Solidity immutable values are spliced in by the constructor, so SovereignToken (decimals/totalSupply/initialHolder) never matches byte for byte. deployedCodeMatches() now masks the compiler immutableReferences ranges; shipping the naive check would have meant a "verified against the template" field that was permanently false. MONEY: supply is a decimal string on the wire and a scaled bigint in memory, never a number; capped at 10^20-1 whole tokens so it stays representable in numeric(38,18); decimals 0-18 enforced in the contract AND the API. No ledger recipe, no balance, no fee — the factory is not payable, and a launch fee is a Fiat Plane recipe (§0.6) belonging to whichever module sells the launch. REFUSALS: every launch path refuses with launch.factory_not_configured on a zero factory BEFORE any arithmetic runs, because CREATE2 against 0x0 returns a real, checksummed, entirely fictional token address that a creator would publish; proven against a real closed socket, not a stub. STILL NOT DONE: no services/svc-launch (§8.4 owns launchpad/meme/NFT/RWA — this is the contract + protocol layer per §17.5 "launch factory contracts"), no product UI, no launch fee, no instant market creation in svc-trade, no seed pool (needs protocol.amm, which does not compile), and NOTHING IS AUDITED — launch.status reports audited:false deliberately. Sockets: socket.contract-audit, socket.contract-toolchain (no fuzz suite and no gas snapshots for these contracts)._ | B |  | `launch.token-factory` |
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
| 🟢 | apps/admin — listings, fee params, treasury, kill-switches <br/>_2026-07-31 honesty: #217 is on main (dev-chain factory, mintAuthorityRetained:false, audited:false, creator signs). Still `ready` not `done` — template is not audited and no production chain is chosen. Downgraded 2026-07-28: apps/admin has ZERO test files and makes no network call of any kind. Every kill-switch, freeze and reconcile is React `useState` in the browser — flipping one changes a local boolean and nothing else. An operator console that appears to halt the ledger and does not is worse than no console._ | F |  | `ops.admin` |
| ✅ | Event-driven fan-out: in-app, push, email, SMS <br/>_In-app inbox shipped (svc-notify: list/unreadCount/markRead/markAllRead; bus consumers: fillSettled, p2pEscrowLocked, p2pEscrowReleased, p2pEscrowRefunded, p2pTradeDisputed (openedBy only #157), kycApproved, rankUpdated, stakeCreated, bankMarginCalled; ON CONFLICT dedupe). Multi-channel fan-out now exists: one NotificationChannel adapter interface, per-channel delivery rows with attempted_at kept apart from delivered_at, claim-per-(notification,channel) idempotency, confirmed-address targets, and a retryable/permanent split that decides whether the bus redelivers. NOT done: no out-of-app channel can actually deliver until the owner supplies gateway credentials — until then email, push and SMS refuse every message with channel.not_configured and the refusal is on the record. In-app is the honest fallback and is genuinely delivering._ | F |  | `ops.notifications` |
| 🔌 | Push notification channel (device tokens + provider) <br/>_§13 — adapter shipped (GatewayChannel over an owner-configured URL, device token registered and confirmed per user). Blocked on credentials the owner must obtain, not on code: with none set it refuses every message with channel.not_configured and records it._ | F |  | `socket.notify-push` |
| 🔌 | Email notification channel <br/>_§13 — adapter shipped (GatewayChannel over NOTIFY_EMAIL_GATEWAY_URL/TOKEN, address confirmed by a code sent through the channel itself, copy rendered server-side from @intafaced/i18n). Blocked on an outbound mail rail the owner must supply; unconfigured it refuses by name._ | F |  | `socket.notify-email` |
| 🔌 | SMS notification channel <br/>_§13 — adapter shipped (GatewayChannel over NOTIFY_SMS_GATEWAY_URL/TOKEN, E.164 addresses confirmed by code). Blocked on an outbound SMS rail the owner must supply; unconfigured it refuses by name._ | F |  | `socket.notify-sms` |
| 🔌 | Rust port of svc-matching | F |  | `socket.rust-matching` |
| 🔌 | Live card issuer rail | F |  | `socket.live-issuer` |
| 🔌 | PayPal / Stripe / live acquiring rails | F |  | `socket.psp-partners` |
| 🔌 | VR lobby client | F |  | `socket.vr-client` |
| 🔌 | A real WebRTC SFU behind StreamProvider (§8.3 LiveKit self-hosted) <br/>_§13 — the interface exists (services/svc-academy/src/stream/provider.ts) and lobbies run without it: seats, presence, capacity, invites and the 2D scene need no provider. NullStreamProvider REFUSES a join credential by name rather than returning a plausible one, because a lobby that opens against no SFU fails silently in the browser and reads as a broken platform. Needs a self-hosted LiveKit deployment and its API key — neither exists in this environment._ | F |  | `socket.stream-provider` |
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

