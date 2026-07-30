/**
 * THE FEATURE REGISTRY.
 *
 * Every feature in INTAFACED_DEFINITIVE_BUILD.md §25 (the full coverage
 * matrix), plus the Core and infrastructure work §25 does not list because it
 * predates the surfaces.
 *
 * This file is DATA. `pnpm tracker` renders it to docs/TRACKER.md and validates
 * it against what is actually in the repo — a feature cannot claim `done` if the
 * service it lives in does not exist. That validation is the whole point: a
 * tracker nobody trusts is worse than no tracker, and the way trackers become
 * untrustworthy is by drifting from the code.
 *
 * ── How to use this as a developer ──────────────────────────────────────────
 * Pick anything with status `ready`. That means its dependencies are `done`, so
 * you can start today without waiting for anyone. Claim it in Telegram, open a
 * branch, open a PR. Set `owner` here in that same PR so nobody duplicates you.
 *
 * status:  done | wip | ready | blocked | socket
 *   done    — shipped to main and its DoD gate passes
 *   wip     — someone is on it right now (set `owner`)
 *   ready   — every dependency is done; free to claim
 *   blocked — computed, not declared: a dependency is not done yet
 *   socket  — deliberately not in v1 (§13). The interface exists; the impl does not.
 *
 * ── What `done` MEANS here (tightened 2026-07-28) ───────────────────────────
 * A feature is `done` only if ALL THREE hold. `requires` proves a path exists on
 * disk; it does not prove any of these, so verify by reading code:
 *
 *   1. REACHABLE. The code is served from a mounted route, or is a library that
 *      other shipped code actually imports. A router that `index.ts` constructs
 *      for its TYPE and never registers is not reachable — seven of eleven
 *      services were in exactly that state on 2026-07-28.
 *   2. TESTED. There are tests that would fail if it broke.
 *   3. NOT PROPPED UP. Nothing it depends on is a stub, a mock, or a TODO.
 *
 * Code-complete but unmounted is `ready`, not `done`, with a `note:` saying so.
 * Evidence for every 2026-07-28 change: docs/audit/tracker-truth-2026-07-28.md.
 *
 * ── Edge principal (updated 2026-07-29 full audit) ──────────────────────────
 * svc-edge EXISTS and signs `x-intafaced-principal` for every routed request.
 * `scopedProcedure` is reachable by logged-in humans through the edge.
 * `done` still means code mounted + tested + unpropped — not "live product
 * complete" (rails, chain, KYC ops may still be sandbox). See mount-boundary.
 */

/** @typedef {'done'|'wip'|'ready'|'socket'} DeclaredStatus */

/**
 * @param {string} id
 * @param {string} title
 * @param {object} opts
 */
function f(id, title, opts) {
  return {
    id,
    title,
    module: opts.module,
    phase: opts.phase,
    plane: opts.plane ?? 'F',
    status: opts.status ?? 'ready',
    dependsOn: opts.dependsOn ?? [],
    owner: opts.owner ?? null,
    note: opts.note ?? null,
    /** Services or packages that must exist on disk for `done` to be credible. */
    requires: opts.requires ?? [],
  };
}

