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
  f('trade.futures', 'Perps: isolated margin, funding, partial-liquidation ladder', {
    module: 'trade',
    phase: '2',
    status: 'ready',
    dependsOn: ['trade.spot'],
    note: '**Reclaimed 2026-08-04** from Shehzad M3 — Nitro agents implement only from tip product law or honest thin §13. Never invent mid/funding. Denon owns product-law invent. **Isolated margin ONLY.** `DIRECTION` §1 and `docs/adr/2026-08-05-futures-risk-and-mark-law.md` done-bar item 8 forbid a cross-margin path even disabled — this row advertised cross/isolated until 2026-08-07 and was wrong. **Orderable behind a flag since 2026-08-08** — `assertTradable` takes a futures order when `TRADE_FUTURES_ENABLED` is on and refuses `trade.futures_disabled` when off, which is the shipped default; orders match on the same svc-matching book (D-S-06, no second book) and settle through the ledger. STATUS STAYS `ready`, NOT `done`: orderability is one of the six things `DIRECTION` §1 calls MVP, and the other five are untouched — no leveraged entry through the book (a futures order is funded by the same full hold as a spot order), funding still off and owner-reserved, insurance fund absent, and the gap-series liquidation proof unrun. The unblocker was `c7dfb5e4`/`cc90c2f4` making the mark size-aware; before those, an orderable futures book was a self-dealing machine.',
  }),
  f('trade.options', 'European options, cash-settled, full collateral in v1', {
    module: 'trade',
    phase: '2',
    dependsOn: ['trade.futures'],
  }),
  f('trade.otc', 'OTC RFQ desk, staked-tier gate', {
    module: 'trade',
    phase: '2',
    status: 'ready',
    dependsOn: ['trade.spot', 'token.staking'],
    requires: ['services/svc-trade'],
    note:
      'Stage 2026-08-07 (D-S-02 Part A): RFQ quote discloses counterparty/size/expiry/spread; accept binds quoted price (no last look); blank ' +
      'DIRECTION §8 desk law → refuse-closed; settle via ledger-client marketMakerMakerFill when owner publishes. Never invent spread/stake/mid. ' +
      'Residual: owner §8 numbers, maker-routing settle, durable otc_quotes table. ' +
      'CLAIM RELEASED 2026-08-08: was `wip` @cursor-swarm-otc — no open PR and no branch on origin; its stage merged as #1000. ' +
      'This one was the most expensive stale claim in the file and the reason is worth keeping. `requires: [services/svc-trade]` names the WHOLE ' +
      'service, so while this row was owned, claim-check answered "human-claimed" for every path in svc-trade — a directory with twenty-plus ' +
      'agent PRs merged into it during the same week. Combined with the module fallback (an owned row with `module: trade` locks ' +
      '`services/svc-trade` even when it declares no paths), the service reported three separate human owners. ' +
      'DELIBERATELY NOT TOUCHED in the same pass, so nobody reads this as a blanket unlock: `trade.copy` and `trade.algo` keep `owner: Nitro` ' +
      'because their stated residual IS an owner decision — the blank §8 numbers — so the claim is describing reality, not stale. ' +
      '`connect.venue-vault` keeps `owner: shehzad002`; it is key custody and genuinely his. Those two are why svc-trade will still read as ' +
      'claimed after this PR, and that is correct rather than a miss.',
  }),
  f('trade.copy', 'Copy trading, audited leaders, profit share', {
    module: 'trade',
    phase: '2',
    plane: 'B',
    status: 'wip',
    owner: 'Nitro',
    dependsOn: ['trade.spot'],
    requires: ['services/svc-trade/src/copy'],
    note: '**Reclaimed 2026-08-04** from Shehzad M4. **wip 2026-08-07** Nitro money wave 3 — D-S-03 Stage: follow/unfollow + envelope mirror refuse; blank DIRECTION §8 leader_share_bps + jurisdiction → refuse-closed; fee-share settle via ledger-client sweepFeesToRewards+rewardPay when owner publishes. Never invent rates/geo/P&L fees/ranking. Residual: owner §8 numbers, on-chain session-key caps (build order §7.1).',
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
    status: 'wip',
    owner: 'Nitro',
    dependsOn: ['trade.spot'],
    note: '**Reclaimed 2026-08-04** from Shehzad M4. **wip 2026-08-07** Nitro money wave 2 — D-S-04 TWAP Stage (parent=schedule, children via placeOrder, refuse blank mark/empty book). VWAP/POV still out (no honest volume series).',
    requires: ['services/svc-trade/src/algo'],
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
  f('connect.venue-vault', 'Venue Vault — per-user external API keys, HSM-backed, withdrawal refused (§27)', {
    module: 'trade',
    phase: '5',
    status: 'socket',
    owner: 'shehzad002',
    dependsOn: ['venue.aggregation'],
    note: 'Law §27:761, gap-closed 2026-08-07. venue.aggregation\'s own note has admitted "Venue Vault absent" since 2026-08-02 while no row existed for it — a KEY CUSTODY SURFACE holding users\' credentials to other exchanges, with no owner. It is also the hard blocker under socket.dex-execution: quoting needs no credentials, executing does. Owner is the chain owner because this is key custody and that is where the expertise sits, NOT because it is protocol plane — the keys are for custodial venues. The split, so it is not confused later: the vault design, the key handling and the withdrawal-permission refusal are his; wiring svc-trade to a vault that exists is ordinary agent work. Non-negotiable in any design: a stored key that carries withdrawal permission is refused at registration, not filtered at use.',
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
    module: 'pay',
    phase: '3',
    status: 'ready',
    dependsOn: ['ledger.double-entry'],
    requires: ['services/svc-pay'],
    note:
      'CLAIM RELEASED 2026-08-08 by Nitro, by name, alongside `ops.admin`. Agents may implement. `wip` became `ready` only because the tracker ' +
      'refuses a `wip` row with no owner — "someone is on it right now" needs a name — and `ready` means what it says here: every dependency is ' +
      'done and it is free to claim. Nothing about what is built changed with this edit; the paragraph below is unaltered and still governs. ' +
      'What the release does NOT touch: card acquiring stays a commercial relationship no PR closes (see socket.psp-partners), so an agent that ' +
      'reads this as permission to enable a card rail has misread it. ' +
      'Updated 2026-08-06 after #346 (M1, shehzad002) landed. WHAT IS REAL, and it is most of the row: the tRPC router is mounted ' +
      '(`index.ts` registers it on `/trpc`, the edge routes `/api/pay` there), and `checkout.open`/`checkout.status`, ' +
      '`merchant.create|me|submitKyb|decideKybStub|profile|createLink|listLinks|deactivateLink` and ' +
      '`payment.create|authorize|capture|refund|get|list|history` all serve from it. #346 added `merchant.me`, the KYB transitions ' +
      '(`submitKyb`/`decideKybStub`, the latter honest-refusing under live-only with `pay.kyb_operator_required`), durable ' +
      '`payment.list`, `getMerchantByUserId`, `scripts/card-sandbox-e2e.mjs` and migration `0005_pay_merchant_kyb`. ' +
      '#800 supplied the merchant-state writer the surface had been missing, so `merchants.status` is now written and historied ' +
      '(`merchant_status_events`, append-only by trigger, migration `0006`). 514 svc-pay tests green. ' +
      'WHY IT IS STILL `wip` AND NOT `done`, two reasons, both checked in code rather than inferred: ' +
      '(1) CARD ACQUIRING IS ABSENT, NOT SANDBOX. `PAY_REGISTER_CARD_SANDBOX` defaults to off in staging/prod, `PAY_CHECKOUT_RAILS` ' +
      'defaults to `crypto-native:crypto` so the public hosted checkout never sees a card, and `PAY_ALLOW_SANDBOX_RAILS=false` makes ' +
      'staging/prod refuse to BOOT while any registered rail declares itself sandbox. So in every posture that ships, this gateway is ' +
      'crypto-only; the card half exists in dev/test alone and its replacement is `socket.psp-partners`, which ADR ' +
      '`docs/adr/2026-08-04-pay-rails-and-psp-socket.md` (Accepted) rules is a sponsor bank and an acquiring BIN — a commercial ' +
      'relationship no code closes. The tracker permits a rail that is *sandbox* under `done`; it does not cover one that is absent, ' +
      'and #800 widened `RailMode` with `absent` precisely so the two stop reporting the same thing. ' +
      '(2) `kybStatus` HAS NO CONSUMER. `submitKyb`/`decideKybStub` move it and the read surfaces echo it, but nothing else reads it — ' +
      '`payment.create`, `checkout.open`, `settlement.run` and the withdrawal path all gate on `merchants.status`, never on KYB. ' +
      'A merchant sitting at `kybStatus: rejected` transacts exactly like an approved one, so merchant onboarding is not KYB-gated at all ' +
      'yet. Digital KYB is `pay.psp`; wiring the existing flag into the money gates is this row. ' +
      'Neither residual is a defect in #346 — its code is reachable, tested and unpropped on its own terms. They are what stands between ' +
      'this row and `done`, and naming them is cheaper than a `done` the board would have to walk back. ' +
      '**Reclaimed 2026-08-04** from Shehzad M1 — Nitro agents after the #346 handoff. Class M. Not go-live.',
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
    status: 'wip',
    owner: 'nitro-money-w3',
    dependsOn: ['pay.gateway', 'identity.apikeys'],
    requires: ['services/svc-pay/src/public-rest.ts', 'services/svc-pay/src/merchant-webhooks.ts'],
    note:
      '**Reclaimed 2026-08-04** M1 expand — Nitro agents Class M. Steps 1–2 tip (#988/#994). ' +
      'Step 3 outbound webhooks (signing/retry/dedup/dashboard) in flight on feat/pay-residual-stage3. ' +
      'Not Class X acquirer. Sandbox-key routing = step 4.',
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
    status: 'wip',
    owner: 'nitro-agent',
    dependsOn: ['p2p.escrow'],
    requires: ['services/svc-p2p/src/router.ts', 'services/svc-p2p/src/state.ts', 'services/svc-p2p/src/moderation-auth.ts'],
    note:
      'CLAIMED 2026-08-07 nitro money/ops wave 3 — feat/p2p-disputes-stage (D-S-08 residual). ' +
      'STAGE SHIPPED in svc-p2p: moderation reachability via `P2P_MODERATOR_USER_IDS` (natural-person allowlist) so a ' +
      'real session with `p2p:read` can call `disputes.list` / `disputes.resolve` when named; empty allowlist ' +
      'honest-refuses with `p2p.moderation_unreachable` (PRECONDITION_FAILED) rather than sitting forever behind ' +
      '`admin:compliance` that SESSION_SCOPES withholds. `disputes.open` and health/ready disclose `moderationReachable`. ' +
      'admin:compliance still counts when a principal holds it (tests / future operator grant). No fake auto-ruling; ' +
      'timer still escalate-and-hold only. ' +
      'NOT done: apps/admin dispute console still absent; `p2p:moderate` scope split remains OWNER sign-off ' +
      '(DIRECTION §3) and is deliberately not minted here. Prior honesty note (2026-08-06 corrected from false `done`) stands for the gap this stage closed.',
  }),
  f('p2p.reputation', 'Reputation feeding the same XP graph', {
    module: 'p2p',
    phase: '3',
    status: 'done',
    dependsOn: ['p2p.offers', 'identity.rank'],
    requires: ['services/svc-p2p/src/reputation.ts'],
    note: "Reputation module on main. This row's title was only nearly true for a while, and the gap is worth recording: svc-p2p published xpEarned and NOTHING consumed it, so P2P reputation did not reach the XP graph — svc-identity wrote rank_state from its own auth flows and its serviceProcedure only, and every rank shown to a P2P user was short by what they had earned. Closed by subscribeXpEvents in services/svc-identity/src/events.ts (ADR D-S-13 Class B). The producers' idempotency keys already matched identity.xp_events.idempotency_key, so no key translation and no migration were needed.",
  }),
  f('p2p.payment-instruments', 'Payment instruments — where the buyer actually pays', {
    module: 'p2p',
    phase: '3',
    status: 'wip',
    owner: 'nitro-agent',
    dependsOn: ['p2p.escrow'],
    requires: ['services/svc-p2p/src/instrument-service.ts'],
    note: "A row exists because the capability did not, and nobody could see that: escrow locked, released, refunded and went to a moderator while a trade could never actually complete — at the moment the buyer had to pay, there was no account to pay to. MECHANISM DONE on feat/p2p-payment-instruments: operator-registered method schemas per (method, country); one active destination per (owner, method, currency); an immutable per-trade snapshot so removal cannot break an in-flight trade and a seller cannot swap the account mid-payment; disclosure only while the escrow is HELD; every read and every refusal written to an append-only access log by the same SQL statement that reads the details. STILL wip, not done: the method registry ships EMPTY and no seller can register anything until an operator calls instruments.methods.register for their market. What a market's rails require is researched jurisdictional content (owner-gated, DIRECTION §8), not engineering — seeding a guess would produce destinations that validate and cannot be paid. Also open: no encryption at rest (§13 socket, needs a KMS decision).",
  }),
  f('p2p.merchants', 'P2P merchant programme — badges, limits, API', {
    module: 'p2p',
    phase: '3',
    status: 'wip',
    owner: 'nitro-agent',
    dependsOn: ['p2p.reputation'],
    requires: ['services/svc-p2p'],
    note: 'Stage 1 of 3 shipped (TRK-p2p.merchants DoD): p2p_merchants + append-only p2p_merchant_events (trigger-enforced), apply/approve/reject/suspend/reinstate/withdraw state machine with actor rules, and eligibility from EARNED reputation so a fresh account cannot borrow merchant trust. tRPC: merchants.me/submitApplication/withdraw (self) + decide/history (admin:compliance). Membership only — no balance, no custody; escrow still moves value through ledger recipes (§0.6). Eligibility thresholds are a policy object with a conservative default because tier ladder + numeric limits are open product law (spec §5). STILL OPEN for done: Stage 2 limits enforced on offer create + badge on public profile; Stage 3 merchant API keys/scopes/rate limits, or an explicit cut of the API to a later row.',
  }),

  // ── PHASE 3P · PROTOCOL PLANE P0 ─────────────────────────────────────────
  f('protocol.smart-accounts', 'Passkey smart accounts, session keys (§17.4)', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    status: 'ready',
    owner: 'shehzad002',
    dependsOn: ['identity.accounts'],
    requires: ['services/svc-protocol'],
    note:
      'HUMAN Protocol Plane @shehzad002 (2026-08-04 sole chain lock). Agents babysit only. Not go-live Class X. ' +
      'WHAT IS ALREADY ON MAIN — stated 2026-08-07 because this row carried an ownership stamp and no state, which is ' +
      'exactly how an owner ends up rebuilding merged work. SmartAccount.sol, AccountFactory.sol and SessionKeyLib.sol ' +
      'compile as a pinned suite (solc 0.8.28) and RUN AGAINST A REAL DEV CHAIN in CI (REQUIRE_EVM_CHAIN=1): 31 ' +
      'contract tests including the CREATE2 cross-check proving the TypeScript address derivation agrees with the ' +
      'deployed factory (#210). The service surface is mounted with typed refusals on every chain-dependent path ' +
      '(#193) and factory honesty on predict/build (#128). ERC-4337 v0.7 user operations are built and hashed ' +
      'independently by src/chain/userop.ts, which is the whole basis on which the relay can refuse to forward ' +
      'something the user did not authorise. ' +
      'WHAT REMAINS, and none of it is "write the contracts": (1) the adversarial AUDIT PACKAGE — threat model, ' +
      'findings, fix-or-residual — and no external audit exists (socket.contract-audit); (2) the passkey P-256 ' +
      'verifier contract does not exist, so a passkey cannot yet own an account ON-CHAIN — the title of this row is ' +
      'not fully true until it does (socket.p256-verifier); (3) the user-operation hash has never been checked ' +
      'against a live EntryPoint (socket.userop-differential-test); (4) no fuzz/invariant suite and no gas snapshots ' +
      '(socket.contract-toolchain); (5) NOBODY OWNS GAS — socket.paymaster-policy and socket.bundler-policy; (6) no ' +
      'deployment beyond a local dev chain and no address registry (socket.deployment-registry).',
  }),
  f('protocol.amm', 'AMM pools from audited templates', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    status: 'ready',
    owner: 'shehzad002',
    dependsOn: ['protocol.smart-accounts'],
    requires: ['services/svc-protocol/contracts/amm', 'services/svc-protocol/src/amm'],
    note:
      'HUMAN Protocol Plane @shehzad002 after SA. Agents babysit only. ' +
      'THE COMPILE-AND-PROVE HALF IS ALREADY MERGED — recorded 2026-08-07 because this row stated only who owns it, ' +
      'and the blockchain task board consequently asks its owner for work that landed eight days earlier. The pool ' +
      'once did not compile at all (swapExactIn called an `external swap` by name); fixed with a private `_swap` ' +
      'shared by both entrypoints, external ABI unchanged for calldata builders (#228, by @shehzad002). PoolFactory ' +
      'then landed on the dev chain (#264), and mint + swapExactIn are PROVEN ON A CHAIN rather than asserted in a ' +
      'unit test (#288 — src/amm/mint-swap-onchain.test.ts, src/amm/pool-factory-onchain.test.ts). Constant-product ' +
      'maths is a pure tested module (src/amm/math.ts). ' +
      'WHAT REMAINS: invariant/property suites (k never decreases, no free extraction, fee accrual), LP accounting ' +
      'and fee tiers, oracle coupling (socket.price-oracle), and the `audited` flag staying false until a real audit ' +
      'package exists. Do not re-derive the compile fix or the on-chain proof.',
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
    owner: 'shehzad002',
    dependsOn: ['blueprint.onboarding', 'protocol.smart-accounts'],
    note: 'Owner set 2026-08-07. The blockchain task board has claimed this as Tier F since 2026-08-03 while this row said `ready` and unowned — so an agent doing the correct free-work check would have started it legitimately. The blueprint half (what a rank means, how it is computed) is already `done`; what is unbuilt is the on-chain half: attestations that verify without disclosing identity.',
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
    status: 'done',
    dependsOn: ['bank.accounts'],
    requires: ['services/svc-bank/src/cards/card-service.ts', 'services/svc-bank/src/cards/issuer.ts'],
    note:
      '**SPLIT 2026-08-06** per docs/adr/2026-08-04-bank-vertical-law.md correction 3. This row is the LEDGER HALF, which is what the ' +
      'title names (CardIssuerAdapter + card-sim). The LIVE RAIL half is **socket.live-issuer** and is not counted here. ' +
      '**Reclaimed 2026-08-04** M6 — Nitro agents thin. Class M. ' +
      'LEDGER HALF DONE on main via #770 (merged 2026-08-04), verified against the ADR six-point bar rather than taken on its word: ' +
      'five procedures mounted on the user-facing `cards` sub-router (programme/list/issue/setStatus/authorizations) plus cardAuthorize/' +
      'cardCapture/cardReverse mounted under `ops` behind admin:treasury — deliberately not user-callable, because a user who can authorise ' +
      'their own purchase can approve one the ledger would have declined. Value moves only through packages/ledger-client recipes ' +
      '(withdrawHold on authorise, withdrawSettle on capture, withdrawReverse on reverse/expiry, rewardPay for cashback, sweepFeesToRewards ' +
      'to fund the pot) — no LedgerClient is ever handed to an adapter, by construction. Money is decimal strings on the wire (amountString) ' +
      'and scaled bigint in memory; cashback rounds DOWN. Refusals are named and refuse rather than default: bank.no_card_issuer, ' +
      'bank.card_not_found, bank.card_not_active, bank.card_limit_exceeded, bank.card_authorization_not_found/declined/closed, ' +
      'bank.card_capture_exceeds_authorization, and a cashback refusal that leaves the capture standing. The DEFAULT issuer is ' +
      '`noCardIssuer`, which refuses everything — a deployment that has not chosen an issuer does not silently fall back to the simulator. ' +
      '`simulated: true` is on cardOutput and is never omitted or defaulted, so no screen can present a card-sim card as a real one. ' +
      '39 tests in cards.test.ts + the #770 additions to bank-service.test.ts; 194 schema lines; migration 0003_bank_cards.sql. ' +
      'RESIDUAL, stated not hidden (see the WHAT IS NOT HERE block in card-service.ts): no refunds (the cashback-clawback question is an ' +
      'unanswered product decision, not a missing module), no disputes/chargebacks, no incremental or multi-capture flows, no fraud scoring / ' +
      'velocity / 3DS / MCC policy — all of it belongs to a rail. The title\'s "<2s auth decision" is not a meaningful claim against an ' +
      'in-process simulator; it is a live-rail latency budget and belongs to socket.live-issuer. Class X (pointing this at real money) ' +
      'stays Nitro human and is a decision, not a missing rail.',
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
    status: 'wip',
    owner: 'cursor-swarm-bank',
    dependsOn: ['pay.rails'],
    requires: ['services/svc-bank/src/ramps/ramp-service.ts', 'services/svc-bank/src/ramps/rails.ts'],
    note:
      '**SPLIT 2026-08-04 ADR** · **CRYPTO LEDGER HALF wip 2026-08-07** (feat/bank-denon-residual, claim TRK-bank.ramps). ' +
      'CRYPTO LEG — ledger surface on main path: `ramps.programme|onramps|offramps|offramp` + ops `creditOnramp`; value only via ' +
      'ledger-client `deposit` / `withdrawHold` / `withdrawSettle` against rail `bank-crypto-ledger` (distinct from svc-pay ' +
      '`crypto-native` so operator credit cannot desync pay chain reconciliation). `BANK_RAMP_MODE=none|crypto-ledger`, default none; ' +
      '`simulated: true` always; fiat refuses `bank.fiat_ramp_socket` → socket.psp-partners. No earn APY / card BIN invented. ' +
      'FIAT LEG — **socket.psp-partners**, not this row. Live chain confirm/send remains svc-pay + Class X. ' +
      '**Reclaimed 2026-08-04** M6 — Nitro agents thin Class M.',
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
    status: 'wip',
    owner: 'Nitro',
    note:
      'Stage-1 programme appoint/freeze + Stage-2 residency desk (non-money). ' +
      'Stage next 2026-08-07: IFC pay + revenue share refuse-closed Class M (ambassadors/ifc-pay.ts) — no invent rates. ' +
      'Not tracker done until residencies seasons + real pay/share (or product-cut) match title.',
  }),
  f('academy.tournaments', 'Seasonal ladders, IFC prize pools', {
    module: 'academy',
    phase: '5',
    dependsOn: ['academy.lobbies', 'trade.spot'],
  }),
  f('academy.paper-trading', 'Paper-trading market flag for workbooks', {
    module: 'academy',
    phase: '5',
    dependsOn: ['trade.spot'],
    note:
      'Stage-1 2026-08-04: trade.markets.paper flag + placeOrder isolation (zero ledger posts on paper). ' +
      'Stage-2 workbook wire + fill-ref attach. ' +
      'Stage-3 2026-08-07: ACADEMY_PAPER_TRADING_ENABLED ops kill-switch (live trade unaffected) — #1001.',
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
    note: 'HUMAN on-chain launch @shehzad002. Agents babysit only. Plane corrected to P 2026-08-07 — presale, vesting and allocation are contracts, and this row rendered as Fiat Plane on the board its own owner reads.',
    module: 'launch',
    phase: '5',
    plane: 'P',
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
    note: 'HUMAN on-chain launch @shehzad002 (licence honesty). Agents babysit only. Plane corrected to P 2026-08-07 — the registry is on-chain; the LICENCE half is Class X and remains Nitro human.',
    module: 'launch',
    phase: '5',
    plane: 'P',
    status: 'socket',
    dependsOn: ['launch.token-factory'],
  }),
  f('launch.trust-layer', 'Launch trust — enforced LP locks, vesting proofs, deployer reputation (§35)', {
    module: 'launch',
    phase: '5',
    plane: 'P',
    status: 'socket',
    owner: 'shehzad002',
    dependsOn: ['launch.token-factory'],
    note: 'Law §35:834, gap-closed 2026-08-07. THE LAW CALLS TRUST THE MOAT IN MEME SEASON and nothing on the board carried it, which meant the anti-rug architecture was missing without being recorded as missing. launch.token-factory already removes the crudest rug — the deployed token has no mint, no owner, no pause and no upgrade selector, proven against the deployed bytecode — but the pool is the other half: liquidity that can be pulled, a team allocation that can dump, and a deployer with no history. LP locks and vesting must be ENFORCED BY CONTRACT rather than promised in a listing, or the badge is worse than no badge.',
  }),
  f('launch.treasury-yield', 'Tokenized T-bill vaults — stable balances opt into RWA yield (§36)', {
    module: 'launch',
    phase: '5',
    plane: 'P',
    status: 'socket',
    owner: 'shehzad002',
    dependsOn: ['launch.rwa'],
    note: 'Law §36:841, gap-closed 2026-08-07. launch.rwa records the licensing blocker for the issuance registry; this rides the same rail and had no row, so the blocker was written down for one half of the pair and not the other. The contract half is his. THE LICENCE IS CLASS X and remains Nitro human — a yield product over tokenised treasuries is a regulated instrument in most places we would offer it, and no contract makes that go away.',
  }),
  f('launch.fundraising', 'Fundraising module — milestones, investor management (§25:658)', {
    module: 'launch',
    phase: '5',
    status: 'socket',
    dependsOn: ['launch.token-factory'],
    note: 'Gap-closed 2026-08-07, and DELIBERATELY UNOWNED. The law names it with a service and a phase and no row carried it. It is a product surface — milestones, investor records, reporting — not chain work, so putting it on the chain owner would widen him into the fiat plane against his own sole-mountain law. The ON-CHAIN legs it would need (milestone escrow, vesting release) are his, under launch.trust-layer and S-G2. Agents may claim the product half.',
  }),
  f('launch.structured', 'Structured issuance — wrapped, synthetic, structured products (§25:661)', {
    module: 'launch',
    phase: '5',
    status: 'socket',
    dependsOn: ['launch.token-factory'],
    note: 'Gap-closed 2026-08-07. The law flags it §13 and there was no socket row, so §14.8 could not check it either — a deferral nobody could see is indistinguishable from an oversight. Unowned for the same reason as launch.fundraising: the product is fiat-plane, the wrapper contracts are chain. Nothing here may be built while any leg of it invents a price.',
  }),
  f('market.vendors', 'Vendor lifecycle — apply, vet, list, stake-gated slots', {
    module: 'market',
    phase: '5',
    dependsOn: ['token.staking'],
    requires: ['services/svc-market'],
    note: 'STAGE 1 ON MAIN (apply → vet) — NOT done. services/svc-market now exists: market.vendors (one row per user) plus append-only market.vendor_status_events enforced by a database trigger; applyAsVendor/mine on market:read/write, listApplications/vet/history on a new market:ops operator scope. market:read and market:write are UNSTUBBED in packages/auth — they read "svc-market not built" until this PR. /api/market is in svc-edge UPSTREAMS, so the module is kill-switchable at the door. NO money path: no @intafaced/ledger-client import and no amount column anywhere. NO vetting criterion — an operator supplies the decision and a required non-blank reason; VendorService.vet refuses any caller not holding market:ops with market.vet_operator_required, so a future policy engine cannot approve anything silently. NO stake numbers restated: vendorSlots stays in svc-token. Still open: Stage 2 stake-gated slots under a lock (reads token.stakeOf), Stage 3 public list eligibility, and the org-vs-user question — per-user chosen as the reversible answer (adding org_id later is a nullable column plus a backfill).',
  }),
  f('market.commerce', 'Listings, subscriptions, purchases, house commission', {
    module: 'market',
    phase: '5',
    dependsOn: ['market.vendors'],
  }),
  f('mining.pool', 'Stratum share protocol, PPLNS payouts', {
    owner: 'shehzad002',
    note: "HUMAN mining epoch/share protocol surface @shehzad002 (token minter remains svc-token). Agents babysit chain half. Plane deliberately left F 2026-08-07: the share/epoch protocol is the chain owner's, but minting stays custodial in svc-token, and relabelling the row P would misdescribe where the value moves.",
    module: 'mining-pool',
    phase: '5',
    dependsOn: ['token.emissions'],
  }),
  f('ops.custody', 'Custody operations — cold/warm/hot wallet tiers, multi-sig approval workflow', {
    module: 'core-ops',
    phase: '5',
    status: 'socket',
    dependsOn: ['ledger.double-entry'],
    note: 'Law §25 custody line, gap-closed 2026-08-07 and DELIBERATELY SPLIT rather than given one owner. This is how the PLATFORM holds its own funds — which wallets are online, how much sits in each tier, and who must approve a movement. The on-chain half (the multi-sig contract, the threshold policy, the hot-wallet perimeter) is @shehzad002 and already has board coverage as S-B2; the operational half (tiering policy, approval workflow, the console an operator uses) is ordinary agent work and Class X where real keys are involved. Naming it here so the capability stops being invisible: an unrowed custody surface is the one nobody notices is missing until it is needed under pressure.',
  }),
  f('ops.support', 'Support desk, tickets, KB', {
    module: 'core-ops',
    phase: '5',
    status: 'ready',
    dependsOn: ['identity.accounts'],
    note:
      'Stage-1 2026-08-07 #989: ticket spine. Stage-2 2026-08-07 #999: operator queue API (listQueue/next/claim) wired on svc-support — no money. ' +
      'CLAIM RELEASED 2026-08-08: was `wip` @cursor-swarm-ops-support. Released on evidence, not assumption — that swarm has no open PR and ' +
      'no branch on origin, and its staged work is already merged. A claim nobody is inside costs exactly what the collision it prevents costs: ' +
      'the next agent reads `owner` and stands down. ' +
      'Residual, re-derived 2026-08-08 and larger than "desk UI": tickets and comments are two in-process `Map`s (`support-service.ts`), so the ' +
      'desk loses every ticket on restart AND two replicas behind the edge serve disjoint ticket sets — the second is the argument that survives ' +
      '"just do not restart it". The claim in `operator-queue.ts` is read-then-write over a Map, so its exclusivity is TOCTOU by construction. ' +
      'Durability is not one class: svc-support has no `support` Postgres schema and no `svc_support` role in tooling/infra/postgres-init, and no ' +
      'TEST_DATABASE_URL_SUPPORT in CI — the store class is the small half. Note `env.ts` already REQUIRES DATABASE_URL through serviceEnvSchema ' +
      'while its own docblock says "no database"; the comment is the thing that is wrong, not the env. KB is further along than this row implied: ' +
      'five articles exist keyed with English copy in @intafaced/i18n, and `searchKb`/`getKbById` are written but not exposed on the router. ' +
      'Genuinely absent: any customer entry point — `create` is reachable only as a raw tRPC call through the edge, and the customer form must be ' +
      'Vue in the vendored shell, never a new SPA.',
  }),
  f('ops.affiliates', 'Multi-tier affiliate / IB trees, payout automation', {
    module: 'core-ops',
    phase: '5',
    status: 'ready',
    dependsOn: ['ledger.double-entry'],
    note:
      'READ THE DEFECT PARAGRAPH BELOW BEFORE TREATING `ready` AS A CLEAN START. ' +
      'Stage-1 2026-08-07 #996: admin treeStatus/node + payout refuse-closed. Stage-2 2026-08-07 #1008: members roster + freeze/unfreeze honestyLine. ' +
      'Stage-3 2026-08-07 #1027, WHICH THIS ROW NEVER RECORDED: durable commission accruals — migration 0007, an SQL store, and two MOUNTED ' +
      'procedures on svc-identity (`affiliates.accrueDryRun`, `affiliates.accrue`). ' +
      'CLAIM RELEASED 2026-08-08: was `wip` @cursor-swarm-affiliates — no open PR, no branch on origin. Kept `wip` rather than `ready` because ' +
      'the row is not idle, it is DEFECTIVE, and the next reader must not treat it as a clean start. ' +
      'THE DEFECT, found 2026-08-08 by reading #1027 rather than its PR title: `DEFAULT_ACCRUAL_TIERS` in `affiliates/commission.ts` hardcodes ' +
      '10% / 5% / 2% fee-share rates as the FALLBACK when a caller omits `tiers`, and `affiliates.accrue` persists rows computed from them. ' +
      'Nobody published those numbers. DIRECTION §8 item 10 reserves "every other fee-share rate" to the owner, and this row\'s own non-goal ' +
      'says no commission percentage without fee events. The refuse-closed gate was fitted to `payout` only — but the invented number enters at ' +
      'ACCRUAL, which is where a claim on real money is created; payout is merely where it leaves. It is also test-locked: the suite computes ' +
      'expected values from the fake rates, so deleting them reddens tests, which is how an honesty debt becomes load-bearing. ' +
      'Removing it is Class N, needs no owner number, and is the first thing to do here — port the discriminated-union law from ' +
      '`svc-trade/src/copy/fee-share-law.ts`, where `published: false` makes the rate unreachable in the type system rather than merely unset. ' +
      'Also open and not previously written down: `attribute` reads the parent map, decides, then inserts with no transaction, so two accounts ' +
      'referring each other concurrently can both pass the cycle check and write a 2-cycle the DB does not forbid — every later read then throws ' +
      '`referral.cycle` and that subtree bricks, with no repair path. `listByBeneficiary` is written and indexed and reachable from no procedure, ' +
      'so an affiliate cannot see their own earnings — and must not, until the rate law is fixed, or the statement shows fabricated money. ' +
      'Residual unchanged: Class M ledger recipe after DIRECTION §8 owner rates; reuse `rewardPay` + `sweepFeesToRewards` unchanged, because ' +
      'ADDING or CHANGING a ledger recipe is a DIRECTION §8 carve-out and stops being agent-mergeable.',
  }),
  f('ops.compliance', 'Screening queues, geo-block, VPN/Tor detection', { module: 'core-ops', phase: '5', dependsOn: ['identity.kyc'] }),
  f('ops.analytics', 'Warehouse — read replica + cube layer', {
    module: 'core-ops',
    phase: '5',
    status: 'ready',
    dependsOn: ['ledger.double-entry'],
    note:
      'Stage-1 2026-08-07: replica role law + honest empty warehouse surface in contracts (ops-analytics-warehouse) + ADR/runbook. No invent volume. ' +
      'CLAIM RELEASED 2026-08-08: was `wip` @cursor-swarm-analytics — no open PR, no branch on origin. ' +
      'THE `requires` IS DELETED IN THE SAME BREATH, and that matters more than the owner did. It named `packages/contracts`, a package eleven ' +
      'services import, so claim-check reported ALL of packages/contracts as owned by one analytics swarm: every agent touching any contract ' +
      'anywhere in the platform was told a human held it. `requires` is meant to prove a path exists on disk for a `done` claim; on an OWNED row ' +
      'it silently becomes a lock, and pointing it at a shared package locks the package rather than the feature. ' +
      'Residual, re-derived 2026-08-08 and CORRECTED — "admin consumer" is stale, #1032 landed one: apps/admin serves ' +
      '/api/analytics/warehouse over queryWarehouseSurface with 3 tests. What is actually missing: (1) LAG IS NEVER MEASURED. The only supply of ' +
      '`lagSeconds` in the tree is `ANALYTICS_REPLICA_LAG_SECONDS`, a string an operator types once — set it to 5 and the surface reports freshness ' +
      '`live` forever whether or not a replica exists. Nothing queries pg_last_xact_replay_timestamp or pg_stat_replication anywhere. It is ' +
      'harmless only because the GET path always passes zero facts, so no number is painted yet; the badge logic is already wrong. A lag reading ' +
      'must itself carry a measurement time, or a stale reading passes as fresh. (2) `assertAnalyticsReplicaRole` HAS NO PRODUCTION CALLER — the ' +
      'admin route reads a self-declared `ANALYTICS_REPLICA_CONFIGURED` boolean and never sees a URL, and the three ANALYTICS_REPLICA_*_URL vars ' +
      'in .env.example are read by no code. It is a check that would fail correctly if anything called it. (3) `empty` cannot distinguish "the ETL ' +
      'never ran" from "the ETL ran and found nothing" — no watermark exists, so `empty` currently overclaims. (4) No ETL/cube job; cube helpers ' +
      'have zero production callers. Not tracker done until replica wiring + one honest cube + access control ship.',
  }),
  f('ops.admin', 'apps/admin — listings, fee params, treasury, kill-switches', {
    module: 'core-ops',
    phase: '5',
    status: 'ready',
    dependsOn: ['infra.ui-tokens'],
    requires: ['apps/admin'],
    note:
      'CLAIM RELEASED 2026-08-08 by Nitro, by name, alongside `pay.gateway`. The `owner: Nitro` never meant a human was typing — ' +
      'it meant agents must not implement here, and that is now lifted. ' +
      'AND THE NOTE IT REPLACES WAS FALSE, WHICH IS THE MORE EXPENSIVE HALF. The old text — "apps/admin has ZERO test files and ' +
      'makes no network call of any kind ... every kill-switch, freeze and reconcile is React `useState`" — was true when written on ' +
      '2026-07-28 and has been wrong since 2026-07-30. Re-derived from the tree on 2026-08-08: apps/admin has 5 test files and ~50 ' +
      'cases; `/` and `/ledger` post through their own BFF routes to svc-edge `/admin/kill-switches` and `/admin/ledger/{freeze,unfreeze}`, ' +
      'which reach svc-ledger `/operator/freeze`; the console is mounted in docker-compose.apps.yml on :3100 with operator and treasury ' +
      'tokens. The five merges that made it real: #186, #360, #447 (which DELETED the fake freeze path), #436, #1032. ' +
      'EXACTLY ONE control is still inert — "Run reconcile (simulated)" (`ledger-ops.tsx`) — and it is honest about it three ways: the ' +
      'button says simulated, the payload field is named `simulated` rather than `result`, and `delivered: false` is a literal type so ' +
      'no code path can claim otherwise. Reconcile is dark at TWO layers, not one: svc-ledger never mounts its tRPC router, so ' +
      '`ledger.reconcile` has no HTTP surface at all, and svc-edge therefore has nothing to proxy. Per-flag switches on the kill board ' +
      'are session previews and say Preview on every row. ' +
      'WHY A STALE NOTE IS A REAL COST, not paperwork: this row is what a dispatcher reads before assigning work, and for eleven days ' +
      'it advertised shipped, tested, money-authority code as theatre — an invitation to rebuild it. That is the same failure the ' +
      'tracker header warns about, arriving from the opposite direction. ' +
      'Still NOT `done`, and the gap is not the UI: there is no fee-param or listing WRITE path anywhere in the platform (market rows ' +
      'are written by migration only), no operator-scoped treasury balance read, and the console is published on :3100 behind a shared ' +
      'token with no SSO and no network ACL — that exposure is Class X and no PR closes it.',
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
    owner: 'Nitro',
    dependsOn: ['dex.quote-router'],
    note: "OWNER-GATED, assigned to Nitro 2026-08-07 rather than left unowned — an unowned decision reads as unclaimed engineering, and this one is neither. It is not the chain owner's to take and no PR closes it. §13 — THE BLOCKER, and it is a DECISION, not code, not a chain. svc-dex can read three kinds of venue and all three are dark for different reasons. (1) `intachain-clob` reads svc-indexer, whose chain feed needs a contract emitting BookLevel/Fill/Position; only contracts/dev/DevVenue.sol does, a dev fixture with no book and no access control, INDEXER_VENUE_ADDRESS is the zero address and the adapter refuses to construct on it — that is socket.clob-contracts, a contracts decision. (2) `internal-book` reads svc-matching, which derives markets from journal replay, so its books stay empty until an order lands or trade.mm-bot seeds depth — an operations problem, not a code one. (3) External venues need one row in DEX_EXTERNAL_VENUES, and the default is `[]` deliberately: a service that had no outbound egress yesterday does not silently acquire it. THAT THIRD PATH NEEDS NO CODE, NO CHAIN AND NO CREDENTIALS — public depth is unauthenticated on any tier-one venue, and a live probe against a throwaway depth server proved the adapter prices correctly the moment a row exists. So the honest blocker is: NOBODY HAS DECIDED WHICH VENUE THIS PLATFORM QUOTES. Checked 2026-08-03 against both accepted ADRs (2026-07-28-vendored-exchange-integration, Accepted 2026-07-31 Option B; 2026-08-02-adopt-vendored-product-keep-our-ledger, Accepted 2026-08-02) and docs/SPEC-SOVEREIGN-ROUTING-AND-COPY-2026-08-01.md: NONE of them mentions svc-dex, a DEX, a CLOB, INTACORE or a venue at all, and none lists a DEX question among its open owner-gated items. The decision is not taken AND not tracked as pending — which is why this socket exists. Until it is taken, refusing with 503 is the correct product behaviour and must not be softened to make a screen look alive.",
  }),
  f('socket.dex-fee-source', 'Authoritative per-venue fee and settlement schedule', {
    module: 'dex',
    phase: '5',
    plane: 'P',
    status: 'socket',
    owner: 'shehzad002',
    dependsOn: ['dex.quote-router'],
    note: "Owner set 2026-08-07 (board S-I3). §13 — named in services/svc-dex/src/env.ts and never tracked until 2026-08-03. Fees are CONFIGURED, not sourced: DEX_CLOB_FEE_BPS (0), DEX_INTERNAL_BOOK_FEE_BPS (20) and DEX_CLOB_SETTLEMENT_COST ('0'). Understate either and the effective price reported is better than the one the user actually gets. The authoritative figures cannot be read yet — the per-market spot schedule lives in svc-trade's own `markets` row and §2 forbids reading another service's tables, and the on-chain CLOB has no deployed contract to publish one. The settlement cost of '0' is a DECLARED UNDERSTATEMENT: converting gas into the quote asset needs a gas oracle and a native-token price and neither exists in this stack. It costs nothing today because that venue has no chain to read, and it must be set before the first real on-chain quote is served. What keeps this honest rather than hidden is that every quote response discloses the exact feeBps and settlementCost applied per venue, so a caller can check the arithmetic against the venue's real schedule.",
  }),
  f('socket.dex-execution', 'Order execution against a quoted venue (§27 vault, §28 OMS)', {
    module: 'dex',
    phase: '5',
    plane: 'P',
    status: 'socket',
    owner: 'shehzad002',
    dependsOn: ['dex.quote-router'],
    note: "Owner set 2026-08-07 (board S-I4) — and note the SIZE of this row, which the one-line title hides: closing it means a Venue Vault (§27) and a whole service that does not exist (services/svc-execution, §28). It is not a residual on svc-dex. §13 — svc-dex QUOTES AND ROUTES; it cannot execute, and that is deliberate rather than unfinished. Every adapter declares `capabilities: ['quote','orderbook']` and `MarketDataSource.submit()` throws `VenueExecutionRefused` rather than returning a plausible rejection. Quoting needs no credentials (public depth is unauthenticated); execution needs trade-scoped Venue Vault credentials (§27) and an OMS (§28, svc-execution), and neither exists — there is no services/svc-execution in this repo. Keeping the refusal loud matters more here than anywhere else in the service: a silent or plausible-looking rejection on an execution path is how a caller concludes an order was placed. Also absent and named rather than implied: no per-venue rate-limit governor (this adapter fetches on every quote, so a busy market will be throttled — a venue answering 429 degrades to `unreachable` and drops out of routing, which is correct but is a degradation, not a governor), no WS streaming or sequenced/gap-detected books (§27 asks for WS-first; this is REST polling, and packages/market-data already holds the sequence machinery), and no cross-venue latency weighting (health() records round-trip per venue, so the input exists and nothing consumes it).",
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

  // ── PROTOCOL PLANE CAPABILITIES THE LAW NAMES AND THE BOARD NEVER DID ─────
  //
  // Added 2026-08-07. Each of these was a COUNTED GAP in tooling/coverage.yaml
  // — the law names the capability, no tracker row carried it, and the ratchet
  // held the count so it could not quietly grow. Counted is not the same as
  // assigned: a chain engineer reading the board could not see them, so a
  // handover that claimed to be his complete scope was not.
  //
  // The gap entries are closed in the same PR. Non-chain gaps (trading
  // engines, quant, mobile, CRM, tax, B2B) are deliberately NOT closed here —
  // that is a separate product-scope question and not a blockchain one.
  f('protocol.stealth-handles', 'Stealth handles — one human, two unlinkable presentations (§26)', {
    module: 'protocol',
    phase: '5P',
    plane: 'P',
    status: 'socket',
    owner: 'shehzad002',
    dependsOn: ['protocol.smart-accounts'],
    note: 'Law §26:746, gap-closed 2026-08-07. blueprint.attestations covers the zero-PII half — proving a rank without naming the person. This is the OTHER half and nothing carried it: a user receiving on-chain without the receiving address being linkable back to their other activity, plus indexer-side analytics that stay aggregate-only. Both are protocol-plane privacy and neither can be retrofitted once addresses are public, which is why it is a row now rather than after launch.',
  }),
  f('protocol.crew-vaults', 'Crew vaults — shared multi-sig treasuries, threshold spend, split on exit (§33)', {
    module: 'protocol',
    phase: '5P',
    plane: 'P',
    status: 'socket',
    owner: 'shehzad002',
    dependsOn: ['protocol.smart-accounts', 'blueprint.crews'],
    note: 'Gap-closed 2026-08-07. Crews already exist and are `done` on the custodial side (blueprint.crews — matching, capacity, membership). A shared TREASURY for one is a contract problem: member shares, an M-of-N spend threshold, and a defined split when someone leaves. The exit split is the part that must be designed before anyone deposits, not after — a vault that cannot fairly release a departing member is worse than no vault.',
  }),
  f('protocol.legacy-vaults', 'Legacy vaults — time-locked inheritance, staged heir release (§34)', {
    module: 'protocol',
    phase: '5P',
    plane: 'P',
    status: 'socket',
    owner: 'shehzad002',
    dependsOn: ['protocol.smart-accounts'],
    note: 'Gap-closed 2026-08-07, AND IT ARRIVES WITH A CONTRADICTION THAT MUST BE SETTLED BEFORE ANY CODE. §34:829 describes guardian M-of-N recovery; socket.social-recovery states the platform must never be a guardian, because a guardian is a second party who can take the account. Both cannot stand. The shape that satisfies both, and the only one to build without an explicit owner ruling: heirs and time locks the USER sets and can revoke, with no platform-controlled key ever eligible and no platform quorum able to move funds. If inheritance cannot be built without the platform being a party, the honest outcome is that this stays a socket — say so rather than shipping it. An ADR settles this, not a PR.',
  }),

  // ── §13 · DELIBERATELY NOT IN v1 ─────────────────────────────────────────
  f('socket.rust-matching', 'Rust port of svc-matching', {
    module: 'matching',
    phase: '5',
    status: 'socket',
    dependsOn: ['matching.engine'],
  }),
  f('socket.live-issuer', 'Live card issuer rail', {
    module: 'bank',
    phase: '5',
    status: 'socket',
    dependsOn: ['bank.cards'],
    note:
      '§13 — a card-scheme sponsor and an issuing BIN are a commercial relationship, not code: no amount of engineering time produces a ' +
      'licence or a contract. The seam exists and is named — the `CardIssuerAdapter` port in services/svc-bank/src/cards/issuer.ts, whose ' +
      'default `noCardIssuer` REFUSES with bank.no_card_issuer rather than falling back to the simulator, because a deployment somebody ' +
      'believes is live must not approve authorisations against a counterparty that does not exist. The ledger half of bank.cards is DONE ' +
      'behind this port (#770); what a live implementation adds is transport, credentials, signature verification and a latency budget — ' +
      'not a different set of decisions. On a live rail authorise/capture become a signed issuer webhook, never user procedures.',
  }),
  f('socket.psp-partners', 'PayPal / Stripe / live acquiring rails', {
    module: 'pay',
    phase: '5',
    status: 'socket',
    dependsOn: ['pay.rails'],
    note:
      '§13 — a sponsor bank and an acquiring BIN are a commercial relationship; no code closes this. Written 2026-08-06 under ADR ' +
      'docs/adr/2026-08-04-pay-rails-and-psp-socket.md (D-S-10, Accepted), which named this row as the least-documented socket on the ' +
      'board: four keys and no reason, with the blocker recorded only inside a runtime error string. §13 requires the reason in writing, ' +
      'so here it is rather than one throw site away. THE ADR ALSO SETTLED WHAT DOES NOT CLOSE IT: an orchestrator is not an acquirer. ' +
      'Hyperswitch is refused — Doctrine line 755 bars a third-party connectivity library in the money path, its connectors are not ' +
      'extractable from `hyperswitch_domain_models`, and adopting it would buy a hundred and twenty ways to reach acquirers we still have ' +
      'no relationship with. §24 Lane B already put principal membership / own acquiring licences on this socket, and a library cannot be ' +
      'on that path. Reopening the Hyperswitch question is an owner call, not an agent one. WHAT EXISTS WITHOUT IT: the seam is named and ' +
      'refuses by name — `RailOperationUnsupportedError` in services/svc-pay/src/rails/rail-adapter.ts points card operations (partial ' +
      'capture, void, 3DS/SCA, disputes) at this socket instead of answering plausibly, and `RailMode` carries `absent` distinctly from ' +
      '`sandbox` so a missing acquirer cannot read as a working one. card-sandbox is dev/test only: PAY_REGISTER_CARD_SANDBOX defaults off ' +
      'in staging/prod, PAY_CHECKOUT_RAILS is crypto-native alone, and PAY_ALLOW_SANDBOX_RAILS=false makes those environments refuse to ' +
      'boot with a sandbox rail registered. Pointing any rail at real money is Class X.',
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
    owner: 'shehzad002',
    dependsOn: ['protocol.smart-accounts'],
    note: 'Owner set 2026-08-07: this is Protocol Plane key custody and belongs to the chain owner, not to whoever claims it first.',
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
    owner: 'shehzad002',
    dependsOn: ['protocol.smart-accounts'],
    note: '2026-07-30 PARTIALLY CLOSED. Solidity is compiled and executed now: solc 0.8.28 pinned in package.json, `contracts:build` emits committed artefacts, and the account suite runs against anvil in CI (REQUIRE_EVM_CHAIN=1) — 31 contract tests including the CREATE2 cross-check. FIRST COMPILE FOUND A BUG NOBODY COULD HAVE SEEN: ConstantProductPool.swapExactIn called `swap`, which is `external`, so the AMM pool produced no bytecode and was undeployable. THAT IS FIXED — #228 introduced a private `_swap` shared by both entrypoints and the suite is now pinned `expect: compiles` in scripts/contract-sources.mjs (corrected here 2026-08-07; this note claimed a broken suite eight days after it was repaired, which is how the AMM ends up on a task board as if it were greenfield). Remaining: no Foundry/forge invariant or fuzz suite, no gas snapshots, and no audit — this proves the contracts compile and behave, not that they are safe. Blocks any mainnet deploy.',
  }),
  f('socket.contract-audit', 'External audit of the account + factory suite', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    status: 'socket',
    owner: 'shehzad002',
    dependsOn: ['socket.contract-toolchain'],
    note: 'Owner set 2026-08-07. NOTE THE OWNER-GATED HALF: choosing and PAYING an audit firm is a Nitro decision (budget), so this row can be prepared — scope, threat model, artefact hashes, `audited:false` honesty — but cannot be closed by engineering alone.',
  }),
  f('socket.userop-differential-test', 'getUserOperationHash checked against a live EntryPoint', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    status: 'socket',
    owner: 'shehzad002',
    dependsOn: ['socket.contract-toolchain'],
    note: 'Owner set 2026-08-07. Small job, serious failure mode: src/chain/userop.ts computes the hash a user signs and has only ever been checked against itself and golden vectors. If it disagrees with the deployed EntryPoint, users authorise one operation and the chain executes another.',
  }),
  f('socket.p256-verifier', 'Passkey (P-256) owner verifier contract', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    status: 'socket',
    owner: 'shehzad002',
    dependsOn: ['protocol.smart-accounts'],
    note: 'SmartAccount already routes contract owners through ERC-1271; the verifier itself is not built. Owner set 2026-08-07, and this is arguably the highest-value unbuilt item in the protocol suite: until a P-256 verifier exists on-chain, "passkey smart accounts" is true of the service and NOT true of the chain — the account cannot check a passkey signature itself. Named on the blockchain task board as S-A9.',
  }),
  f('socket.social-recovery', 'Guardian-based account recovery', {
    module: 'protocol',
    phase: '5P',
    plane: 'P',
    status: 'socket',
    owner: 'shehzad002',
    dependsOn: ['protocol.smart-accounts'],
    note: 'DOCTRINE, not a backlog item, and the blockchain task board contradicted it until 2026-08-07 (board S-A1 invited a guardian/multi-sig design; this row forbids one). RESOLVED IN FAVOUR OF THIS ROW: the platform must NEVER be a guardian, because a guardian is a second party who can take the account. What is permitted, and is the only shape worth designing: guardians the USER elects and can revoke, where no platform-controlled key is ever eligible, no platform quorum can move funds, and the recovery path is provable to the user without trusting us. If that cannot be built without the platform being a party, the honest answer is that this stays a socket.',
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
    owner: 'shehzad002',
    dependsOn: ['indexer.readmodels'],
    note: 'Owner set 2026-08-07 — the CONTRACT is the chain owner\'s (board S-C1); the indexer adapter that reads it stays agent residual, and the two must not be confused. services/svc-indexer/src/chain/evm/abi.ts declares three events — BookLevel, Fill, Position — and abi.test.ts holds them to the compiled ABI of contracts/dev/DevVenue.sol. DevVenue is a DEV FIXTURE and says so in its own header: no order book, no matching, no custody, and no access control at all (anyone can publish any trade). It exists so the adapter decodes logs a real chain produced. INDEXER_VENUE_ADDRESS therefore has no honest default — it is the zero address, EvmChainSource refuses to construct on it (eth_getLogs against 0x0 returns [] forever, which would fill the read model with a confident permanent "no liquidity"), and docker-compose.apps.yml leaves INDEXER_RPC_URL empty so the shipped stack still boots NullChainSource. Blocked on there being a venue contract to read, which is a contracts decision and not an indexer one: the adapter does not depend on which events it decodes.',
  }),
  f('socket.indexer-stream', 'Live book/tape feed from the projection (§5.2 ws-gateway)', {
    module: 'indexer',
    phase: '3P',
    plane: 'P',
    status: 'socket',
    dependsOn: ['indexer.readmodels'],
    note: 'The read path is pull-only today. packages/market-data already computes the deltas; what is missing is a subject in packages/events and the transport. DELIBERATELY LEFT UNOWNED 2026-08-07: the TRANSPORT is ordinary agent work, while the EVENT SURFACE it carries is defined by the venue contract (socket.clob-contracts, @shehzad002). Giving one owner both would either block agents on a chain decision or let an agent freeze a chain event shape.',
  }),

  // ── §13 · PROTOCOL PLANE HOLES NAMED 2026-08-07 ──────────────────────────
  //
  // Four capabilities the whole registry never mentioned. They were found by
  // auditing the blockchain task board against this file: each is either
  // required by a row that already exists, or is a decision nobody has been
  // asked to take. An unnamed hole is the same failure mode this file was
  // built to prevent — work gets rebuilt, or a dependency is discovered
  // halfway through the thing that needed it.
  f('socket.paymaster-policy', 'Who pays gas — ERC-4337 paymaster + sponsorship policy', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    status: 'socket',
    owner: 'shehzad002',
    dependsOn: ['protocol.smart-accounts'],
    note: "§13 — src/chain/userop.ts already carries every paymaster field of the v0.7 user operation, and NOTHING decides who pays. Without a paymaster, a user must hold the chain's native token before their passkey account can do anything at all, which quietly removes the retail half of the self-custody story: the account exists, is provably theirs, and cannot move. Not merely a contract — a sponsorship POLICY (who is sponsored, for what, up to what, and how abuse is refused) and a funded account behind it, which makes the funding half a Nitro decision. Named on the blockchain task board as S-A10.",
  }),
  f('socket.bundler-policy', 'Bundler dependency — public relay or self-hosted', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    status: 'socket',
    owner: 'shehzad002',
    dependsOn: ['protocol.smart-accounts'],
    note: "§13 — PROTOCOL_BUNDLER_URL exists in env.ts and is optional, and no decision sits behind it. The service correctly still builds and verifies operations without one and lets the user submit. But a public bundler is a third party that can censor or reorder a user's operation, and a self-hosted one is infrastructure we then run: that is a sovereignty question, not a config default. State the choice and its failure mode before the first real deployment. Named as S-A11.",
  }),
  f('socket.price-oracle', 'Price oracle for on-chain marks and liquidations', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    status: 'socket',
    owner: 'shehzad002',
    dependsOn: ['protocol.smart-accounts'],
    note: '§13 — protocol.lending REQUIRES oracle marks for LTV and liquidation and there has never been an oracle row anywhere in this registry; the task board carried it only as "write an ADR about it", which turns a hard dependency into a document. Nothing about this may be invented: a mark that is guessed liquidates real collateral. Needs a stated source set, a staleness bound, a disagreement rule between sources, and a fail-closed answer (refuse to liquidate) rather than a fallback price. Blocks protocol.lending and couples to protocol.amm. Named as S-A12.',
  }),
  f('socket.deployment-registry', 'Which contracts are deployed where, and verified against what source', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    status: 'socket',
    owner: 'shehzad002',
    dependsOn: ['protocol.smart-accounts'],
    note: '§13 — every contract address in env.ts defaults to the zero address, and there is no tracked artefact anywhere saying "these addresses, on this chain, deployed from this source hash, verified on this explorer". The suite already knows how to prove deployed bytecode matches a template with the immutable ranges masked (launch.token-factory found that the naive check is wrong and looks right), so the hard part is done and unrecorded. This is the first thing an auditor or an integrator asks for, and the first thing that is impossible to reconstruct later. Named as S-A13.',
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
