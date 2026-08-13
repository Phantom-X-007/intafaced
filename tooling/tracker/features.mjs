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
  f('infra.slo-dashboards', '§14.5 metrics — /metrics on the edge, scraped, one live SLO dashboard', {
    module: 'core-ops',
    phase: '0',
    status: 'done',
    requires: [
      'packages/telemetry/src/metrics.ts',
      'tooling/infra/grafana/dashboards/edge-slo.json',
      'tooling/infra/grafana/provisioning/dashboards/dashboards.yaml',
    ],
    dependsOn: ['infra.compose'],
    note:
      'LANDED 2026-08-08. The METRICS half of §14.5; traces landed separately in packages/telemetry/src/start.ts and are not ' +
      'restated here. Verified absent first: prom-client / "text/plain; version=0.0.4" / http_request_duration matched NOTHING ' +
      'under services/ or packages/, prometheus.yaml was 16 lines scraping only itself and nats:8222, and grafana/ held a ' +
      'datasource file with no dashboard and NO PROVIDER that could have loaded one. ' +
      'DONE-BAR EVIDENCE. (1) REACHABLE — proved three ways, not asserted. metrics.boot.e2e.test.ts SPAWNS THE REAL index.ts, ' +
      'binds a real socket and scrapes it, so deleting the registerMetrics call from index.ts turns 5 tests red (it turned none ' +
      'red before that file existed, which is why it exists). Out of band, the committed prometheus.yaml was loaded by real ' +
      'prom/prometheus:v3.0.1 and reported job=svc-edge health=up url=http://svc-edge:4000/metrics; real grafana/grafana:11.4.0 ' +
      'loaded the committed JSON with provisioned=true provisionedFile=edge-slo.json, all 5 panels, and every panel query ' +
      'returned live series through Grafana own datasource proxy (availability 0.9596, p99 pay 2.39s). (2) TESTED — 45 ' +
      'assertions across 4 suites, all parsing the ENDPOINT OUTPUT rather than calling render(); mutation-checked, see the PR for ' +
      'the 9-mutation table. promtool check metrics accepts 934 lines of real output; promtool check config accepts the scrape ' +
      'file. (3) NOT PROPPED UP — no stub, no mock, and NO NEW DEPENDENCY (prom-client rejected; the 0.0.4 format is frozen and ' +
      'a library would not have answered either hard question, which were "does anything scrape it" and "does the panel name ' +
      'what we emit"). ' +
      'WHAT IS NOT COVERED, PLAINLY. ONE of 19 services emits metrics — svc-edge. The panel is an EDGE-MEASURED SLO: 15 modules ' +
      'appear as `module` label values when traffic crosses the edge (academy agents bank blueprint dex identity indexer market ' +
      'notify p2p pay protocol support token trade), and svc-ws, svc-ledger and svc-matching are NOT covered at all because they ' +
      'do not sit behind the edge (routes.ts OUTSIDE_THE_DOOR). No service instruments its own internals; a module with no ' +
      'traffic has no series. So §14.5 read as "at least one SLO dashboard panel" is met and proven; read as per-service ' +
      'instrumentation it is 1/19 and the remaining 18 are residual. The series names, label set and buckets live in ' +
      'packages/telemetry so the next adopter needs no dashboard edit — it appears as another `service` value.',
  }),
  f('infra.i18n', '100+ languages — keyed from day one (§9)', {
    module: 'core-ops',
    phase: '0',
    status: 'ready',
    requires: ['packages/i18n'],
    dependsOn: ['infra.ui-tokens'],
    note: 'Owner released 2026-08-08 (axis C1 / Nitro green light). Downgraded 2026-07-28: `@intafaced/i18n` is imported by zero files outside its own package. apps/web hardcodes English in a `copy` object whose comment calls i18n "being built in a separate worktree". "Keyed from day one" is not true of any surface.',
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
    note:
      'Base keys on main. **D26-P1-I1 / D-S-11 sealed 2026-08-12** — ownership doors (assertOwned + assertTransferDoor), ' +
      'cross-leak ban via ledger subAccountTransfer only, trade S2S ownership gate, live-partition cap (IDENTITY_MAX_SUB_ACCOUNTS), ' +
      'no per-sub-account tier/jurisdiction. Class M. Do not invent money routing / KYC vault.',
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

  f('identity.pii-isolation', 'PII isolation — KYC documents in a separate encrypted store (§10)', {
    module: 'identity',
    phase: '1',
    plane: 'F',
    status: 'wip',
    owner: 'ZenYoda3',
    dependsOn: ['identity.kyc', 'identity.kyc-review'],
    requires: [
      'services/svc-identity/src/kyc/document-store.ts',
      'services/svc-identity/src/kyc/provider-ref-bind.ts',
      'services/svc-identity/drizzle/0010_kyc_document_store.sql',
    ],
    note: 'Law §10:443. WIP L11 wave 13 (2026-08-10): encrypted vault (#1348) + principal-bound getFor/deleteFor (no free get-by-id cross-user read) + operator tRPC storeDocument/listDocuments/bindDocument (meta only, never bytes) + provider_ref bind ownership gate + monorepo gate no foreign service touches kyc_documents. STILL NOT done: (1) production index.ts must wire kycDocs when IDENTITY_KYC_DOC_KEY set — held while Denon #1626 dual-writes index/auth-service; (2) live verification vendor webhook Class X owner. Services get status flags only; kyc.status never returns provider_ref or document bytes.',
  }),
  f('infra.drop-flags', 'Drop phases 0–V as feature flags — waitlist, referral queue, founding badges, season engine (§11)', {
    module: 'core-ops',
    phase: '1',
    plane: 'F',
    status: 'wip',
    owner: 'ZenYoda3',
    requires: ['packages/config/src/flags.ts'],
    dependsOn: ['infra.config'],
    note: 'Law §11:456. SWITCH mountain (not the features behind it). 2026-08-09 W10 L14: product refuse path shipped — `assertEnabled` / `FlagDisabledError` so waitlist+referral refuse when off (wrong phase / override / kill); `offReadiness` makes OFF unbuilt plan rows read `unbuilt` not ready (tracker Done-bar). Residual: wire callers in waitlist/referral services when those surfaces exist; founding-badge mint remains launch.nft (chain). NOT PROMISED: no drop phase in coverage.yaml carries `promised: true`.',
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
    status: 'wip',
    owner: 'Phantom-X-007',
    dependsOn: ['trade.spot'],
    requires: ['services/svc-trade/src/futures'],
    note:
      'WIP 2026-08-12 Denon D26-P1-T1e (feat/futures-gap-series-proof / #1689): mark/liq honesty on gapping depth series ' +
      '(mark-gap-series-honesty.test.ts — markSourceFromDepth mid gap + smooth-ramp control). ' +
      'Also sealed on tip: #1685 T1g ADL disclosure; #1684 T1d insurance shortfall; #1681 T1c partial vs real book; #1679 T1f; #1678 T1b. Isolated margin ONLY. ' +
      'Orderable only when TRADE_FUTURES_ENABLED (default OFF). Same svc-matching book (D-S-06). ' +
      'Sealed W3 money: #1136 ladder mechanism + gap-series, #1202 funding membership freeze, #1203 insurance shortfall bound, ' +
      '#1204 funding rate abs bound (env or refuse — no invented ceiling), #1211 margin-call transport stub (no grace without delivery), ' +
      '#1672 T1a mark law, #1670 insurance list gate, #1678 T1b, #1679 T1f, #1681 T1c, #1684 T1d, #1685 T1g. ' +
      'Still not umbrella-done: leveraged entry product, funding jobs OFF default + owner §8 rates/ceilings, ' +
      'Denon ladder numbers (D3), N1 profit-source capitalisation. ' +
      'D26-P0-17 SEALED 2026-08-13 (adr/2026-08-13-insurance-fund-funding-policy.md): empty insurance pot → no live list ' +
      '(trade.insurance_fund_empty); futuresInsuranceTopup; no invent target size. ' +
      'D26-P0-07 SEALED 2026-08-13 (adr/2026-08-13-leverage-defaults-frozen.md): 10× isolated frozen; no silent raise. ' +
      'D26-P0-14 SEALED 2026-08-13 (adr/2026-08-13-mark-dust-floor.md): keep shipped min-best 100 quote + 100 bps; no third %. ' +
      'Never invent mid/funding/grace/ADL rates.',
  }),
  f('trade.options', 'European options, cash-settled, full collateral in v1', {
    module: 'trade',
    phase: '2',
    dependsOn: ['trade.futures'],
    requires: ['services/svc-trade/src/spot/options-listing.ts'],
    note:
      'D26-P0-05 SEALED 2026-08-13 (adr/2026-08-13-options-forex-settlement-asset-law.md): European cash full-collateral; ' +
      'opaque TRADE_OPTIONS_SETTLEMENT_ASSET_LAW = ADR-in-force, never a parsed coin table; live set stays P0-06. ' +
      'D26-P1-T6: listMarket throws trade.options_settlement_law_unset while stamp empty (SOCKET §13 socket.options-settlement-asset-law). ' +
      'Fixing alone must not unlock. After operator stamp: TRADE_OPTIONS_SETTLEMENT_FIXING + complete European terms required; ' +
      'DB CHECK markets_options_terms_ck. No IV surface, no invent live set / settlement asset / D7 source. Orders still refused by ' +
      'assertTradable (trade.market_kind_unsupported). Product-complete only after stamp + D7 + engine — ADR landing is not Done.',
  }),
  f('trade.otc', 'OTC RFQ desk, staked-tier gate', {
    module: 'trade',
    phase: '2',
    status: 'wip',
    owner: 'Phantom-X-007',
    dependsOn: ['trade.spot', 'token.staking'],
    requires: ['services/svc-trade/src/otc'],
    note:
      'WIP 2026-08-12 Denon D26-P1-T2 (feat/trade-otc-rfq-settle): RFQ→stake→fail-closed quote (mid asOf + owner maxMidAgeSeconds)→ledger settle. ' +
      'Stage #1000 + #1097: RFQ refuse-closed blank §8; accept binds quoted price (no last look); caller mid removed; settle via marketMakerMakerFill. ' +
      'requires narrowed to src/otc (W4) so a future claim cannot whole-lock svc-trade via this row alone. ' +
      '2026-08-12 maker-routing seal: deskStatus.makerRouting + planOtcSettle refuse name socket.otc-maker-routing (platform principal settle remains real). ' +
      '2026-08-12 mid-feed seal: deskStatus.midFeed names socket.otc-mid-feed refuse-closed (boot TRADE_OTC_MIDS map ≠ live observation feed). ' +
      'Residual OWNER: §8 spreads/stake/maxMidAgeSeconds numbers, live observation feed close for socket.otc-mid-feed, maker-routing recipe close, durable quotes table. ' +
      'copy/algo released 2026-08-08 (not Nitro-owned). connect.venue-vault remains @shehzad002 key custody (socket; no module→svc-trade invent after W4 A0).',
  }),
  f('trade.copy', 'Copy trading, audited leaders, fee-share (not profit-share)', {
    module: 'trade',
    phase: '2',
    plane: 'B',
    status: 'wip',
    owner: 'Phantom-X-007',
    dependsOn: ['trade.spot'],
    requires: [
      'services/svc-trade/src/copy',
      'services/svc-trade/src/copy/auto-mirror-place.ts',
      'services/svc-trade/src/copy/copy-auto-mirror-place-done-bar.test.ts',
    ],
    note:
      'CLAIM 2026-08-12 Denon agent (feat/copy-trading-deepen-2026-08-12): SOCKET §13 `socket.copy-auto-mirror-place` — ' +
      'placeMirror refuse-closed after planMirror; never invent spot fills. ' +
      'D26-P0-15 SEALED 2026-08-12: jurisdiction refuse-closed until owner TRADE_COPY_JURISDICTION_LAW ' +
      '(adr/2026-08-12-copy-jurisdiction-refuse-closed.md) — never invent geo list. ' +
      'Prior: deskStatus.sovereign + P0-02 residual cites; kill/unfollow real (#1692). ' +
      'W13 L10: settle fillId claim + listMyFollows + planMirror. Product is **fee-share** only; P&L profit-share banned (§95). ' +
      'Still open: owner rates (P0-02) + region table (P0-15 content); session-key caps (protocol); closing the place socket with a real follower wire.',
  }),
  f('trade.forex', 'Fiat pairs on the same engine', {
    module: 'trade',
    phase: '2',
    dependsOn: ['trade.spot', 'pay.rails'],
    requires: ['services/svc-trade/src/spot/forex-settlement.ts', 'packages/contracts/src/instruments.ts'],
    note:
      'D26-P0-05 SEALED 2026-08-13 (adr/2026-08-13-options-forex-settlement-asset-law.md): shape-law only — euro-stable ≠ fiat rails. ' +
      'D26-P1-T7: explicit §13 socket.forex-settlement refuse-closed until P0-05 (now sealed) AND fiat settle rails — ' +
      'forex.settlementStatus + list/place/setMarketStatus(active) share trade.unsettled_asset_class_listing; never invent settlement asset. ' +
      'On OPEN_MONEY allowlist 2026-08-08. **Not "unlisted"** — migration `0001_multi_asset_instruments.sql` seeds six majors active ' +
      '(EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CHF, USD/CAD) and the public market list publishes them `active: true`. They are **unfundable** ' +
      '(no live fiat rail settles; only crypto-native + card-sandbox inbound). #1169/#1220 + T7 socket refuse NEW production listing and place. ' +
      'What exists: asset_class + schedule; assertMarketOpen; D-S-05/T7 listing+place refuse. Full product blocked on rails, not on "no markets listed."',
  }),
  f('trade.algo', 'TWAP / VWAP / POV execution', {
    module: 'trade',
    phase: '2',
    status: 'ready',
    dependsOn: ['trade.spot'],
    note:
      'Owner released 2026-08-08. D-S-04 TWAP Stage #1002 + ADR #1145 + #1193 (re-space, cancel atomicity, scheduler mounted default OFF via TRADE_ALGO_JOBS_ENABLED). ' +
      'Create works when TRADE_ALGO_ENABLED; children fire only when jobs ON. VWAP/POV out — market maturity (owner), not missing candles. ' +
      'Residual craft: cancel-fail still leaves parent active (W4), tickAll isolation, hydrate on mutate, principal durability socket. Tip re-verified W4.',
    requires: ['services/svc-trade/src/algo'],
  }),
  f('trade.ccxt-api', 'CCXT-compatible public API (bots + terminals connect)', {
    module: 'trade',
    phase: '2',
    status: 'ready',
    dependsOn: ['trade.spot'],
    requires: [
      'services/svc-trade/src/public-rest.ts',
      'services/svc-trade/src/private-rest.ts',
      'services/svc-trade/src/ccxt-capability-matrix.ts',
    ],
    note: 'On OPEN_MONEY allowlist 2026-08-08. Contract-complete — all REST_ROUTES mounted. Bot-ready capability matrix + refuse surface in services/svc-trade/src/ccxt-capability-matrix.ts (D26-P1-T5 / paste-w10 L02 A1): every REST_ROUTES row + open/close extensions; refuse arms setLeverage/setMarginMode 501, funding-rate unsupported 501, caller price on open/close 400 — tests fail if matrix claim ≠ wire. Public: markets (paper + schedule/sessionOpen), orderbook, ticker, tickers, trades (?since=), ohlcv (real fills only), funding-rate (published or NotSupported). Private: orders, account, positions list/open/close. Edge rate limiter ON (N4 residual vs published contract). W13 L10: public GET /api/v1/capabilities serves matrix+refuse arms. Residual: paper-list exclude policy (N3 Nitro), rate-limit published vs edge 300/min (N4), mm seed ops.',
  }),
  f('trade.mm-bot', 'Internal market-maker seeding books at launch', {
    module: 'trade',
    phase: '2',
    status: 'ready',
    dependsOn: ['trade.spot'],
    requires: ['services/svc-trade/src/mm'],
    note: 'Owner released 2026-08-08 (axis C1 / Nitro green light). seedMarket + job OFF default + marketMakerMakerFill + settleFill house-MM; cancel/reseed lifecycle + mid port on main (MM-1/2/3). D26-P1-T10 backend honesty: seed-honesty contract (flagged / killable / no manufactured crosses); resting seeds recorded seeded=true; TRADE_MM_SEED_ENABLED kills placeOrder seeded path too. Still residual: orderFilled event accountId recovery, production mid ops. Not Done — ready with ops kill-switches.',
  }),
  f('venue.aggregation', 'External venue adapters via CCXT (cross-venue)', {
    module: 'trade',
    phase: '2',
    status: 'ready',
    dependsOn: ['trade.spot'],
    requires: ['packages/venue-adapter', 'packages/venue-contracts'],
    note: 'Updated 2026-08-02 A-TRADE-VENUE-OPS. NOT "via CCXT" — §27 forbids a third-party connectivity library in the money path and there is no `ccxt` in the workspace by design; we are that layer. Fabric: packages/venue-contracts + packages/venue-adapter (Binance spot public market data only; trading half deliberately not ready). Mounted in svc-trade: TRADE_VENUE_MARK_VENUE + TRADE_VENUE_MARK_SYMBOLS default empty/OFF — when set to binance-spot + marketId:symbol map, public book mid preferred for futures marks (A-TRADE-VENUE-1); optional TRADE_MM_SEED_MID_FROM_VENUE for MM mid after env map miss (A-TRADE-MM-3). Ops enable path: services/svc-trade/README.md "Venue fabric mark". Never invents mid (empty venue, unknown id, unmapped market, empty book → null). Still `ready`, not `done`: (1) one public venue only — second venue needs a real MarketDataAdapter + createVenueMarketDataAdapter id; (2) TRADING half NOT BUILT (credentials throw not_ready); (3) no live-network CI; (4) futures risk truth remains human M3. VENUE VAULT REMOVED FROM THIS DONE BAR 2026-08-08 — AND NOT AS A LOOSENED BAR, AS AN INVERTED ONE. From 2026-08-02 this note carried "Venue Vault absent" as residual (3), while `connect.venue-vault` is `phase: 5`, `status: socket`, owner @shehzad002 and `dependsOn: [venue.aggregation]` — the Vault is DOWNSTREAM of this row. A done bar that names its own dependent can never be satisfied by anyone: this row was waiting on a phase-5 socket that is waiting on this row, and the tracker cycle detector cannot see it because one leg is prose and the other is data. Six phase-2 rows (connect.latency-grading, connect.data-lake, execution.sor, execution.arbitrage, execution.market-making, execution.house-tenant) compute `blocked` behind this row, so the cost of the inversion was a phase-2 stack parked behind another developer\'s phase-5 socket. On the merits it does not belong here either: §27:761 is per-USER encrypted external API keys, HSM-backed and trade-only, so a user can trade THEIR OWN accounts on other venues. Nothing in this row touches a per-user credential — cross-venue market-data aggregation reads public books, and house routing signs with house keys. The Vault remains the hard blocker it always was under socket.dex-execution and under the external-venue half of quant.sdk (§29:787 takes its keys from the Vault, trade-only). The four residuals above are unchanged and are the real bar; this row stays `ready`, not `done`.',
  }),
  f('connect.venue-vault', 'Venue Vault — per-user external API keys, HSM-backed, withdrawal refused (§27)', {
    phase: '5',
    status: 'socket',
    owner: 'shehzad002',
    dependsOn: ['venue.aggregation'],
    note:
      'Law §27:761. KEY CUSTODY — owner @shehzad002 (chain expertise, not protocol plane). Vault design + key handling + withdrawal-permission refuse = his. ' +
      'Wiring svc-trade once a vault exists = ordinary agent work. W4 A0: removed `module: trade` so claim-check no longer invents services/svc-trade for this socket ' +
      '(there is no vault tree under svc-trade yet; whole-service lock was a false claim-check hit). Add requires when a real path exists. ' +
      'Non-negotiable: stored key with withdrawal permission refused at registration, not filtered at use.',
  }),
  f('connect.latency-grading', 'Latency grading — every adapter scored live, feeding routing weights (§27)', {
    module: 'trade',
    phase: '2',
    plane: 'B',
    dependsOn: ['venue.aggregation'],
    requires: ['packages/venue-adapter/src/fabric/latency.ts', 'packages/venue-contracts/src/latency.ts'],
    note: 'Law §27:760, gap-closed 2026-08-08. WHAT IS DECIDED: `docs/adr/2026-08-04-predict-quant-connect-law.md` (D-S-18, Accepted) puts §27 in scope and states the rule this row lives under — "latency grading is a MEASUREMENT, never an estimate": an adapter that has not run has NO score, not a low score, and an unscored adapter must not receive routing weight. WHAT IS NOT DECIDED: which venues we connect and in what order — D-S-18 reserves that to the owner, commercial before technical. No weight function is proposed here either; the consumer is `execution.sor`, and §28:770 makes the latency grade ONE INPUT to that cost model, not a ranking rule of its own. UNBLOCKED AND BUILT 2026-08-09 (D26-P1-X1). Two corrections to what this note said before, both of which had gone stale rather than been wrong when written: (a) it said "this capability had no row at all" while ALSO describing the plumbing as unbuilt — in fact `packages/venue-adapter/src/fabric/latency.ts` and its tests landed in #209 (ee334a6f) with the fabric, and both venue adapters have fed their grader on every REST exit since; (b) the stated blocker — "`venue.aggregation` is one public market-data adapter (Binance spot)" — was removed by #1148 (1ae907dd), which landed `bybit-spot` as a second public MarketDataAdapter registered in `createVenueMarketDataAdapter`. A grade with no peer is a number and a median of one venue is that venue\'s opinion of itself, so the blocker was real; it is simply spent. WHAT THIS PR FIXED, and it was the load-bearing defect rather than missing code: an adapter with no observations graded `\'F\'`, which D-S-18 forbids in as many words. `\'F\'` asserted a measured property of a venue we may never have contacted, AND was indistinguishable from a venue we did measure and found unusable — two states needing opposite responses (venue fault vs unwired plumbing on our side). The old test asserted the defect as intended behaviour ("grades an unmeasured venue F, not A"). Now: `grade: null` for ungraded — the fabric\'s existing refusal convention alongside empty venue, unknown id, unmapped market and empty book — with every derived statistic `null` too, because a 0% reject rate over zero samples is a perfect score awarded for silence. `isGraded()` is a TYPE GUARD, so code that ranks on the letter cannot compile without handling the ungraded case. Ungraded still does not earn routing weight (D-S-18 second clause): `healthFromGrade` marks it unhealthy and the router excludes AND reports it through existing machinery. The measurement is named — `LatencyMeasurement` is a union of one, `rest-round-trip`, recording what it does NOT measure (stream delivery lag, book staleness per #1163 `observedAt`, venue-side matching, and time spent waiting on our own rate-limit governor — that last is tested, since charging a venue for a delay we imposed would argue for routing away from a venue that did nothing wrong). REACHABLE: `latencyGrade?()` is declared on `MarketDataAdapter` in venue-contracts, so the grade is readable through the type consumers actually hold (`createVenueMarketDataAdapter` returns `MarketDataAdapter | null`); a method on the concrete class alone would have been invisible through it, which is the unreachable-guard failure this repo has hit repeatedly. 197 tests in venue-adapter (was 184), fixtures and injected clocks only — no live-network CI was added, that remains `venue.aggregation` residual (4) and a separate decision. `ready`, NOT `done`, and the reason is the REACHABLE limb of the three-part bar rather than modesty: the grade is reachable through the contract but NO SHIPPED CONSUMER READS IT. Nothing calls `latencyGrade()` outside tests, and the natural consumer is `svc-trade`, which was out of bounds for this change (residual wave, four futures PRs the same day) — and the real consumer is `execution.sor`, which is blocked and does not exist. Code-complete but unconsumed is `ready`. ON THE RENDERED BADGE, which says `blocked` and is not a contradiction: `blocked` is computed, not declared, and this row still `dependsOn` `venue.aggregation`, which is itself `ready` rather than `done` (its residuals 2/3/4 — no trading half, no live-network CI, futures risk human M3 — are untouched by this work). So the edge stays and the badge stays. What changed is that the specific blocker this row\'s note named, one venue, is spent: the work was buildable and is built. Read the badge as "its dependency is not `done`", not as "nothing here exists". RESIDUAL for whoever takes it further: (1) no consumer — wire a health/ops surface or take it with `execution.sor`; (2) `DEFAULT_THRESHOLDS` (p95 [150,400,1000,3000]ms, reject [50,200,1000,3000]bps, maxStalenessMs 5000, minSamples 10) predates this work (#209) and GATES MONEY through `healthy: false` — unruled numbers awaiting an owner call under DIRECTION §8 item 8; this PR added none and re-tuned none; (3) `VenueHealth.latencyMs` is a required `number` shared with every rail in the repo, so "no measurement" has no `null` to use — `UNMEASURED_LATENCY_MS` is a sentinel whose safety is DIRECTIONAL (maximum value, ascending sort, so an unmeasured venue always loses a tie it enters) rather than representational, and a provisional graded-F venue with no successful call does carry it into ranking; (4) grading covers REST round-trip only — the WS stream path is not graded, so a venue delivering its stream late reads clean.',
  }),
  f('connect.data-lake', 'Unified data lake — normalised ticks, books and fills to a time-series store (§27)', {
    module: 'trade',
    phase: '2',
    plane: 'B',
    status: 'wip',
    owner: 'Phantom-X-007',
    dependsOn: ['venue.aggregation'],
    requires: ['packages/venue-adapter/src/fabric/capture-lake.ts'],
    note: 'Law §27:762, gap-closed 2026-08-08. §30:793 phases Connect at 2. The law calls this our data moat and the backtest fuel for §29, and `docs/adr/2026-08-04-predict-quant-connect-law.md` (D-S-18, Accepted) records the cost of its absence from the other side: §29 Quant is blocked on this lake, which is blocked on §27 adapters. WHAT IS DECIDED: capture only, and per D-S-18 a venue that is not connected is ABSENT in the record, never an empty book — a hole in capture must be readable as a hole, not as a quiet market. WHAT IS NOT DECIDED: the store itself. No time-series database is chosen, provisioned or in either compose file, retention is unwritten, and whether §29 ships to users at all is explicitly left with the owner by D-S-18. CAPTURE HONESTY SHIPPED 2026-08-12 (feat/connect-capture-lake-honesty): `packages/venue-adapter` `CaptureLake` append log — null/mismatched adapter → typed `hole` (`not_connected`); `VenueUnavailableError` → hole with venue reason (incl. `no_depth`); connected empty snapshot → `book` quiet-market fact; `bookFromCapture(hole)` is null (never synthetic empty). Second public venue (`bybit-spot`) already on tip (#1148) so the old "one adapter" lake blocker is spent for capture shape. Still `wip` / not `done`: no TSDB, no retention, no tick/fill normalisation pipeline, no compose store, Quant product still owner-gated by D-S-18.',
  }),
  f('execution.sor', 'svc-execution — cross-venue Smart Order Router, OMS/EMS, execution reports (§28)', {
    module: 'trade',
    phase: '2',
    plane: 'B',
    status: 'wip',
    owner: 'Phantom-X-007',
    dependsOn: ['venue.aggregation', 'connect.latency-grading'],
    requires: ['packages/venue-adapter'],
    note: 'Law §28:770, gap-closed 2026-08-08 — §30:793 phases Execution at 2 and it had no row, while `services/svc-dex/src/quote/market-data-source.ts` refuses BY NAME because "svc-execution does not exist". WHAT IS DECIDED, and it is the load-bearing half: THE RANKING RULE ALREADY EXISTS AND IS NOT RE-OPENED HERE. `packages/venue-adapter/src/router.ts` ranks on effective price through one interface the internal book also implements — "the router has no notion of ours versus theirs and cannot quietly favour us" — with a single bounded, disclosed, tested internal preference of 5 bps applied at ranking time only (`internalPreferenceBps`, default 5; `docs/TERMINAL.md` §4), under which a genuinely worse internal book still loses. D26-P1-X3 (2026-08-12): §28 cost-model completeness in `packages/venue-adapter` — `scoreSorCost` + `planRoute({ costTermsByVenue })` require fee/impact/transfer/graded latency or refuse (weight 0); no letter→bps invent (D-S-14); no structural house preference beyond 5 bps. **Execution reports deepen (2026-08-12):** `buildExecutionReport` — shortfall + venue attribution over RoutePlan (no invent fills). Residual: OMS/EMS service scaffold, letter→bps owner schedule. A second ranking rule, a second thumb on the scale, or a preference above 5 bps is a product change for the owner, not a PR. Also already settled: a fill is a proposal until the ledger posts it (D-S-06). WHAT IS NOT DECIDED: full `services/svc-execution` — this claim does NOT scaffold one. D-S-18: "a cross-venue router with one venue is a router with nothing to route between."',
  }),
  f('execution.arbitrage', 'Arbitrage engine — cross-exchange, triangular, basis, funding, DEX to CEX (§28)', {
    module: 'trade',
    phase: '2',
    plane: 'B',
    status: 'wip',
    owner: 'Phantom-X-007',
    dependsOn: ['execution.sor'],
    requires: ['packages/execution-arb'],
    note: 'Law §28:772, gap-closed 2026-08-08. §30:793 phases it at 2. WHAT IS DECIDED: it rides the ONE ranking rule under `execution.sor` — `packages/venue-adapter`\'s effective-price ranking with the bounded, tested 5 bps internal tie-break the README records as the reason "the router cannot favour us structurally" — and an arbitrage leg does not get a preference of its own. The law supplies its own honesty term too: "inventory-based execution (pre-positioned inventory both sides — no bridge-latency fantasy)", so a DEX-to-CEX opportunity priced on a bridge completing inside the spread is refused, not sized. D26-P0-01 sealed external-only. D26-P1-X4 (2026-08-12): product path `@intafaced/execution-arb` — `scanExternalCrossExchangeArb` uses SOR `scoreSorCost` / all-in effective price; refuses internal legs, missing/unscored cost terms (weight 0), bridge fantasy / missing pre-positioned inventory, and no-edge after costs; never invents spreads/fees/depth. Residual: triangular / basis / funding classes, inventory policy + exposure caps (D-S-14 owner magnitudes), OMS atomic legs + PnL attribution, capital. WHAT IS NOT DECIDED: capital magnitudes. Still dependsOn `execution.sor` (cost model on tip via #1673; OMS residual remains).',
  }),
  f('execution.market-making', 'Market-making engine — internal MM and external-venue MM, one engine (§28)', {
    module: 'trade',
    phase: '2',
    plane: 'B',
    status: 'wip',
    owner: 'Phantom-X-007',
    dependsOn: ['execution.sor', 'trade.mm-bot'],
    requires: ['packages/execution-mm'],
    note: 'Law §28:773, gap-closed 2026-08-08. §30:793 phases it at 2. `trade.mm-bot` is the internal half and covers book seeding only; §28:773 wants ONE engine that "seeds our books and works the street". OWNER RULING SEALED 2026-08-12 (D26-P0-01) in `docs/adr/2026-08-08-house-desk-and-market-making-fairness.md`: Q1 house desk v1 EXTERNAL-ONLY; Q3 HARD EXCLUSION — internal quotes never counted in mark derivation (no percentage cap invent; ties DEFAULT_MIN_BEST_LEVEL / dust refuse path). D26-P1-X5 (2026-08-12): EXTERNAL half product path `@intafaced/execution-mm` — `quoteExternalMm` + `planExternalMmHedge` + `evaluateMmKillSwitches` on SOR cost model; refuses internal venue MM with honest reason; never invents mids/depth/fees; owner spread/skew/bands (D-S-14). INTERNAL half remains BLOCKED until a later explicit owner ruling. Q2 existence-disclosure deferred. Residual: wire into OMS/svc-execution, live venue books, owner magnitude schedules. Still dependsOn `execution.sor` and `trade.mm-bot` (`ready` with residual ops, not done).',
  }),
  f('execution.house-tenant', 'House desk sealed private tenant — the Throne Law (§28)', {
    module: 'trade',
    phase: '2',
    plane: 'F',
    dependsOn: ['execution.sor'],
    note: 'Law §28:777, gap-closed 2026-08-08. OWNER RULING SEALED 2026-08-12 (D26-P0-01) in `docs/adr/2026-08-08-house-desk-and-market-making-fairness.md` (+ owner packet §A1): Q1 v1 is EXTERNAL-ONLY — house desk may trade external venues; pointing this tenant at our own matching book stays BLOCKED until a later explicit ruling. Q2 existence-disclosure deferred (not decided; internal trading off for v1). Q3 hard mark exclusion binds when any internal quotes exist. Five mechanism rules still Accepted: no structural queue advantage, D-S-06 one book / no extra preference, sealed ≠ unaudited (ledger recipes), kill-switches apply first. Tenancy MECHANISM (separate keys, namespace, audit, no matching-path privilege) may be built; internal-venue half may not. §30:795 plane "—"; `F` here means house money is custodial platform value, not a plane decision. Still dependsOn `execution.sor`.',
  }),
  f('web.terminal', 'Pro terminal — depth, charts, hotkeys, sub-accounts', {
    module: 'trade',
    phase: '2',
    status: 'ready',
    dependsOn: ['trade.spot', 'infra.ui-tokens', 'ws.depth'],
    requires: [
      'docs/adr/2026-08-03-retire-apps-web-port-to-vue-shell.md',
      'vendor/upstream-exchange/05_Web_Front/src/pages/exchange/Exchange.vue',
    ],
    note: 'Owner released 2026-08-08 (axis C1 / Nitro green light). Terminal = vendored Vue desk (ADR retire-apps-web). On tip: depth feedLive only after snapshot (#1221); REST + UC accept float refuse (#1231); book shape messages (#1224); confirm/fill decimals (#1225); dex/protocol custodial:true refuse (#1242); shell-i18n + shell-golden gates (#1230). Residual: brand drain / depth number refuse / snapshot provenance in L11 W5. dependsOn is ws.depth not ws.gateway so the book is not blocked on positions.',
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
    status: 'ready',
    dependsOn: ['matching.engine', 'ws.depth'],
    requires: ['services/svc-ws', 'packages/market-data'],
    note: 'Owner released 2026-08-08 (axis C1 / Nitro green light). Positions channel receives positionUpdated from trade.futures open/close (#281). Still not full product gateway done — residual streams/ops.',
  }),

  f('web.mobile-apps', 'Native mobile apps — iOS and Android, own name, zero attribution (§25:727)', {
    module: 'core-ops',
    phase: '2',
    plane: 'B',
    dependsOn: ['web.terminal'],
    note: 'Law §25:727, named again at :635, gap-closed 2026-08-08. THE MATRIX PHASES IT 2–5 AND THERE IS NO CODE: zero rows, no React Native app, nothing in apps/ (audit §A1.a #2). It reads `2` rather than `5` because 2 is the lower bound the matrix gives and the phase being worked — filing it at 5 would have hidden that it is already late. The registry has no "2–5" bucket, so the range is recorded here rather than invented as a phase key the by-phase render would drop. Blocked on web.terminal, which is `wip`: a native client is a second view of one surface, and mirroring a surface that is mid-port is how two front ends become three. FLAGGED FOR A PRODUCT RULING BEFORE ANY CODE, and the reason is an accepted ADR the law has not caught up with. §25:727 specifies "React Native app in apps/"; `docs/adr/2026-08-03-retire-apps-web-port-to-vue-shell.md` (Accepted) RETIRES apps/web and ports the terminal into the vendored Vue shell. So the law names a directory the platform is emptying, and the surface a native app would wrap is now Vue under vendor/. React Native over our own edge, a wrapper over the Vue shell, or a native client written straight against svc-edge are three products with very different costs, and no agent should pick between them by starting to type. ALSO NOT DECIDED: distribution. Shipping under our own name with zero attribution is an app-store and compliance step — a crypto app listing is reviewed on jurisdiction, not only on code — and that is the owner\'s.',
  }),

  // ── PHASE 3 · PAY + P2P ──────────────────────────────────────────────────
  f('pay.gateway', 'Branded gateway, hosted checkout, payment links', {
    module: 'pay',
    phase: '3',
    status: 'ready',
    dependsOn: ['ledger.double-entry'],
    requires: ['services/svc-pay'],
    note:
      'D26-P0-08 SEALED 2026-08-13 (adr/2026-08-13-pay-write-grant-a2-unpublished.md): A2 unpublished = ' +
      'auth.merchant_pay_scope_grant_unpublished; no invented grantor; issueMerchantPayScopes stays refuse. ' +
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
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['pay.gateway'],
    requires: [
      'services/svc-pay/src/kyb-service.ts',
      'services/svc-pay/src/psp-mode.ts',
      'services/svc-pay/drizzle/0013_pay_merchant_kyb_history.sql',
      'services/svc-pay/src/psp-done-bar.test.ts',
    ],
    note:
      '**DONE 2026-08-12 (D26-P1-P1):** PSP path without third-party money library (D-S-10 boot seal) + merchant ' +
      'durability — digital KYB live operator path (`kyb.submit`/`kyb.decide`) + append-only KYB/pricing histories; ' +
      'PSP mode enable refuses missing feeBps (no invent fees). Public-door proof: `psp-done-bar.test.ts` (#1720 tip + Done-bar closeout). ' +
      'Residual: kybStatus money-gate is pay.gateway; card acquiring stays socket.psp-partners.',
  }),
  f('pay.payfac', 'PayFac mode — sub-merchant trees, 14 permission areas', {
    module: 'pay',
    phase: '3',
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['pay.psp'],
    requires: [
      'services/svc-pay/src/payfac-permissions.ts',
      'services/svc-pay/src/public-rest.payfac-permissions.test.ts',
      'docs/pay/PAYFAC-PERMISSIONS-PARTIAL-2026-08-12.md',
    ],
    note:
      '**DONE 2026-08-12 (D26-P1-P2):** Honest partial + §13 — REST /v1/submerchant-permissions/* + shared surface→area map ' +
      '(#1741) · trees + area fence on money paths · named sockets `socket.payfac-settling-party-partner` + ' +
      '`socket.payfac-split-fee-recipes`. Title "14 areas" is historical; eleven shipped. Public-door: ' +
      '`public-rest.payfac-permissions.test.ts`. Not full underwriting / invent fee splits.',
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
    status: 'wip',
    owner: 'Phantom-X-007',
    dependsOn: ['pay.rails'],
    note: '**D26-P1-P3 2026-08-13:** Hosted checkout open walks selectSmartCheckoutRail (geo/method/risk). Blank dims → pay.routing_input_missing; no invented approval/cost. Payer cannot name a rail. STILL NOT done: live acquiring / PSP (Class X). Not tracker done until live connectors.',
  }),
  f('pay.settlement', 'Dual settlement — bank or crypto', {
    module: 'pay',
    phase: '3',
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['pay.rails'],
    requires: ['services/svc-pay/src/settlement-ledger.ts', 'services/svc-pay/src/settlement-ledger.test.ts'],
    note: '**D26-P1-P4 completed 2026-08-12** — bank and crypto payout paths compose only ledger-client withdraw hold/settle/reverse recipes. Configured crypto completes against the chain adapter; bank remains honestly absent and refuses before any recipe posts until its Class X commercial socket exists. Integration proof pins both outcomes and ledger reconciliation.',
  }),
  f('pay.fraud', 'Risk scoring, chargebacks, decline recovery', {
    module: 'pay',
    phase: '3',
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['pay.gateway'],
    requires: [
      'services/svc-pay/src/fraud/evaluate.ts',
      'services/svc-pay/src/fraud/review-queue.ts',
      'services/svc-pay/src/fraud/dispute-case.ts',
      'services/svc-pay/src/fraud/chargeback-ledger-socket.ts',
      'services/svc-pay/src/fraud-done-bar.test.ts',
    ],
    note:
      '**DONE 2026-08-12 (D26-P1-P5):** Scoring mechanism + review queue + dispute case surface ' +
      '(fraud.evaluate / enqueueReview / openDispute) with settled→disputed writer. Chargeback ledger ' +
      'recipes refuse-closed via named §13 `socket.pay-chargeback-ledger-wire` — not a stub unwired ' +
      'matrix and not silent posts. List content (IPs/devices/sanctions) Class X. Public-door proof: ' +
      '`fraud-done-bar.test.ts`. Residual: durable disputes table + owner sign-off to close the socket.',
  }),
  f('pay.subscriptions', 'Recurring — card and crypto', {
    module: 'pay',
    phase: '3',
    // Ghost clear 2026-08-09 W4: schema/schedule/lifecycle/invoice-runner on tip (#1214).
    // W10 L01: mandate.cancel + listExecutions + path allowlist.
    // W11 L02: merchant fleet list (mandate.list / subscription.list); claim released.
    // D26-P1-P6 Done bar: Mandates product-complete; notify gaps honest.
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['pay.gateway'],
    requires: [
      'services/svc-pay/src/subscriptions/mandate-product.ts',
      'services/svc-pay/src/subscriptions/mandate-product.test.ts',
      'services/svc-pay/src/subscriptions/subscriptions-done-bar.test.ts',
    ],
    note:
      '**DONE 2026-08-12 (D26-P1-P6):** Mandates product-complete; notify gaps honest. Crypto invoice-and-watch E2E ' +
      '(create mandate → subscription → due runner → invoice → capture settles execution → cancel immediate) via ' +
      '`subscriptions-done-bar.test.ts` + merchant doors. Fire path uses `mandateChargeDisposition` matrix; charge traces ' +
      'to active mandate; re-consent refuse `mandate.proposeTerms` → `pay.subscription_reconsent_required`; card refuses ' +
      '`pay.mandate_rail_absent` → `socket.psp-partners` (no invent pull). Bounded dunning = MAX_ATTEMPTS_PER_CYCLE then ' +
      'named `arrears` stall (reachable from fire). Pre-charge notify sealed §13 `socket.pay-precharge-notify` — fire ' +
      'acknowledges gap with `notified:false` before openInvoice; Ready door `subscription.productReady` never reports notified. ' +
      'Parked sockets (not this mountain): live card charge-against-mandate (`socket.psp-partners`), real pre-charge delivery.',
  }),
  f('pay.plugins', 'Woo / Magento / OpenCart plugins', {
    module: 'pay',
    phase: '3',
    status: 'done',
    owner: null,
    dependsOn: ['pay.gateway'],
    requires: [
      'services/svc-pay/src/plugins/reference-client.ts',
      'services/svc-pay/src/plugins/webhook-vectors.ts',
      'services/svc-pay/src/plugins/plugins-done-bar.test.ts',
      'docs/pay/PLUGINS-REFERENCE-PATH-2026-08-10.md',
    ],
    note:
      '**D26-P1-P8 2026-08-12:** Done bar = one real plugin path (TS reference client) + §13 PHP CMS socket. ' +
      'Client pins create/get/authorize/capture/refund + webhook-endpoints/deliveries; https-only register; ' +
      'frozen HMAC vectors; public-door lifecycle Done-bar (`plugins-done-bar.test.ts`) + sendPluginRequest E2E; ' +
      'no Woo/Magento/OpenCart PHP in monorepo CI. Law §13 socket opened. ' +
      'Was reclaimed 2026-08-04 M1; wave-13 #1633 banked install/auth; this closes the mountain.',
  }),
  f('pay.public-api', 'Public REST + webhooks + sandbox (§9)', {
    module: 'pay',
    phase: '3',
    plane: 'B',
    // D26-P1-P7 Done bar: Surface + webhooks + sandbox.
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['pay.gateway', 'identity.apikeys'],
    requires: [
      'services/svc-pay/src/public-rest.ts',
      'services/svc-pay/src/merchant-webhooks.ts',
      'services/svc-pay/src/sandbox-key-routing.ts',
      'services/svc-pay/src/public-api-done-bar.test.ts',
    ],
    note:
      '**DONE 2026-08-12 (D26-P1-P7):** Surface + webhooks + sandbox. REST /v1 + OpenAPI + idempotency ' +
      '(#988/#994) · signed outbound webhooks with retry/disable/dashboard (#1006) · durable claimDue now ' +
      'truly FOR UPDATE SKIP LOCKED + lease · POST …/webhook-endpoints/:id/enable re-activates · payment ' +
      '`mode: sandbox|live` from rail posture · sandbox-key routing (#1014) · money path (#1507/#1624) · ' +
      'edge BASE (#1181) · quickstart (#1024) · Done-bar suite `public-api-done-bar.test.ts`. ' +
      'Parked (not this mountain): pay:* prod grant mint / KYB money-gate (DIRECTION §8) · live acquirer ' +
      'Class X `socket.psp-partners` · dispute/chargeback wire.',
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
    owner: 'Phantom-X-007',
    dependsOn: ['p2p.escrow'],
    requires: ['services/svc-p2p/src/router.ts', 'services/svc-p2p/src/state.ts', 'services/svc-p2p/src/moderation-auth.ts'],
    note:
      'CLAIM 2026-08-12 Denon agent (feat/p2p-disputes-product-complete): deepen engine — `opened_via` party|timeout ' +
      '(audit P3 honesty); `resolutionNotes` on wire; `disputes.backlog` for allowlisted moderators; ledger release/refund ' +
      'unchanged via escrow recipes. PRIOR STAGE (#1007): allowlist · empty → `p2p.moderation_unreachable` · list/evidence/' +
      'escalate-and-hold · natural-person rulings only. SOCKET / not agent-done: apps/admin dispute console (nitro-frontend-all); ' +
      '`p2p:moderate` scope mint (DIRECTION §3 owner); who moderates = Class X env allowlist (do not invent); chat_thread_id ' +
      'product; outbox (events plane). Auto-ruling forbidden.',
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
    status: 'ready',
    dependsOn: ['p2p.escrow'],
    requires: ['services/svc-p2p/src/instrument-service.ts'],
    note: "GHOST OWNER CLEARED 2026-08-09 L03 W4 (mechanism on main #428). Residual is operator content + Class X KMS, not craft. A row exists because the capability did not, and nobody could see that: escrow locked, released, refunded and went to a moderator while a trade could never actually complete — at the moment the buyer had to pay, there was no account to pay to. MECHANISM DONE on feat/p2p-payment-instruments: operator-registered method schemas per (method, country); one active destination per (owner, method, currency); an immutable per-trade snapshot so removal cannot break an in-flight trade and a seller cannot swap the account mid-payment; disclosure only while the escrow is HELD; every read and every refusal written to an append-only access log by the same SQL statement that reads the details. STILL wip, not done: the method registry ships EMPTY and no seller can register anything until an operator calls instruments.methods.register for their market. What a market's rails require is researched jurisdictional content (owner-gated, DIRECTION §8), not engineering — seeding a guess would produce destinations that validate and cannot be paid. Also open: no encryption at rest (§13 socket, needs a KMS decision).",
  }),
  f('p2p.merchants', 'P2P merchant programme — badges, limits, API', {
    module: 'p2p',
    phase: '3',
    status: 'done',
    dependsOn: ['p2p.reputation'],
    requires: ['services/svc-p2p'],
    note:
      'DONE 2026-08-12 D26-P1-I2 under dispute law. Stage 1 (#1108) membership + Stage 2 (#1152) offer ceilings + honest API (W10 L07 offerLimits/myOfferCeiling/health.offerLimitsConfigured). ' +
      'Stage 3 second key plane CUT — identity.apikeys + edge throttle + merchants.apiAccess (#1697); API keys cannot moderate (D-S-08). ' +
      'Product-complete seal: moderated dispute loss suspends approved standing when live reputation fails programme eligibility (same maxDisputesLost policy as apply) — badge/API/ceilings stop vouching immediately; operator reinstate remains human override. ' +
      'Unlimited ceilings when env unset accepted as product posture (magnitudes stay owner env, not invented). Eligibility defaults remain conservative (spec §5). Residual Class X / owner: who moderates, apps/admin console, optional ceiling magnitudes.',
  }),

  f('api.gateway', 'Public API — ONE gateway in front of trade, pay and data (§9)', {
    module: 'core-ops',
    phase: '3',
    plane: 'B',
    dependsOn: ['pay.public-api', 'trade.ccxt-api'],
    note: 'Law §9:430, gap-closed 2026-08-08: "REST + webhooks, named keys, scopes, domain whitelist, sandbox env — ONE gateway in front of trade/pay/data." The board has two domain-scoped surfaces and nobody owning the single one the law describes (audit §A1.a #20): pay.public-api (blocked, pay-scoped) and trade.ccxt-api (`ready`, trade-scoped, and the board\'s one recorded ORPHAN — no law basis, no ADR, no spec). There is no "data" surface of any kind. Blocked on both, honestly: two gateways cannot be unified while one of them has not shipped. FLAGGED — §9:430 AND AN ACCEPTED ADR PULL IN OPPOSITE DIRECTIONS, and that needs an owner ruling rather than a PR. `docs/adr/2026-08-07-pay-public-api-law.md` (Accepted) deliberately REJECTS a shared error taxonomy: svc-trade speaks CCXT "because bots already speak CCXT and that is a real interop win", and the ADR records that payments have no equivalent lingua franca, so adopting one vendor\'s would name a vendor (§0.7) and buy nothing. That reasoning is sound, and one gateway with two error taxonomies is not one gateway. So either §9:430 means one KEY, SCOPE, QUOTA and SANDBOX plane in front of several domain dialects, or it means one dialect and the ADR gives. THE FIRST READING IS THE CHEAPER ONE AND THIS ROW DELIBERATELY DOES NOT PICK IT. What is genuinely shared and uncontested either way is the key and scope plane — identity.apikeys is `done` and already issues named, scoped keys — so that is where a claimant should start, and asserting the taxonomy answer is where they should stop.',
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
      'WHAT REMAINS after 2026-08-08: (1) EXTERNAL audit still open — internal adversarial package shipped ' +
      '(docs/audits/protocol-smart-accounts-2026-08-08.md + src/accounts/adversarial-audit.test.ts); socket.contract-audit ' +
      'stays socket until Nitro budget + firm; (2) passkey verifier ON-CHAIN is done (socket.p256-verifier closed S-A9); ' +
      '(3) userOp hash never checked against live EntryPoint (socket.userop-differential-test); (4) no fuzz/invariant ' +
      'suite and no gas snapshots (socket.contract-toolchain); (5) paymaster FUNDING still Nitro — policy modules exist; ' +
      '(6) public deployment registry rows wait on Nitro RPC funding.',
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
      'INVARIANTS + LP ACCOUNTING 2026-08-08 (S-A2 residual): src/amm/invariants.test.ts — k never decreases, ' +
      'no free extraction on round-trip, MINIMUM_LIQUIDITY + pro-rata mint/burn, fee tiers, no setFee/pause. ' +
      'STATUS stays ready: oracle coupling is deliberately NOT reading AMM for marks (S-A12); audited:false until ' +
      'socket.contract-audit. Do not rebuild mint/swap on-chain proof (#288).',
  }),
  f('protocol.lending', 'On-chain lending markets, keeper liquidations', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    status: 'ready',
    owner: 'shehzad002',
    dependsOn: ['protocol.amm', 'socket.price-oracle'],
    requires: ['services/svc-protocol/contracts/lending/IsolatedLendingMarket.sol'],
    note:
      'S-A4 P0 2026-08-08: IsolatedLendingMarket — over-collateral, no rehypothecation, fail-closed oracle marks, ' +
      'permissionless liquidate + close factor, immutable kink rates. On-chain suite lending-oracle.onchain.test.ts. ' +
      'STATUS stays ready (not done): SPEC-LENDING done-bar still wants cascade suite, flash-loan adversarial pack, ' +
      'and persistent public testnet with verified source (Nitro RPC). Do not invent rates or AMM marks.',
  }),
  f('protocol.escrow', 'Non-custodial P2P escrow contracts', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    status: 'done',
    owner: 'shehzad002',
    dependsOn: ['protocol.smart-accounts'],
    requires: ['services/svc-protocol/contracts/escrow'],
    note: 'CLOSED 2026-08-08 (S-A3). SovereignEscrow.sol — open/lock/release/refund/dispute + keeper settleTimeout with immutable TimeoutDisposition; optional user-elected arbiter; no platform key. Distinct from custodial svc-p2p escrow (ADR 2026-08-04). On-chain suite: release, refund, timeout refund, early-timeout refusal. Residuals: multi-asset, richer fee splits, svc wiring, indexer events. Law: docs/adr/2026-08-08-sovereign-p2p-escrow.md.',
  }),
  f('protocol.router', 'Sovereign router — book vs pool best execution', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    status: 'done',
    owner: 'shehzad002',
    dependsOn: ['protocol.amm'],
    requires: ['services/svc-protocol/contracts/router/SovereignRouter.sol', 'services/svc-protocol/src/router/sovereign-quote.ts'],
    note:
      'S-A5 2026-08-08: on-chain SovereignRouter executes pool swaps with minOut fail-closed; TypeScript pickBestRoute ' +
      'compares caller-supplied book quotes vs pool maths without inventing a mid. Split routes / MEV notes residual.',
  }),
  f('protocol.merchant', 'Lane A merchant contracts — zero KYB (§24)', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    status: 'done',
    owner: 'shehzad002',
    dependsOn: ['protocol.smart-accounts'],
    requires: ['services/svc-protocol/contracts/merchant/MerchantAccept.sol'],
    note:
      'S-A6 2026-08-08: MerchantAccept — merchant-owned receive + optional merchant-chosen fee recipient; platform never ' +
      'hardcoded. On-chain merchant-accept.onchain.test.ts. Sub-merchant trees / invoice metadata residual.',
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
    requires: [
      'services/svc-bank/src/cards/card-service.ts',
      'services/svc-bank/src/cards/issuer.ts',
      'services/svc-bank/src/cards/cards-auth-product.test.ts',
    ],
    note:
      '**D26-P1-B2 public-door proof 2026-08-12 (#1765):** `cards-auth-product.test.ts` — auth path via mounted router + ledger half reachable; live-issuer latency stays socket.live-issuer. ' +
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
    status: 'done',
    dependsOn: ['bank.cards', 'protocol.smart-accounts'],
    requires: [
      'services/svc-bank/src/cards/conversion.ts',
      'services/svc-bank/src/cards/card-service.ts',
      'services/svc-bank/src/cards/sovereign-card-product.test.ts',
      'services/svc-bank/drizzle/0007_card_jit_conversion.sql',
    ],
    note:
      '**Custodial half DONE #1174** (2026-08-09) · **D26-P1-B3 refuse-invent seal** (mounted-router product suite): ' +
      'settlement asset ≠ funding asset; rate frozen at auth; refuses invented marks (bank.mark_*); no second book; ' +
      'no invent FX. On-chain JIT / smart-account funding half remains Shehzad protocol board.',
  }),
  f('bank.ramps', 'Fiat on/off ramp reusing svc-pay adapters', {
    module: 'bank',
    phase: '5',
    status: 'done',
    dependsOn: ['pay.rails'],
    requires: [
      'services/svc-bank/src/ramps/ramp-service.ts',
      'services/svc-bank/src/ramps/rails.ts',
      'services/svc-bank/src/ramps/pay-fiat-adapter.ts',
      'services/svc-bank/src/ramps/ramps-fiat-product.test.ts',
    ],
    note:
      '**D26-P1-B4 COMPLETE #1773** — Fiat on/off via PayFiatRampPort (svc-pay RailAdapter plane) on public doors ' +
      '(ops.creditOnramp + ramps.offramp); empty/sandbox/absent refuse bank.fiat_ramp_socket before any row; live adapter ' +
      'books only via ledger-client deposit/withdrawHold/withdrawSettle against the pay rail id (no second book, no bank-local PSP). ' +
      'Programme surfaces fiatVia: svc-pay.RailAdapter. simulated: true always. No APY/BIN invent. ' +
      'auto-invest/business claim fences narrowed to their dirs (owners unchanged). ' +
      '**SPLIT 2026-08-04 ADR** · CRYPTO LEDGER HALF #997. Commercial partner / money-transmission remains socket.psp-partners + Class X. ' +
      'Live chain confirm/send remains svc-pay + Class X.',
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
    status: 'wip',
    owner: 'Phantom-X-007',
    dependsOn: ['agents.gateway'],
    note: '**D26-P1-A1 2026-08-12:** Denon backend product pass in progress — requester-scoped tool calls plus existing runtime guardrails and dark-refuse zero billing. Live trade/identity allowlisted inputs remain Class X; do not mark done until grounded production environment.',
  }),
  f('agents.support', 'Support agent — KB + account-state grounded', {
    module: 'agents',
    phase: '5',
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['agents.gateway', 'ops.support'],
    requires: ['services/svc-agents/src/support-agent', 'services/svc-agents/src/support-agent/d26-p1-a2-done-bar.test.ts'],
    note:
      '**D26-P1-A2 Done-bar sealed 2026-08-12 (#1735):** KB + account-state grounded; AbortSignal stoppable; ' +
      'refuse invent balance / plane-dark / missing account-state; settle/close no silent feeCharge. ' +
      'Live ops.support production credentials remain Class X residual (not agent-done). No packages/i18n.',
  }),
  f('agents.scanner', 'Market Scanner — ranked signals by tier', {
    module: 'agents',
    phase: '5',
    status: 'wip',
    owner: 'Phantom-X-007',
    dependsOn: ['agents.gateway', 'trade.spot'],
    note: '**D26-P1-A3 2026-08-13:** P0-11 sealed — production default is abs_change_x_log_volume + last/volume24h/change24hBps (adr/2026-08-12-scanner-signal-inputs-law.md). Omitted law on public doors uses that constant; explicit unpublished still refuses. STILL NOT done: live spot tickers (Class X). Not tracker done until live data path.',
  }),
  f('agents.merchant', 'Merchant agent — approval-rate watch', {
    module: 'agents',
    phase: '5',
    dependsOn: ['agents.gateway', 'pay.routing'],
    note: '**W6 honesty 2026-08-09:** Stage-1 on tip — metered merchant.runSession (#1284), dark pay refuse invent rates, boot-register. STILL NOT done: live pay metrics allowlist (Class X). Not tracker done until live pay plane.',
  }),
  f('agents.copy-intel', 'Copy-Intel — writes audited leader stats', {
    module: 'agents',
    phase: '5',
    status: 'wip',
    owner: 'Phantom-X-007',
    dependsOn: ['agents.gateway', 'trade.copy'],
    requires: ['services/svc-agents/src/copy-intel'],
    note:
      '**D26-P1-A5 2026-08-12:** tip #1708 audited refuse + residual directory presentation (presentDirectory / leaderId order). ' +
      'STILL NOT done: live trade.copy leader plane (Class X / Shehzad M4). Not tracker done until live leaders allowlist.',
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
    status: 'done',
    owner: 'Phantom-X-007',
    requires: ['services/svc-academy/src/curriculum/import-pipeline.ts', 'services/svc-academy/src/curriculum/import-pipeline.test.ts'],
    note:
      '**D26-P1-C5 Done-bar sealed 2026-08-12 (#1738):** import substance bar (not char-count theater); ' +
      '`lessonSubstanceChecklist` + `substanceBarMet` on spine (20 playbooks + 3 workbooks platform-native). ' +
      'Licensed DERIV//DESK dump assets remain Class X residual (not agent invent).',
  }),
  f('academy.certs', 'Certifications → XP → real perks', {
    module: 'academy',
    phase: '5',
    // GHOST OWNER CLEARED 2026-08-09 L07 W9: was wip @nitro-agent with cert XP
    // + grant race + spine seals already on main (#1117 · #1370 · #1490). No open
    // academy PR held the path — the leftover owner fenced ALL of
    // services/svc-academy via module fallback (false block on residual honesty).
    // status ready (not wip): mechanism free; full title "→ real perks" is multi-svc residual.
    status: 'ready',
    owner: null,
    note:
      'D26-P1-C1 2026-08-12: grantCert → XP → real identity perks OR refuse invent perk money ' +
      '(certs/perk-plane.ts · certPerkPlane · certPerkIntent). svc-identity remains SoT; no academy ' +
      'cert→perk map / perk book. Unpriced cert still publishes nothing. NOT tracker done on full ' +
      'title until multi-svc cert→perk product law (contracts) — honesty plane is sealed.',
    dependsOn: ['academy.curriculum', 'identity.rank'],
  }),
  f('academy.ambassadors', 'Residencies, IFC pay, revenue share', {
    module: 'academy',
    phase: '5',
    dependsOn: ['academy.lobbies', 'token.staking'],
    status: 'done',
    owner: 'Phantom-X-007',
    requires: ['services/svc-academy/src/ambassadors/ifc-pay-rate-law.ts', 'services/svc-academy/src/ambassadors/ifc-pay.ts'],
    note:
      '**D26-P1-C2 Done-bar sealed 2026-08-12 (#1725):** residencies / IFC pay under rate authority — owner-published ' +
      'JSON law only; refuse invent rates; dry-run quote when authority present; accepted-residency gate. ' +
      'SOCKET residual: live settlement Class M until ledger recipe (no recipes in ambassadors); seasons product residual.',
  }),
  f('academy.tournaments', 'Seasonal ladders, IFC prize pools', {
    module: 'academy',
    phase: '5',
    dependsOn: ['academy.lobbies', 'trade.spot'],
    owner: 'Phantom-X-007',
    status: 'wip',
    note:
      'D26-P1-C3 2026-08-12: blank/unset prize pools typed refuse `academy.prize_pool_unset` — cannot start; no invent IFC. ' +
      'Ladder Stage-1+lifecycle on tip; Class M fund/payout recipes still refuse-closed until owner amounts + ledger.',
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
    status: 'ready',
    owner: 'shehzad002',
    dependsOn: ['launch.token-factory'],
    requires: ['services/svc-protocol/contracts/trust/LaunchLpLock.sol'],
    note:
      'S-L4 LP leg 2026-08-08: LaunchLpLock — immutable unlockTime, no admin early exit. STATUS ready (not done): ' +
      'vesting proofs + deployer reputation badge still residual; badge-false must stay unissuable.',
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
    status: 'done',
    dependsOn: ['token.staking'],
    requires: ['services/svc-market'],
    note:
      'ALL THREE STAGES ON MAIN 2026-08-08 — #1109 (apply → vet), #1115 (stake-gated slots), #1126 (public list eligibility). ' +
      'STAGE 3: `profile` and `listed` are genuinely anonymous publicProcedures, plus VendorService.listingEligibility as the seam ' +
      'market.commerce calls. Eligibility is COMPUTED on every read — approved, holds an open slot, and the live svc-token tier ' +
      'still covers one — never a stored is_listed flag, because a stored grant lies the moment behaviour changes. That is what ' +
      'makes done-bar clause 5 real: a vendor who claimed slots at Operator and then unstaked to Base still HOLDS those rows and ' +
      'is not listed. Proven by listing-eligibility.test.ts (12 tests), confirmed executed in the CI log rather than inferred from ' +
      'a green aggregate. Suspended, rejected and undecided collapse into ONE public refusal code, so a public read cannot ' +
      'enumerate who was thrown off the marketplace. Stake source unreachable means nobody is listed rather than everybody. ' +
      'RESIDUAL, additive and named: the directory read costs one stake read per candidate, capped at 50 a page and ordered by ' +
      'registration date only — ranking is DIRECTION 8 and owner-gated; the upgrade path marked in code is a batch entitlement ' +
      'read on svc-token, never a cached flag. ' +
      'STAGE 1: services/svc-market exists — market.vendors (one row per user) plus append-only market.vendor_status_events ' +
      'enforced by a database trigger; applyAsVendor/mine on market:read/write, listApplications/vet/history on a market:ops ' +
      'operator scope. market:read and market:write UNSTUBBED in packages/auth. /api/market is in svc-edge UPSTREAMS, so the ' +
      'module is kill-switchable at the door. NO vetting criterion — an operator supplies the decision and a required non-blank ' +
      'reason; VendorService.vet refuses any caller not holding market:ops with market.vet_operator_required, so a future policy ' +
      'engine cannot approve anything silently. ' +
      'STAGE 2 ADDS market.vendor_slots (one row per claimed slot, released via released_at so occupancy stays a COUNT and never ' +
      'a maintained counter) and claimSlot/releaseSlot/slots — none of which takes a vendorId, so a slot is always spent against ' +
      'the caller own row. CAPACITY IS NOT STORED: it is AccessTier.vendorSlots read live from svc-token GET ' +
      '/internal/stake/:userId (NOT the tRPC token.stakeOf, which is scopedProcedure self-only and unreachable from market), and ' +
      'no threshold, tier or slot-count column exists in the market schema. Fails closed on all four paths — network throw, ' +
      'non-2xx, unusable payload, non-integer vendorSlots — with market.stake_unavailable; the `slots` read fails closed too, so ' +
      'a read that cannot verify entitlement never reports a vendor as listable. NO AMOUNT crosses the boundary: `staked` and ' +
      '`tier.minStake` arrive as decimal strings and this service reads neither, which is also why it cannot re-scale an ' +
      'already-scaled value (the fail-OPEN bug PR #1100 fixed). ' +
      'OVERSELL PROOF: claimSlot locks the vendor row FOR UPDATE, counts, decides, then inserts inside one read-committed ' +
      'transaction (the academy join() pattern). src/vendor-slots.test.ts fires 8 simultaneous claims at a tier of 3 and asserts ' +
      'exactly 3 succeed and 5 refuse BY NAME, plus a capacity-of-1 variant and a 6x same-ref retry proving idempotency consumes ' +
      'one slot and not six. The stake read is deliberately BEFORE the lock — a network call held under the busiest row would ' +
      'serialise every claim behind svc-token latency. That suite is DB-backed and skips without Postgres. ' +
      'RELEASE: vet() releases every open slot in the SAME transaction as any transition out of `approved` (suspended AND ' +
      'rejected) — split across two transactions, a crash leaves a suspended vendor holding every slot. NO unstake subscriber ' +
      'and none wanted: no accepted bus subject exists, event-wiring reds on an orphan, and polling would be a second source of ' +
      'truth. Instead `slots` reports usable = min(held, capacity) and 0 for anyone not approved, so an unstaked vendor reads ' +
      'usable:0 instantly — that is how DoD clause 5 holds with no event. NO suspension POLICY was added: releasing on a ' +
      'transition an operator recorded is not deciding it. ' +
      'PR #1100 (stake endpoint serialization) and #1109 (Stage 1) are on main — the earlier note that they were unmerged is stale. ' +
      'Org-vs-user left as per-user on purpose (adding org_id later is a nullable column plus a backfill). market.commerce C1+C2 done #1189; C3 subscriptions residual.',
  }),
  f('market.commerce', 'Listings, subscriptions, purchases, house commission', {
    module: 'market',
    phase: '5',
    status: 'done',
    dependsOn: ['market.vendors'],
    requires: ['services/svc-market'],
    note:
      'D26-P0-10 SEALED 2026-08-13 (adr/2026-08-13-house-commission-authority.md): authority = host ' +
      'MARKET_HOUSE_COMMISSION_BPS; blank refuses; 0 is explicit owner free-cut; no agent-invented bps. ' +
      'Money only via recipes.marketPurchase → houseFees(market); blank MARKET_HOUSE_COMMISSION_BPS refuses ' +
      'market.commission_not_configured (never invents free commission; 0 only when owner sets). ' +
      'Crash re-drive settles from claim snapshot (not live env bps). Over-capacity after unstake: oldest-first ' +
      'entitledListingRefs; excess refuse market.listing_over_capacity. Concurrent createListing cannot oversell ' +
      'slots (claimSlot FOR UPDATE + orphan rollback). Catalogue registration order (ASC) — ranking DIRECTION §8 owner. ' +
      'D26-P1-M1 Class M residual SEALED 2026-08-12: compose LEDGER_URL→svc-ledger (no localhost invent); ' +
      'public-door PRECONDITION_FAILED + empty catalogue proofs; ledger listing/premium recipes coord #1761. ' +
      'RESIDUAL / PARK: C3 subscriptions (period/past-due/cancel/access law — Nitro); commission bps value (Nitro env); ' +
      'ranking/featured. Purchase of subscription refuse market.subscription_not_built; public catalogue hides them.',
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
      'Stage-1 #989 ticket spine · Stage-2 #999 operator queue · **durability #1179 (2026-08-09 wave 3)**: Postgres schema `support` + role `svc_support`, ' +
      'atomic claim UPDATE (two operators racing cannot both win), `searchKb`/`getKb` on the router, TEST_DATABASE_URL_SUPPORT + turbo pass-through. ' +
      '**Stage-4 #1494 (2026-08-09): the desk can now say what it read.** Closes the two Stage-2 boxes docs/ops/trk/ops.support.md left unchecked. ' +
      '(a) AUDIT TRAIL — `support.ticket_events`, append-only and dense-sequenced by unique index, written in the SAME transaction as the state change ' +
      'it records, so there is no path that moves a ticket without recording who moved it and from what; `setStatus` was previously a bare UPDATE whose ' +
      'only trace was an `updated_at` the next comment overwrote. Lifecycle is a table (`src/lifecycle.ts`): `closed` is terminal, `resolved → open` is a ' +
      "recorded reopen, self-transitions refused. (b) ACCOUNT-STATE GROUNDING — read port on svc-identity's new `GET /internal/account/:userId` " +
      '(`accountStateSchema` = userId + status + kycTier, three fields and no fourth); NOT a support-side projection, so an operator cannot reassure a ' +
      'user from a stale copy of a freeze. Takes no userId argument — the id comes off the ticket, so `support:ops` is not a platform-wide account lookup. ' +
      '(c) ESCALATION CASE FILE — `support.case_files`, immutable once written, `citations` refused empty at three layers (builder, zod, CHECK). Citations ' +
      'are ref + sha256 digest, never content, so the record proves what was read without becoming a PII archive. ' +
      'PROVEN: 103 svc-support tests + 6 new svc-identity ones; all Postgres triggers asserted by SQLSTATE against a real database (23514/23505), not by ' +
      'message text; route reachability via `createCaller` through the real edge context and scope middleware. 32/32 gates green. ' +
      'STILL NOT DONE, and this row stays `ready` for the first reason alone: (1) **svc-support has no running container in the local fleet and the compose ' +
      'block now requires INTERNAL_SERVICE_SECRET, so the grounding loop is proven in tests and in migration, NOT observed serving in a real env** — the ' +
      "row's own bar is a real ticket+KB loop in a real env. (2) No customer Vue entry in the vendored shell (create is edge tRPC only) and no operator " +
      'list/detail in `apps/admin`; both are inside the `nitro-frontend-all` HUMAN lane, so not agent-closable. (3) No SLA anywhere — priority is a score, ' +
      'not a promise (DIRECTION §8 item 9 needs an owner ruling before any support timing is described to a user). ' +
      'No money on this service ever: no ledger client, and the case file has no amount/currency/instruction field — `money_request` is a reason NAME that ' +
      'files a request for the pay/ledger recipe that owns the value (§0.6).',
  }),
  f('ops.affiliates', 'Multi-tier affiliate / IB trees, payout automation', {
    module: 'core-ops',
    phase: '5',
    status: 'wip',
    owner: 'Phantom-X-007',
    dependsOn: ['ledger.double-entry'],
    note:
      'D26-P1-O2 2026-08-13: identity accrue door LANDED #1794; svc-trade settleFill best-effort POST after house fees (412/down never unwind fill; no invent rates). svc-pay caller not this PR. ' +
      'D26-P1-O2 SEALED 2026-08-12: accrual tree under rate authority — durable `affiliates.accrue` uses owner-published ' +
      '`IDENTITY_AFFILIATE_ACCRUAL_TIERS_JSON` only; unset → `affiliate.accrual.rates_unset`; per-call invent → `affiliate.accrual.invent_refused`; ' +
      'dry-run may simulate; Stage `treeStatus` exposes `rateAuthorityPublished` + status line (tier count only, never rate invent); ' +
      'payout still existing ledger recipes only (no invent commissions). Mountain stays wip/ready-not-done until owner rates + producer wire. ' +
      'Wave 13 L04 honesty: mixed sourceModule on one fee event refuses `affiliate.payout.mixed_source_module` (no multi-pool debit); treeStatus frozenCount = freezes on tree participants only (not global freeze ledger). ' +
      'Wave 10 #L05 / #1589 source_module on accruals (fee-pool provenance for payout sweep) — land before producer wire. ' +
      'Rate invent FIXED #1133 (2026-08-08): blank / unpublished accrual tiers refuse-closed; DEFAULT_ACCRUAL_TIERS gone. ' +
      'Wave 3 residual #1180 (2026-08-09): attribute under txn + advisory lock + post-insert cycle recheck; `affiliates.myAccruals` self-only ' +
      'reads durable rows (never invents rates). Stage-1 #996 tree/payout refuse · Stage-2 #1008 members/freeze · Stage-3 #1027 accrue store. ' +
      'SLICE C PAYOUT ENGINE LANDED #1477 (2026-08-09) — affiliates/payout-engine.ts. The tree, attribution and durable accruals already existed, so this ' +
      'built the payout half ON TOP of them rather than a second tree. `affiliates.payout` no longer throws an unconditional stub: it plans a multi-tier ' +
      'fan-out from durable accrual rows and posts it through EXISTING recipes (sweepFeesToRewards + rewardPay). No recipe added or edited — DIRECTION §3 ' +
      'owner carve-out. svc-identity gained @intafaced/ledger-client and a `Pick<LedgerClient,"post">` client (narrower than all seven siblings on purpose: ' +
      'a service that must hold no balance gets no balance read). ' +
      'STILL `ready`, NOT `done`, AND THE REASON IS THE DELIVERABLE: every commission rate is DIRECTION §8 owner-only (item 10 reserves leader_share_bps ' +
      '"and every other fee-share rate"; item 6 reserves fee/revenue recipes). With no published law the path refuses `affiliate.payout.rates_unset` and ' +
      'moves nothing — asserted on BALANCES, not on a tRPC code. A payout engine refuse-closed on an owner rate is `ready`. ' +
      'NEW HOLE CLOSED THAT WAS NOT IN THE BRIEF: resolveAccrualTiers accepts per-call operator `requestTiers`, which is defensible at accrual (writes a ' +
      'claim, moves nothing) and NOT at payout — paying "the rate on the row" would launder an operator-supplied rate into real money. Payout therefore ' +
      'ignores row.rate and requires every row to match the owner-published tier for its hop, else `affiliate.payout.rate_unpublished`. Compared numerically, ' +
      'so "0.10" vs "0.1" is not a false refuse an operator would "fix" by editing a rate. ' +
      'OWNER RULING PENDING (not a rate, but it multiplies one): MAX_PAYOUT_TIER_DEPTH — one named constant in payout-engine.ts, conservatively equal to the ' +
      'tree write-time cap DEFAULT_MAX_REFERRAL_DEPTH = 5. Each extra commissionable hop is a money decision. ' +
      'ATOMICITY, STATED HONESTLY: LedgerClient has no batch API and an all-legs single post would need a new multi-beneficiary recipe (owner carve-out), so ' +
      'the fan-out is replay-safe by key rather than one transaction — a crash mid-fan-out leaves the tree partly paid and re-running completes it, paying ' +
      'nobody twice. Keys are business-derived: `affiliate:<feeEventId>:<beneficiaryId>:h<hop>`, which IS the accrual unique constraint — no clock, no UUID. ' +
      'One sweep PER LEG, not per fee event, because sweepFeesToRewards omits the amount from its key: a per-event sweep would dedupe against itself if the ' +
      'row set grew and silently borrow the difference from the rewards engine. ' +
      'Also refused and tested: cycles and self-referral (write time in the tree, and again at payout so a pre-fix row cannot pay), depth past the bound, ' +
      'mixed-asset fan-out, rows from another fee event, duplicate rows, frozen beneficiary (freeze applied AFTER accrual still stops the money), and an ' +
      'unfunded fee pool (fails rather than inventing). 31 engine tests + 12 mount tests; 12 mutations each verified to turn a named test red. ' +
      'ONE OF THOSE MUTATIONS FOUND A REAL BUG IN THIS PR before merge: payoutKeysAreBusinessDerived allowed a uuid that `endsWith` the key on the theory that ' +
      'a trailing id was the business one — backwards, since trailing is exactly where a generated id is appended, so `close:${id}:${randomUUID()}` passed the ' +
      'guard clean. Replaced with a count (exactly one uuid per key, the beneficiary) plus a Date.now() segment check, and pointed a test at both shapes. ' +
      'Still NOT done beyond the rate: no caller ACCRUES from a real fee event yet — svc-trade/svc-pay do not emit affiliate fee events, so accrual rows are ' +
      'operator-supplied today. LEDGER_URL is optional and undefaulted in svc-identity, so a deployment that has not set it refuses ' +
      '`affiliate.payout.ledger_unwired` rather than failing at post time. ' +
      'NAMED GAP FOR WHOEVER WIRES THE PRODUCER, because it will bite them and is invisible from the payout side: FeeEvent and the accrual row do NOT record ' +
      'which module fee pool the fee landed in. A trading fee lands in houseFees("trade"), a payment fee in houseFees("pay") — payout has only ' +
      'AFFILIATE_PAYOUT_SOURCE_MODULE = "identity" to sweep from. It is one named constant plus an overridable `sourceModule` param rather than a literal at the ' +
      'call site, so the hedge is legible, but it IS an assumption: a real producer needs a source-module column on the accrual row, or commission gets swept ' +
      'from a pool that never held the fee (which fails as InsufficientFunds rather than inventing — safe, but a failure). Not fixed here because inventing a ' +
      'column shape for a producer that does not exist is the same class of guess as inventing a rate.',
  }),
  f('ops.compliance', 'Screening queues, geo-block, VPN/Tor detection', {
    module: 'core-ops',
    phase: '5',
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['identity.kyc'],
    requires: ['packages/config/src/screening.ts', 'packages/config/src/jurisdiction.ts'],
    note:
      '**D26-P1-O1 Done-bar sealed 2026-08-12 (#1734):** screening *mechanism* — `INTAFACED_SCREENING_FAIL_CLOSED` → ' +
      '`denied.screening_unconfigured` when list unset; honesty-only default OFF. List *content* remains Class X (Nitro/counsel). ' +
      'VPN partner / geo-IP socket / case-management UI residual. Avoid dual-edit Nitro #1659 svc-edge control-plane.',
  }),
  f('ops.analytics', 'Warehouse — read replica + cube layer', {
    module: 'core-ops',
    phase: '5',
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['ledger.double-entry'],
    requires: ['packages/contracts/src/ops-analytics-warehouse.ts', 'services/svc-edge/src/compliance-honesty.ts'],
    note:
      '**D26-P1-O4 Done-bar sealed 2026-08-12 (#1759):** warehouse door usable-or-§13 — `ANALYTICS_ETL_WATERMARK_AT` + ' +
      '`resolveEtlWatermark` absent/present honesty; stamp never paints live cubes alone; writer URLs refuse. ' +
      'Residual (not invent): production pg lag pool wiring + cube job callers. Never second balances.',
  }),
  f('ops.admin', 'apps/admin — listings, fee params, treasury, kill-switches', {
    module: 'core-ops',
    phase: '5',
    status: 'ready',
    dependsOn: ['infra.ui-tokens'],
    requires: ['apps/admin'],
    note:
      'Console is NOT a facade (kill/freeze live via BFF → edge). **Wave 3 #1188 (2026-08-09)**: `/tools` Operator tools page + BFF proxies already-mounted ' +
      'edge tRPC (KYC, freeze identity, bank.ops, merchantState, token mint/distribute, academy ops) — missing EDGE/token → not-wired, never fake success. ' +
      'Reconcile stays simulated (honest marker) until full 3-service mount. Still NOT done: fee/listing write paths absent platform-wide; Class X SSO/ACL ' +
      'on :3100; no invent fee schedules.',
  }),
  f('ops.notifications', 'Event-driven fan-out: in-app, push, email, SMS', {
    module: 'notify',
    phase: '5',
    status: 'ready',
    dependsOn: ['infra.events'],
    requires: ['services/svc-notify'],
    note:
      '**D26-P1-O5 deepen (2026-08-12):** `notify.operatorDeliveries` (`admin:read`) — newest-first ' +
      'cross-user delivery outcomes; `accepted`≠end-device delivered. Prior #1701: fan-out mountain vs §13 ' +
      'channels explicit (`mountain-vs-sockets.ts`). Mountain stays `ready` not `done` while OOA refuse; ' +
      'no provider invent; Class X credentials remain owner. ' +
      'GHOST OWNER CLEARED 2026-08-09 wave 3: was `wip` @nitro-agent with no open PR when wave started; residual built and merged as #1187 (stuck-pending reap, ' +
      'register/verify rate limits, consent footer). Prior: liquidation fan-out #1116, multi-channel adapters, delivery honesty (accepted≠delivered). ' +
      '**Wave 4 #1504 (2026-08-09)**: closed a declared-but-unwired surface — AlertService.evaluateMarket was complete, tested and had NO CALLER while ' +
      'router.ts called it "an internal job path" (D-S-13 Class B: createAlert returned status active for a watch nothing would ever evaluate). Sweep now ' +
      'mounted on an interval fanning in from activeMarkets(), reported on /ready; MarkSource.kind required so a dark port cannot read as live; both alert ' +
      'procedures carry evaluation {markSource,canFire,code} so the gap is disclosed in code (Class C). Also mount.reachable.test.ts — the tRPC mount over ' +
      'a real socket; nothing in the repo had ever exercised fastifyTRPCPlugin, and createCaller stays green on a mount that was never registered. ' +
      '**Wave 10 #1586**: trade public ticker MarkSource when TRADE_URL set; unset stays dark. ' +
      '**Wave 13 #1638 (L12)**: compose sets TRADE_URL for svc-notify (same surface bank uses) so the stack is not dark-by-default while trade is up; ' +
      'settle ownership by attempt so a late gateway after reclaim cannot stamp accepted over attempt N+1; claim never abandons under a live lease. ' +
      '**MUST NOT flip to done:** out-of-app channels refuse channel.not_configured until Class X gateway credentials (owner). In-app DELIVERS. ' +
      'email/push/sms transports are wired and proven against a real HTTP server (gateway-wire.test.ts counts at the server) but cannot deliver without ' +
      'owner-provisioned credentials — wired to refuse, never to pretend. ' +
      'Residual: more event consumers (optional); Class X gateway credentials. ' +
      '(Multi-replica rate-limit N× already closed by migration 0005 + PostgresTargetRateLimiter.)',
  }),
  f('v22.alerts', 'Alerts & watchlists — price, funding, liquidation proximity, whale flow, portfolio (§31)', {
    module: 'notify',
    phase: '2',
    plane: 'F',
    dependsOn: ['trade.spot'],
    note: 'Law §31:809, gap-closed 2026-08-08; DEPENDENCY CORRECTED 2026-08-08 and the reasoning is here rather than in a commit message. THE PHASE IS NOT WHAT WAS WRONG. §31:809 ends "Phase 2 (alerts core) / 5 (intelligence tiers)" and §38:854 repeats it as "Alerts & watchlists (B/svc-notify/2–5)", so the law is explicit twice that the core belongs at 2 — the phase being worked. The edge was wrong: this row depended on `ops.notifications`, which is `phase: 5`, putting a phase-5 prerequisite in front of a phase-2 capability and rendering a row the law phases at 2 as permanently unstartable. Resolved by arguing the dependency down to what the core actually needs, NOT by moving the phase, because moving the phase would contradict the law in the one sentence where it is unambiguous. WHAT THE CORE ACTUALLY NEEDS: condition evaluation against a price the platform can source, plus watchlists. §31:809 says it "Rides §9 notification fan-out" — it CONSUMES a delivery path rather than building one, and a delivery path exists and is genuinely delivering (svc-notify in-app inbox, bus consumers, ON CONFLICT dedupe — see `ops.notifications`). WHY THE EDGE CAME OFF: the only thing standing between `ops.notifications` and `done` is out-of-app gateway CREDENTIALS the owner must obtain — email, push and SMS refuse every message with channel.not_configured until then (`docs/OWNER-ACTIONS-NOTIFY-GATEWAYS.md`, audit §C2). That is a done-bar residual on a supplier, not a start-bar dependency on this row, and §31:809 places no such condition on the alerts core. Keeping the edge repeated the mistake `venue.aggregation` made with the Venue Vault: a residual belonging on a done bar written as a blocking edge. THE RESIDUAL IS NOT DISCARDED — IT MOVES ONTO THIS ROW\'S OWN DONE BAR: this row may not read `done` while an alert can only reach an in-app inbox, and an alert that must reach a device and cannot must refuse by name rather than silently drop (svc-notify already has that vocabulary). STILL NOT DECIDED, and out of scope for the core: the Phase-5 intelligence tiers (whale-flow pings are Scanner-tier, and §31:809 ties tiers to stake); funding and liquidation-proximity alerts, which follow `trade.futures` (itself `ready`) and not this row; mobile watchlist sync, which needs `web.mobile-apps` and has no code. The honesty constraint transfers unchanged from the marks work — an alert compared against a price the platform cannot source refuses rather than firing on a stale or invented number, and `services/svc-trade/src/futures/accepted-mark.ts` is the existing vocabulary for saying so. `plane: F` is stated rather than defaulted — an alert has to know who to tell. RECORDED, NOT SILENTLY RESOLVED: §38:854 gives this capability plane B; this row says F. The disagreement is written down here rather than settled by whoever edits next.',
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

  // ── CAPABILITIES THE LAW NAMES AND THE BOARD NEVER DID (§25 · §29 · §31 · §37)
  //
  // Added 2026-08-08. Every row below was a COUNTED GAP in tooling/coverage.yaml:
  // the law names the capability, no tracker row carried it, and the ratchet held
  // the set BY NAME so it could not quietly grow. Counted is not tracked — a gap
  // says "we know something is missing"; a row says what phase it belongs to,
  // what it waits on, and which parts nobody has decided yet.
  //
  // ALMOST ALL OF THESE COMPUTE `blocked`, and that is the correct outcome rather
  // than a disappointing one. The job here was to express the real edge and let
  // the status fall out of it — not to find an edge that makes the board look
  // claimable. Phases come from the law (§25's matrix, §30:793, §31, §37); where
  // the law is silent, or where it gives a range or a "5+" the registry has no
  // bucket for, the note says so instead of inventing a phase key that the
  // by-phase render would silently drop the row out of.

  f('bank.auto-invest', 'Auto-invest — DCA schedules, card round-ups, threshold sweeps (§31)', {
    module: 'bank',
    phase: '5',
    plane: 'B',
    status: 'wip',
    owner: 'nitro-w10-l08',
    dependsOn: ['bank.accounts', 'bank.cards', 'bank.earn', 'trade.convert', 'protocol.smart-accounts'],
    // Path-narrowed 2026-08-12 (D26-P1-B4): was `services/svc-bank` and fenced ALL bank mountains
    // including ramps/cards/earn. Owner + wip unchanged — only the claim-check fence matches the real dir.
    requires: ['services/svc-bank/src/auto-invest'],
    note:
      'Law §31:805 F-plane PARTIAL (W10 L08): threshold_sweep → earn via earnDeposit on main path; ' +
      'createDca refuses bank.auto_invest_rate_unset without ConvertPort (no invent §8); ops.runAutoInvest + AUTO_INVEST_ENABLED. ' +
      'Still open: card round-ups (capture hook), ConvertPort→trade.convert wire, P-plane session-key allowance (protocol.smart-accounts / Shehzad). ' +
      '§0.6: rules hold no balance. Residual law: gap-closed 2026-08-08 note on both planes still stands for Done. ' +
      'Fence: requires narrowed to src/auto-invest so path-disjoint bank.ramps/cards work is not HUMAN-CLAIMED.',
  }),
  f('bank.business', 'svc-bank-biz — corporate accounts, maker/checker, expense cards, invoicing, crypto payroll (§31)', {
    module: 'bank',
    phase: '5',
    plane: 'F',
    status: 'wip',
    owner: 'nitro-w13-l03',
    // Path-narrowed 2026-08-12 (D26-P1-B4): was `services/svc-bank` (same over-fence as auto-invest).
    requires: ['services/svc-bank/src/business'],
    dependsOn: ['bank.accounts', 'bank.cards', 'pay.gateway'],
    note:
      'W13 L03 DEEPEN: over-threshold propose places purposed ledger hold (business-approval:<id>); approve settles hold→dest; ' +
      'reject/cancel releases. Still partial — KYB/payroll/invoicing/expense cards residual or §13. Prior W10 L08: dual-control roles. ' +
      'Law §31:811, gap-closed 2026-08-08 — payroll atomicity DoD and KYB Lane B still block full Done. Blocked on pay.gateway for invoicing; ' +
      'no invent payroll without law. Fence: requires narrowed to src/business so path-disjoint bank.ramps work is not HUMAN-CLAIMED.',
  }),
  f('tax.engine', 'svc-tax — per-jurisdiction lot accounting, realised/unrealised views, export packs (§31)', {
    module: 'tax',
    phase: '5',
    plane: 'B',
    dependsOn: ['ledger.double-entry', 'connect.data-lake', 'indexer.readmodels'],
    note: 'Law §31:807, gap-closed 2026-08-08. §31:807 names `svc-tax` as a NEW service, "owned not vendored", phases it 5, and §38:854 records B/svc-tax/5. Scope: per-jurisdiction reporting across trades, P2P, card spend-disposals, on-chain activity via the indexer, mining income and staking rewards; lot accounting (FIFO/LIFO/HIFO per jurisdiction); realised and unrealised views; export packs. THE ADVANTAGE THE LAW CLAIMS IS THE PART THAT IS MISSING: "Reads ledger + data lake; nothing to re-import, which is the entire advantage." The ledger half is real and `done`. The data lake does not exist (connect.data-lake, blocked behind §27) and on-chain history needs indexer.readmodels, also blocked. So this row is blocked on exactly the two reads that make it worth building — a tax engine that has to re-import CSVs is the product the law is differentiating against, not this one. NEEDS COUNSEL, NOT ENGINEERING, and that is the load-bearing half: which lot method applies in which jurisdiction, and what a "spend-disposal" is when a card transaction converts crypto at the till, are legal determinations. Same class as the sanctions list (DIRECTION §8.7) and the licensing gate on launch.rwa. An agent may build the lot-accounting ENGINE and the export format; it must not choose the jurisdiction mapping, because a wrong mapping shipped confidently is worse than no tax product. §31:807 keeps marketplace tax vendors for exotic jurisdictions, so the honest v1 boundary is a small set of mapped jurisdictions that refuses BY NAME outside it — never a silent default to one country\'s rules.',
  }),
  f('quant.studio', 'Strategy Studio — no-code builder, mandatory risk blocks (§29)', {
    module: 'quant',
    phase: '5',
    plane: 'B',
    dependsOn: ['connect.data-lake'],
    note: 'Law §29:783, gap-closed 2026-08-08. PHASE FROM THE LAW: §30:793 says "Quant Studio lands **Phase 5**" and §30:795 records B/svc-quant/5. WHAT IS DECIDED — `docs/adr/2026-08-04-predict-quant-connect-law.md` (D-S-18, Accepted) rules on §29 directly: "Blocked on §27\'s data lake, which is blocked on §27\'s adapters." That is the edge on this row, not an inference. §29:783 also makes the risk blocks MANDATORY — position caps, stop policy, drawdown halt — so a strategy a user can assemble without them is a bug and not a permissive default. WHAT IS NOT DECIDED, and D-S-18 lists it in writing under what still needs the owner: WHETHER QUANT SHIPS TO USERS AT ALL, given the framing risk that ADR describes at length. This row is boarded so the capability stops being invisible; it does not assert the product is going ahead, and no `services/svc-quant` should be scaffolded off the back of it. D-S-18 also draws the line that bounds any work here: "In a room with no code, an agent may build the contract and the refusal. It may not build the claim."',
  }),
  f('quant.backtest', 'Backtest engine — event-level, walk-forward, Monte Carlo, out-of-sample enforced (§29)', {
    module: 'quant',
    phase: '5',
    plane: 'B',
    dependsOn: ['connect.data-lake'],
    note: 'Law §29:785, gap-closed 2026-08-08; §30:795 groups backtests with the studio at B/svc-quant/5. Blocked on connect.data-lake, which §29:785 names as the substrate ("event-level backtests on the §27 data lake") and which does not exist. THIS IS THE ROW WHERE THE HONESTY DOCTRINE IS UNDER THE MOST PRESSURE, and D-S-18 (`docs/adr/2026-08-04-predict-quant-connect-law.md`, Accepted) already wrote the operative rule so it cannot be softened later: "A backtest is a claim about the past. Every surface that displays one must make it impossible to read as a claim about the future." The ADR also gives the reason no scan will ever cover this — everywhere else a fabricated number is a bug, but here a TRUTHFUL number computed over real history can still be the most misleading thing on the screen, so "the dishonesty is in the framing, not the arithmetic". BINDING FROM LINE ONE per D-S-18, and not re-openable by whoever claims this: a result with no out-of-sample verdict DOES NOT RENDER; fees, slippage and latency are modelled or the run is REFUSED rather than run-and-caveated; the number of variants tried is displayed, because a user who tested four hundred and shows the best has found noise; a live strategy\'s real P&L is never shown beside its backtest unless both are labelled at the same visual weight; and NO LEADERBOARD RANKED BY HISTORICAL RETURN, in any room. §30:797 adds a backtest determinism test to the DoD.',
  }),
  f('quant.sdk', 'Code SDK — TypeScript and Python on a sandboxed strategy runtime (§29)', {
    module: 'quant',
    phase: '5',
    plane: 'B',
    dependsOn: ['quant.studio', 'execution.sor'],
    note: 'Law §29:784, gap-closed 2026-08-08. PHASE: §30:793 puts "SDK + Marketplace **Phase 5+**". THE REGISTRY HAS NO 5+ BUCKET, so this reads `5` and the law\'s exact wording is recorded here — adding a phase key PHASE_ORDER does not know would drop the row out of the by-phase view entirely, which is the opposite of boarding it. §30:795 meanwhile lists the SDK with the studio at 5, so the law is not fully consistent with itself here; this note is the record of that rather than a silent pick. Blocked on quant.studio and execution.sor: §29:784 wants a sandboxed runtime with "full Connect market data, execution via the same OMS with per-strategy scoped permissions", and that OMS is svc-execution, which does not exist. THE SANDBOX IS ITS OWN SECURITY SURFACE, which is why §30:797 adds a sandbox-escape test suite to the DoD for this row specifically: §29:787 requires user code in V8 isolates or WASM, CPU, memory and egress capped, NO RAW NETWORK — market data and orders only through the runtime API. A runtime that can reach the network is not a sandbox with a gap; it is not a sandbox. DONE-BAR CONDITION, DELIBERATELY NOT AN EDGE: §29:787 takes external venue keys "from the Venue Vault, trade-only scope enforced", so the external-venue half of this row cannot read `done` until connect.venue-vault exists — the chain owner\'s phase-5 socket. It is recorded here rather than in `dependsOn` because the internal-book half needs no user credential. Note the contrast with venue.aggregation, where the same vault was an INVERTED edge (the vault depends on that row) and was removed for that reason: here the direction is honest, so the residual simply belongs on the done bar rather than in front of the row.',
  }),
  f('quant.marketplace', 'Strategy marketplace and compute tiers — subscriptions, token-gated tiers (§29)', {
    module: 'quant',
    phase: '5',
    plane: 'B',
    dependsOn: ['quant.studio', 'market.commerce'],
    note: 'Law §29:788, gap-closed 2026-08-08. PHASE: §30:793 gives Marketplace "**Phase 5+**"; §30:795 records B/svc-quant+market/5. Same treatment as quant.sdk — `5` in the field, the law\'s "5+" in this note, because the registry has no 5+ bucket and an unknown phase key would drop the row out of the by-phase render. Blocked on quant.studio (nothing to publish before strategies can be built) and market.commerce (subscriptions and house commission already live there, and a second commerce path would be a second answer to the same question). FLAGGED — A CONTRADICTION THE BOARD ALREADY CARRIES ONCE, ARRIVING A SECOND TIME. §29:788 offers publication "as subscriptions **or profit-share** (copy-trading generalised to systems)". `SPEC-SOVEREIGN-ROUTING-AND-COPY-2026-08-01.md:95` forbids, in v1, "any fee computed from follower P&L, in any form — percentage of gains, high-water mark, hurdle rate, or \'success fee\'", and audit §B5 #1 records the law being stale in precisely this way for trade.copy. If copy trading may not charge on P&L, then a strategy marketplace that does is the same unlicensed-manager structure with a different noun — and NOBODY HAS RULED THAT SYSTEMS DIFFER FROM LEADERS. An ADR settles that; a PR must not. Also binding from D-S-18: no leaderboard ranked by historical return, which removes the obvious way to rank a strategy market and means the ranking signal has to be designed rather than defaulted. NOT DECIDED: compute-tier magnitudes — §29:789 token-gates tiers per §4.3, and every economic magnitude is owner-only under D-S-14.',
  }),

  f('agents.portfolio', 'Portfolio Agent — auto-rebalance inside user guardrails (§8.2)', {
    module: 'agents',
    phase: '5',
    plane: 'B',
    dependsOn: ['agents.gateway', 'ops.portfolio'],
    note: 'Law §8.2:388 ("v2: Portfolio (auto-rebalance in guardrails)") and §25:732, gap-closed 2026-08-08. §8.2 names TEN agents; the board carried five plus the gateway (audit §A1.a #12), and this is one of the five with no row. Blocked on ops.portfolio: rebalancing means comparing a held position against a target allocation, and the portfolio view that would supply "held" does not exist yet. agents.gateway is `done`, so the fleet runtime, guardrail schema and `agent_actions` audit log this rides are real rather than assumed. CLASS M THE MOMENT IT MOVES: an agent that rebalances is placing orders with user money, so §8.2\'s Agentic Law is not decoration — every action to `agent_actions` plus a user-visible log, execution strictly inside user guardrails, and a kill-switch the user can see. NOT DECIDED: whether rebalancing may cross the plane boundary. Selling a custodial holding to fund a sovereign one is a bridge movement, not a trade, and it follows `docs/adr/2026-08-04-cross-plane-bridge-accounting.md` — not this row\'s assumption.',
  }),
  f('agents.launch', 'Launch Agent — pre-listing risk pattern flags (§8.2)', {
    module: 'agents',
    phase: '5',
    plane: 'B',
    dependsOn: ['agents.gateway', 'launch.trust-layer'],
    note: 'Law §8.2:388 ("v2: ... Launch") and §35:836, gap-closed 2026-08-08. One of the five v2 agents with no row (audit §A1.a #12). §35:836 states the job precisely — "Launch Agent flags risk patterns pre-listing" — alongside deployer reputation, so it is blocked on launch.trust-layer, a `socket` owned by the chain owner and the row where on-chain deployer history would live. agents.gateway is `done`. THE HONESTY LINE FOR THIS ONE: a risk flag on a deployer with no history is not a low score, it is NO score — the same rule D-S-18 fixed for latency grading, and the same failure shape as a scan that walks zero files and prints clean. A pre-listing badge reading "no risk patterns found" over an empty history is worse than showing nothing, because it launders absence into assurance and §35 sells that badge as the moat. NOT DECIDED: whether a flag blocks a listing or only annotates it. §35:837 has honest-market badges GATE cross-promotion, which is annotation with consequences rather than refusal, but nothing anywhere says what happens when the agent flags a token a paying customer wants listed. That is an owner call.',
  }),
  f('agents.risk-compliance', 'Risk & Compliance Agent — screening support and report drafts (§8.2)', {
    module: 'agents',
    phase: '5',
    plane: 'B',
    dependsOn: ['agents.gateway', 'ops.compliance'],
    note: 'Law §8.2:388 ("v2: ... Risk & Compliance (screening + report drafts)") and §25:732, gap-closed 2026-08-08. One of the five v2 agents with no row. Blocked on ops.compliance (`ready`, not `done`), which owns the screening queues and geo-block surfaces this agent would draft against; agents.gateway is `done`. THE BOUNDARY THAT MUST NOT BLUR: §8.2 says screening plus REPORT DRAFTS. A draft is a proposal for a human. A compliance DECISION — granting a tier, filing a report, clearing a flagged account — is not an agent action, and identity.kyc-review already models this correctly: approval is an operator action recorded with `reviewed_by`, and an agent must never be able to write that column. NOT DECIDED, and it sits upstream of this row rather than inside it: the sanctions blocklist ships EMPTY (`packages/config/src/screening.ts`) and no JURISDICTION_MATRIX entry carries `blocked:true`, so an agent drafting against that content today would be drafting against nothing. Prod and staging refuse to boot without the list, which is correct; the list itself is counsel (DIRECTION §8.7), not engineering.',
  }),
  f('agents.coach', 'AI Coach — curriculum-grounded coaching agent (§8.2, §25:708)', {
    module: 'agents',
    phase: '5',
    plane: 'B',
    dependsOn: ['agents.gateway', 'academy.curriculum'],
    note: 'Law §8.2:388 ("v2: ... Coach") and §25:708, which gives the AI Coach its OWN matrix row (B / svc-agents / 5) — which is why it is a row here rather than folded into the fleet, and why both the agents capability and the academy capability claim it. Gap-closed 2026-08-08; audit §A1.a #11 and #12. Blocked on academy.curriculum (`ready`, not `done`): a coach grounded in nothing is a chatbot, and the DERIV//DESK library import is the material it is supposed to be grounded in. agents.gateway is `done`. THE LINE THIS AGENT SITS CLOSEST TO: coaching a user on the platform they are trading on is one sentence away from advice, and advice is regulated in most places we operate. agents.support already has the honest shape — KB-grounded and account-state-grounded, escalating with a case file rather than improvising — and this row inherits it. NOT DECIDED, and NOT an agent\'s to decide: whether the Coach may reference the user\'s own positions. §8.2 grounds Support in account state, and the same grounding on a coaching agent turns education into a recommendation about live money. That is an owner ruling, and it changes what gets built rather than only what gets said.',
  }),
  f('agents.growth', 'Growth Agent — acquisition and campaign proposals (§8.2)', {
    module: 'agents',
    phase: '5',
    plane: 'B',
    dependsOn: ['agents.gateway', 'ops.analytics'],
    note: 'Law §8.2:388 ("v2: ... Growth") and §25:719, which names the Growth Agent inside the marketing-engine matrix row — so this row is claimed by both the fleet capability and the marketing one. Gap-closed 2026-08-08; one of the five v2 agents with no row. Blocked on ops.analytics (`ready`, not `done`), the warehouse a growth agent would read cohorts and funnels from; agents.gateway is `done`. WHAT IT MUST NOT BECOME: §8.2\'s Agentic Law plus the platform\'s own honesty doctrine mean this agent may propose a campaign and may not publish a claim. Every returns-adjacent statement is already banned in three places — no returns-ranked leaderboards (§8 and D-S-18), no curve-fit marketing on-platform (§29:785) — and an agent generating acquisition copy is the single most likely thing on this board to breach them by accident. Proposals to a human, never autonomous publication. NOT DECIDED: incentive budgets. Any spend the agent proposes is an economic magnitude and owner-only under D-S-14.',
  }),
  f('academy.video', 'Video library — stored playback, tier-gated (§25:707)', {
    module: 'academy',
    phase: '5',
    plane: 'B',
    dependsOn: ['academy.curriculum'],
    note: 'Law §25:707 ("Video library | B | media service | 5"), gap-closed 2026-08-08 — a named surface in the matrix with no row and no service on disk (audit §A1.a #10). Phase and plane are the matrix\'s own. Blocked on academy.curriculum (`ready`, not `done`): §25:705 puts the 20 playbooks and 3 workbooks in the curriculum spine, and a video library is the media half of that same shelf rather than a separate product — standing a second catalogue up beside it is how one surface becomes two. WHAT IS ACTUALLY MISSING IS NOT CODE: §25:707 names a "media service", and there is no object storage and no transcode path anywhere in this repo. That is the same unprovisioned dependency blueprint.card records for its rasterizer, and it is an owner and infrastructure item rather than a PR. NOTE WHAT THIS ROW IS NOT, so one blocker cannot hide behind the other: socket.stream-provider is LIVE streaming (LiveKit, blocked on a self-hosted deployment and an API key the owner must supply); this is stored playback. DONE-BAR CONDITION: entitlement. §25:710 gates Academy access by tier and stake, so a video library that serves a file to anyone holding the URL has not shipped the product — signed, expiring, tier-checked access, or it is not `done`.',
  }),
  f('ops.portfolio', 'Portfolio suite — users and house, views over ledger and indexer (§25:723)', {
    module: 'core-ops',
    phase: '5',
    plane: 'B',
    dependsOn: ['ledger.double-entry', 'indexer.readmodels'],
    note: 'Law §25:723 ("Portfolio suite (users + house) | B | portfolio views over ledger+indexer | 5"), gap-closed 2026-08-08 — no row, and no service claimed it (audit §A1.a #4). Blocked on indexer.readmodels, which is exactly the second half of the substrate the matrix names: the ledger half (ledger.double-entry) is `done`, the on-chain half is not, and a portfolio showing only the custodial side of a two-plane platform is a MISLEADING balance rather than a partial one. THAT IS THE LOAD-BEARING RULE FOR THIS ROW: a holding the platform cannot currently read is ABSENT AND NAMED, never zero. D-S-18 states the same principle for venues — "a venue that is not connected is absent, never an empty book" — and it transfers exactly, because a zero in a portfolio is a claim, and it is the one number a user will act on. §0.6 applies in the direction people forget: a portfolio is a VIEW. It reads the ledger and the indexer and holds no balance of its own. THE HOUSE HALF NEEDS CARE: §25:723 says users AND house, and house positions are the platform\'s own book — the same surface ops.custody covers for wallets, and Class X wherever real balances are exposed. This row also blocks agents.portfolio, which cannot rebalance against a portfolio nobody can read.',
  }),
  f('ops.business-systems', 'CRM, HR and team, Finance with live revenue, Project engine (§25:714)', {
    module: 'core-ops',
    phase: '5',
    plane: 'F',
    dependsOn: ['ops.support', 'ops.analytics'],
    note: 'Law §25:714 ("CRM / HR & team / Finance (live revenue fused) / Project engine | — | svc-core-ops | 5"), gap-closed 2026-08-08. FOUR NAMED SYSTEMS AGAINST ONE ADJACENT ROW — ops.support, which is tickets and a KB (audit §A1.a #7). Blocked on ops.support and ops.analytics, both `ready` and neither `done`: a CRM sits on the contact and case data the support desk already owns, and "Finance with live revenue fused" is the warehouse read rather than a second aggregation of the same numbers. PLANE: the §25 matrix gives "—" for this line. `plane: F` here means only that these are operator-side, identity-bearing internal tools; it is NOT a plane ruling — the same qualification execution.house-tenant carries, for the same reason. FLAGGED FOR SCOPE, NOT FOR DESIGN: CRM and Finance sit next to revenue the platform already records, but "HR & team" and a "Project engine" are internal business software with no customer-facing edge, and nothing anywhere says we build those rather than buy them. That is a build-or-buy call worth taking BEFORE anyone starts, because it is the difference between two surfaces and four. This row does not assume the answer; it records that the law names all four and the board carried none.',
  }),
  f('ops.marketing', 'Marketing engine — campaigns, attribution, with the Growth Agent (§25:719)', {
    module: 'core-ops',
    phase: '5',
    plane: 'F',
    dependsOn: ['ops.analytics', 'ops.affiliates', 'agents.growth'],
    note: 'Law §25:719 ("Marketing engine (+ Growth Agent) | — | svc-core-ops | 5"), gap-closed 2026-08-08 — no row for the engine, and Growth was one of the five missing agents (audit §A1.a #8). Blocked on ops.analytics and ops.affiliates (both `ready`, neither `done`) and on agents.growth: a marketing engine with no attribution is a send button, and attribution already has a home in the affiliate and referral trees rather than needing a second one. PLANE: §25 gives "—"; `F` states operator-side and identity-bearing, and is not a plane ruling. THE CONSTRAINT THAT MATTERS MORE THAN THE FEATURE SET: this is the surface most likely to make a claim the rest of the platform has spent real effort refusing to make. Returns-ranked leaderboards are banned (§8, D-S-18); curve-fit marketing is banned on-platform (§29:785); brand-scan already enforces §0.7. A campaign template with a performance figure in it breaches all three quietly, so the engine should make that shape HARD rather than possible. UNRESOLVED UPSTREAM, and it decides what this engine can actually do: outbound email, push and SMS all refuse with channel.not_configured until the owner supplies gateway credentials (`docs/OWNER-ACTIONS-NOTIFY-GATEWAYS.md`), so the delivery rail a campaign would use does not currently deliver out-of-app. NOT DECIDED: budgets and incentive magnitudes, owner-only under D-S-14.',
  }),
  f('ops.kb-workflow', 'Knowledge base and workflow automation (§25:720)', {
    module: 'core-ops',
    phase: '5',
    plane: 'F',
    dependsOn: ['ops.support'],
    note: 'Law §25:720 ("Knowledge base / Workflow automation | — | svc-core-ops | 5"), gap-closed 2026-08-08. ops.support carries "KB" in its TITLE, which is precisely how this stayed invisible: a word in another row\'s title is not a row, and the workflow-automation engine beside it had no board presence at all (audit §A1.a #9). Blocked on ops.support (`ready`, not `done`), which is the right edge in both directions — the standalone KB is an extraction of what the support desk already stores, and agents.support is grounded in it. PLANE: §25 gives "—"; `F` states operator-side and identity-bearing, not a plane ruling. TWO CAPABILITIES IN ONE MATRIX LINE, AND THEY ARE NOT THE SAME SIZE. A public, versioned knowledge base is a content surface and ordinary work. A WORKFLOW AUTOMATION ENGINE — user-defined triggers running actions across modules — is an agent runtime with a different name, and it must not become a second one: agents.gateway already owns the fleet runtime, the guardrail schema and the `agent_actions` audit log, and anything that executes on a user\'s behalf belongs behind those or the Agentic Law has a hole in it. Worth an owner ruling on whether the automation half ships at all, rather than discovering the overlap after it is built.',
  }),
  f('ops.social-promotion', 'Social promotion — share pipeline and tracked attribution, every surface (§25:725)', {
    module: 'core-ops',
    phase: '5',
    plane: 'B',
    dependsOn: ['blueprint.card', 'ops.affiliates'],
    note: 'Law §25:725 ("Social promotion (one-tap share, tracked attribution, every surface) | B | share pipeline + Blueprint cards | 4/5"), gap-closed 2026-08-08. blueprint.card covers RENDERING the §7.2 acquisition artefact and is `done`; the distribution half — the share pipeline and attribution on every surface — had no row (audit §A1.a #6). PHASE: the matrix gives 4/5 and the registry has no range bucket. It reads `5` because the phase-4 half IS the card, which already shipped, so what remains is the attribution half that follows ops.affiliates at 5 — and phasing it 4 would have put a phase-5 dependency in front of a phase-4 row, which is the exact defect this same PR removed from venue.aggregation and v22.alerts. Blocked on ops.affiliates (`ready`, not `done`), which owns the multi-tier trees attribution belongs in; a second attribution system would be a second answer to "who brought this user". NOT DECIDED, and genuinely load-bearing for a share pipeline: what leaves the platform in a share. blueprint.card is derived from a Blueprint session, and §26:742-746 plus blueprint.ownership make Blueprint data owned and private with deletion cascading. A share URL that outlives a deleted Blueprint breaks that, so the attribution token has to be revocable rather than permanent — an ADR-shaped question, not a default someone picks while wiring a share button.',
  }),
  f('ops.infra-b2b', 'INTAFACED INFRA — embeddable ramp widget and white-label tiers (§37)', {
    module: 'core-ops',
    phase: '5',
    plane: 'B',
    dependsOn: ['pay.payfac', 'bank.ramps'],
    note: 'Law §37:845, gap-closed 2026-08-08. THE LAW CALLS THIS "potentially the largest single revenue line in the stack" and it had zero board presence (audit §A1.c #40). Scope per §37: an embeddable ramp widget (on/off-ramp plus checkout for third-party apps — their users, our rails, rev-share) and white-label tiers from hosted exchange-in-a-box up to full OS licensing. PHASE: §37:848 says "**Phase 5+ (post public drop)**". The registry has no 5+ bucket, so this reads `5` and the law\'s wording is recorded here rather than a phase key invented that the by-phase render would drop the row out of. PLANE: §38:854 gives "—" for this line; `B` states that the line packages both planes\' rails and is not a plane ruling. Blocked on pay.payfac and bank.ramps — §37:848 says it "runs on existing multi-tenancy (PayFac trees + execution tenancy already specced) — this is packaging, not new core", and the PayFac trees are blocked while the ramp itself is `wip`. The white-label half additionally needs the §28:777 execution tenancy, which is execution.house-tenant: blocked, and behind an owner ADR of its own. §38:854 ALREADY ADDS A "white-label tenant isolation audit" TO THE DoD with nothing to attach it to — the same pattern as the payroll test under bank.business, and half the reason both rows now exist. FLAGGED, AND THE FLAG IS NOT TECHNICAL: licensing the OS to an operator under their brand means our engine moving their customers\' money under someone else\'s compliance posture. Who holds the licence, who is liable for a white-label operator\'s KYC failures, and what the rev-share is are owner and counsel questions. "Packaging, not new core" is true of the code and false of the risk.',
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
    note: 'D26-P0-03 SEALED 2026-08-13 (adr/2026-08-13-dex-venue-set-refuse-closed.md): empty default is refuse; agents do not seed DEX_EXTERNAL_VENUES. Socket stays until Nitro publishes a durable set. OWNER-GATED, assigned to Nitro 2026-08-07. THE CODE IS FINISHED. IT CANNOT SERVE A QUOTE. Three adapters, all dark on shipped defaults: intachain-clob (socket.clob-contracts), internal-book (empty until an order lands), external venues DEX_EXTERNAL_VENUES=[] by design. Until Nitro publishes a host set, refusing with 503 dex.quote.no_venue_available is the correct product behaviour.',
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

  f('predict.markets', 'INTAFACED PREDICT — prediction markets as an INTACORE market type (§32)', {
    module: 'predict',
    phase: '5P',
    plane: 'P',
    owner: 'shehzad002',
    dependsOn: ['chain.mainnet'],
    note: 'Law §32:815, gap-closed 2026-08-08 — AN ENTIRE NAMED MODULE OF THE PRODUCT, the twelfth room, with no board presence (audit §A1.c #35). §38:853 records the module count moving 11 to 12 and products 24 to 28; the tracker did not know the twelfth room existed. §32:821 phases it 5P; the plane is P — sovereign, zero KYC by architecture, geo-gated on the hosted front end per JURISDICTION_MATRIX. OWNER IS THE CHAIN OWNER BECAUSE AN ACCEPTED ADR SAYS SO, not by inference: `docs/adr/2026-08-04-predict-quant-connect-law.md` (D-S-18) states "§32 Predict — Phase 5P. Not agent work, and not mine", "It is out of my lane and out of the agent lane", and lists "Every §32 decision" under what still needs the owner. AGENTS BABYSIT ONLY. Blocked on chain.mainnet: prediction markets are an INTACORE market type and INTACORE does not exist — no `services/svc-chain`, no Go files, no genesis. D-S-18 also fixes two properties now, so they are not decided by whoever writes the first line of code. RESOLUTION IS THE PRODUCT, not the order book: the resolution stack (oracle adapters, designated reporter, staked dispute escalation with bond slashing) "is specced before the market type is built, not after", because a prediction market that cannot resolve honestly is a casino with extra steps, and resolution is where every real prediction platform has failed. And every bond and slashing magnitude is owner-only under D-S-14 — "IFC-staked dispute escalation" names a mechanism and no number. §38:854 adds a resolution-dispute game-theory test suite to the DoD with nothing to attach it to, the same pattern as the payroll test under bank.business. D-S-18 done bar, verbatim: "§32 stays unstarted until INTACORE exists and its resolution stack is specced."',
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
    status: 'done',
    owner: 'shehzad002',
    dependsOn: ['protocol.smart-accounts', 'blueprint.crews'],
    requires: ['services/svc-protocol/contracts/vaults/CrewVault.sol'],
    note:
      'S-L1 2026-08-08: CrewVault — immutable share bps summing to 10_000, M-of-N spend, exit pays construction share of ' +
      'current balance (split designed before deposit). Residual: multi-asset vaults, share rebalance after exit.',
  }),
  f('protocol.legacy-vaults', 'Legacy vaults — time-locked inheritance, staged heir release (§34)', {
    module: 'protocol',
    phase: '5P',
    plane: 'P',
    status: 'socket',
    owner: 'shehzad002',
    dependsOn: ['protocol.smart-accounts'],
    note:
      'S-K7 ADR accepted 2026-08-08 (docs/adr/2026-08-08-inheritance-never-platform-guardian.md): platform never a guardian. ' +
      'S-L2 contract code deliberately NOT started until an heir/time-lock design matches that ADR without a platform key. ' +
      'Stays socket — honest.',
  }),

  f('socket.options-settlement-asset-law', 'Options / forex settlement asset law (D26-P0-05 ADR)', {
    module: 'trade',
    phase: '2',
    status: 'socket',
    dependsOn: ['trade.options'],
    requires: ['services/svc-trade/src/spot/options-listing.ts'],
    note:
      '§13 — D26-P0-05 ADR sealed 2026-08-13 (docs/adr/2026-08-13-options-forex-settlement-asset-law.md). Socket stays until operator ' +
      'sets opaque TRADE_OPTIONS_SETTLEMENT_ASSET_LAW on a deploy (ADR-in-force, never parsed for assets/matrix). Named 2026-08-12 (D26-P1-T6): ' +
      'svc-trade listMarket(kind=options) refuses with trade.options_settlement_law_unset while the stamp is empty. Inventing a coin here would ' +
      'close a ready row with a lie. Forex share is sibling socket.forex-settlement. Closing this socket requires the operator stamp, not craft.',
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
      'boot with a sandbox rail registered. Pointing any rail at real money is Class X. ' +
      'D26-P1-P6: subscription card path refuses `pay.mandate_rail_absent` into this socket — rail port has createMandate/revokeMandate and ' +
      'no charge-against-mandate operation; do not invent pull in svc-pay subscriptions.',
  }),
  f('socket.pay-precharge-notify', 'Pre-charge subscription notify (SPEC §4 before money lands)', {
    module: 'pay',
    phase: '5',
    status: 'socket',
    dependsOn: ['pay.subscriptions', 'ops.notifications'],
    note:
      '§13 — SPEC §4 requires every recurring charge notified BEFORE it lands. D26-P1-P6 sealed the gap honestly: fire path calls ' +
      '`acknowledgePreChargeNotifyBeforeCharge` with `notified:false` before openInvoice; merchant Ready `subscription.productReady` ' +
      'exposes the same socket so "notified" cannot be read as true. Closing still needs a real notify/journal delivery path ' +
      '(svc-notify or merchant webhook upcoming event) — inventing a silent success event remains forbidden. ' +
      'Channel credentials remain `socket.notify-*`. Pins: mandate-product.ts · precharge-notify-absent.test.ts · subscriptions-done-bar.test.ts.',
  }),
  f('socket.forex-settlement', 'Forex/commodity settlement asset law + fiat settle rails', {
    module: 'trade',
    phase: '2',
    status: 'socket',
    dependsOn: ['pay.rails'],
    requires: ['services/svc-trade/src/spot/forex-settlement.ts'],
    note:
      '§13 — D26-P1-T7 explicit socket (2026-08-12). D26-P0-05 ADR sealed 2026-08-13 (shape only). trade.forex product-complete only after ' +
      'fiat settle rails posture. Until then: forex.settlementStatus published=false; production active listMarket / setMarketStatus(active) / ' +
      'place refuse trade.unsettled_asset_class_listing naming this socket. Paper + non-active listing allowed (model). Do NOT invent settlement ' +
      'asset (stablecoin-margined vs true fiat omnibus — D8; PAY_CRYPTO_ASSETS must not accidentally map EUR→euro stablecoin). No code closes this.',
  }),
  f('socket.otc-maker-routing', 'Maker-routed OTC settle (external maker ledger path)', {
    module: 'trade',
    phase: '2',
    status: 'socket',
    dependsOn: ['trade.otc'],
    requires: ['services/svc-trade/src/otc/maker-routing.ts'],
    note:
      '§13 — named 2026-08-12 under trade.otc residual. Platform-principal settle is real (marketMakerMakerFill). ' +
      'Maker counterparty settle refuses via planOtcSettle + otc.deskStatus.makerRouting until owner publishes routing recipe + ledger path. ' +
      'Do NOT invent maker book / silent second counterparty. Pins: maker-routing.ts · settle.ts · otc-maker-routing-donebar.test.ts.',
  }),
  f('socket.otc-mid-feed', 'Live OTC mid observation feed (refreshes asOf)', {
    module: 'trade',
    phase: '2',
    status: 'socket',
    dependsOn: ['trade.otc'],
    requires: ['services/svc-trade/src/otc/mid-feed.ts'],
    note:
      '§13 — named under trade.otc residual. createConfigOtcMidSource boot map stamps asOf at process start and age-gates dark — ' +
      'that is not a live feed. otc.deskStatus.midFeed published=false until an observation source refreshes asOf. ' +
      'Do NOT invent mids or keep boot memory past maxMidAgeSeconds. Pins: mid-feed.ts · mid-source.ts · otc-mid-feed-donebar.test.ts.',
  }),
  // D26-P1-P5: pay.fraud Done bar ships dispute cases; ledger chargeback posts stay refuse-closed here.
  f('socket.pay-chargeback-ledger-wire', 'Wire svc-pay dispute open to ledger chargeback recipes', {
    module: 'pay',
    phase: '3',
    status: 'socket',
    dependsOn: ['pay.fraud'],
    requires: ['services/svc-pay/src/fraud/chargeback-ledger-socket.ts'],
    note:
      '§13 residual (named 2026-08-12 under D26-P1-P5) — packages/ledger-client already has chargebackOpen / Shortfall / Won / ' +
      'ShortfallRecovered with an explicit Class M owner-sign-off banner. svc-pay records dispute cases and projects payment → disputed, ' +
      'but must not call those recipes until the four named questions in chargeback.ts are signed. The seam refuses by name ' +
      '(`refuseChargebackLedgerPost` → pay.chargeback_ledger_unwired) so the Done bar is mechanism + honest socket, not a silent book ' +
      'entry or an unwired stub string. Closing = owner sign-off then wire dispute open to post; inventing split legs or shortfall ' +
      'policy is forbidden. Blocklist / scheme list content remains Class X.',
  }),
  f('socket.copy-auto-mirror-place', 'Copy auto-mirror place into spot after planMirror', {
    module: 'trade',
    phase: '2',
    status: 'socket',
    dependsOn: ['trade.copy', 'trade.spot'],
    requires: ['services/svc-trade/src/copy/auto-mirror-place.ts', 'services/svc-trade/src/copy/copy-auto-mirror-place-done-bar.test.ts'],
    note:
      '§13 — D26-P1-T3 (2026-08-12). planMirror + exposure claim are real; placing the plan as a follower spot order is not wired. ' +
      'copy.placeMirror / deskStatus.autoMirrorPlace refuse-closed naming this socket — never invent fills or silently drop plans. ' +
      'Closing needs a durable follower place path (session-key / principal wire), not a fake order id.',
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
    note:
      'Owner set 2026-08-07. INTERNAL PACKAGE 2026-08-08: threat model + findings log + adversarial matrix ' +
      '(services/svc-protocol/src/accounts/adversarial-audit.test.ts) live under docs/audits/protocol-smart-accounts-2026-08-08.md. ' +
      'STATUS stays socket: choosing and PAYING an audit firm is a Nitro decision (budget). Tests pass ≠ audited:true.',
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
    status: 'done',
    owner: 'shehzad002',
    dependsOn: ['protocol.smart-accounts'],
    requires: ['services/svc-protocol/contracts/passkey'],
    note: 'CLOSED 2026-08-08 (S-A9). PasskeyOwner.sol answers ERC-1271 for a SmartAccount contract owner: WebAuthn get assertion (authData||sha256(clientDataJSON)) verified via RIP-7212 P256VERIFY at 0x100, challenge bound to the digest under check, low-s enforced. Hermetic bridge tests mirror svc-identity signing; on-chain suite requires the precompile (anvil/Base). Residuals named in NatSpec + docs/audits/protocol-smart-accounts-2026-08-08.md: origin/rpId not enforced on-chain yet; gas to be snapshotted on the ruled P0 rail; no audited:true.',
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
    status: 'done',
    owner: 'shehzad002',
    dependsOn: ['protocol.smart-accounts'],
    requires: ['services/svc-protocol/src/chain/paymaster-policy.ts', 'docs/adr/2026-08-08-paymaster-and-bundler-policy.md'],
    note:
      'S-A10 2026-08-08: sponsorship decision module — allowlist, selectors, gas cap; refuses when funding_unconfigured. ' +
      'ADR states Nitro Class X owns the deposit account. Live paymaster contract + funded path still need that deposit.',
  }),
  f('socket.bundler-policy', 'Bundler dependency — public relay or self-hosted', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    status: 'done',
    owner: 'shehzad002',
    dependsOn: ['protocol.smart-accounts'],
    requires: ['services/svc-protocol/src/chain/bundler-policy.ts', 'docs/adr/2026-08-08-paymaster-and-bundler-policy.md'],
    note:
      'S-A11 2026-08-08: modes user_submits | public_bundler | self_hosted with stated censor/reorder failure mode and ' +
      'fallbackToUserSubmit. Live EntryPoint differential (socket.userop-differential-test) remains residual.',
  }),
  f('socket.price-oracle', 'Price oracle for on-chain marks and liquidations', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    status: 'done',
    owner: 'shehzad002',
    dependsOn: ['protocol.smart-accounts'],
    requires: ['services/svc-protocol/contracts/oracle/FailClosedOracle.sol', 'docs/adr/2026-08-08-price-oracle-fail-closed.md'],
    note:
      'S-A12 2026-08-08: FailClosedOracle — dual reporters, staleness + disagreement refuse, min mark, never AMM. ' +
      'Hermetic + on-chain with lending. TWAP / own-pool oracles residual and must not replace this path.',
  }),
  f('socket.deployment-registry', 'Which contracts are deployed where, and verified against what source', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    status: 'done',
    owner: 'shehzad002',
    dependsOn: ['protocol.smart-accounts'],
    requires: [
      'services/svc-protocol/src/deployments/registry.ts',
      'services/svc-protocol/deployments/dev-anvil.example.json',
      'docs/adr/2026-08-08-deployment-registry.md',
    ],
    note: 'S-A13 2026-08-08: zod schema + example artefact. Real chain rows + explorer verified:true wait on Nitro RPC funding.',
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