export const FEATURES = [
  // ── PHASE 0 · FOUNDATIONS ────────────────────────────────────────────────
  f('infra.monorepo', 'Monorepo, Turborepo, CI pipeline', {
    module: 'core-ops',
    phase: '0',
    status: 'done',
    requires: ['packages/config'],
  }),
  f('infra.compose', 'docker compose: Postgres, Redis, NATS, OTel, Grafana', {
    module: 'core-ops',
    phase: '0',
    status: 'done',
    requires: ['docker-compose.yml', 'docker-compose.apps.yml'],
  }),
  f('infra.config', 'Typed env, feature flags, JURISDICTION_MATRIX', {
    module: 'core-ops',
    phase: '0',
    status: 'done',
    requires: ['packages/config'],
  }),
  f('infra.events', 'NATS subject law, versioned event catalog', {
    module: 'core-ops',
    phase: '0',
    status: 'done',
    requires: ['packages/events'],
  }),
  f('infra.contracts', 'zod-first tRPC pattern', { module: 'core-ops', phase: '0', status: 'done', requires: ['packages/contracts'] }),
  f('infra.auth-pkg', 'Scopes, JWT verify, guards', { module: 'identity', phase: '0', status: 'done', requires: ['packages/auth'] }),
  f('infra.db-pkg', 'Drizzle primitives, isolation helpers, test harness', {
    module: 'core-ops',
    phase: '0',
    status: 'done',
    requires: ['packages/db'],
  }),
  f('infra.ui-tokens', 'Design tokens + console primitives', { module: 'core-ops', phase: '0', status: 'done', requires: ['packages/ui'] }),
  f('infra.gates', 'brand-scan, custody-scan, migration-check, DoD gate', {
    module: 'core-ops',
    phase: '0',
    status: 'done',
    requires: ['tooling/ci'],
  }),
  f('infra.worktrees', 'Worktree tooling + GitHub Flow', {
    module: 'core-ops',
    phase: '0',
    status: 'done',
    requires: ['CONTRIBUTING.md', 'package.json'],
  }),
  f('infra.i18n', '100+ languages — keyed from day one (§9)', {
    module: 'core-ops',
    phase: '0',
    status: 'ready',
    requires: ['packages/i18n'],
    dependsOn: ['infra.ui-tokens'],
    note: 'Downgraded 2026-07-28: `@intafaced/i18n` is imported by zero files outside its own package. apps/web hardcodes English in a `copy` object whose comment calls i18n "being built in a separate worktree". "Keyed from day one" is not true of any surface.',
  }),

  // ── PHASE 1 · THE CORE ───────────────────────────────────────────────────
  f('ledger.double-entry', 'Double-entry ledger, hash chain, reconciliation', {
    module: 'ledger',
    phase: '1',
    status: 'done',
    requires: ['services/svc-ledger'],
  }),
  f('ledger.recipes', 'Money recipes — every value path in the OS', {
    module: 'ledger',
    phase: '1',
    status: 'done',
    requires: ['packages/ledger-client'],
  }),
  f('identity.accounts', 'Accounts, sessions, argon2id, TOTP', {
    module: 'identity',
    phase: '1',
    status: 'done',
    requires: ['services/svc-identity'],
  }),
  f('identity.rank', 'XP graph, rank ladder, machine-readable perks', {
    module: 'identity',
    phase: '1',
    status: 'done',
    requires: ['services/svc-identity'],
  }),
  f('identity.apikeys', 'Scoped API keys, sub-accounts', {
    module: 'identity',
    phase: '1',
    status: 'done',
    requires: ['services/svc-identity'],
    note: 'create/list/revoke on /trpc + public apiKeys.exchange → short-lived access JWT the edge already verifies. Key scopes only; no refresh; interactive-only scopes stay off keys. Sub-accounts still thin (create only).',
  }),
  f('identity.kyc', 'KYC tiers wired to JURISDICTION_MATRIX', {
    module: 'identity',
    phase: '1',
    status: 'done',
    requires: ['services/svc-identity'],
    note: "Restored to done 2026-07-28: the write side the audit called out now exists. `kyc.submit` / `kyc.approve` / `kyc.reject` / `kyc.pending` / `kyc.status` are served from svc-identity's mounted /trpc, so identity.kyc_records is writable and a real user can leave tier `none`. See identity.kyc-review.",
  }),
  f('identity.kyc-review', 'Routed KYC — submit, operator approve/reject, review queue', {
    module: 'identity',
    phase: '1',
    status: 'done',
    dependsOn: ['identity.kyc'],
    requires: ['services/svc-identity'],
    note: "Reachable on svc-identity's mounted /trpc; tested in router.test.ts + identity.test.ts; nothing propped up — approval is an operator action against kyc_records, no provider stub. Custodial side only: §22 permissionless surfaces read no tier (docs/decisions/kyc-posture.md).",
  }),
  f('identity.step-up', 'Step-up challenge minting trade:withdraw for five minutes', {
    module: 'identity',
    phase: '1',
    status: 'done',
    dependsOn: ['identity.accounts'],
    requires: ['services/svc-identity'],
    note: 'defaultScopes() withheld trade:withdraw "until a step-up challenge" that did not exist, so no session could reach any withdrawal. Reachable on the mounted router. Known limit, platform-wide and not introduced here: a TOTP code is replayable inside its validity window.',
  }),
  f('identity.webauthn', 'WebAuthn registration + assertion (§9)', {
    module: 'identity',
    phase: '1',
    status: 'done',
    dependsOn: ['identity.accounts'],
    requires: ['services/svc-identity'],
    note: 'PR #93: register/assert on mounted /trpc; soft-authenticator tests; session after assertion.',
  }),
  f('token.emissions', 'Emission curve, halving, single-minter guarantee', {
    module: 'token',
    phase: '1',
    status: 'done',
    requires: ['services/svc-token'],
    note: 'PR #94: mintEpoch live path + EMISSIONS_ENABLED kill-switch.',
  }),
  f('token.staking', 'Stake tiers, locks, access gating', {
    module: 'token',
    phase: '1',
    status: 'done',
    requires: ['services/svc-token'],
    note: 'PR #94: stake/unstake/listStakes on /trpc; principal-bound.',
  }),
  f('token.yield', 'Real-yield distribution from platform fees', {
    module: 'token',
    phase: '1',
    status: 'done',
    requires: ['services/svc-token'],
    note: 'Live path: tRPC distributeRevenue (admin:treasury + MFA). Operator supplies fee window + sources until Phase 2 auto-consumes trade fills. Service maths + ledger recipes unchanged; mount tests cover scope/MFA.',
  }),
  f('token.buyback', 'Buyback & burn split', {
    module: 'token',
    phase: '1',
    status: 'done',
    requires: ['services/svc-token'],
    note: 'Live path: tRPC recordBuyback + burnedSupply. tokensBought supplied by operator (pricing is svc-trade — §13 auto market-buy later). admin:treasury + MFA on the mutation.',
  }),
  f('token.governance', 'Proposals + IFC-weighted voting (§4.3)', {
    module: 'token',
    phase: '1',
    status: 'done',
    dependsOn: ['token.staking'],
    requires: ['services/svc-token'],
    note: 'PR #97: createProposal / castVote / listProposals / getProposal on mounted /trpc (weight = stakeOf snapshot).',
  }),

  // ── PHASE 2 · TRADE ──────────────────────────────────────────────────────
  f('matching.engine', 'Orderbook + matching engine, journal, replay', {
    module: 'matching',
    phase: '2',
    status: 'done',
    requires: ['services/svc-matching'],
    dependsOn: ['ledger.double-entry'],
  }),
  f('matching.determinism', 'Determinism test — replay yields identical book', {
    module: 'matching',
    phase: '2',
    status: 'done',
    requires: ['services/svc-matching/src/engine/engine.test.ts'],
    dependsOn: ['matching.engine'],
  }),
  f('trade.spot', 'Spot markets, order lifecycle, fees', {
    module: 'trade',
    phase: '2',
    status: 'done',
    requires: ['services/svc-trade'],
    dependsOn: ['matching.engine', 'identity.rank'],
  }),
  f('trade.convert', 'One-tap Convert — the retail on-ramp', {
    module: 'trade',
    phase: '2',
    status: 'wip',
    owner: 'Nitro',
    dependsOn: ['trade.spot'],
    requires: ['services/svc-trade'],
    note: 'convert.quote + convert.execute on svc-trade (RFQ + house spread → market IOC, same hold→fill). Money-path suite tests exist (trade-service convert describe). Still wip: CI billing blocked so green-CI DoD not re-proven; edge product-check open.',
  }),
  f('trade.futures', 'Perps: cross/isolated margin, funding, liquidation ladder', {
    module: 'trade',
    phase: '2',
    dependsOn: ['trade.spot'],
  }),
  f('trade.options', 'European options, cash-settled, full collateral in v1', {
    module: 'trade',
    phase: '2',
    dependsOn: ['trade.futures'],
  }),
  f('trade.otc', 'OTC RFQ desk, staked-tier gate', { module: 'trade', phase: '2', dependsOn: ['trade.spot', 'token.staking'] }),
  f('trade.copy', 'Copy trading, audited leaders, profit share', { module: 'trade', phase: '2', plane: 'B', dependsOn: ['trade.spot'] }),
  f('trade.forex', 'Fiat pairs on the same engine', { module: 'trade', phase: '2', dependsOn: ['trade.spot', 'pay.rails'] }),
  f('trade.algo', 'TWAP / VWAP / POV execution', { module: 'trade', phase: '2', dependsOn: ['trade.spot'] }),
  f('trade.ccxt-api', 'CCXT-compatible public API (bots + terminals connect)', {
    module: 'trade',
    phase: '2',
    dependsOn: ['trade.spot'],
    note: 'partial — markets+orderbook public REST live on svc-trade (/api/v1/markets, /api/v1/orderbook/:symbol) + edge preservePath /api/v1 → TRADE_URL; private routes still open',
  }),
  f('trade.mm-bot', 'Internal market-maker seeding books at launch', { module: 'trade', phase: '2', dependsOn: ['trade.spot'] }),
  f('venue.aggregation', 'External venue adapters via CCXT (cross-venue)', {
    module: 'trade',
    phase: '2',
    status: 'ready',
    dependsOn: ['trade.spot'],
    requires: ['packages/venue-adapter'],
    note: 'Downgraded 2026-07-28: `@intafaced/venue-adapter` is imported by zero files outside its own package. There is no adapter for any real venue — `LiquiditySource` is an interface with no implementation, so nothing is aggregated.',
  }),
  f('web.terminal', 'Pro terminal — depth, charts, hotkeys, sub-accounts', {
    module: 'trade',
    phase: '2',
    dependsOn: ['trade.spot', 'infra.ui-tokens', 'ws.depth'],
    note: 'Order entry, market list, open orders and fills are wired to svc-trade through svc-edge, and the DEX/CEX plane switch is live against svc-protocol. DEPTH is now live too: the terminal streams snapshot+deltas from services/svc-ws and withholds the book on a gap rather than drawing a stale one. Still missing from the four words in the title: CHARTS (no candle or trade-tape source exists anywhere), HOTKEYS and SUB-ACCOUNTS (not started). Those render as §13 sockets with the reason on screen. `dependsOn` moved from `ws.gateway` to `ws.depth`: the book needs depth, not positions, and depending on the umbrella would keep this blocked on streams it does not use.',
  }),
  f('web.shell', 'apps/web scaffold on the design system', {
    module: 'core-ops',
    phase: '2',
    status: 'done',
    dependsOn: ['infra.ui-tokens'],
    requires: ['apps/web'],
    note: 'Re-upgraded: apps/web now has a typed tRPC client against svc-edge (auth header, zod-validated responses, `Result` instead of throws), a tested depth state machine that resnapshots on a gap, and 45 tests. Every hardcoded price literal is gone — what cannot be fetched renders as a socket with a reason. The masthead status is a real `trade.health` probe rather than the constant "Systems nominal". Known limit, stated in the UI: the session is in-memory only, so a reload signs the user out; httpOnly refresh-cookie persistence is not built.',
  }),
  f('ws.depth', 'Live order book — snapshot + sequenced deltas to the browser', {
    module: 'trade',
    phase: '2',
    status: 'done',
    dependsOn: ['matching.engine'],
    requires: ['services/svc-ws', 'packages/market-data'],
    note: 'services/svc-ws polls svc-matching’s public depth endpoint, diffs it with `@intafaced/market-data`’s `diffDepth`, and fans snapshot+delta out over a websocket; apps/web applies them with `applyDelta` and resnapshots on a gap. Reachable (mounted routes + a real socket, wired into the terminal), tested (47 service tests, incl. a 200-tick stream rebuilt client-side through `applyDelta`, both backpressure stages, and an end-to-end socket suite), and unpropped (no stub upstream — it reads the real engine). Split out of `ws.gateway`: that entry names four streams and this is one of them.',
  }),
  f('ws.gateway', 'WebSocket fan-out: depth, trades, orders, positions', {
    module: 'trade',
    phase: '2',
    status: 'wip',
    owner: 'Nitro',
    dependsOn: ['matching.engine', 'ws.depth'],
    requires: ['services/svc-ws', 'packages/market-data'],
    note: 'Depth + public TRADE tape + private orders/fills (/private/stream: orderUpdated + fillSettled, JWT optional). Futures positions still missing.',
  }),

  // ── PHASE 3 · PAY + P2P ──────────────────────────────────────────────────
  f('pay.gateway', 'Branded gateway, hosted checkout, payment links', {
    module: 'pay',
    phase: '3',
    status: 'wip',
    owner: 'Nitro',
    dependsOn: ['ledger.double-entry'],
    requires: ['services/svc-pay'],
    note: 'Updated 2026-07-29: /trpc is mounted (createEdgeContext + fastifyTRPCPlugin, webhook raw-body parser encapsulated so it does not break tRPC). Edge already routes /api/pay → svc-pay. Merchant payment procedures are on the wire. Payment links: merchant.createLink + public resolveLink (token once). Still not `done`: hosted checkout *UI* is thin; rails remain sandbox (MemoryChain + card-sandbox).',
  }),
  f('pay.psp', 'PSP mode — own the merchant, digital KYB, custom pricing', { module: 'pay', phase: '3', dependsOn: ['pay.gateway'] }),
  f('pay.payfac', 'PayFac mode — sub-merchant trees, 14 permission areas', { module: 'pay', phase: '3', dependsOn: ['pay.psp'] }),
  f('pay.rails', 'RailAdapter interface + crypto-native + card-sandbox', {
    module: 'pay',
    phase: '3',
    status: 'ready',
    dependsOn: ['pay.gateway'],
    requires: ['services/svc-pay/src/rails'],
    note: 'Interface + conformance kit are real and tested; neither v1 rail moves real value — crypto-native runs on `MemoryChain` (index.ts, §13 socket), the other is card-SANDBOX. Merchant payments and webhooks can exercise these adapters now that /trpc is mounted; production rails are still sockets.',
  }),
  f('pay.user-money', 'User deposit + withdrawal — the two paths off the merchant path', {
    module: 'pay',
    phase: '3',
    status: 'ready',
    dependsOn: ['pay.rails', 'ledger.recipes'],
    requires: ['services/svc-pay'],
    note: 'Updated 2026-07-29: deposit.credit (admin:treasury) and withdrawal.* (trade:withdraw INTERACTIVE_ONLY + 2FA / trade:read) are reachable on mounted /trpc via svc-edge /api/pay — edge-signed principal required (router.mount.test.ts). Money-path suite against real Postgres remains. Still not `done`: depends on pay.rails which is MemoryChain + card-sandbox, so real value cannot leave/enter production rails.',
  }),
  f('pay.routing', 'Smart routing — geo, method, risk, approval rate', { module: 'pay', phase: '3', dependsOn: ['pay.rails'] }),
  f('pay.settlement', 'Dual settlement — bank or crypto', { module: 'pay', phase: '3', dependsOn: ['pay.rails'] }),
  f('pay.fraud', 'Risk scoring, chargebacks, decline recovery', { module: 'pay', phase: '3', dependsOn: ['pay.gateway'] }),
  f('pay.subscriptions', 'Recurring — card and crypto', { module: 'pay', phase: '3', dependsOn: ['pay.gateway'] }),
  f('pay.plugins', 'Woo / Magento / OpenCart plugins', { module: 'pay', phase: '3', dependsOn: ['pay.gateway'] }),
  f('pay.public-api', 'Public REST + webhooks + sandbox (§9)', {
    module: 'pay',
    phase: '3',
    plane: 'B',
    dependsOn: ['pay.gateway', 'identity.apikeys'],
  }),
  f('p2p.offers', 'Offers, maker/taker, 100+ fiat currencies', {
    module: 'p2p',
    phase: '3',
    status: 'done',
    dependsOn: ['ledger.double-entry'],
    requires: ['services/svc-p2p'],
    note: 'svc-p2p on main; self-mounts /trpc with an edge-verified principal',
  }),
  f('p2p.escrow', 'Ledger escrow — lock, release, refund', {
    module: 'p2p',
    phase: '3',
    status: 'done',
    dependsOn: ['p2p.offers'],
    requires: ['services/svc-p2p'],
    note: 'Escrow flows in svc-p2p; not a separate service',
  }),
  f('p2p.disputes', 'Moderated dispute resolution', {
    module: 'p2p',
    phase: '3',
    status: 'done',
    dependsOn: ['p2p.escrow'],
    requires: ['services/svc-p2p'],
    note: 'Dispute paths in svc-p2p core',
  }),
  f('p2p.reputation', 'Reputation feeding the same XP graph', {
    module: 'p2p',
    phase: '3',
    status: 'done',
    dependsOn: ['p2p.offers', 'identity.rank'],
    requires: ['services/svc-p2p/src/reputation.ts'],
    note: 'Reputation module on main',
  }),
  f('p2p.merchants', 'P2P merchant programme — badges, limits, API', { module: 'p2p', phase: '3', dependsOn: ['p2p.reputation'] }),

  // ── PHASE 3P · PROTOCOL PLANE P0 ─────────────────────────────────────────
  f('protocol.smart-accounts', 'Passkey smart accounts, session keys (§17.4)', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    status: 'ready',
    dependsOn: ['identity.accounts'],
    requires: ['services/svc-protocol'],
    note: 'Core + contracts on main; /trpc mounted; edge /api/protocol + web health/predictAddress product path. Factory/impl default 0x0 and PROTOCOL_RPC_URL is outside compose (no chain in stack). predict/buildDeployment refuse zero factory/impl. NOT done until factory+impl non-zero, RPC answers, and product path proves real chain config. Sockets: socket.evm-rpc, socket.contract-toolchain, socket.p256-verifier.',
  }),
  f('protocol.amm', 'AMM pools from audited templates', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    status: 'wip',
    owner: 'Nitro',
    dependsOn: ['protocol.smart-accounts'],
    requires: ['services/svc-protocol/contracts/amm', 'services/svc-protocol/src/amm'],
    note: 'WIP 2026-07-29: ConstantProductPool + PoolFactory Solidity, pure quote math + unsigned calldata builders on svc-protocol (amm.quoteExactIn / buildCreatePool / buildSwapExactIn / buildMintLiquidity). Not done until factory is deployed on a real chain (PROTOCOL_AMM_FACTORY_ADDRESS non-zero) and forge/runtime contract tests run — Foundry still §13 socket.contract-toolchain.',
  }),
  f('protocol.lending', 'On-chain lending markets, keeper liquidations', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    dependsOn: ['protocol.amm'],
  }),
  f('protocol.escrow', 'Non-custodial P2P escrow contracts', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    dependsOn: ['protocol.smart-accounts'],
  }),
  f('protocol.router', 'Sovereign router — book vs pool best execution', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    dependsOn: ['protocol.amm'],
  }),
  f('protocol.merchant', 'Lane A merchant contracts — zero KYB (§24)', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    dependsOn: ['protocol.smart-accounts'],
  }),
  f('indexer.readmodels', 'Chain → Postgres read models', {
    module: 'indexer',
    phase: '3P',
    plane: 'P',
    dependsOn: ['protocol.smart-accounts'],
    requires: ['services/svc-indexer'],
    note: 'Everything downstream of the chain is on main and mounted: schema-per-service read models (books, fills, positions), block-versioned rows with reorg unwind, idempotent projection, and a permissionless /trpc read API. 81 tests, 27 against real Postgres, reorg handling mutation-tested. NOT `done` because the "chain →" half is propped: `NullChainSource` is what boots, since there is no EVM RPC in this stack and no deployed CLOB to read — socket.evm-rpc. Also not yet routed at svc-edge.',
  }),

  // ── PHASE 4 · BLUEPRINT ──────────────────────────────────────────────────
  f('blueprint.onboarding', 'Blueprint session → profile JSON', {
    module: 'blueprint',
    phase: '4',
    status: 'done',
    dependsOn: ['identity.accounts'],
    requires: ['services/svc-blueprint'],
    note: 'svc-blueprint on main; self-mounts /trpc with an edge-verified principal',
  }),
  f('blueprint.card', 'Share card render (1080×1350, 1200×630)', { module: 'blueprint', phase: '4', dependsOn: ['blueprint.onboarding'] }),
  f('blueprint.crews', 'Crew matching + mentor shortlist', { module: 'blueprint', phase: '4', dependsOn: ['blueprint.onboarding'] }),
  f('blueprint.ownership', 'Export + hard delete, cascading', { module: 'blueprint', phase: '4', dependsOn: ['blueprint.onboarding'] }),
  f('blueprint.attestations', 'On-chain rank attestations, zero PII (§19)', {
    module: 'blueprint',
    phase: '4',
    plane: 'B',
    dependsOn: ['blueprint.onboarding', 'protocol.smart-accounts'],
  }),

  // ── PHASE 4P · INTACHAIN ─────────────────────────────────────────────────
  f('chain.mainnet', 'INTACHAIN — CometBFT + native CLOB module', {
    module: 'chain',
    phase: '4P',
    plane: 'P',
    dependsOn: ['matching.engine', 'protocol.amm'],
  }),
  f('chain.evm', 'INTAEVM sharing validator set + state', { module: 'chain', phase: '4P', plane: 'P', dependsOn: ['chain.mainnet'] }),
  f('bridge.canonical', 'Canonical IFC bridge + attestations', {
    module: 'bridge',
    phase: '4P',
    plane: 'B',
    dependsOn: ['chain.mainnet', 'token.emissions'],
  }),

  // ── PHASE 5 · SURFACES ───────────────────────────────────────────────────
  f('bank.accounts', 'Multi-currency account UX over the ledger', {
    module: 'bank',
    phase: '5',
    status: 'done',
    dependsOn: ['ledger.double-entry'],
    requires: ['services/svc-bank'],
    note: 'svc-bank on main; self-mounts /trpc with an edge-verified principal; UX product may expand',
  }),
  f('bank.loans', 'Collateralised loans, LTV, margin calls, liquidation', {
    module: 'bank',
    phase: '5',
    dependsOn: ['bank.accounts', 'trade.spot'],
  }),
  f('bank.earn', 'Flexible + fixed yield pools', { module: 'bank', phase: '5', dependsOn: ['bank.accounts', 'token.staking'] }),
  f('bank.cards', 'CardIssuerAdapter + card-sim, <2s auth decision', { module: 'bank', phase: '5', dependsOn: ['bank.accounts'] }),
  f('bank.sovereign-card', 'Self-custody funded card, JIT conversion (§18)', {
    module: 'bank',
    phase: '5',
    plane: 'P',
    dependsOn: ['bank.cards', 'protocol.smart-accounts'],
  }),
  f('bank.ramps', 'Fiat on/off ramp reusing svc-pay adapters', { module: 'bank', phase: '5', dependsOn: ['pay.rails'] }),
  f('agents.gateway', 'Model-agnostic gateway, per-user metering', {
    module: 'agents',
    phase: '5',
    status: 'done',
    dependsOn: ['identity.accounts'],
    requires: ['services/svc-agents'],
    note: 'Reference mount — the /trpc + createEdgeContext recipe every other service copies',
  }),
  f('agents.navigator', 'Navigator — tool-calling inside user guardrails', { module: 'agents', phase: '5', dependsOn: ['agents.gateway'] }),
  f('agents.support', 'Support agent — KB + account-state grounded', { module: 'agents', phase: '5', dependsOn: ['agents.gateway'] }),
  f('agents.scanner', 'Market Scanner — ranked signals by tier', {
    module: 'agents',
    phase: '5',
    dependsOn: ['agents.gateway', 'trade.spot'],
  }),
  f('agents.merchant', 'Merchant agent — approval-rate watch', {
    module: 'agents',
    phase: '5',
    dependsOn: ['agents.gateway', 'pay.routing'],
  }),
  f('agents.copy-intel', 'Copy-Intel — writes audited leader stats', {
    module: 'agents',
    phase: '5',
    dependsOn: ['agents.gateway', 'trade.copy'],
  }),
  f('academy.lobbies', 'Live lobbies, LiveKit SFU, capacity tiers', { module: 'academy', phase: '5', dependsOn: ['identity.rank'] }),
  f('academy.spatial', '2D navigable room canvas, VR-ready scene state', { module: 'academy', phase: '5', dependsOn: ['academy.lobbies'] }),
  f('academy.curriculum', 'DERIV//DESK library import — 20 playbooks + 3 workbooks', {
    module: 'academy',
    phase: '5',
    dependsOn: ['academy.lobbies'],
  }),
  f('academy.certs', 'Certifications → XP → real perks', {
    module: 'academy',
    phase: '5',
    dependsOn: ['academy.curriculum', 'identity.rank'],
  }),
  f('academy.ambassadors', 'Residencies, IFC pay, revenue share', {
    module: 'academy',
    phase: '5',
    dependsOn: ['academy.lobbies', 'token.staking'],
  }),
  f('academy.tournaments', 'Seasonal ladders, IFC prize pools', {
    module: 'academy',
    phase: '5',
    dependsOn: ['academy.lobbies', 'trade.spot'],
  }),
  f('academy.paper-trading', 'Paper-trading market flag for workbooks', { module: 'academy', phase: '5', dependsOn: ['trade.spot'] }),
  f('launch.token-factory', 'ERC-20 deploy from audited templates', {
    module: 'launch',
    phase: '5',
    plane: 'B',
    dependsOn: ['protocol.smart-accounts'],
  }),
  f('launch.meme-factory', 'One-click meme launch + instant market + LP', {
    module: 'launch',
    phase: '5',
    plane: 'P',
    dependsOn: ['launch.token-factory', 'protocol.amm'],
  }),
  f('launch.launchpad', 'Presale / fair launch, vesting, staked allocation tiers', {
    module: 'launch',
    phase: '5',
    dependsOn: ['launch.token-factory', 'token.staking'],
  }),
  f('launch.nft', 'NFT mint / list / auction, on-chain royalties', {
    module: 'launch',
    phase: '5',
    plane: 'P',
    dependsOn: ['launch.token-factory'],
  }),
  f('launch.rwa', 'RWA issuance registry, licence-gated', {
    module: 'launch',
    phase: '5',
    status: 'socket',
    dependsOn: ['launch.token-factory'],
  }),
  f('market.vendors', 'Vendor lifecycle — apply, vet, list, stake-gated slots', {
    module: 'market',
    phase: '5',
    dependsOn: ['token.staking'],
  }),
  f('market.commerce', 'Listings, subscriptions, purchases, house commission', {
    module: 'market',
    phase: '5',
    dependsOn: ['market.vendors'],
  }),
  f('mining.pool', 'Stratum share protocol, PPLNS payouts', { module: 'mining-pool', phase: '5', dependsOn: ['token.emissions'] }),
  f('ops.support', 'Support desk, tickets, KB', { module: 'core-ops', phase: '5', dependsOn: ['identity.accounts'] }),
  f('ops.affiliates', 'Multi-tier affiliate / IB trees, payout automation', {
    module: 'core-ops',
    phase: '5',
    dependsOn: ['ledger.double-entry'],
  }),
  f('ops.compliance', 'Screening queues, geo-block, VPN/Tor detection', { module: 'core-ops', phase: '5', dependsOn: ['identity.kyc'] }),
  f('ops.analytics', 'Warehouse — read replica + cube layer', { module: 'core-ops', phase: '5', dependsOn: ['ledger.double-entry'] }),
  f('ops.admin', 'apps/admin — listings, fee params, treasury, kill-switches', {
    module: 'core-ops',
    phase: '5',
    status: 'ready',
    dependsOn: ['infra.ui-tokens'],
    requires: ['apps/admin'],
    note: 'Downgraded 2026-07-28: apps/admin has ZERO test files and makes no network call of any kind. Every kill-switch, freeze and reconcile is React `useState` in the browser — flipping one changes a local boolean and nothing else. An operator console that appears to halt the ledger and does not is worse than no console.',
  }),
  f('ops.notifications', 'Event-driven fan-out: in-app, push, email, SMS', {
    module: 'notify',
    phase: '5',
    status: 'ready',
    dependsOn: ['infra.events'],
    requires: ['services/svc-notify'],
    note: 'In-app inbox shipped (svc-notify: list/unreadCount/markRead/markAllRead; bus consumers for fillSettled, p2pEscrowLocked, kycApproved; ON CONFLICT dedupe). Push / email / SMS remain §13 sockets — no channel senders in this service.',
  }),
  f('socket.notify-push', 'Push notification channel (device tokens + provider)', {
    module: 'notify',
    phase: '5',
    status: 'socket',
    dependsOn: ['ops.notifications'],
    note: '§13 — interface is the in-app inbox row; push delivery not in v1.',
  }),
  f('socket.notify-email', 'Email notification channel', {
    module: 'notify',
    phase: '5',
    status: 'socket',
    dependsOn: ['ops.notifications'],
    note: '§13 — outbound mail rail not wired.',
  }),
  f('socket.notify-sms', 'SMS notification channel', {
    module: 'notify',
    phase: '5',
    status: 'socket',
    dependsOn: ['ops.notifications'],
    note: '§13 — outbound SMS rail not wired.',
  }),

  // ── PHASE 5P · PROTOCOL P2–P3 ────────────────────────────────────────────
  f('chain.rust-core', 'Rust CLOB execution engine', {
    module: 'chain',
    phase: '5P',
    plane: 'P',
    status: 'socket',
    dependsOn: ['chain.mainnet'],
  }),
  f('chain.validators', 'Validator set opening, published schedule', {
    module: 'chain',
    phase: '5P',
    plane: 'P',
    dependsOn: ['chain.mainnet'],
  }),
  f('chain.governance', 'Governance parameter handover', {
    module: 'chain',
    phase: '5P',
    plane: 'P',
    dependsOn: ['chain.validators', 'token.governance'],
  }),

  // ── §13 · DELIBERATELY NOT IN v1 ─────────────────────────────────────────
  f('socket.rust-matching', 'Rust port of svc-matching', {
    module: 'matching',
    phase: '5',
    status: 'socket',
    dependsOn: ['matching.engine'],
  }),
  f('socket.live-issuer', 'Live card issuer rail', { module: 'bank', phase: '5', status: 'socket', dependsOn: ['bank.cards'] }),
  f('socket.psp-partners', 'PayPal / Stripe / live acquiring rails', {
    module: 'pay',
    phase: '5',
    status: 'socket',
    dependsOn: ['pay.rails'],
  }),
  f('socket.vr-client', 'VR lobby client', { module: 'academy', phase: '5', status: 'socket', dependsOn: ['academy.spatial'] }),
  f('socket.mpc-custody', 'MPC custody for self-custody wallets', {
    module: 'protocol',
    phase: '5P',
    plane: 'P',
    status: 'socket',
    dependsOn: ['protocol.smart-accounts'],
  }),
  f('socket.ledger-sharding', 'Per-asset hash chains with cross-shard anchor', {
    module: 'ledger',
    phase: '5',
    status: 'socket',
    dependsOn: ['ledger.double-entry'],
  }),

  // §13 sockets opened by protocol.smart-accounts. The contracts exist and are
  // reviewed; nothing compiles or runs them yet, and nothing in contracts/ may
  // reach a chain holding real value until the first two of these are closed.
  f('socket.contract-toolchain', 'Foundry + contract test suite in CI', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    status: 'socket',
    dependsOn: ['protocol.smart-accounts'],
    note: 'Solidity is written and cross-checked from TypeScript, but never executed. Blocks any mainnet deploy.',
  }),
  f('socket.contract-audit', 'External audit of the account + factory suite', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    status: 'socket',
    dependsOn: ['socket.contract-toolchain'],
  }),
  f('socket.userop-differential-test', 'getUserOperationHash checked against a live EntryPoint', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    status: 'socket',
    dependsOn: ['socket.contract-toolchain'],
  }),
  f('socket.p256-verifier', 'Passkey (P-256) owner verifier contract', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    status: 'socket',
    dependsOn: ['protocol.smart-accounts'],
    note: 'SmartAccount already routes contract owners through ERC-1271; the verifier itself is not built.',
  }),
  f('socket.social-recovery', 'Guardian-based account recovery', {
    module: 'protocol',
    phase: '5P',
    plane: 'P',
    status: 'socket',
    dependsOn: ['protocol.smart-accounts'],
    note: 'Deliberately absent: a guardian is a second party who can take the account, and the platform must never be one.',
  }),

  // §13 socket opened by indexer.readmodels. It is the gap under BOTH Protocol
  // Plane services: svc-protocol's PROTOCOL_RPC_URL points outside the compose
  // network and a clean clone has none, and svc-indexer boots NullChainSource
  // for the same reason. Nothing on this plane reads a real chain today.
  f('socket.evm-rpc', 'A real EVM ChainSource — RPC + deployed CLOB contracts', {
    module: 'indexer',
    phase: '3P',
    plane: 'P',
    status: 'socket',
    dependsOn: ['indexer.readmodels'],
    note: 'The ChainSource port (services/svc-indexer/src/chain/source.ts) is the shape the adapter must satisfy; MemoryChainSource is the deterministic reference its conformance is judged against. Blocked on there being contracts to read, not on the indexer.',
  }),
  f('socket.indexer-stream', 'Live book/tape feed from the projection (§5.2 ws-gateway)', {
    module: 'indexer',
    phase: '3P',
    plane: 'P',
    status: 'socket',
    dependsOn: ['indexer.readmodels'],
    note: 'The read path is pull-only today. packages/market-data already computes the deltas; what is missing is a subject in packages/events and the transport.',
  }),
];

export const PHASE_ORDER = ['0', '1', '2', '3', '3P', '4', '4P', '5', '5P'];

export const PHASE_NAMES = {
  0: 'Foundations',
  1: 'THE CORE',
  2: 'Trade',
  3: 'Pay + P2P',
  '3P': 'Protocol P0',
  4: 'Blueprint',
  '4P': 'INTACHAIN',
  5: 'Surfaces',
  '5P': 'Protocol P2–P3',
};
