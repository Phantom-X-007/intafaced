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
  f('infra.monorepo', 'Monorepo, Turborepo, CI pipeline', { module: 'core-ops', phase: '0', status: 'done', requires: ['packages/config'] }),
  f('infra.compose', 'docker compose: Postgres, Redis, NATS, OTel, Grafana', { module: 'core-ops', phase: '0', status: 'done' }),
  f('infra.config', 'Typed env, feature flags, JURISDICTION_MATRIX', { module: 'core-ops', phase: '0', status: 'done', requires: ['packages/config'] }),
  f('infra.events', 'NATS subject law, versioned event catalog', { module: 'core-ops', phase: '0', status: 'done', requires: ['packages/events'] }),
  f('infra.contracts', 'zod-first tRPC pattern', { module: 'core-ops', phase: '0', status: 'done', requires: ['packages/contracts'] }),
  f('infra.auth-pkg', 'Scopes, JWT verify, guards', { module: 'identity', phase: '0', status: 'done', requires: ['packages/auth'] }),
  f('infra.db-pkg', 'Drizzle primitives, isolation helpers, test harness', { module: 'core-ops', phase: '0', status: 'done', requires: ['packages/db'] }),
  f('infra.ui-tokens', 'Design tokens + console primitives', { module: 'core-ops', phase: '0', status: 'done', requires: ['packages/ui'] }),
  f('infra.gates', 'brand-scan, custody-scan, migration-check, DoD gate', { module: 'core-ops', phase: '0', status: 'done', requires: ['tooling/ci'] }),
  f('infra.worktrees', 'Worktree tooling + GitHub Flow', { module: 'core-ops', phase: '0', status: 'done' }),
  f('infra.i18n', '100+ languages — keyed from day one (§9)', {
    module: 'core-ops',
    phase: '0',
    status: 'done',
    requires: ['packages/i18n'],
    dependsOn: ['infra.ui-tokens'],
  }),

  // ── PHASE 1 · THE CORE ───────────────────────────────────────────────────
  f('ledger.double-entry', 'Double-entry ledger, hash chain, reconciliation', { module: 'ledger', phase: '1', status: 'done', requires: ['services/svc-ledger'] }),
  f('ledger.recipes', 'Money recipes — every value path in the OS', { module: 'ledger', phase: '1', status: 'done', requires: ['packages/ledger-client'] }),
  f('identity.accounts', 'Accounts, sessions, argon2id, TOTP', { module: 'identity', phase: '1', status: 'done', requires: ['services/svc-identity'] }),
  f('identity.rank', 'XP graph, rank ladder, machine-readable perks', { module: 'identity', phase: '1', status: 'done', requires: ['services/svc-identity'] }),
  f('identity.apikeys', 'Scoped API keys, sub-accounts', { module: 'identity', phase: '1', status: 'done', requires: ['services/svc-identity'] }),
  f('identity.kyc', 'KYC tiers wired to JURISDICTION_MATRIX', { module: 'identity', phase: '1', status: 'done', requires: ['services/svc-identity'] }),
  f('identity.webauthn', 'WebAuthn registration + assertion (§9)', { module: 'identity', phase: '1', dependsOn: ['identity.accounts'] }),
  f('token.emissions', 'Emission curve, halving, single-minter guarantee', { module: 'token', phase: '1', status: 'done', requires: ['services/svc-token'] }),
  f('token.staking', 'Stake tiers, locks, access gating', { module: 'token', phase: '1', status: 'done', requires: ['services/svc-token'] }),
  f('token.yield', 'Real-yield distribution from platform fees', { module: 'token', phase: '1', status: 'done', requires: ['services/svc-token'] }),
  f('token.buyback', 'Buyback & burn split', { module: 'token', phase: '1', status: 'done', requires: ['services/svc-token'] }),
  f('token.governance', 'Proposals + IFC-weighted voting (§4.3)', { module: 'token', phase: '1', dependsOn: ['token.staking'] }),

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
  f('trade.convert', 'One-tap Convert — the retail on-ramp', { module: 'trade', phase: '2', dependsOn: ['trade.spot'] }),
  f('trade.futures', 'Perps: cross/isolated margin, funding, liquidation ladder', { module: 'trade', phase: '2', dependsOn: ['trade.spot'] }),
  f('trade.options', 'European options, cash-settled, full collateral in v1', { module: 'trade', phase: '2', dependsOn: ['trade.futures'] }),
  f('trade.otc', 'OTC RFQ desk, staked-tier gate', { module: 'trade', phase: '2', dependsOn: ['trade.spot', 'token.staking'] }),
  f('trade.copy', 'Copy trading, audited leaders, profit share', { module: 'trade', phase: '2', plane: 'B', dependsOn: ['trade.spot'] }),
  f('trade.forex', 'Fiat pairs on the same engine', { module: 'trade', phase: '2', dependsOn: ['trade.spot', 'pay.rails'] }),
  f('trade.algo', 'TWAP / VWAP / POV execution', { module: 'trade', phase: '2', dependsOn: ['trade.spot'] }),
  f('trade.ccxt-api', 'CCXT-compatible public API (bots + terminals connect)', { module: 'trade', phase: '2', dependsOn: ['trade.spot'], note: 'contract already built in packages/exchange-contract' }),
  f('trade.mm-bot', 'Internal market-maker seeding books at launch', { module: 'trade', phase: '2', dependsOn: ['trade.spot'] }),
  f('venue.aggregation', 'External venue adapters via CCXT (cross-venue)', { module: 'trade', phase: '2', status: 'done', dependsOn: ['trade.spot'], requires: ['packages/venue-adapter'], note: 'LiquiditySource + router package on main; live venue wiring still product work' }),
  f('web.terminal', 'Pro terminal — depth, charts, hotkeys, sub-accounts', { module: 'trade', phase: '2', dependsOn: ['trade.spot', 'infra.ui-tokens'] }),
  f('web.shell', 'apps/web scaffold on the design system', { module: 'core-ops', phase: '2', status: 'done', dependsOn: ['infra.ui-tokens'], requires: ['apps/web'], note: 'Scaffold on main; trade UI still mock data until ws/terminal wire' }),
  f('ws.gateway', 'WebSocket fan-out: depth, trades, orders, positions', { module: 'trade', phase: '2', dependsOn: ['matching.engine'] }),

  // ── PHASE 3 · PAY + P2P ──────────────────────────────────────────────────
  f('pay.gateway', 'Branded gateway, hosted checkout, payment links', { module: 'pay', phase: '3', status: 'done', dependsOn: ['ledger.double-entry'], requires: ['services/svc-pay'], note: 'svc-pay core on main; tRPC mount deferred to §9 gateway; product checkout links may still expand' }),
  f('pay.psp', 'PSP mode — own the merchant, digital KYB, custom pricing', { module: 'pay', phase: '3', dependsOn: ['pay.gateway'] }),
  f('pay.payfac', 'PayFac mode — sub-merchant trees, 14 permission areas', { module: 'pay', phase: '3', dependsOn: ['pay.psp'] }),
  f('pay.rails', 'RailAdapter interface + crypto-native + card-sandbox', { module: 'pay', phase: '3', status: 'done', dependsOn: ['pay.gateway'], requires: ['services/svc-pay/src/rails'], note: 'Rails + conformance kit on main inside svc-pay' }),
  f('pay.routing', 'Smart routing — geo, method, risk, approval rate', { module: 'pay', phase: '3', dependsOn: ['pay.rails'] }),
  f('pay.settlement', 'Dual settlement — bank or crypto', { module: 'pay', phase: '3', dependsOn: ['pay.rails'] }),
  f('pay.fraud', 'Risk scoring, chargebacks, decline recovery', { module: 'pay', phase: '3', dependsOn: ['pay.gateway'] }),
  f('pay.subscriptions', 'Recurring — card and crypto', { module: 'pay', phase: '3', dependsOn: ['pay.gateway'] }),
  f('pay.plugins', 'Woo / Magento / OpenCart plugins', { module: 'pay', phase: '3', dependsOn: ['pay.gateway'] }),
  f('pay.public-api', 'Public REST + webhooks + sandbox (§9)', { module: 'pay', phase: '3', plane: 'B', dependsOn: ['pay.gateway', 'identity.apikeys'] }),
  f('p2p.offers', 'Offers, maker/taker, 100+ fiat currencies', { module: 'p2p', phase: '3', status: 'done', dependsOn: ['ledger.double-entry'], requires: ['services/svc-p2p'], note: 'svc-p2p on main; self-mounts /trpc with an edge-verified principal' }),
  f('p2p.escrow', 'Ledger escrow — lock, release, refund', { module: 'p2p', phase: '3', status: 'done', dependsOn: ['p2p.offers'], requires: ['services/svc-p2p'], note: 'Escrow flows in svc-p2p; not a separate service' }),
  f('p2p.disputes', 'Moderated dispute resolution', { module: 'p2p', phase: '3', status: 'done', dependsOn: ['p2p.escrow'], requires: ['services/svc-p2p'], note: 'Dispute paths in svc-p2p core' }),
  f('p2p.reputation', 'Reputation feeding the same XP graph', { module: 'p2p', phase: '3', status: 'done', dependsOn: ['p2p.offers', 'identity.rank'], requires: ['services/svc-p2p/src/reputation.ts'], note: 'Reputation module on main' }),
  f('p2p.merchants', 'P2P merchant programme — badges, limits, API', { module: 'p2p', phase: '3', dependsOn: ['p2p.reputation'] }),

  // ── PHASE 3P · PROTOCOL PLANE P0 ─────────────────────────────────────────
  f('protocol.smart-accounts', 'Passkey smart accounts, session keys (§17.4)', { module: 'protocol', phase: '3P', plane: 'P', status: 'done', dependsOn: ['identity.accounts'], requires: ['services/svc-protocol'], note: 'svc-protocol on main; self-mounts /trpc with an edge-verified principal; open contract sockets remain elsewhere' }),
  f('protocol.amm', 'AMM pools from audited templates', { module: 'protocol', phase: '3P', plane: 'P', dependsOn: ['protocol.smart-accounts'] }),
  f('protocol.lending', 'On-chain lending markets, keeper liquidations', { module: 'protocol', phase: '3P', plane: 'P', dependsOn: ['protocol.amm'] }),
  f('protocol.escrow', 'Non-custodial P2P escrow contracts', { module: 'protocol', phase: '3P', plane: 'P', dependsOn: ['protocol.smart-accounts'] }),
  f('protocol.router', 'Sovereign router — book vs pool best execution', { module: 'protocol', phase: '3P', plane: 'P', dependsOn: ['protocol.amm'] }),
  f('protocol.merchant', 'Lane A merchant contracts — zero KYB (§24)', { module: 'protocol', phase: '3P', plane: 'P', dependsOn: ['protocol.smart-accounts'] }),
  f('indexer.readmodels', 'Chain → Postgres read models', { module: 'indexer', phase: '3P', plane: 'P', dependsOn: ['protocol.smart-accounts'] }),

  // ── PHASE 4 · BLUEPRINT ──────────────────────────────────────────────────
  f('blueprint.onboarding', 'Blueprint session → profile JSON', { module: 'blueprint', phase: '4', status: 'done', dependsOn: ['identity.accounts'], requires: ['services/svc-blueprint'], note: 'svc-blueprint on main; self-mounts /trpc with an edge-verified principal' }),
  f('blueprint.card', 'Share card render (1080×1350, 1200×630)', { module: 'blueprint', phase: '4', dependsOn: ['blueprint.onboarding'] }),
  f('blueprint.crews', 'Crew matching + mentor shortlist', { module: 'blueprint', phase: '4', dependsOn: ['blueprint.onboarding'] }),
  f('blueprint.ownership', 'Export + hard delete, cascading', { module: 'blueprint', phase: '4', dependsOn: ['blueprint.onboarding'] }),
  f('blueprint.attestations', 'On-chain rank attestations, zero PII (§19)', { module: 'blueprint', phase: '4', plane: 'B', dependsOn: ['blueprint.onboarding', 'protocol.smart-accounts'] }),

  // ── PHASE 4P · INTACHAIN ─────────────────────────────────────────────────
  f('chain.mainnet', 'INTACHAIN — CometBFT + native CLOB module', { module: 'chain', phase: '4P', plane: 'P', dependsOn: ['matching.engine', 'protocol.amm'] }),
  f('chain.evm', 'INTAEVM sharing validator set + state', { module: 'chain', phase: '4P', plane: 'P', dependsOn: ['chain.mainnet'] }),
  f('bridge.canonical', 'Canonical IFC bridge + attestations', { module: 'bridge', phase: '4P', plane: 'B', dependsOn: ['chain.mainnet', 'token.emissions'] }),

  // ── PHASE 5 · SURFACES ───────────────────────────────────────────────────
  f('bank.accounts', 'Multi-currency account UX over the ledger', { module: 'bank', phase: '5', status: 'done', dependsOn: ['ledger.double-entry'], requires: ['services/svc-bank'], note: 'svc-bank on main; self-mounts /trpc with an edge-verified principal; UX product may expand' }),
  f('bank.loans', 'Collateralised loans, LTV, margin calls, liquidation', { module: 'bank', phase: '5', dependsOn: ['bank.accounts', 'trade.spot'] }),
  f('bank.earn', 'Flexible + fixed yield pools', { module: 'bank', phase: '5', dependsOn: ['bank.accounts', 'token.staking'] }),
  f('bank.cards', 'CardIssuerAdapter + card-sim, <2s auth decision', { module: 'bank', phase: '5', dependsOn: ['bank.accounts'] }),
  f('bank.sovereign-card', 'Self-custody funded card, JIT conversion (§18)', { module: 'bank', phase: '5', plane: 'P', dependsOn: ['bank.cards', 'protocol.smart-accounts'] }),
  f('bank.ramps', 'Fiat on/off ramp reusing svc-pay adapters', { module: 'bank', phase: '5', dependsOn: ['pay.rails'] }),
  f('agents.gateway', 'Model-agnostic gateway, per-user metering', { module: 'agents', phase: '5', status: 'done', dependsOn: ['identity.accounts'], requires: ['services/svc-agents'], note: 'Reference mount — the /trpc + createEdgeContext recipe every other service copies' }),
  f('agents.navigator', 'Navigator — tool-calling inside user guardrails', { module: 'agents', phase: '5', dependsOn: ['agents.gateway'] }),
  f('agents.support', 'Support agent — KB + account-state grounded', { module: 'agents', phase: '5', dependsOn: ['agents.gateway'] }),
  f('agents.scanner', 'Market Scanner — ranked signals by tier', { module: 'agents', phase: '5', dependsOn: ['agents.gateway', 'trade.spot'] }),
  f('agents.merchant', 'Merchant agent — approval-rate watch', { module: 'agents', phase: '5', dependsOn: ['agents.gateway', 'pay.routing'] }),
  f('agents.copy-intel', 'Copy-Intel — writes audited leader stats', { module: 'agents', phase: '5', dependsOn: ['agents.gateway', 'trade.copy'] }),
  f('academy.lobbies', 'Live lobbies, LiveKit SFU, capacity tiers', { module: 'academy', phase: '5', dependsOn: ['identity.rank'] }),
  f('academy.spatial', '2D navigable room canvas, VR-ready scene state', { module: 'academy', phase: '5', dependsOn: ['academy.lobbies'] }),
  f('academy.curriculum', 'DERIV//DESK library import — 20 playbooks + 3 workbooks', { module: 'academy', phase: '5', dependsOn: ['academy.lobbies'] }),
  f('academy.certs', 'Certifications → XP → real perks', { module: 'academy', phase: '5', dependsOn: ['academy.curriculum', 'identity.rank'] }),
  f('academy.ambassadors', 'Residencies, IFC pay, revenue share', { module: 'academy', phase: '5', dependsOn: ['academy.lobbies', 'token.staking'] }),
  f('academy.tournaments', 'Seasonal ladders, IFC prize pools', { module: 'academy', phase: '5', dependsOn: ['academy.lobbies', 'trade.spot'] }),
  f('academy.paper-trading', 'Paper-trading market flag for workbooks', { module: 'academy', phase: '5', dependsOn: ['trade.spot'] }),
  f('launch.token-factory', 'ERC-20 deploy from audited templates', { module: 'launch', phase: '5', plane: 'B', dependsOn: ['protocol.smart-accounts'] }),
  f('launch.meme-factory', 'One-click meme launch + instant market + LP', { module: 'launch', phase: '5', plane: 'P', dependsOn: ['launch.token-factory', 'protocol.amm'] }),
  f('launch.launchpad', 'Presale / fair launch, vesting, staked allocation tiers', { module: 'launch', phase: '5', dependsOn: ['launch.token-factory', 'token.staking'] }),
  f('launch.nft', 'NFT mint / list / auction, on-chain royalties', { module: 'launch', phase: '5', plane: 'P', dependsOn: ['launch.token-factory'] }),
  f('launch.rwa', 'RWA issuance registry, licence-gated', { module: 'launch', phase: '5', status: 'socket', dependsOn: ['launch.token-factory'] }),
  f('market.vendors', 'Vendor lifecycle — apply, vet, list, stake-gated slots', { module: 'market', phase: '5', dependsOn: ['token.staking'] }),
  f('market.commerce', 'Listings, subscriptions, purchases, house commission', { module: 'market', phase: '5', dependsOn: ['market.vendors'] }),
  f('mining.pool', 'Stratum share protocol, PPLNS payouts', { module: 'mining-pool', phase: '5', dependsOn: ['token.emissions'] }),
  f('ops.support', 'Support desk, tickets, KB', { module: 'core-ops', phase: '5', dependsOn: ['identity.accounts'] }),
  f('ops.affiliates', 'Multi-tier affiliate / IB trees, payout automation', { module: 'core-ops', phase: '5', dependsOn: ['ledger.double-entry'] }),
  f('ops.compliance', 'Screening queues, geo-block, VPN/Tor detection', { module: 'core-ops', phase: '5', dependsOn: ['identity.kyc'] }),
  f('ops.analytics', 'Warehouse — read replica + cube layer', { module: 'core-ops', phase: '5', dependsOn: ['ledger.double-entry'] }),
  f('ops.admin', 'apps/admin — listings, fee params, treasury, kill-switches', { module: 'core-ops', phase: '5', status: 'done', dependsOn: ['infra.ui-tokens'], requires: ['apps/admin'], note: 'Console scaffold on main; freeze/reconcile still simulated until wired' }),
  f('ops.notifications', 'Event-driven fan-out: in-app, push, email, SMS', { module: 'core-ops', phase: '5', dependsOn: ['infra.events'] }),

  // ── PHASE 5P · PROTOCOL P2–P3 ────────────────────────────────────────────
  f('chain.rust-core', 'Rust CLOB execution engine', { module: 'chain', phase: '5P', plane: 'P', status: 'socket', dependsOn: ['chain.mainnet'] }),
  f('chain.validators', 'Validator set opening, published schedule', { module: 'chain', phase: '5P', plane: 'P', dependsOn: ['chain.mainnet'] }),
  f('chain.governance', 'Governance parameter handover', { module: 'chain', phase: '5P', plane: 'P', dependsOn: ['chain.validators', 'token.governance'] }),

  // ── §13 · DELIBERATELY NOT IN v1 ─────────────────────────────────────────
  f('socket.rust-matching', 'Rust port of svc-matching', { module: 'matching', phase: '5', status: 'socket', dependsOn: ['matching.engine'] }),
  f('socket.live-issuer', 'Live card issuer rail', { module: 'bank', phase: '5', status: 'socket', dependsOn: ['bank.cards'] }),
  f('socket.psp-partners', 'PayPal / Stripe / live acquiring rails', { module: 'pay', phase: '5', status: 'socket', dependsOn: ['pay.rails'] }),
  f('socket.vr-client', 'VR lobby client', { module: 'academy', phase: '5', status: 'socket', dependsOn: ['academy.spatial'] }),
  f('socket.mpc-custody', 'MPC custody for self-custody wallets', { module: 'protocol', phase: '5P', plane: 'P', status: 'socket', dependsOn: ['protocol.smart-accounts'] }),
  f('socket.ledger-sharding', 'Per-asset hash chains with cross-shard anchor', { module: 'ledger', phase: '5', status: 'socket', dependsOn: ['ledger.double-entry'] }),

  // §13 sockets opened by protocol.smart-accounts. The contracts exist and are
  // reviewed; nothing compiles or runs them yet, and nothing in contracts/ may
  // reach a chain holding real value until the first two of these are closed.
  f('socket.contract-toolchain', 'Foundry + contract test suite in CI', { module: 'protocol', phase: '3P', plane: 'P', status: 'socket', dependsOn: ['protocol.smart-accounts'], note: 'Solidity is written and cross-checked from TypeScript, but never executed. Blocks any mainnet deploy.' }),
  f('socket.contract-audit', 'External audit of the account + factory suite', { module: 'protocol', phase: '3P', plane: 'P', status: 'socket', dependsOn: ['socket.contract-toolchain'] }),
  f('socket.userop-differential-test', 'getUserOperationHash checked against a live EntryPoint', { module: 'protocol', phase: '3P', plane: 'P', status: 'socket', dependsOn: ['socket.contract-toolchain'] }),
  f('socket.p256-verifier', 'Passkey (P-256) owner verifier contract', { module: 'protocol', phase: '3P', plane: 'P', status: 'socket', dependsOn: ['protocol.smart-accounts'], note: 'SmartAccount already routes contract owners through ERC-1271; the verifier itself is not built.' }),
  f('socket.social-recovery', 'Guardian-based account recovery', { module: 'protocol', phase: '5P', plane: 'P', status: 'socket', dependsOn: ['protocol.smart-accounts'], note: 'Deliberately absent: a guardian is a second party who can take the account, and the platform must never be one.' }),
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
