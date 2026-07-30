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
    note: 'API keys: create/list/revoke on /trpc + public apiKeys.exchange → short-lived access JWT the edge already verifies. Key scopes only; no refresh; interactive-only scopes stay off keys. Sub-accounts: create/list/revoke soft-disable (revoked flag; no hard DELETE — ledger owner id must survive).',
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
    status: 'done',
    dependsOn: ['trade.spot'],
    requires: ['services/svc-trade'],
    note: 'Shipped on main: convert.quote + convert.execute on mounted /trpc (RFQ + house spread → market IOC, same hold→fill; TRADE_CONVERT_ENABLED defaults on). Money-path suite in trade-service convert describe + convert/quote unit tests. Local svc-trade suite green (102 passed; money-path needs Postgres — skipped when DB down). CI org billing may block Actions re-prove; edge product-check optional remaining.',
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
  f('trade.forex', 'Fiat pairs on the same engine', {
    module: 'trade',
    phase: '2',
    dependsOn: ['trade.spot', 'pay.rails'],
    note: 'NOT started as a product. What exists: the instrument model (asset_class + schedule on trade.markets) and venue-hours enforcement on order-create — #102 added assertMarketOpen before the hold, so a weekend EUR/USD order is refused with trade.market_closed rather than funded. Hours coverage completed since: the unrecognised-schedule fail-safe (rows.ts casts the DB enum with no runtime parse, so an enum added without a TRADING_SCHEDULES entry must refuse, not throw), the cme-globex daily settlement break, Chicago DST, and an end-to-end proof that a closed venue takes no hold and writes no intent row. Still missing for the actual feature: fiat settlement rails, so no forex market is listed in production.',
  }),
  f('trade.algo', 'TWAP / VWAP / POV execution', { module: 'trade', phase: '2', dependsOn: ['trade.spot'] }),
  f('trade.ccxt-api', 'CCXT-compatible public API (bots + terminals connect)', {
    module: 'trade',
    phase: '2',
    dependsOn: ['trade.spot'],
    note: 'partial — public REST: markets, orderbook, ticker, tickers, trades (tape; ?since= ms), ohlcv (route exists, always [] until candle aggregation job — no inventing candles; ohlcv empty); private REST (edge-signed principal, fail-closed): GET orders/open|closed (?since= ms on closed), GET orders/:id, POST orders (placeOrder money path, trade:write + jurisdiction), DELETE orders/:id (cancelOrder), DELETE orders[?symbol=] (cancelAllOrders, sequential money path), GET account/trades (myFills; ?symbol= filter + ?since= ms), GET account/fees (published maker/taker bps per symbol; {} when none), GET account/balance (ledger projection, real self-only balances — not stub), GET positions (positions empty [] until trade.futures; setLeverage/setMarginMode not mounted). Still open: OHLCV empty (no candle job), futures leverage/margin when trade.futures exists. Private WS is under `ws.gateway` (/private/stream), not this REST surface. LIVE PROBE 2026-07-30 found orderbook/ticker **502 MatchingUnavailable** when matching returned 404 for never-journalled markets; **#185** fixed that code path — empty/missing book is now honest empty depth `[]` (not engine-down 502). Residual: svc-matching still derives markets from journal replay only, so books stay empty until an order lands or trade.mm-bot seeds depth — bots may still see empty books, not "exchange down", until seeding. OHLCV remains [] until candle job.',
  }),
  f('trade.mm-bot', 'Internal market-maker seeding books at launch', { module: 'trade', phase: '2', dependsOn: ['trade.spot'] }),
  f('venue.aggregation', 'External venue adapters via CCXT (cross-venue)', {
    module: 'trade',
    phase: '2',
    status: 'ready',
    dependsOn: ['trade.spot'],
    requires: ['packages/venue-adapter', 'packages/venue-contracts'],
    note: 'Updated 2026-07-30. NOT "via CCXT" — §27 forbids a third-party connectivity library in the money path and there is no `ccxt` in the workspace by design; we are that layer. What now exists: `packages/venue-contracts` (the §27 unified schema — markets carrying a TICK not a decimal count, sequenced books, funding/borrow/trade prints, account state typed explicitly as an OBSERVATION of a third party and never a ledger input, and a wire reader that REFUSES a JSON number rather than coercing it) and a fabric in `packages/venue-adapter/src/fabric`: a sequenced book tracker that WITHHOLDS the book on a gap instead of patching over it (mutation delegated to `@intafaced/market-data` `applyDelta`), a feed that subscribes-then-buffers-then-snapshots and refuses to join when the REST snapshot predates the stream, a per-venue weighted rate-limit governor that refuses rather than silently waits and believes a 429/418 over its own arithmetic, latency grading on p95 + reject rate + staleness fed into routing through `VenueHealth` alone, and median-based cross-venue divergence detection that reports INCONCLUSIVE on fewer than three venues rather than calling one venue a consensus. One real venue: Binance spot public market data (markets, depth snapshot, WS depth at 100ms with `U`/`u` ranges, trade tape) behind injected transport ports. 137 tests in the package. Still `ready`, not `done`: (1) nothing outside the package imports the fabric — no service mounts it, so nothing is aggregated in production; (2) the TRADING half is deliberately NOT BUILT — `BinanceSpotTrade`/`BinanceSpotAccount` throw `VenueCredentialsMissingError` with no key and `VenueUnavailableError(not_ready)` with one, because a plausible rejection would let a router report a fill that never happened; (3) the Venue Vault (per-user HSM-backed trade-only keys) does not exist; (4) one venue only, and no live-network test runs in CI.',
  }),
  f('web.terminal', 'Pro terminal — depth, charts, hotkeys, sub-accounts', {
    module: 'trade',
    phase: '2',
    dependsOn: ['trade.spot', 'infra.ui-tokens', 'ws.depth'],
    note: 'Order entry, market list, open orders and fills are wired to svc-trade through svc-edge, and the DEX/CEX plane switch is live against svc-protocol. DEPTH is live: terminal streams snapshot+deltas from services/svc-ws and withholds the book on a gap. Public TRADE tape is now wired in the terminal (`LiveTradeTape` → svc-ws `channel=trades`, decimal-string prints only, no candles). Still missing from the four words in the title: CHARTS (no candle store / OHLCV always []; tape is live, chart socket remains honest), HOTKEYS and SUB-ACCOUNTS (not started). Those render as §13 sockets with the reason on screen. `dependsOn` is `ws.depth` not `ws.gateway` so the book is not blocked on positions.',
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
    note: 'Depth done + public TRADE tape + private orders/fills on /private/stream (orderUpdated+fillSettled, JWT). Futures positions still missing — title names four streams; three of four is not done.',
  }),

  // ── PHASE 3 · PAY + P2P ──────────────────────────────────────────────────
  f('pay.gateway', 'Branded gateway, hosted checkout, payment links', {
    module: 'pay',
    phase: '3',
    status: 'wip',
    owner: 'Nitro',
    dependsOn: ['ledger.double-entry'],
    requires: ['services/svc-pay'],
    note: 'Updated 2026-07-30 (2): the hosted PAGE is now a hosted CHECKOUT — pay.checkout_sessions turns a link into a payment. checkout.open / checkout.status on tRPC (publicProcedure — no principal, because a hosted checkout takes money from someone who is not logged in) plus POST /checkout/session and GET /checkout/session/:token as HTML. THE SESSION IS THE FRAUD BOUNDARY: the amount is frozen server-side at open and a payer-supplied amount on a fixed-amount link is IGNORED, not compared; there is no rail input anywhere and the rail comes from PAY_CHECKOUT_RAILS (default crypto-native ONLY — card-sandbox is deliberately absent); a session completes only when a verified rail webhook drives the payment to captured, never from the browser. NEW POSTURE GATE assertRailMayAcceptPublicPayment, stricter than assertRailMayMoveValue: sandbox authorize/capture stay allowed for a MERCHANT integration (platform goes short, reconciliation catches it) but are refused for an anonymous payer who is shown "paid" while the merchant is credited clearing they can settle and withdraw. So under live-only the public path refuses with pay.checkout_rail_not_live -> SERVICE_UNAVAILABLE BEFORE any row is written — meaning hosted checkout refuses every payer in staging/prod today. That is the honest state, not a regression. Links hardened: expiry defaulted (30d) and capped (365d), "never expires" refused, opt-in maxUses, revocation one-way and deliberately non-cancelling for payers already in flight. Page: no script at all (CSP default-src none, meta-refresh poll), frame-ancestors none, no-store, no-referrer, still no card fields. A SESSION EXPIRING DOES NOT EXPIRE THE PAYMENT — a late payer still books, proven end to end. Still wip: no live rail, no card acquiring, merchant onboarding still blocked on pay:write.',
  }),
  f('pay.psp', 'PSP mode — own the merchant, digital KYB, custom pricing', { module: 'pay', phase: '3', dependsOn: ['pay.gateway'] }),
  f('pay.payfac', 'PayFac mode — sub-merchant trees, 14 permission areas', { module: 'pay', phase: '3', dependsOn: ['pay.psp'] }),
  f('pay.rails', 'RailAdapter interface + crypto-native + card-sandbox', {
    module: 'pay',
    phase: '3',
    status: 'ready',
    dependsOn: ['pay.gateway'],
    requires: ['services/svc-pay/src/rails'],
    note: 'Updated 2026-07-30: interface + conformance kit are real and tested; NEITHER v1 RAIL MOVES REAL VALUE and the code now says so. Every adapter declares `mode: live|sandbox` (conformance kit refuses one that does not); crypto-native derives its mode from the chain port, so MemoryChain makes it a sandbox whatever §13 says. Two gates in rails/posture.ts: APP_ENV staging/prod REFUSES TO BOOT with any sandbox rail registered unless PAY_ALLOW_SANDBOX_RAILS=true, and payout/refund re-check at the call site before the ledger moves (pay.rail_not_live -> SERVICE_UNAVAILABLE). Production chain default is now UnconfiguredChain, which refuses every call instead of returning a fabricated txHash. /ready and railHealth carry mode. Still `ready` not `done`: no live rail exists — see README for exactly what the owner must obtain.',
  }),
  f('pay.user-money', 'User deposit + withdrawal — the two paths off the merchant path', {
    module: 'pay',
    phase: '3',
    status: 'ready',
    dependsOn: ['pay.rails', 'ledger.recipes'],
    requires: ['services/svc-pay'],
    note: 'Updated 2026-07-30: deposit.credit (admin:treasury) and withdrawal.* (trade:withdraw INTERACTIVE_ONLY + 2FA / trade:read) are reachable on mounted /trpc via svc-edge /api/pay — edge-signed principal required (router.mount.test.ts). Double-submit now proven under CONCURRENCY, not just sequential retry: two identical withdrawals in flight at once debit once and carry ONE rail idempotency key; a redelivered deposit credits once; two concurrent affordable-alone withdrawals cannot overdraw. Money-path suite against real Postgres, now on intafaced_test (it was defaulting to the shared intafaced DB and TRUNCATE-ing live rows). Still not `done`: depends on pay.rails, which has no live rail — a sandbox payout is refused before anything moves rather than fabricating a `sent`.',
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
    note: 'Core + contracts on main; /trpc mounted; edge /api/protocol + web health/predictAddress product path. Factory/impl default 0x0 and PROTOCOL_RPC_URL is outside compose (no chain in stack). predict/buildDeployment refuse zero factory/impl. 2026-07-30 honesty pass: every chain-dependent path refuses with a typed code instead of an opaque 500. chain/availability.ts separates transport failure (protocol.chain_unreachable) from an absent contract (protocol.contract_not_deployed) and a wrong-chain RPC (protocol.chain_id_mismatch); router maps them to 503 with the code intact. sessionStatus had no try/catch and could answer exists:false — indistinguishable from "the owner granted nothing" — when nothing had been read; it now proves code at the address first. New chainStatus returns reachable/observedChainId/usable as DATA so a surface renders the outage instead of catching a throw. 2026-07-30 LOCAL DEV CHAIN: docker-compose.yml now runs anvil as the dev-only `evm` service (# no-deploy, ephemeral, port 8545) and the Solidity is COMPILED for the first time — solc 0.8.28 pinned as a devDependency, artefacts committed under contracts/out with a sourceHash the suite re-derives. CREATE2 CROSS-CHECK PROVEN: the TypeScript derivation in accounts/address.ts and AccountFactory.getAddress agree across 25 owner/salt pairs, run against the deployed factory (create2-onchain.test.ts); the account also lands at the predicted address, is owned by the user and not the relayer, and its runtime code is byte-identical to the EIP-1167 proxy the init code hashes. predictAddress / buildDeployment / sessionStatus / claimAccount now return real values through the real ProtocolChain (router.live-chain.test.ts, 13 tests) — including a session granted on chain and read back with a matching specHash. The hand-written abi.ts is now checked against the compiled ABI (inputs, outputs, stateMutability, indexed flags) — it agreed exactly. chainStatus.suiteDeployed is now an eth_getCode READ, with suiteConfigured split out, so wiring real addresses into compose cannot make the service claim contracts that are not there. Found and fixed: relayUserOperation returned an opaque 500 for a malformed signature envelope (SignatureEnvelopeError was unmapped) — now a 400. Refusals unchanged when the chain is absent, now proven against a real closed socket rather than a stub (refusal-without-chain.test.ts). CI runs anvil and sets REQUIRE_EVM_CHAIN=1 so the cross-check cannot silently skip. STILL NOT DONE: a dev chain is not a chain decision — no production network is chosen, no EntryPoint and no bundler exist here so relayUserOperation still refuses, and nothing is audited. Sockets: socket.evm-rpc (svc-indexer still boots NullChainSource), socket.p256-verifier, socket.contract-audit, socket.userop-differential-test.',
  }),
  f('protocol.amm', 'AMM pools from audited templates', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    status: 'wip',
    owner: 'Nitro',
    dependsOn: ['protocol.smart-accounts'],
    requires: ['services/svc-protocol/contracts/amm', 'services/svc-protocol/src/amm'],
    note: 'WIP 2026-07-29: ConstantProductPool + PoolFactory Solidity, pure quote math + unsigned calldata builders on svc-protocol (amm.quoteExactIn / buildCreatePool / buildSwapExactIn / buildMintLiquidity). 2026-07-30: quoteExactIn took reserves as an INPUT and nothing in the repo supplied them — getReserves was in the ABI and called from nowhere, so a correct AMM was a calculator with no inputs. Added chain reads (poolReserves/poolToken0/poolToken1/poolFeeBps) and amm.quoteFromPool, which sources its own reserves, orients them by token0, and refuses a tokenIn the pool does not trade (amm.token_not_in_pool) rather than assuming token1. Both quotes now carry reservesFromChain so a caller can tell a real quote from arithmetic. quoteFromPool refuses in this environment every time — there is no chain. 2026-07-30 THE CONTRACT DOES NOT COMPILE. First time anything ran a Solidity compiler over this tree: ConstantProductPool.swapExactIn calls `swap` at lines 177 and 179, `swap` is declared `external`, and Solidity does not permit an internal call to an external function. So the pool has never produced bytecode and could never have been deployed. Fix is `external` -> `public` or a shared internal `_swap`; deliberately NOT done as a side effect of standing up a dev chain, because it changes a money contract external surface. Pinned in scripts/contract-sources.mjs so the build fails if it starts compiling (or fails differently) without somebody deciding. Not done until that is fixed, the factory is deployed (PROTOCOL_AMM_FACTORY_ADDRESS non-zero) and pool tests run on chain.',
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
    status: 'ready',
    note: "Everything downstream of the chain is on main and mounted: schema-per-service read models (books, fills, positions), block-versioned rows with reorg unwind, idempotent projection, and a permissionless /trpc read API. Routed at svc-edge (/api/indexer). 2026-07-30 THE \"chain ->\" HALF IS NO LONGER PROPPED — socket.evm-rpc is CLOSED. src/chain/evm/ is a real adapter over a real JSON-RPC (viem PublicClient, no wallet client, an ABI carrying three events and zero functions): real block hashes, real parent links, real eth_getLogs. 132 tests, up from 81 — 79 hermetic, 27 on Postgres, 26 on a live anvil. THE REORG IS NOW PROVEN ON A CHAIN THAT REALLY FORKS: every reorg assertion used to run against MemoryChainSource, a fake whose hashes this repo computes and whose forks it stages, so it could not disagree with the code in any way the code had not anticipated. reorg.live.test.ts uses evm_snapshot/evm_revert to make anvil DISCARD blocks the indexer has already read, projected and served, and asserts on both stores that the orphaned level is gone (not merged, not left at zero), that there is one fill and not two, that the position is the winner's, and that the block at that height is a different block. A fork that replaces the tip WITHOUT extending it is caught; a fork deeper than retained history halts instead of unwinding into pruned history. Idempotency proven against real chain data (fresh Indexer applies 0 blocks, byte-identical read model; re-applying every block reports duplicate and changes nothing). STALENESS IS NOW STATED: status carries a LIVE chain probe, behindBy (null when unknown, never zero-by-default) and lastError — a pass that ends in neither progress nor a halt was impossible before a real RPC and freezes the cursor at a plausible number. THREE DECISIONS: logs fetched by BLOCK HASH not block number (a reorg between header-read and log-read staples branch B's logs onto branch A's header); a failure NEVER returns null (that would make a dead endpoint indistinguishable from NullChainSource); the venue's code is re-read every pass (eth_getLogs against an absent contract returns [] forever, which is #210's suiteDeployed lesson in its worse form — a missing contract that makes a read SUCCEED with nothing in it). Money: an on-chain uint256 with 18 implied decimals IS the scaled bigint Amount, no conversion; Number() never touches an amount; amounts >= 10^38 refused because numeric(38,18) cannot hold them. Two bugs found by the new tests: viem memoises getBlockNumber, so the staleness probe could report a cached tip (behindBy lying about staleness); and the by-block-hash fetch had NO test — swapping it to fromBlock/toBlock was a one-line change the whole suite ignored until one was written. Solc toolchain SHARED with svc-protocol (#210) rather than forked — one EXPECTED_SOLC and one SETTINGS in the repo, with assertSolcPinAgrees() covering the one thing an import cannot. NOT `done`: socket.clob-contracts. The three event signatures in evm/abi.ts are declared by this repo and implemented only by contracts/dev/DevVenue.sol, a dev fixture with no book, no matching and no access control. No audited venue exists, INDEXER_VENUE_ADDRESS has no honest default (zero, and the adapter refuses to construct on it), and the compose default is still no chain. That is a contracts problem, not an indexer one — the adapter does not depend on which events it decodes.",
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
  f('blueprint.card', 'Share card render (1080×1350, 1200×630)', {
    module: 'blueprint',
    phase: '4',
    dependsOn: ['blueprint.onboarding'],
    requires: ['services/svc-blueprint'],
    note: 'Composition is DONE and is ours: `card/compose.ts` is a pure function from profile+crew to SVG, mounted at `blueprint.card` (blueprint:read, self-only) and carried in the §7.2 export. Both §7.2 canvases are asserted as literals — 1080×1350 and 1200×630, width/height attributes AND a matching viewBox — plus determinism, in-canvas bounds, tag balance, and a palette check that fails on any hex not in packages/ui tokens. §7.2\'s copy-scan runs on the RENDERED OUTPUT (not only the source) across every profile value the contract allows, with a negative control. The card deliberately carries ZERO personal data — no name, id or date — which is asserted, and is what makes it safe to share. NOT `done` because the "→ PNG" half of §7.1 is a rail this environment does not have: `CardRenderer` is the §0.4 adapter, `UnconfiguredCardRenderer` is what boots without BLUEPRINT_CARD_RENDERER_URL, and it answers `{status:"unavailable", code:"blueprint.card_renderer_unconfigured"}` as DATA so a surface renders the honest state instead of catching a throw. Every HttpCardRenderer failure path is tested to return `unavailable` and NEVER a URL — a fabricated asset URL becomes an og:image and is found as a broken unfurl on someone else\'s timeline. Done when a rasterizer + object storage exist and a real PNG URL lands in `card_asset_url`. OWNER call outstanding: whether a user-supplied display name may appear on the card (it would make a public renderer of arbitrary text in our branding).',
  }),
  f('blueprint.crews', 'Crew matching + mentor shortlist', {
    module: 'blueprint',
    phase: '4',
    status: 'done',
    dependsOn: ['blueprint.onboarding'],
    requires: ['services/svc-blueprint'],
    note: 'The tracker row was stale, the code was not — this is a re-score of work already on main, not new work. Reachable: placement runs inside the mounted `blueprint.onboard`, the shortlist is the mounted `blueprint.mentors`. Placement and mentor scoring are pure deterministic functions (`matching/`), so a re-run lands a user in the SAME crew — asserted, not hoped. Capacity is enforced under `serializable` with the crew row locked; crew ids are derived, so two concurrent "form a crew" calls collide into one instead of stranding two crews of one; and every run writes a `match_runs` row scoring EVERY open crew, so "why am I not with them" is answerable from a row. 38 pure matching tests (28 crew + 10 mentor) plus placement, capacity, concurrency and determinism tests against real Postgres. Self-contained: nothing here waits on another service. `crewMemberCreated` is published for svc-academy lobby routing and has no consumer yet — that is svc-academy\'s feature, not a hole in this one.',
  }),
  f('blueprint.ownership', 'Export + hard delete, cascading', {
    module: 'blueprint',
    phase: '4',
    dependsOn: ['blueprint.onboarding'],
    requires: ['services/svc-blueprint'],
    note: "svc-blueprint's half is complete and mounted; the CASCADE is not, and the title of this feature is the cascade. Not `done` for one reason: `profiles.blueprint_id` lives in svc-identity, §2 forbids us writing it, so erase publishes `blueprintDeleted` and svc-identity is supposed to clear the field — and **no service in this repo subscribes to that event** (`grep -rn blueprintDeleted services/` finds only the catalog and svc-blueprint). The only thing proving the cascade completes is a stand-in consumer inside our own test file, which is rule 3 of `done` (nothing propped up by a mock) failing exactly as written. After an erase today a real `profiles` row keeps a `blueprint_id` pointing at a deleted Blueprint, so §7.2's \"deletion truly cascades\" is not yet true end to end. What IS true and tested against real Postgres: export follows the TABLES rather than the UI — it includes `mentoringOthers` (the shortlists this user appears ON) and excludes crewmates' profiles, who did not consent to being in someone else's export; schemaVersion 2 adds the card, so §7.2's \"export (JSON + card)\" is literally true; erase is a hard delete in one serializable transaction covering mentor rows on BOTH sides, match runs, membership, the blueprint and any crew the departure emptied; and erasing twice returns a receipt of zeroes. Done when svc-identity consumes `blueprintCreated`/`blueprintDeleted` — a one-service PR over there, not more work here.",
  }),
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
  f('academy.lobbies', 'Live lobbies, LiveKit SFU, capacity tiers', {
    module: 'academy',
    phase: '5',
    status: 'done',
    dependsOn: ['identity.rank'],
    requires: ['services/svc-academy'],
    note: 'svc-academy on 4016, mounted at /api/academy. §8.3 capacity tiers free/staked/invite in one pure decideSeat(); seat claimed under FOR UPDATE so a race cannot oversell the last seat; staked tier reads token.stakeOf and fails closed, and only for staked rooms. Hosting gated on §4.1 rank_thresholds.perks.lobbyHostRights read from svc-identity, NOT on the scope — academy:write is now issued to every session so a seat is takeable. Sessions carry a serializable jsonb scene (the §8.3 VR-ready 2D layer). NO SFU: ACADEMY_STREAM_PROVIDER=none, NullStreamProvider REFUSES a join credential rather than fabricating one — socket.stream-provider. Non-custodial: no LEDGER_URL, no ledger client; min_stake is a threshold, never a balance. Curriculum/certs/ambassador pay deliberately not built here.',
  }),
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
    note: 'In-app inbox shipped (svc-notify: list/unreadCount/markRead/markAllRead; bus consumers: fillSettled, p2pEscrowLocked, p2pEscrowReleased, p2pEscrowRefunded, p2pTradeDisputed (openedBy only #157), kycApproved, rankUpdated, stakeCreated, bankMarginCalled; ON CONFLICT dedupe). Multi-channel fan-out now exists: one NotificationChannel adapter interface, per-channel delivery rows with attempted_at kept apart from delivered_at, claim-per-(notification,channel) idempotency, confirmed-address targets, and a retryable/permanent split that decides whether the bus redelivers. NOT done: no out-of-app channel can actually deliver until the owner supplies gateway credentials — until then email, push and SMS refuse every message with channel.not_configured and the refusal is on the record. In-app is the honest fallback and is genuinely delivering.',
  }),
  f('socket.notify-push', 'Push notification channel (device tokens + provider)', {
    module: 'notify',
    phase: '5',
    status: 'socket',
    dependsOn: ['ops.notifications'],
    note: '§13 — adapter shipped (GatewayChannel over an owner-configured URL, device token registered and confirmed per user). Blocked on credentials the owner must obtain, not on code: with none set it refuses every message with channel.not_configured and records it.',
  }),
  f('socket.notify-email', 'Email notification channel', {
    module: 'notify',
    phase: '5',
    status: 'socket',
    dependsOn: ['ops.notifications'],
    note: '§13 — adapter shipped (GatewayChannel over NOTIFY_EMAIL_GATEWAY_URL/TOKEN, address confirmed by a code sent through the channel itself, copy rendered server-side from @intafaced/i18n). Blocked on an outbound mail rail the owner must supply; unconfigured it refuses by name.',
  }),
  f('socket.notify-sms', 'SMS notification channel', {
    module: 'notify',
    phase: '5',
    status: 'socket',
    dependsOn: ['ops.notifications'],
    note: '§13 — adapter shipped (GatewayChannel over NOTIFY_SMS_GATEWAY_URL/TOKEN, E.164 addresses confirmed by code). Blocked on an outbound SMS rail the owner must supply; unconfigured it refuses by name.',
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
  f('socket.stream-provider', 'A real WebRTC SFU behind StreamProvider (§8.3 LiveKit self-hosted)', {
    module: 'academy',
    phase: '5',
    status: 'socket',
    dependsOn: ['academy.lobbies'],
    note: '§13 — the interface exists (services/svc-academy/src/stream/provider.ts) and lobbies run without it: seats, presence, capacity, invites and the 2D scene need no provider. NullStreamProvider REFUSES a join credential by name rather than returning a plausible one, because a lobby that opens against no SFU fails silently in the browser and reads as a broken platform. Needs a self-hosted LiveKit deployment and its API key — neither exists in this environment.',
  }),
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
    note: '2026-07-30 PARTIALLY CLOSED. Solidity is compiled and executed now: solc 0.8.28 pinned in package.json, `contracts:build` emits committed artefacts, and the account suite runs against anvil in CI (REQUIRE_EVM_CHAIN=1) — 31 contract tests including the CREATE2 cross-check. FIRST COMPILE FOUND A BUG NOBODY COULD HAVE SEEN: ConstantProductPool.swapExactIn calls `swap`, which is `external`, so the AMM pool has never produced bytecode and is undeployable. That is pinned as a known-broken suite in scripts/contract-sources.mjs, not silently skipped. Remaining: no Foundry/forge invariant or fuzz suite, no gas snapshots, and no audit — this proves the contracts compile and behave, not that they are safe. Blocks any mainnet deploy.',
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

  // §13 socket CLOSED 2026-07-30 by indexer.readmodels. Kept as a `done` entry
  // rather than deleted: several other notes point at it, and a socket that
  // vanishes reads as a socket nobody ever opened.
  f('socket.evm-rpc', 'A real EVM ChainSource — RPC + log decoding', {
    module: 'indexer',
    phase: '3P',
    plane: 'P',
    status: 'done',
    dependsOn: ['indexer.readmodels'],
    requires: ['services/svc-indexer/src/chain/evm'],
    note: "CLOSED. services/svc-indexer/src/chain/evm/ implements the ChainSource port over a real JSON-RPC: viem PublicClient (no wallet client anywhere under src/), blocks and parent hashes read from the node, logs fetched BY BLOCK HASH so a reorg between the header read and the log read cannot staple one branch's logs onto another's header, and typed refusals (indexer.chain_unreachable / chain_id_mismatch / venue_not_deployed / malformed_block) instead of a null that would be indistinguishable from \"no chain configured\". Proven against the anvil dev chain #210 stood up, including a real evm_snapshot/evm_revert fork on a dedicated second node (`evm-reorg`, port 8546 — evm_revert rewinds the whole node, so sharing 8545 would rewind svc-protocol's factory out from under its own live tests). What remains is socket.clob-contracts: the event signatures the adapter decodes are declared by this repo and no audited venue emits them.",
  }),
  // The half of the old socket.evm-rpc that was never an indexer problem.
  f('socket.clob-contracts', 'An audited venue contract emitting the indexed event surface', {
    module: 'indexer',
    phase: '3P',
    plane: 'P',
    status: 'socket',
    dependsOn: ['indexer.readmodels'],
    note: 'services/svc-indexer/src/chain/evm/abi.ts declares three events — BookLevel, Fill, Position — and abi.test.ts holds them to the compiled ABI of contracts/dev/DevVenue.sol. DevVenue is a DEV FIXTURE and says so in its own header: no order book, no matching, no custody, and no access control at all (anyone can publish any trade). It exists so the adapter decodes logs a real chain produced. INDEXER_VENUE_ADDRESS therefore has no honest default — it is the zero address, EvmChainSource refuses to construct on it (eth_getLogs against 0x0 returns [] forever, which would fill the read model with a confident permanent "no liquidity"), and docker-compose.apps.yml leaves INDEXER_RPC_URL empty so the shipped stack still boots NullChainSource. Blocked on there being a venue contract to read, which is a contracts decision and not an indexer one: the adapter does not depend on which events it decodes.',
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
