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
  f('infra.ui-tokens', 'Design tokens + console primitives', {
    module: 'core-ops',
    phase: '0',
    status: 'done',
    owner: 'Nitro',
    requires: ['packages/ui'],
  }),
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
    owner: 'Nitro',
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
    note: 'Base keys on main. **Reclaimed 2026-08-04** from Shehzad M5 — Nitro agents own remaining money-routing graph (no cross-leak). Class M. Do not invent money routing.',
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
  f('token.yield', 'Operator-settled staker payout (§4.3 weekly job NOT built)', {
    module: 'token',
    phase: '1',
    status: 'socket',
    requires: ['services/svc-token'],
    note: 'CORRECTED 2026-08-03, was `done` "live path". The PAYOUT is real and stays real: distributeRevenue sweeps fee sources and pays stakers pro-rata by stake x snapshotted multiplier through ledger recipes, resumable per (window,user), and it is tested. What §4.3 actually specifies — "weekly job aggregates house fee accounts per asset" — does not exist. distributeRevenue has ZERO callers outside its own tests: no cron, no bus subscriber, and no admin form (apps/admin has jurisdiction/launch/ledger pages and no treasury page). The only live entry is the tRPC mutation at router.ts:300, which a human holding admin:treasury + MFA must invoke by hand. sources[].amount is trusted operator input validated only for decimal shape (router.ts:305-310); nothing reads the real houseFees balance, so the sum distributed is whatever an operator types (audit T-03). Correct money maths behind a manual operator action is not an automated flywheel and must not be described as one. Socket, not done: the missing half is the aggregation job and a service-side window claim.',
  }),
  f('token.buyback', 'Operator-recorded burn (no buyback — nothing is bought)', {
    module: 'token',
    phase: '1',
    status: 'socket',
    requires: ['services/svc-token'],
    note: 'CORRECTED 2026-08-03, was `done` "live path". There is no buyback. §4.3 specifies "market-buy on internal book -> split to burn address account + rewards engine account. Structural, scheduled." What ships is recordBuyback: tokensBought is operator-typed input (router.ts:346), revenueTotal is an unvalidated jsonb blob from the same caller, and the ONLY ledger movement is a burn debited from the rewards engine (token-service.ts:771-775). No purchase is executed anywhere, so nothing is bought back and no buy pressure exists. buybackBudget(), the function that would size the spend from revenue, has no caller in the repo outside its own tests (economics/buyback.ts:73) — tested dead code. The burn destination is house/burn (packages/ledger-client/src/accounts.ts:155-157), an ordinary operator-owned internal ledger account of kind `available`; "never move again" (recipes/index.ts:857) is a convention, not an enforced invariant. Socket until svc-trade can execute a real market-buy.',
  }),
  f('token.governance', 'Proposals + IFC-weighted ballots — outcome NOT built (§4.3)', {
    module: 'token',
    phase: '1',
    status: 'socket',
    dependsOn: ['token.staking'],
    requires: ['services/svc-token'],
    note: 'CORRECTED 2026-08-03, was `done`. The BALLOT is real: createProposal / castVote / listProposals / getProposal are mounted, weight is a stakeOf snapshot taken inside the vote transaction so a concurrent unstake cannot race it (token-service.ts:1021-1029), zero weight is refused, and one-ballot-per-user is a unique index. The OUTCOME does not exist. proposal_status declares passed/rejected/executed/cancelled (db/schema.ts:50) and NO code anywhere in the repo writes any of the four — the only status write in svc-token is the draft/open choice made once at insert (token-service.ts:950), and there is no UPDATE token.proposals statement in the tree. No quorum, no pass threshold, no tally job, no close job, no executor. getProposal does compute a read-time tally (token-service.ts:1140-1175) — correct as far as it goes, and acted on by nothing. Worse than the audit found: a proposal created with a future opensAt is `draft` and nothing can ever flip it to `open`, so it can never be voted on at all. Deliberately socketed rather than built: quorum and threshold are numbers an agent must not invent, three of the four proposal kinds execute across a service boundary (listing -> svc-trade, curriculum -> svc-academy, fee_param -> token_params), and `grant` moves value, which is a ledger recipe and an owner carve-out (DIRECTION §3). A tally job that only flips a status column would look like an action and be none — strictly worse than saying it is not built, because users vote believing it decides something.',
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
    status: 'ready',
    dependsOn: ['trade.spot'],
    note: '**Reclaimed 2026-08-04** from Shehzad M3 — Nitro agents implement only from tip product law or honest thin §13. Never invent mid/funding. Denon owns product-law invent.',
  }),
  f('trade.options', 'European options, cash-settled, full collateral in v1', {
    module: 'trade',
    phase: '2',
    dependsOn: ['trade.futures'],
  }),
  f('trade.otc', 'OTC RFQ desk, staked-tier gate', {
    module: 'trade',
    phase: '2',
    dependsOn: ['trade.spot', 'token.staking'],
    note: '**Reclaimed 2026-08-04** from Shehzad M4 — agents implement thin/§13 from tip law. Never invent OTC product truth.',
  }),
  f('trade.copy', 'Copy trading, audited leaders, profit share', {
    module: 'trade',
    phase: '2',
    plane: 'B',
    dependsOn: ['trade.spot'],
    note: '**Reclaimed 2026-08-04** from Shehzad M4 — agents implement thin/§13 from tip law. Never invent copy product.',
  }),
  f('trade.forex', 'Fiat pairs on the same engine', {
    module: 'trade',
    phase: '2',
    dependsOn: ['trade.spot', 'pay.rails'],
    note: 'NOT started as a product. What exists: the instrument model (asset_class + schedule on trade.markets) and venue-hours enforcement on order-create — #102 added assertMarketOpen before the hold, so a weekend EUR/USD order is refused with trade.market_closed rather than funded. Hours coverage completed since: the unrecognised-schedule fail-safe (rows.ts casts the DB enum with no runtime parse, so an enum added without a TRADING_SCHEDULES entry must refuse, not throw), the cme-globex daily settlement break, Chicago DST, and an end-to-end proof that a closed venue takes no hold and writes no intent row. Still missing for the actual feature: fiat settlement rails, so no forex market is listed in production.',
  }),
  f('trade.algo', 'TWAP / VWAP / POV execution', {
    module: 'trade',
    phase: '2',
    dependsOn: ['trade.spot'],
    note: '**Reclaimed 2026-08-04** from Shehzad M4 — agents implement thin/§13 from tip law. Never invent algo product.',
  }),
  f('trade.ccxt-api', 'CCXT-compatible public API (bots + terminals connect)', {
    module: 'trade',
    phase: '2',
    dependsOn: ['trade.spot'],
    note: 'partial — public REST: markets, orderbook, ticker, tickers, trades (tape; ?since= ms), ohlcv (live fill aggregation #345 + materialize job default OFF TRADE_CANDLE_JOBS_*; honest [] when never traded; never invent candles); private REST (edge-signed principal, fail-closed): GET orders/open|closed (?since= ms on closed), GET orders/:id, POST orders (placeOrder money path, trade:write + jurisdiction), DELETE orders/:id (cancelOrder), DELETE orders[?symbol=] (cancelAllOrders, sequential money path), GET account/trades (myFills; ?symbol= filter + ?since= ms), GET account/fees (published maker/taker bps per symbol; {} when none), GET account/balance (ledger projection, real self-only balances — not stub), GET positions (open futures rows when present; [] when none — never invent); POST/DELETE positions with required exitPrice on close (realized PnL via planClose). setLeverage/setMarginMode still not mounted. Still open: OHLCV empty (no candle job); futures jobs default OFF; live index/matching seed residual. Private WS is under `ws.gateway` (/private/stream), not this REST surface. LIVE PROBE 2026-07-30 found orderbook/ticker **502 MatchingUnavailable** when matching returned 404 for never-journalled markets; **#185** fixed that code path — empty/missing book is now honest empty depth `[]` (not engine-down 502). Residual: svc-matching still derives markets from journal replay only, so books stay empty until an order lands or trade.mm-bot seeds depth — bots may still see empty books, not "exchange down", until seeding. OHLCV remains [] until candle job.',
  }),
  f('trade.mm-bot', 'Internal market-maker seeding books at launch', {
    module: 'trade',
    phase: '2',
    status: 'ready',
    owner: 'Nitro',
    dependsOn: ['trade.spot'],
    note: 'Updated 2026-08-02: seedMarket + job OFF default + marketMakerMakerFill + settleFill house-MM; cancel/reseed lifecycle + mid port (env map then optional venue public mid TRADE_MM_SEED_MID_FROM_VENUE, never invent) on main (MM-1/2/3). Still residual: orderFilled event accountId recovery, production mid ops. Not Done — ready with ops kill-switches.',
  }),
  f('venue.aggregation', 'External venue adapters via CCXT (cross-venue)', {
    module: 'trade',
    phase: '2',
    status: 'ready',
    dependsOn: ['trade.spot'],
    requires: ['packages/venue-adapter', 'packages/venue-contracts'],
    note: 'Updated 2026-08-02 A-TRADE-VENUE-OPS. NOT "via CCXT" — §27 forbids a third-party connectivity library in the money path and there is no `ccxt` in the workspace by design; we are that layer. Fabric: packages/venue-contracts + packages/venue-adapter (Binance spot public market data only; trading half deliberately not ready). Mounted in svc-trade: TRADE_VENUE_MARK_VENUE + TRADE_VENUE_MARK_SYMBOLS default empty/OFF — when set to binance-spot + marketId:symbol map, public book mid preferred for futures marks (A-TRADE-VENUE-1); optional TRADE_MM_SEED_MID_FROM_VENUE for MM mid after env map miss (A-TRADE-MM-3). Ops enable path: services/svc-trade/README.md "Venue fabric mark". Never invents mid (empty venue, unknown id, unmapped market, empty book → null). Still `ready`, not `done`: (1) one public venue only — second venue needs a real MarketDataAdapter + createVenueMarketDataAdapter id; (2) TRADING half NOT BUILT (credentials throw not_ready); (3) Venue Vault absent; (4) no live-network CI; (5) futures risk truth remains human M3.',
  }),
  f('web.terminal', 'Pro terminal — depth, charts, hotkeys, sub-accounts', {
    module: 'trade',
    phase: '2',
    status: 'wip',
    owner: 'Nitro',
    dependsOn: ['trade.spot', 'infra.ui-tokens', 'ws.depth'],
    requires: ['docs/adr/2026-08-03-retire-apps-web-port-to-vue-shell.md'],
    note: "Repointed 2026-08-03 (ADR `docs/adr/2026-08-03-retire-apps-web-port-to-vue-shell.md`): the terminal is the vendored Vue desk, not the retired Next scaffold — this row previously named both codebases at once. On the shell today: order entry, blotter, depth and public tape against svc-edge; real OHLCV candles via `assets/js/market-chart/kline.js` (lightweight-charts, honest [] when never traded); hotkeys #337, honesty #349, sub-account selector #358, a11y #367. NOT done, and the three gaps are the ported scaffold's strengths: (1) no live feed at all — `Exchange.vue:1020` hardcodes `feedLive: false` and the screen says so; the sequenced-delta + gap-resnapshot client is still to port; (2) no runtime shape validation of edge responses; (3) `bignumber.min.js` is vendored but `ix-trade.js` does not reference it, so desk arithmetic is not yet decimal-safe. `dependsOn` is `ws.depth` not `ws.gateway` so the book is not blocked on positions.",
  }),
  f('web.shell', 'Product shell — the served customer surface', {
    module: 'core-ops',
    phase: '2',
    status: 'done',
    owner: 'Nitro',
    requires: ['docs/adr/2026-08-03-retire-apps-web-port-to-vue-shell.md'],
    note: 'REPOINTED 2026-08-04 and the scaffold DELETED in the same commit, per ADR `docs/adr/2026-08-03-retire-apps-web-port-to-vue-shell.md` — `requires` names the ADR rather than the shell directory for the same brand-scan reason `web.terminal` does (#741). This row now means the vendored Vue shell served on :8090 — the sole product surface (doctrine §5.3). `dependsOn: infra.ui-tokens` is removed rather than kept: it was false of the shell, which defines its own 204 `--ix-*` variables in `assets/css/intafaced.css` and imports `@intafaced/ui/tokens.css` nowhere. What the deleted scaffold held is not lost — each capability has a live equivalent on the shell, named here so nobody re-derives it: runtime response validation `lib/api/wire.ts` → `assets/js/ix-wire.js`; decimal-safe desk arithmetic `lib/money.ts` → `assets/js/ix-money.js` (bignumber.js, not bigint — the vendor tree is outside the pnpm workspace and its webpack 3 build cannot parse `0n`); sequenced-delta depth client with gap resnapshot `lib/market/depth-controller.ts` → `assets/js/ix-depth-feed.js` (#748); the fabricated-money test fixture → promoted into the CI gate `tooling/ci/fabricated-money-scan.mjs`. Deliberately dropped with reasons recorded in the ADR: grid-backdrop (idiom conflict, not quality), data-table and depth-ladder (the shell keeps loading/failed/empty as three states where these kept two), Next routing and layout. Full pre-deletion tree recoverable at tag `apps-web-retired-2026-08-04`.',
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
    note: 'Updated 2026-07-31: positions channel receives positionUpdated from trade.futures open/close (#281). Still wip product gateway.',
  }),

  // ── PHASE 3 · PAY + P2P ──────────────────────────────────────────────────
  f('pay.gateway', 'Branded gateway, hosted checkout, payment links', {
    owner: 'Nitro',
    module: 'pay',
    phase: '3',
    status: 'wip',
    dependsOn: ['ledger.double-entry'],
    requires: ['services/svc-pay'],
    note: '**Reclaimed 2026-08-04** from Shehzad M1 — Nitro agents after #346 handoff. Crypto rail on main (#226). Card sandbox residual Class M. Not go-live.',
  }),
  f('pay.psp', 'PSP mode — own the merchant, digital KYB, custom pricing', {
    module: 'pay',
    phase: '3',
    dependsOn: ['pay.gateway'],
    note: '**Reclaimed 2026-08-04** M1 expand — Nitro agents Class M.',
  }),
  f('pay.payfac', 'PayFac mode — sub-merchant trees, 14 permission areas', {
    module: 'pay',
    phase: '3',
    dependsOn: ['pay.psp'],
    note: '**Reclaimed 2026-08-04** M1 expand — Nitro agents Class M.',
  }),
  f('pay.rails', 'RailAdapter interface + crypto-native + card-sandbox', {
    module: 'pay',
    phase: '3',
    status: 'done',
    // Rails do not wait on hosted checkout — the adapter layer shipped first and
    // the live EvmLiveChain path is independent of payment links.
    dependsOn: ['ledger.double-entry'],
    requires: ['services/svc-pay/src/rails'],
    note: 'Updated 2026-07-31: LIVE-capable crypto rail exists — NOT "go-live complete". `EvmLiveChain` implements CryptoChainPort with posture:live (viem Public+Wallet client, HD acceptance addresses from PAY_CRYPTO_DEPOSIT_MNEMONIC, hot-wallet outbound via PAY_CRYPTO_HOT_WALLET_KEY, asset map PAY_CRYPTO_ASSETS). BroadcastStore claim→send→put-before-receipt ordering (single-process MemoryBroadcastStore wired today). defaultChainFor builds it when PAY_CRYPTO_RPC_URL(+keys) are set; otherwise UnconfiguredChain in staging/prod and MemoryChain in dev/test. In-process CryptoChainWatcher POSTs signed webhooks. staging/prod omit card-sandbox by default so boot posture can pass with only live crypto. Proven: unit + broadcast claim suite + optional anvil. Residuals that BLOCK production go-live (named, not waved): durable multi-replica BroadcastStore still required; address book + watcher are in-process; production RPC/custody are owner-supplied (anvil ≠ chain decision); card acquiring remains a §13 commercial socket. `done` means the adapter + live path exist under env — not that ops may turn on mainnet without those residuals.',
  }),
  f('pay.user-money', 'User deposit + withdrawal — the two paths off the merchant path', {
    module: 'pay',
    phase: '3',
    status: 'done',
    dependsOn: ['pay.rails', 'ledger.recipes'],
    requires: ['services/svc-pay'],
    note: 'Updated 2026-07-31: unblocked by live crypto-native. deposit.credit + withdrawal.* remain mounted; under live-only a crypto-native withdrawal can now pass assertRailMayMoveValue when EvmLiveChain is configured (sandbox still refused). Concurrent double-submit + conservation suites unchanged. Residual: operator hand-credit still defaults to card-sandbox (skipped when that adapter is not registered); on-chain user deposits for the retail path are the watcher→webhook→capture loop, not deposit.credit.',
  }),
  f('pay.routing', 'Smart routing — geo, method, risk, approval rate', {
    module: 'pay',
    phase: '3',
    dependsOn: ['pay.rails'],
    note: '**Reclaimed 2026-08-04** M1 expand — Nitro agents Class M.',
  }),
  f('pay.settlement', 'Dual settlement — bank or crypto', {
    module: 'pay',
    phase: '3',
    dependsOn: ['pay.rails'],
    note: '**Reclaimed 2026-08-04** M1 expand — Nitro agents Class M.',
  }),
  f('pay.fraud', 'Risk scoring, chargebacks, decline recovery', {
    module: 'pay',
    phase: '3',
    dependsOn: ['pay.gateway'],
    note: '**Reclaimed 2026-08-04** M1 expand — Nitro agents Class M.',
  }),
  f('pay.subscriptions', 'Recurring — card and crypto', {
    module: 'pay',
    phase: '3',
    dependsOn: ['pay.gateway'],
    note: '**Reclaimed 2026-08-04** M1 expand — Nitro agents Class M.',
  }),
  f('pay.plugins', 'Woo / Magento / OpenCart plugins', {
    module: 'pay',
    phase: '3',
    dependsOn: ['pay.gateway'],
    note: '**Reclaimed 2026-08-04** M1 expand — Nitro agents Class M.',
  }),
  f('pay.public-api', 'Public REST + webhooks + sandbox (§9)', {
    module: 'pay',
    phase: '3',
    plane: 'B',
    dependsOn: ['pay.gateway', 'identity.apikeys'],
    note: '**Reclaimed 2026-08-04** M1 expand — Nitro agents Class M.',
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
    note: "Reputation module on main. This row's title was only nearly true for a while, and the gap is worth recording: svc-p2p published xpEarned and NOTHING consumed it, so P2P reputation did not reach the XP graph — svc-identity wrote rank_state from its own auth flows and its serviceProcedure only, and every rank shown to a P2P user was short by what they had earned. Closed by subscribeXpEvents in services/svc-identity/src/events.ts (ADR D-S-13 Class B). The producers' idempotency keys already matched identity.xp_events.idempotency_key, so no key translation and no migration were needed.",
  }),
  f('p2p.merchants', 'P2P merchant programme — badges, limits, API', { module: 'p2p', phase: '3', dependsOn: ['p2p.reputation'] }),

  // ── PHASE 3P · PROTOCOL PLANE P0 ─────────────────────────────────────────
  f('protocol.smart-accounts', 'Passkey smart accounts, session keys (§17.4)', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    status: 'ready',
    owner: 'shehzad002',
    dependsOn: ['identity.accounts'],
    requires: ['services/svc-protocol'],
    note: 'HUMAN Protocol Plane @shehzad002 (2026-08-04 sole chain lock). Deploy + adversarial audit package. Agents babysit only. Not go-live Class X.',
  }),
  f('protocol.amm', 'AMM pools from audited templates', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    status: 'ready',
    owner: 'shehzad002',
    dependsOn: ['protocol.smart-accounts'],
    requires: ['services/svc-protocol/contracts/amm', 'services/svc-protocol/src/amm'],
    note: 'HUMAN Protocol Plane @shehzad002 after SA. Agents babysit only.',
  }),
  f('protocol.lending', 'On-chain lending markets, keeper liquidations', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    owner: 'shehzad002',
    dependsOn: ['protocol.amm'],
    note: 'HUMAN Protocol Plane @shehzad002. Agents babysit only.',
  }),
  f('protocol.escrow', 'Non-custodial P2P escrow contracts', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    owner: 'shehzad002',
    dependsOn: ['protocol.smart-accounts'],
    note: 'HUMAN Protocol Plane @shehzad002. Agents babysit only.',
  }),
  f('protocol.router', 'Sovereign router — book vs pool best execution', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    owner: 'shehzad002',
    dependsOn: ['protocol.amm'],
    note: 'HUMAN Protocol Plane @shehzad002. Agents babysit only.',
  }),
  f('protocol.merchant', 'Lane A merchant contracts — zero KYB (§24)', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    owner: 'shehzad002',
    dependsOn: ['protocol.smart-accounts'],
    note: 'HUMAN Protocol Plane @shehzad002. Agents babysit only.',
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
    status: 'done',
    dependsOn: ['blueprint.onboarding'],
    requires: ['services/svc-blueprint'],
    note: 'Stage-1 DONE 2026-08-04 (implementable TRK pilot): product accepts SVG as the share artifact via `shareMode: svg|png` on CardRender. Composition is ours (`card/compose.ts`), both §7.2 canvases, zero PII, self-only blueprint:read. PNG rail residual: UnconfiguredCardRenderer returns unavailable (never fabricates URL) until BLUEPRINT_CARD_RENDERER_URL + rasterizer/object storage exist. Stage-2 residual tracked separately.',
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
    status: 'done',
    dependsOn: ['blueprint.onboarding'],
    requires: ['services/svc-blueprint'],
    note: 'Stage A DONE 2026-08-04: cascade end-to-end on tip. svc-blueprint publish half (export/erase + blueprintCreated/Deleted) + svc-identity consumer (`subscribeBlueprintProfileEvents` / blueprint-profile) sets and clears profiles.blueprint_id under §2. Identity unit tests cover redelivery match-guard and re-onboard. Blueprint README no longer claims a void subscriber. Optional residual: multi-service bus e2e + legal-hold policy — not a reopen of this mountain.',
  }),
  f('blueprint.attestations', 'On-chain rank attestations, zero PII (§19)', {
    module: 'blueprint',
    phase: '4',
    plane: 'B',
    dependsOn: ['blueprint.onboarding', 'protocol.smart-accounts'],
  }),

  // ── PHASE 4P · INTACHAIN ─────────────────────────────────────────────────
  f('chain.mainnet', 'INTACHAIN — CometBFT + native CLOB module', {
    owner: 'shehzad002',
    note: 'HUMAN INTACHAIN P1 @shehzad002 (§17). Plan ADR before large implement. Agents babysit only.',
    module: 'chain',
    phase: '4P',
    plane: 'P',
    dependsOn: ['matching.engine', 'protocol.amm'],
  }),
  f('chain.evm', 'INTAEVM sharing validator set + state', {
    owner: 'shehzad002',
    note: 'HUMAN INTACHAIN INTAEVM @shehzad002. Agents babysit only.',
    module: 'chain',
    phase: '4P',
    plane: 'P',
    dependsOn: ['chain.mainnet'],
  }),
  f('bridge.canonical', 'Canonical IFC bridge + attestations', {
    owner: 'shehzad002',
    note: 'HUMAN Protocol Plane bridge @shehzad002. Agents babysit only.',
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
    status: 'done',
    dependsOn: ['bank.accounts', 'trade.spot'],
    requires: ['services/svc-bank', 'packages/ledger-client/src/recipes/loans.ts'],
    note: 'DONE on main #202 (2026-07-30). Collateral is purposed per loan (assertPurposedLocks covers collateral) so two loans in one asset cannot unsecure each other. Principal draws from loanReserve (module account, hard non-negative — underfunded reserve fails to lend rather than printing). No stored outstanding column — debt event-sourced. Liquidation ladder + accrual with per-(loan,day) idempotency. Value only via ledger-client recipes; amounts decimal strings / scaled bigint, never money-as-number for principal. Residual product: bank.earn / bank.cards / live go-live policy still separate.',
  }),
  f('bank.earn', 'Flexible + fixed yield pools', {
    module: 'bank',
    phase: '5',
    status: 'done',
    dependsOn: ['bank.accounts', 'token.staking'],
    requires: ['services/svc-bank/src/earn/earn-service.ts', 'packages/ledger-client/src/recipes/bank.ts'],
    note:
      '**Reclaimed 2026-08-04** from Shehzad M6 — Nitro agents thin ledger-true. Class M. ' +
      'DONE 2026-08-04 against the bar in docs/adr/2026-08-04-bank-vertical-law.md (Accepted; correction 1 there says this row was stale, ' +
      'and the ADR test — "could this platform produce it with no third party\'s signature?" — answers yes, because yield pays from houseFees, ' +
      "which is internal value and not a counterparty). Verified on main, not taken on the ADR's word: four router procedures mounted under " +
      'the earn sub-router (pools/deposit/withdraw/positions, plus admin accrue/fundPool), four ledger-client recipes (earnDeposit, earnWithdraw, ' +
      'earnPoolFund, earnInterest — every value movement, none in the service), three tables (earn_pools, earn_positions, interest_accruals), and ' +
      'the suite in bank-service.test.ts. §0.6 holds: the deposit lands in the ledger stake account and a test asserts the table principal always ' +
      'equals it, so no balance lives here. Money is decimal strings on the wire (amountString) and scaled bigint in memory (parseAmount/formatAmount). ' +
      'Refusals are named and refuse rather than default: bank.pool_underfunded (an unfunded pool moves nothing rather than paying out of thin air), ' +
      'bank.native_asset_not_earnable (svc-token owns IFC staking, §8.1), bank.position_locked, bank.below_minimum, ledger.insufficient_funds. ' +
      'Accrual is idempotent on a (pool, date) business key, rounds interest DOWN, and records a zero day rather than reconsidering it. ' +
      'RESIDUAL, both additive and neither a §13 counterparty: pools are funded by an admin call, not an automatic revenue sweep; and the ' +
      'per-pool-per-day chunk index is documented in recipes/bank.ts:206 for when one pool outgrows one transaction. Class X issuer keys are ' +
      'bank.cards, not this row.',
  }),
  f('bank.cards', 'CardIssuerAdapter + card-sim, <2s auth decision', {
    module: 'bank',
    phase: '5',
    dependsOn: ['bank.accounts'],
    note: '**Reclaimed 2026-08-04** M6 — Nitro agents thin. Class X keys = Nitro human.',
  }),
  f('bank.sovereign-card', 'Self-custody funded card, JIT conversion (§18)', {
    module: 'bank',
    phase: '5',
    plane: 'P',
    dependsOn: ['bank.cards', 'protocol.smart-accounts'],
    note: '**Reclaimed 2026-08-04** M6 custodial half — agents thin; on-chain JIT contract half remains Shehzad protocol board.',
  }),
  f('bank.ramps', 'Fiat on/off ramp reusing svc-pay adapters', {
    module: 'bank',
    phase: '5',
    dependsOn: ['pay.rails'],
    note: '**Reclaimed 2026-08-04** M6 — Nitro agents thin Class M.',
  }),
  f('agents.gateway', 'Model-agnostic gateway, per-user metering', {
    module: 'agents',
    phase: '5',
    status: 'done',
    dependsOn: ['identity.accounts'],
    requires: ['services/svc-agents'],
    note: 'Reference mount — the /trpc + createEdgeContext recipe every other service copies',
  }),
  f('agents.navigator', 'Navigator — tool-calling inside user guardrails', {
    module: 'agents',
    phase: '5',
    dependsOn: ['agents.gateway'],
    note: 'Stage-1 2026-08-04: navigatorAgentGuardrail — navigator.plan/tool_select + read-only trade/identity tools; money-write tools refuse undeclared. Stage-2 grounded tools residual. Not tracker done until live grounded env.',
  }),
  f('agents.support', 'Support agent — KB + account-state grounded', {
    module: 'agents',
    phase: '5',
    dependsOn: ['agents.gateway', 'ops.support'],
    note: 'Stage-1 2026-08-04: supportAgentGuardrail — read-only support tools + support.classify/reply tasks; money tools (ledger/pay/bank/trade/p2p) refused undeclared. Stage-2: KB grounding via ops.support. Not tracker done until grounded env.',
  }),
  f('agents.scanner', 'Market Scanner — ranked signals by tier', {
    module: 'agents',
    phase: '5',
    dependsOn: ['agents.gateway', 'trade.spot'],
    note: 'Stage-1 2026-08-04: pure fixture rank in svc-agents (`scanner/rank.ts`) — empty/stale/incomplete refuse with copy keys; no invent prices; no auto-trade. Live tools + shell UX residual. Not tracker done until allowlisted live data path.',
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
  f('academy.spatial', '2D navigable room canvas, VR-ready scene state', {
    module: 'academy',
    phase: '5',
    dependsOn: ['academy.lobbies'],
    note: 'Stage-1 2026-08-04: versioned Scene v1 schema + size gate (`spatial/scene.ts`); updateScene rejects invalid/oversized. Canvas product residual. Not tracker done until navigable shell uses server scene.',
  }),
  f('academy.curriculum', 'DERIV//DESK library import — 20 playbooks + 3 workbooks', {
    module: 'academy',
    phase: '5',
    dependsOn: ['academy.lobbies'],
    note: 'Stage-1 2026-08-04: import pipeline format + brand checklist + count gate (titlePromiseMet false). Content residual — not tracker done.',
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
    note: 'Stage-1 2026-08-04: appoint/freeze + public badge (status only). IFC pay/revenue share Class M residual — not tracker done.',
  }),
  f('academy.tournaments', 'Seasonal ladders, IFC prize pools', {
    module: 'academy',
    phase: '5',
    dependsOn: ['academy.lobbies', 'trade.spot'],
    note: 'Stage-1 2026-08-04: seasons + standings + ACADEMY_TOURNAMENT_ENABLED. Prize pools Class M residual — not tracker done.',
  }),
  f('academy.paper-trading', 'Paper-trading market flag for workbooks', {
    module: 'academy',
    phase: '5',
    dependsOn: ['trade.spot'],
    note: 'Stage-1 2026-08-04: trade.markets.paper flag + placeOrder isolation (zero ledger posts on paper). Workbook wire + sim fills Stage-2 residual.',
  }),
  f('launch.token-factory', 'ERC-20 deploy from audited templates', {
    owner: 'shehzad002',
    module: 'launch',
    phase: '5',
    plane: 'B',
    status: 'ready',
    // DEPENDENCY REMOVED 2026-07-30, on evidence rather than opinion.
    // This declared `dependsOn: ['protocol.smart-accounts']`, and that is not
    // true: a token launch needs a chain and a factory, not an account
    // abstraction layer. `launch/router-launch-live.test.ts` builds the router
    // with `factory: ZERO, implementation: ZERO` — the smart-account suite
    // deliberately NOT deployed — and launches a token through it on a real
    // chain. That is also why `tokenFactoryDeployed` is a separate boolean from
    // `suiteDeployed`: neither feature may take the other down.
    dependsOn: [],
    requires: ['services/svc-protocol/contracts/launch', 'services/svc-protocol/src/launch'],
    note:
      'HUMAN on-chain launch @shehzad002. Agents babysit only.' +
      'the title says "audited templates" while nothing here has been audited. What DOES exist, on main and mounted: ' +
      'contracts/launch/SovereignToken.sol (fixed-supply ERC-20 — NO mint, NO owner, NO pause, NO blacklist, NO upgrade ' +
      'path; entire supply minted once in the constructor to a named recipient) and TokenFactory.sol (CREATE2; the salt ' +
      'binds the creator and every parameter binds via the init code, so "this address, these parameters, this creator" ' +
      'is one claim; a repeat launch REVERTS rather than returning the existing token, unlike AccountFactory, because the ' +
      'supply was already minted by the first call). Compiled as its own pinned suite (solc 0.8.28, paris, artefacts ' +
      'committed with a sourceHash the suite re-derives). Service surface on svc-protocol: launch.status / ' +
      'predictTokenAddress / buildTokenDeployment / tokenInfo, permissionless per §22, unsigned calldata only — the ' +
      'service holds no key and never originates a launch. PROVEN ON THE REAL DEV CHAIN: the TypeScript CREATE2 ' +
      'derivation agrees with TokenFactory.getAddress over 20 creator/salt pairs and 5 parameter sets; our init code ' +
      'equals the factory own initCode(); the token lands at the predicted address; the deployed runtime IS the compiled ' +
      'template; the full supply reaches the recipient and NOTHING reaches the creator; no mint/owner/pause/upgrade ' +
      'selector appears anywhere in the deployed bytecode. End to end through the router: predict, build, broadcast ' +
      'exactly the bytes the service returned, token is at the predicted address (router-launch-live.test.ts) — which is ' +
      'what rules out predicting one address while handing out calldata that deploys to another. FOUND AND FIXED: ' +
      'comparing a deployed contract against artifact.deployedBytecode is WRONG and looks right — Solidity immutable ' +
      'values are spliced in by the constructor, so SovereignToken (decimals/totalSupply/initialHolder) never matches ' +
      'byte for byte. deployedCodeMatches() now masks the compiler immutableReferences ranges; shipping the naive check ' +
      'would have meant a "verified against the template" field that was permanently false. MONEY: supply is a decimal ' +
      'string on the wire and a scaled bigint in memory, never a number; capped at 10^20-1 whole tokens so it stays ' +
      'representable in numeric(38,18); decimals 0-18 enforced in the contract AND the API. No ledger recipe, no balance, ' +
      'no fee — the factory is not payable, and a launch fee is a Fiat Plane recipe (§0.6) belonging to whichever module ' +
      'sells the launch. REFUSALS: every launch path refuses with launch.factory_not_configured on a zero factory BEFORE ' +
      'any arithmetic runs, because CREATE2 against 0x0 returns a real, checksummed, entirely fictional token address ' +
      'that a creator would publish; proven against a real closed socket, not a stub. STILL NOT DONE: no ' +
      'services/svc-launch (§8.4 owns launchpad/meme/NFT/RWA — this is the contract + protocol layer per §17.5 "launch ' +
      'factory contracts"), no product UI, no launch fee, no instant market creation in svc-trade, no seed pool (needs ' +
      'protocol.amm, which does not compile), and NOTHING IS AUDITED — launch.status reports audited:false deliberately. ' +
      'Sockets: socket.contract-audit, socket.contract-toolchain (no fuzz suite and no gas snapshots for these contracts).',
  }),
  f('launch.meme-factory', 'One-click meme launch + instant market + LP', {
    owner: 'shehzad002',
    note: 'HUMAN on-chain launch @shehzad002. Agents babysit only.',
    module: 'launch',
    phase: '5',
    plane: 'P',
    dependsOn: ['launch.token-factory', 'protocol.amm'],
  }),
  f('launch.launchpad', 'Presale / fair launch, vesting, staked allocation tiers', {
    owner: 'shehzad002',
    note: 'HUMAN on-chain launch @shehzad002. Agents babysit only.',
    module: 'launch',
    phase: '5',
    dependsOn: ['launch.token-factory', 'token.staking'],
  }),
  f('launch.nft', 'NFT mint / list / auction, on-chain royalties', {
    owner: 'shehzad002',
    note: 'HUMAN on-chain launch @shehzad002. Agents babysit only.',
    module: 'launch',
    phase: '5',
    plane: 'P',
    dependsOn: ['launch.token-factory'],
  }),
  f('launch.rwa', 'RWA issuance registry, licence-gated', {
    owner: 'shehzad002',
    note: 'HUMAN on-chain launch @shehzad002 (licence honesty). Agents babysit only.',
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
  f('mining.pool', 'Stratum share protocol, PPLNS payouts', {
    owner: 'shehzad002',
    note: 'HUMAN mining epoch/share protocol surface @shehzad002 (token minter remains svc-token). Agents babysit chain half.',
    module: 'mining-pool',
    phase: '5',
    dependsOn: ['token.emissions'],
  }),
  f('ops.support', 'Support desk, tickets, KB', {
    module: 'core-ops',
    phase: '5',
    dependsOn: ['identity.accounts'],
    note: 'Stage-1 2026-08-04: contracts + svc-support in-memory ticket spine (create/list/comment/status) + empty KB. No money. Operator UI Stage-2 residual.',
  }),
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
    owner: 'Nitro',
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
    note: 'In-app inbox shipped (svc-notify: list/unreadCount/markRead/markAllRead; bus consumers: fillSettled, p2pEscrowLocked, p2pEscrowReleased, p2pEscrowRefunded, p2pTradeDisputed (openedBy only #157), kycApproved, rankUpdated, stakeCreated, bankMarginCalled; ON CONFLICT dedupe). Multi-channel fan-out now exists: one NotificationChannel adapter interface with three real out-of-app adapters (email/push/SMS), per-channel delivery rows with attempted_at kept apart from accepted_at, claim-per-(notification,channel) idempotency, confirmed-address targets, and a retryable/permanent split that decides whether the bus redelivers. The outcome column is accepted_at, not delivered_at: a 2xx from a gateway is custody, not receipt, and no delivery receipts are modelled (migration 0002). NOT done: no out-of-app channel can actually deliver until the owner supplies gateway credentials — until then email, push and SMS refuse every message with channel.not_configured and the refusal is on the record. In-app is the honest fallback and is genuinely delivering.',
  }),
  f('socket.notify-push', 'Push notification channel (device tokens + provider)', {
    module: 'notify',
    phase: '5',
    status: 'socket',
    dependsOn: ['ops.notifications'],
    note: '§13 — PushChannel shipped and proved against a real HTTP server (title/body plus a data payload the app routes on; device token registered and confirmed per user; opaque-token validation refuses channel.target_unroutable without calling out). NOTIFY_PUSH_GATEWAY_URL/TOKEN now exist in .env.example and docker-compose.apps.yml, so there is somewhere to put them. Blocked on credentials the owner must obtain, not on code; listing push in NOTIFY_REQUIRED_CHANNELS makes their absence fatal at boot. Owner list: docs/OWNER-ACTIONS-NOTIFY-GATEWAYS.md.',
  }),
  f('socket.notify-email', 'Email notification channel', {
    module: 'notify',
    phase: '5',
    status: 'socket',
    dependsOn: ['ops.notifications'],
    note: '§13 — EmailChannel shipped and proved against a real HTTP server (subject/text body, address confirmed by a code sent through the channel itself, copy rendered server-side from @intafaced/i18n, mailbox validation refuses channel.target_unroutable without calling out). NOTIFY_EMAIL_GATEWAY_URL/TOKEN now exist in .env.example and docker-compose.apps.yml. Blocked on an outbound mail rail the owner must supply; unconfigured it refuses by name, and listing email in NOTIFY_REQUIRED_CHANNELS makes that absence fatal at boot. Owner list: docs/OWNER-ACTIONS-NOTIFY-GATEWAYS.md.',
  }),
  f('socket.notify-sms', 'SMS notification channel', {
    module: 'notify',
    phase: '5',
    status: 'socket',
    dependsOn: ['ops.notifications'],
    note: '§13 — SmsChannel shipped and proved against a real HTTP server (one text field composed title/body/href and capped at NOTIFY_SMS_MAX_CHARS because SMS is billed per segment; E.164 addresses confirmed by code, non-E.164 refuses channel.target_unroutable without calling out). NOTIFY_SMS_GATEWAY_URL/TOKEN now exist in .env.example and docker-compose.apps.yml. Blocked on an outbound SMS rail the owner must supply; unconfigured it refuses by name, and listing sms in NOTIFY_REQUIRED_CHANNELS makes that absence fatal at boot. Owner list: docs/OWNER-ACTIONS-NOTIFY-GATEWAYS.md.',
  }),

  // ── PHASE 5 · DEX — THE PROTOCOL PLANE'S FRONT DOOR (§8.6, §17.5) ────────
  //
  // Added 2026-08-03. `dex` was the 21st module and the tracker listed 20: the
  // service had ~2,100 lines of source, 87 tests, an edge route and a running
  // process, and NO ROW OF ANY KIND. That is the exact mechanism a previous
  // audit named for five other capabilities — untracked work gets rebuilt by
  // accident, because nothing tells the next person it exists.
  //
  // It is deliberately not one row saying "done". The custody posture is
  // finished and provable; the routing arithmetic is finished and mounted; the
  // live quote path is finished and CANNOT SERVE A QUOTE, because no venue it
  // is configured to read is reachable. Those are three different truths.
  f('dex.permissionless-access', 'Provably non-custodial, permissionless front door (§503, §585)', {
    module: 'dex',
    phase: '5',
    plane: 'P',
    status: 'done',
    dependsOn: ['infra.gates'],
    requires: ['services/svc-dex'],
    note: "PROVEN END TO END 2026-08-03, and this is the part of svc-dex that is genuinely finished. packages/config/src/modules.ts declares `dex: { planes: ['protocol'], custodial: false }`, and `checkAccess` short-circuits exactly that shape to `allowed.permissionless` BEFORE any tier is read — with region screening still ahead of the short-circuit, which is the ordering §24 Lane A requires (sovereign does not mean unscreened). Enforced three ways, not asserted once: (1) `custody-scan` includes svc-dex in its Protocol Plane list and fails the build on any ledger write import — run clean at 97 files across 3 services; (2) env.ts withholds both DATABASE_URL and INTERNAL_SERVICE_SECRET, so a bug here could not reach `ledger.post` even if an import slipped past the scanner; (3) `/ready` states `{custodial: false, plane: 'protocol'}` and the `health` procedure's output schema types `custodial` as `z.literal(false)`, so a deployment that contradicted the posture could not typecheck. Live probe: `/health` 200, `/ready` 200 `{ready:true,custodial:false,plane:'protocol'}`, `health` procedure `{ok:true,service:'svc-dex',custodial:false}`. §0.6 holds — svc-dex moves no value and has no code path that could. 5 dedicated tests in permissionless.test.ts.",
  }),
  f('dex.route-preview', 'Best-execution routing arithmetic over caller-supplied quotes', {
    module: 'dex',
    phase: '5',
    plane: 'P',
    status: 'done',
    requires: ['services/svc-dex/src/router-quote.ts'],
    note: 'Mounted, tested and probed live 2026-08-03. `routePreview` sweeps a set of venue quotes by effective price and returns the split. It is explicitly NOT a price and the router says so in its own header — it was called `quote` once, which is precisely how a caller ends up rendering invented numbers in good faith, so it was renamed rather than deleted because the arithmetic is genuinely useful for a routing explainer. Live probe with two venues (a: 3 @ 90000 @ 10bps, b: 4 @ 124000 @ 30bps, want 5) returned 200 and correctly took 3 from the cheaper venue and 2 from the dearer, effective prices 30030.03003003003003003 and 31093.279839518555667001, all decimal strings. Money law holds on the wire: a JSON-number `qty` is refused with HTTP 400 by the zod schema, and every amount is parsed to scaled bigint via parseAmount before any arithmetic. 16 tests in router-quote.test.ts plus 16 mount tests that would fail if it stopped being reachable.',
  }),
  f('dex.quote-router', 'Live cross-venue quote — real prices or a typed refusal', {
    owner: 'shehzad002',
    module: 'dex',
    phase: '5',
    plane: 'P',
    status: 'ready',
    dependsOn: ['indexer.readmodels'],
    requires: ['services/svc-dex/src/quote'],
    note: "HUMAN Protocol Plane dex residual @shehzad002 (S-I2 quote integrity). Agents babysit only — no invent prices. THE CODE IS FINISHED. IT CANNOT SERVE A QUOTE. Both halves of that are true and the row exists to stop either half being read alone. `quote` sources its own prices from live venues, enforces QUOTE_MAX_AGE_MS against the moment THIS process finished reading (not a timestamp a venue supplied), and REFUSES when it cannot — there is no cache and no fallback. LIVE PROBE 2026-08-03 on the shipped default config: HTTP 503, `dex.quote.no_venue_available — No venue could price BTC-USDT: intachain-clob (unreachable); internal-book (unreachable)`. It fails safe and names both dead venues. PROOF THE CODE IS NOT THE BLOCKER: the same binary, given one reachable venue via DEX_EXTERNAL_VENUES and nothing else changed, returned HTTP 200 with a real route — one leg, filledQty 1, quoteAmount '30010.25', effectivePrice '30040.29029029029029029' (the taker fee grossed up as quoteAmount/(1-bps), which errs AGAINST the user rather than understating cost), `degraded: true`, `singleVenue: true`, `custodialLegs: true`, and the dead intachain-clob leg still named in `unavailable`. Every response carries venuesConfigured / degraded / singleVenue precisely so a client cannot present the only venue that answered as the best of several — the quiet failure mode of every cross-venue router. Three adapters, one interface, so the router has no notion of ours-versus-theirs and cannot quietly favour us: intachain-clob (svc-indexer read models, protocol plane), internal-book (svc-matching, custodial and disclosed as such), and external venues (operator config, EMPTY BY DEFAULT). No third-party connectivity library: `parseLevels` refuses a JSON number outright, which is why there is no ccxt import — its unified fetchOrderBook returns floats. NOT `done` for one reason and it is not a code reason: no real venue has ever answered this service. See socket.dex-venue-set.",
  }),
  f('socket.dex-venue-set', 'A venue this platform actually quotes', {
    module: 'dex',
    phase: '5',
    plane: 'P',
    status: 'socket',
    dependsOn: ['dex.quote-router'],
    note: '§13 — THE BLOCKER, and it is a DECISION, not code, not a chain. svc-dex can read three kinds of venue and all three are dark for different reasons. (1) `intachain-clob` reads svc-indexer, whose chain feed needs a contract emitting BookLevel/Fill/Position; only contracts/dev/DevVenue.sol does, a dev fixture with no book and no access control, INDEXER_VENUE_ADDRESS is the zero address and the adapter refuses to construct on it — that is socket.clob-contracts, a contracts decision. (2) `internal-book` reads svc-matching, which derives markets from journal replay, so its books stay empty until an order lands or trade.mm-bot seeds depth — an operations problem, not a code one. (3) External venues need one row in DEX_EXTERNAL_VENUES, and the default is `[]` deliberately: a service that had no outbound egress yesterday does not silently acquire it. THAT THIRD PATH NEEDS NO CODE, NO CHAIN AND NO CREDENTIALS — public depth is unauthenticated on any tier-one venue, and a live probe against a throwaway depth server proved the adapter prices correctly the moment a row exists. So the honest blocker is: NOBODY HAS DECIDED WHICH VENUE THIS PLATFORM QUOTES. Checked 2026-08-03 against both accepted ADRs (2026-07-28-vendored-exchange-integration, Accepted 2026-07-31 Option B; 2026-08-02-adopt-vendored-product-keep-our-ledger, Accepted 2026-08-02) and docs/SPEC-SOVEREIGN-ROUTING-AND-COPY-2026-08-01.md: NONE of them mentions svc-dex, a DEX, a CLOB, INTACORE or a venue at all, and none lists a DEX question among its open owner-gated items. The decision is not taken AND not tracked as pending — which is why this socket exists. Until it is taken, refusing with 503 is the correct product behaviour and must not be softened to make a screen look alive.',
  }),
  f('socket.dex-fee-source', 'Authoritative per-venue fee and settlement schedule', {
    module: 'dex',
    phase: '5',
    plane: 'P',
    status: 'socket',
    dependsOn: ['dex.quote-router'],
    note: "§13 — named in services/svc-dex/src/env.ts and never tracked until 2026-08-03. Fees are CONFIGURED, not sourced: DEX_CLOB_FEE_BPS (0), DEX_INTERNAL_BOOK_FEE_BPS (20) and DEX_CLOB_SETTLEMENT_COST ('0'). Understate either and the effective price reported is better than the one the user actually gets. The authoritative figures cannot be read yet — the per-market spot schedule lives in svc-trade's own `markets` row and §2 forbids reading another service's tables, and the on-chain CLOB has no deployed contract to publish one. The settlement cost of '0' is a DECLARED UNDERSTATEMENT: converting gas into the quote asset needs a gas oracle and a native-token price and neither exists in this stack. It costs nothing today because that venue has no chain to read, and it must be set before the first real on-chain quote is served. What keeps this honest rather than hidden is that every quote response discloses the exact feeBps and settlementCost applied per venue, so a caller can check the arithmetic against the venue's real schedule.",
  }),
  f('socket.dex-execution', 'Order execution against a quoted venue (§27 vault, §28 OMS)', {
    module: 'dex',
    phase: '5',
    plane: 'P',
    status: 'socket',
    dependsOn: ['dex.quote-router'],
    note: "§13 — svc-dex QUOTES AND ROUTES; it cannot execute, and that is deliberate rather than unfinished. Every adapter declares `capabilities: ['quote','orderbook']` and `MarketDataSource.submit()` throws `VenueExecutionRefused` rather than returning a plausible rejection. Quoting needs no credentials (public depth is unauthenticated); execution needs trade-scoped Venue Vault credentials (§27) and an OMS (§28, svc-execution), and neither exists — there is no services/svc-execution in this repo. Keeping the refusal loud matters more here than anywhere else in the service: a silent or plausible-looking rejection on an execution path is how a caller concludes an order was placed. Also absent and named rather than implied: no per-venue rate-limit governor (this adapter fetches on every quote, so a busy market will be throttled — a venue answering 429 degrades to `unreachable` and drops out of routing, which is correct but is a degradation, not a governor), no WS streaming or sequenced/gap-detected books (§27 asks for WS-first; this is REST polling, and packages/market-data already holds the sequence machinery), and no cross-venue latency weighting (health() records round-trip per venue, so the input exists and nothing consumes it).",
  }),

  // ── PHASE 5P · PROTOCOL P2–P3 ────────────────────────────────────────────
  f('chain.rust-core', 'Rust CLOB execution engine', {
    owner: 'shehzad002',
    note: 'HUMAN INTACHAIN P2 @shehzad002. Agents babysit only.',
    module: 'chain',
    phase: '5P',
    plane: 'P',
    status: 'socket',
    dependsOn: ['chain.mainnet'],
  }),
  f('chain.validators', 'Validator set opening, published schedule', {
    owner: 'shehzad002',
    note: 'HUMAN INTACHAIN @shehzad002. Agents babysit only.',
    module: 'chain',
    phase: '5P',
    plane: 'P',
    dependsOn: ['chain.mainnet'],
  }),
  f('chain.governance', 'Governance parameter handover', {
    owner: 'shehzad002',
    note: 'HUMAN INTACHAIN @shehzad002. Agents babysit only.',
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
  // Found 2026-08-03 while separating the screening authority from the
  // jurisdiction matrix. Declared rather than fixed: an undeclared gap is a
  // claim, and this one is a claim about a compliance control.
  f('socket.geo-region-resolution', 'Resolve the caller’s region per request instead of stamping one constant', {
    module: 'edge',
    phase: '3',
    status: 'socket',
    note: '§13 — svc-edge resolves `region` ONCE, from `DEFAULT_REGION` (services/svc-edge/src/env.ts, default `XX`), and stamps that same value onto the principal of EVERY request (src/index.ts, the `exchangePrincipal` call). There is no geo-IP handling anywhere in the repo: no `cf-ipcountry`, no `x-vercel-ip-country`, no provider database, nothing. WHAT THAT MEANS FOR SCREENING: `checkAccess`, JURISDICTION_MATRIX and the sanctions list are all correct and armed, and they evaluate ONE CONSTANT REGION for all traffic. Even with a counsel-supplied `INTAFACED_SANCTIONS_REGIONS`, no real caller’s jurisdiction is ever tested against it — a listed region can only ever match if an operator happened to set DEFAULT_REGION to that same code. So `assertScreeningConfigured` passing in prod means "a list was supplied", NOT "traffic is screened against it", and this row exists so the first is never read as the second. It understates matrix enforcement (tiers, limits, per-module blocks) for the same reason, not only sanctions. WHY IT IS NOT A ONE-LINER: region must never be caller-supplied — a caller who could set it would choose its own regulator — so closing this needs a TRUSTED upstream geo header from whatever CDN or proxy fronts the edge, a stated precedence between headers, proof the header cannot be spoofed by a direct-to-origin request, and a fail-closed answer when it is absent or untrusted. That is a deployment-topology decision with an owner, not just code.',
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
