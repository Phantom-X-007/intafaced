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
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['identity.kyc', 'identity.kyc-review'],
    requires: [
      'services/svc-identity/src/kyc/document-store.ts',
      'services/svc-identity/src/kyc/provider-ref-bind.ts',
      'services/svc-identity/drizzle/0010_kyc_document_store.sql',
    ],
    note:
      '**DONE 2026-08-16:** Title is the encrypted KYC document store (§10), not a live vendor. ' +
      'Vault + principal-bound getFor/deleteFor + operator tRPC meta-only + provider_ref bind + foreign-service gate on main (#1348). ' +
      'Production `index.ts` constructs/wires `kycDocs` via `kycRouterBootOptions(sql, env.IDENTITY_KYC_DOC_KEY)` when the key is set (#1806, #2101); unset → procedures named-refuse `kyc_doc.unwired`; invalid key → `kyc_doc.key_missing`. Pin: `kyc/index-boot-wire.test.ts`. ' +
      'Named Class X residual (not this title): live verification vendor webhook — no vendor invented. Services get status flags only; kyc.status never returns provider_ref or document bytes.',
  }),
  f('infra.drop-flags', 'Drop phases 0–V as feature flags — waitlist, referral queue, founding badges, season engine (§11)', {
    module: 'core-ops',
    phase: '1',
    plane: 'F',
    status: 'done',
    owner: 'ZenYoda3',
    requires: ['packages/config/src/flags.ts', 'packages/config/src/flag-enforcement.test.ts'],
    dependsOn: ['infra.config'],
    note:
      '**D26-P1-F1 Done 2026-08-21:** §11 drop switch (`drop-flags-mount-vs-tracker.ts`); assertEnabled + FlagDisabledError. ' +
      'offReadiness makes OFF plan rows read unbuilt not ready; waitlist+referral request-path enforced. ' +
      'Class X residual: wire remaining waitlist/referral callers; founding-badge mint stays launch.nft chain.',
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
    note: 'Shipped on main: convert.quote + convert.execute on mounted /trpc (RFQ + house spread → market IOC, same hold→fill; TRADE_CONVERT_ENABLED defaults on). Money-path suite in trade-service convert describe + convert/quote unit tests. Local svc-trade suite green (102 passed; money-path needs Postgres — skipped when DB down). Actions are unlimited on this public repo (thrift retired 2026-08-07) — do not read billing as a Done blocker. Edge product-check optional remaining.',
  }),
  f('trade.futures', 'Perps: isolated margin, funding, partial-liquidation ladder', {
    module: 'trade',
    phase: '2',
    status: 'ready',
    owner: 'Phantom-X-007',
    dependsOn: ['trade.spot'],
    requires: [
      'services/svc-trade/src/futures/mount-vs-tracker.ts',
      'services/svc-trade/src/futures/mount-vs-tracker.test.ts',
      'services/svc-trade/src/futures/futures-policy.ts',
      'services/svc-trade/src/futures/mark-gap-series-honesty.test.ts',
      'services/svc-trade/src/futures/adl-disclosure.test.ts',
    ],
    note:
      '**D27-P0 UNSTAMP 2026-08-22:** mount-vs-tracker cert ≠ product done — public-door bar not met. ' +
      'Stage-1 refuse-closed on tip (isolated margin ladder + funding + ADL disclosure); gap-series marks proven. ' +
      'TRADE_FUTURES_ENABLED default OFF; jobs default OFF; insurance empty blocks live list. ' +
      'Product still needs: owner D3 ladder numbers; funding rates/ceilings; live re-leverage (501 or named socket).',
  }),
  f('trade.options', 'European options, cash-settled, full collateral in v1', {
    module: 'trade',
    phase: '2',
    status: 'ready',
    owner: 'Phantom-X-007',
    dependsOn: ['trade.futures'],
    requires: ['services/svc-trade/src/spot/options-policy.ts', 'services/svc-trade/src/spot/options-listing.test.ts'],
    note:
      '**D27-P0 UNSTAMP 2026-08-22:** mount-vs-tracker cert ≠ product done. ' +
      'Settlement law refuse on options.policy on tip; SOCKET §13 socket.options-settlement-asset-law — never invent live set / settlement asset / IV. ' +
      'Product still needs: owner P0-05 settlement asset stamp; D7 fixing; complete European terms + engine.',
  }),
  f('trade.otc', 'OTC RFQ desk, staked-tier gate', {
    module: 'trade',
    phase: '2',
    status: 'ready',
    owner: 'Phantom-X-007',
    dependsOn: ['trade.spot', 'token.staking'],
    requires: [
      'services/svc-trade/src/otc/mount-vs-tracker.ts',
      'services/svc-trade/src/otc/mount-vs-tracker.test.ts',
      'services/svc-trade/src/otc/otc-rfq-settle-donebar.test.ts',
      'services/svc-trade/src/otc/otc-mount.reachable.test.ts',
      'services/svc-trade/src/otc/otc-policy.ts',
    ],
    note:
      '**D27-P0 UNSTAMP 2026-08-22:** mount-vs-tracker cert ≠ product done. ' +
      'Stage-1 RFQ→stake→fail-closed quote→ledger settle on tip; accept binds quoted price; caller mid refused; ledger-client only. ' +
      'Product still needs: owner §8 desk-law numbers; socket.otc-maker-routing; connect.venue-vault custody.',
  }),
  f('trade.copy', 'Copy trading, audited leaders, fee-share (not profit-share)', {
    module: 'trade',
    phase: '2',
    plane: 'B',
    status: 'ready',
    owner: 'Phantom-X-007',
    dependsOn: ['trade.spot'],
    requires: [
      'services/svc-trade/src/copy/mount-vs-tracker.ts',
      'services/svc-trade/src/copy/mount-vs-tracker.test.ts',
      'services/svc-trade/src/copy/copy-policy.ts',
      'services/svc-trade/src/copy/copy-auto-mirror-place-done-bar.test.ts',
    ],
    note:
      '**D27-P0 UNSTAMP 2026-08-22:** mount-vs-tracker cert ≠ product done. ' +
      'Stage-1 sovereign desk + follow/kill/unfollow on tip; fee-share not profit-share; blank §8 rates/jurisdiction refuse-closed. ' +
      'Product still needs: owner fee-share/jurisdiction env pins; durable auto-mirror session-key (socket.copy-auto-mirror).',
  }),
  f('trade.forex', 'Fiat pairs on the same engine', {
    module: 'trade',
    phase: '2',
    status: 'ready',
    owner: 'Phantom-X-007',
    dependsOn: ['trade.spot', 'pay.rails'],
    requires: ['services/svc-trade/src/spot/forex-settlement.ts', 'services/svc-trade/src/spot/forex-settlement-public-doors.test.ts'],
    note:
      '**D27-P0 UNSTAMP 2026-08-22:** mount-vs-tracker cert ≠ product done. ' +
      'Refuse-closed settlement posture on tip; forex.settlementStatus + assertProductionListing; six majors listed but unfundable until rails. ' +
      'Product still needs: owner P0-05 settlement asset stamp; fiat settle rails — never invent settlement asset.',
  }),
  f('trade.algo', 'TWAP execution', {
    module: 'trade',
    phase: '2',
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['trade.spot'],
    requires: ['services/svc-trade/src/algo'],
    note:
      '**DONE 2026-08-16:** Title is TWAP only. Create + children when TRADE_ALGO_JOBS_ENABLED + cancel honesty (cancel-fail parks paused / haltReason cancel_incomplete; resume refused; next tick idle) on main. ' +
      '2026-08-16 hydrate-on-mutate proofs: cold pause/resume/cancel + cancel_incomplete resume refuse; getAlgo and mutate share owner hydrate. ' +
      'Jobs gated default OFF (TRADE_ALGO_JOBS_ENABLED denylist). Pin: twap-engine.test.ts cancel_incomplete. ' +
      'D-S-04 #1002 + ADR #1145 + #1193 + hydrate-on-mutate + persist-on-tick + durable place grant (no JWT). ' +
      'VWAP/POV are not this row — see socket.trade-vwap-pov (owner market maturity, not missing candles). TWAP on main + #2213; no new algo code.',
  }),
  f('socket.trade-vwap-pov', 'VWAP / POV execution', {
    module: 'trade',
    phase: '2',
    status: 'socket',
    dependsOn: ['trade.algo'],
    note:
      '§13 — owner market maturity, not missing candles. Agents must not invent VWAP/POV product, fills, volume curves, or participation defaults. ' +
      'TWAP shipped on trade.algo. Empty-tape refuse in src/algo is honesty, not a claim these algos exist as product.',
  }),
  f('trade.ccxt-api', 'CCXT-compatible public API (bots + terminals connect)', {
    module: 'trade',
    phase: '2',
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['trade.spot'],
    requires: [
      'services/svc-trade/src/public-rest.ts',
      'services/svc-trade/src/private-rest.ts',
      'services/svc-trade/src/ccxt-capability-matrix.ts',
    ],
    note:
      '**DONE 2026-08-13 D26-P1-T5:** claim ≡ wire — `ccxt-capability-matrix.test.ts` fails if a REST_ROUTES row is missing or a refuse arm drifts. GET /api/v1/capabilities serves matrix. Residual not blocking: paper-list exclude (N3 Nitro — do not invent), published rate-limit vs edge 300/min (N4), mm seed ops. ' +
      'On OPEN_MONEY allowlist 2026-08-08. Contract-complete — all REST_ROUTES mounted. Bot-ready capability matrix + refuse surface in services/svc-trade/src/ccxt-capability-matrix.ts (D26-P1-T5 / paste-w10 L02 A1): every REST_ROUTES row + open/close extensions; refuse arms setLeverage/setMarginMode 501, funding-rate unsupported 501, caller price on open/close 400 — tests fail if matrix claim ≠ wire. Public: markets (paper + schedule/sessionOpen), orderbook, ticker, tickers, trades (?since=), ohlcv (real fills only), funding-rate (published or NotSupported). Private: orders, account, positions list/open/close. Edge rate limiter ON (N4 residual vs published contract). W13 L10: public GET /api/v1/capabilities serves matrix+refuse arms.',
  }),
  f('trade.mm-bot', 'Internal market-maker seeding books at launch', {
    module: 'trade',
    phase: '2',
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['trade.spot'],
    requires: ['services/svc-trade/src/mm'],
    note:
      '**DONE 2026-08-16 #2207:** Title is true on tip. seedMarket (#325) + job host default OFF (#326, #1962) + marketMakerMakerFill/settleFill house-MM (#328) + cancel/reseed (#340) + mid port (#356) + seed-honesty (#1710) + fill-account recovery on live orderFilled → settleFillEvent (#1852). ' +
      'TRADE_MM_SEED_ENABLED kills jobs and the seeded placeOrder path. Production mid ops (TRADE_MM_SEED_MID_FROM_VENUE / venue map) is an operator enable, not missing seed machinery — never invents mids or manufactured crosses. ' +
      'Pin: fill-account.test.ts fails if recoverMatchingAccountId leaves settleFillEvent. Did not mark trade.algo or venue.aggregation done.',
  }),
  f('venue.aggregation', 'External venue adapters via CCXT (cross-venue)', {
    module: 'trade',
    phase: '2',
    status: 'ready',
    owner: 'Phantom-X-007',
    dependsOn: ['trade.spot'],
    requires: [
      'packages/venue-adapter/src/fabric/venues/factory.ts',
      'packages/venue-adapter/src/fabric/venues/factory.test.ts',
      'packages/venue-contracts/src/latency.ts',
    ],
    note:
      '**D27-P0 UNSTAMP 2026-08-22:** mount-vs-tracker cert ≠ product done — quote-only MD fabric is not the trading half. ' +
      'Public market-data fabric on tip (binance/bybit/okx); no ccxt in money path; never invent mid. ' +
      'Product still needs: trading half (OMS wire); no live-network CI; futures M3 human risk truth.',
  }),
  f('connect.venue-vault', 'Venue Vault — per-user external API keys, HSM-backed, withdrawal refused (§27)', {
    phase: '5',
    status: 'done',
    owner: 'shehzad002',
    dependsOn: ['venue.aggregation'],
    requires: ['services/svc-protocol/src/venue-vault/vault.ts'],
    note:
      'CLOSED engineering bar 2026-08-18 (S-L6): VenueVault refuses withdrawal/internal-transfer permissions at ' +
      'register (not at unwrap). Ciphertext AES-256-GCM; never written to protocol.* postgres (read model forbids key material). ' +
      'Residuals: HSM-backed KEK (PROTOCOL_VENUE_VAULT_WRAP empty = fail-closed, Nitro/Class X), durable sealed store, ' +
      'svc-trade/OMS wiring. Unaudited.',
  }),
  f('connect.latency-grading', 'Latency grading — every adapter scored live, feeding routing weights (§27)', {
    module: 'trade',
    phase: '2',
    plane: 'B',
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['venue.aggregation'],
    requires: [
      'packages/venue-adapter/src/latency-mount-vs-tracker.ts',
      'packages/venue-adapter/src/latency-mount-vs-tracker.test.ts',
      'packages/venue-adapter/src/fabric/latency.ts',
      'packages/venue-adapter/src/fabric/latency-policy.ts',
      'packages/venue-adapter/src/sor-cost-refuse-pin.test.ts',
      'packages/venue-contracts/src/latency.ts',
    ],
    note:
      '**D26-P1-X1 Done 2026-08-21:** REST round-trip measurement-not-estimate (`latency-mount-vs-tracker.ts`); ungraded → null + routing weight 0. ' +
      '`execution.sor` `scoreSorCost` consumes `latencyGrade` (unscored → weight 0). Never invent default grade or letter→bps. ' +
      'Class X residual: owner DEFAULT_THRESHOLDS; WS stream lag not graded; UNMEASURED_LATENCY_MS sentinel.',
  }),
  f('connect.data-lake', 'Unified data lake — normalised ticks, books and fills to a time-series store (§27)', {
    module: 'trade',
    phase: '2',
    plane: 'B',
    status: 'wip',
    owner: 'Phantom-X-007',
    dependsOn: ['venue.aggregation'],
    requires: [
      'packages/connect-data-lake/src/mount-vs-tracker.ts',
      'packages/connect-data-lake/src/mount-vs-tracker.test.ts',
      'packages/connect-data-lake/src/data-lake-stage1.ts',
      'packages/connect-data-lake/src/capture-policy.ts',
      'packages/connect-data-lake/src/capture-lake-consumer.ts',
      'packages/connect-data-lake/src/persistence-sink.ts',
      'packages/venue-adapter/src/fabric/capture-lake.ts',
    ],
    note:
      'WIP Stage-1 D26-P2-DL2: mount-vs-tracker deepened — fabric consumer + persistence sink refuse (no TSDB write). ' +
      'Unconnected venue = absent hole. Class X residual: TSDB/compose; tick/fill normalisation; retention owner.',
  }),
  f('execution.sor', 'svc-execution — cross-venue Smart Order Router, OMS/EMS, execution reports (§28)', {
    module: 'trade',
    phase: '2',
    plane: 'B',
    status: 'wip',
    owner: 'Phantom-X-007',
    dependsOn: ['venue.aggregation', 'connect.latency-grading'],
    requires: [
      'packages/venue-adapter/src/sor-policy.ts',
      'packages/venue-adapter/src/cost-model.ts',
      'packages/venue-adapter/src/execution-report.ts',
      'services/svc-execution/src/venue-market-adapters.ts',
      'services/svc-execution/src/oms-ems-store.ts',
    ],
    note:
      '**D27-P4 WIP 2026-08-22:** OMS boot wires public MD observation + trade/account maps; in-memory EMS ack journal on execute. ' +
      'SOR cost model + plan/execute/cancel/fetch doors on svc-execution tip. ' +
      'Product still needs: durable EMS store; letter→bps owner schedule; live venue creds operator wiring.',
  }),
  f('execution.arbitrage', 'Arbitrage engine — cross-exchange, triangular, basis, funding, DEX to CEX (§28)', {
    module: 'trade',
    phase: '2',
    plane: 'B',
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['execution.sor'],
    requires: [
      'packages/execution-arb/src/arbitrage.ts',
      'packages/execution-arb/src/arbitrage.test.ts',
      'packages/execution-arb/src/mount-vs-tracker.ts',
      'packages/execution-arb/src/mount-vs-tracker.test.ts',
      'packages/execution-arb/src/arb-policy.ts',
    ],
    note:
      '**D26-P1-X4 Done 2026-08-21:** external-only cross-exchange scanner on SOR cost model (`mount-vs-tracker.ts`, `@intafaced/execution-arb`). ' +
      'Refuses internal legs, bridge fantasy, missing inventory, no-edge after costs — never invents spreads/fees. ' +
      'Class X residual: triangular/basis/funding classes, OMS atomic legs, svc consumer mount, owner capital magnitudes.',
  }),
  f('execution.market-making', 'Market-making engine — internal MM and external-venue MM, one engine (§28)', {
    module: 'trade',
    phase: '2',
    plane: 'B',
    status: 'ready',
    owner: 'Phantom-X-007',
    dependsOn: ['execution.sor', 'trade.mm-bot'],
    requires: [
      'packages/execution-mm/src/mount-vs-tracker.ts',
      'packages/execution-mm/src/mount-vs-tracker.test.ts',
      'packages/execution-mm/src/market-making.ts',
      'packages/execution-mm/src/mm-policy.ts',
    ],
    note:
      '**D27-P0 UNSTAMP 2026-08-22:** mount-vs-tracker cert ≠ product done. ' +
      'Stage-1 external-only MM half on SOR cost model on tip; refuses internal venue MM; kill switches + hedge plan. ' +
      'Product still needs: internal MM + house-on-own-venue (owner unfreeze or never); OMS wire; owner spread/skew bands.',
  }),
  f('execution.house-tenant', 'House desk sealed private tenant — the Throne Law (§28)', {
    module: 'trade',
    phase: '2',
    plane: 'F',
    status: 'ready',
    owner: 'Nitro',
    dependsOn: ['execution.sor'],
    requires: ['packages/execution-house-tenant/src/house-tenant-policy.ts', 'services/svc-execution/src/execution-policy-route.test.ts'],
    note:
      '**D27-P0 UNSTAMP 2026-08-22:** mount-vs-tracker cert ≠ product done. ' +
      'Stage-1 external-only tenant on tip; kill-first adminKill; internal_venue + matching-book refuse. ' +
      'Product still needs: internal-venue half (owner ruling unfreeze or never); existence disclosure deferred.',
  }),
  f('web.terminal', 'Pro terminal — depth, charts, hotkeys, sub-accounts', {
    module: 'trade',
    phase: '2',
    status: 'ready',
    owner: 'Phantom-X-007',
    dependsOn: ['trade.spot', 'infra.ui-tokens', 'ws.depth'],
    requires: [
      'vendor/upstream-exchange/05_Web_Front/src/terminal-mount-vs-tracker.ts',
      'vendor/upstream-exchange/05_Web_Front/src/terminal-mount-vs-tracker.test.ts',
      'vendor/upstream-exchange/05_Web_Front/src/pages/exchange/Exchange.vue',
      'vendor/upstream-exchange/05_Web_Front/src/assets/js/ix-depth-feed.js',
    ],
    note:
      '**D27-P0 UNSTAMP 2026-08-22:** mount-vs-tracker cert ≠ product done — mount cert is not the public-door product bar. ' +
      'Vendored Vue desk + live ix-depth-feed wired on tip; feedLive only after snapshot; ix-wire refuses float decimals. ' +
      'Product still needs: brand drain / depth number refuse / snapshot provenance (Nitro craft L11 W5).',
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
    note: 'D26-P4-06 (2026-08-15) product SLO for the shell: empty book stays empty — `docs/ops/DEPTH-TAPE-PRODUCT-SLO.md`. No fake depth, no invent mid, no seed fills as live tape; no measured latency SLO (honesty, not a p99). Status stays `done` (backend doors); Vue craft remains HUMAN. CORRECTED 2026-08-15 D26-P4-09: `apps/web` is deleted (ADR retire-apps-web). services/svc-ws polls svc-matching’s public depth endpoint, diffs it with `@intafaced/market-data`’s `diffDepth`, and fans snapshot+delta out over a websocket; the vendored shell (`vendor/upstream-exchange/05_Web_Front/src/assets/js/ix-depth-feed.js`) applies them with `applyDelta` and resnapshots on a gap. Reachable (mounted routes + a real socket, wired into the terminal), tested (47 service tests, incl. a 200-tick stream rebuilt client-side through `applyDelta`, both backpressure stages, and an end-to-end socket suite), and unpropped (no stub upstream — it reads the real engine). Split out of `ws.gateway`: that entry names four streams and this is one of them.',
  }),
  f('ws.gateway', 'WebSocket fan-out: depth, trades, orders, positions', {
    module: 'trade',
    phase: '2',
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['matching.engine', 'ws.depth'],
    requires: [
      'services/svc-ws/src/gateway-mount-vs-tracker.ts',
      'services/svc-ws/src/gateway-mount-vs-tracker.test.ts',
      'services/svc-ws/src/gateway-policy.ts',
      'services/svc-ws/src/empty-book-honesty.test.ts',
      'packages/market-data',
    ],
    note:
      '**D26-P4-06 Done 2026-08-21:** depth/trade/private fan-out (`gateway-mount-vs-tracker.ts`); empty book stays empty. ' +
      'Matching-down → depth.engine_unavailable; never invent quiet market or positions blotter. ' +
      'Class X residual: private stream ops polish; no public positions tape.',
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
    owner: 'Phantom-X-007',
    dependsOn: ['ledger.double-entry'],
    requires: [
      'services/svc-pay/src/gateway-mount-vs-tracker.ts',
      'services/svc-pay/src/gateway-mount-vs-tracker.test.ts',
      'services/svc-pay/src/checkout-page.ts',
      'services/svc-pay/src/router.mount.test.ts',
    ],
    note:
      '**D27-P0 UNSTAMP 2026-08-22:** mount-vs-tracker cert ≠ product done. ' +
      'Stage-1 hosted checkout + merchant + payment lifecycle on tip; hosted page script-free; A2 grant refuse-closed. ' +
      'Product still needs: card acquiring (socket.psp-partners); KYB must gate money (kybStatus echo-only today).',
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
      'services/svc-pay/src/router.payfac-area.test.ts',
    ],
    note:
      '**D26-P1-P2 Done 2026-08-21:** sub-merchant trees + eleven permission areas (`payfac-mount-vs-tracker.ts`). ' +
      'REST + tRPC money doors read `PAYFAC_SURFACE_AREAS`; never invent fourteenth area or underwriting. ' +
      'Class X residual: socket.payfac-settling-party-partner + socket.payfac-split-fee-recipes.',
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
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['pay.rails'],
    requires: [
      'services/svc-pay/src/routing/mount-vs-tracker.ts',
      'services/svc-pay/src/routing/mount-vs-tracker.test.ts',
      'services/svc-pay/src/routing/decide.ts',
      'services/svc-pay/src/routing-policy.ts',
      'services/svc-pay/src/routing-no-invent.test.ts',
    ],
    note:
      '**D26-P1-P3 Done 2026-08-21:** geo/method/risk smart rail selection (`mount-vs-tracker.ts`); hosted checkout + routing doors. ' +
      'Blank dims → pay.routing_input_missing; never invent approval rates, cost weights, or payer-named rails. ' +
      'Class X residual: live acquiring / PSP connectors; operator success-fraction profiles not silent defaults.',
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
      'Parked sockets (not this mountain): live card charge-against-mandate (`socket.psp-partners`). ' +
      'Pre-charge **attempt** is recorded on `subscription_executions.notify_status` (wired port → attempted; ' +
      'unwired → skipped_unwired / `pay.subscription_notify_unwired`). `notified` stays false. Inbox delivery ' +
      'still `socket.pay-precharge-notify`.',
  }),
  f('pay.plugins', 'Woo / Magento / OpenCart plugins', {
    module: 'pay',
    phase: '3',
    status: 'done',
    owner: 'nitro-agents',
    dependsOn: ['pay.gateway'],
    requires: [
      'services/svc-pay/src/plugins/mount-vs-tracker.ts',
      'services/svc-pay/src/plugins/mount-vs-tracker.test.ts',
      'services/svc-pay/src/plugins/plugins-policy.ts',
      'services/svc-pay/src/plugins/plugins-done-bar.test.ts',
      'plugins/woocommerce-intafaced-pay/intafaced-pay.php',
    ],
    note:
      '**D26-P1-P8 Done 2026-08-21:** WooCommerce adapter + TS reference path (`mount-vs-tracker.ts`). ' +
      'Decimal-string amounts, Idempotency-Key, frozen HMAC webhook vectors. ' +
      'Class X residual: Magento/OpenCart §13 pay.plugin_cms_unwired — not three PHP trees.',
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
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['p2p.escrow'],
    requires: ['services/svc-p2p/src/router.ts', 'services/svc-p2p/src/state.ts', 'services/svc-p2p/src/moderation-auth.ts'],
    note:
      '**DONE 2026-08-13:** mechanism on tip — open/list/backlog/resolve, `opened_via`, `resolutionNotes`, empty ' +
      '`P2P_MODERATOR_USER_IDS` → `p2p.moderation_unreachable`, API keys cannot rule, SQL invariant 0003 (no auto-ruling). ' +
      'Money only existing escrow release/refund recipes. Pin: `disputes-tracker-pin.test.ts`. Residual not blocking: ' +
      'apps/admin Vue (`nitro-frontend-all`); `p2p:moderate` scope mint (DIRECTION §3); who-moderates Class X env ' +
      'allowlist (do not invent ids); chat_thread_id; events outbox.',
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
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['p2p.escrow'],
    requires: [
      'services/svc-p2p/src/instrument-service.ts',
      'services/svc-p2p/src/instrument-service.test.ts',
      'services/svc-p2p/src/router.mount.test.ts',
    ],
    note:
      '**D26-P1-P4 Done 2026-08-21:** method schemas + instrument lifecycle (`instruments-mount-vs-tracker.ts`). ' +
      'Escrow-bound reveal + immutable snapshot; access log same SQL as read. Registry ships empty until operator registers. ' +
      'Class X residual: jurisdictional method content; encryption at rest (KMS socket).',
  }),
  f('p2p.merchants', 'P2P merchant programme — badges, limits, API', {
    module: 'p2p',
    phase: '3',
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['p2p.reputation'],
    requires: ['services/svc-p2p'],
    note:
      '**DONE 2026-08-16:** Denon accepts unset `P2P_OFFER_MAX_STANDARD`/`P2P_OFFER_MAX_MERCHANT` as unlimited (documented product, not a missing feature). ' +
      'Stage 1 membership (apply/decide/withdraw) + Stage 2 ceiling mechanism + honest API (`merchants.offerLimits` / `merchants.myOfferCeiling` / health `offerLimitsConfigured`) on tip. ' +
      'reputation.get exposes `merchant: boolean|null`. Stage 3 second key plane stays CUT — identity.apikeys + edge throttle + `merchants.apiAccess`; no invented ceiling magnitudes. ' +
      'Pin: `merchants-tracker-pin.test.ts`. Residual not blocking: optional numeric ceilings (owner env), eligibility defaults (spec §5), apps/admin Vue.',
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
    status: 'done',
    owner: 'shehzad002',
    dependsOn: ['identity.accounts'],
    requires: ['services/svc-protocol/src/router.mount.test.ts', 'services/svc-protocol/src/chain/bundler-policy.test.ts'],
    note:
      '**D26-P1-S1 Done 2026-08-21:** passkey smart accounts + session keys mounted (`smart-accounts-mount-vs-tracker.ts`). ' +
      'Factory predict/build, session grant/revoke, relay userOp with typed chain refusals. ' +
      'Class X residual: paymaster funding float; public deployment registry Nitro RPC.',
  }),
  f('protocol.amm', 'AMM pools from audited templates', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    status: 'done',
    owner: 'shehzad002',
    dependsOn: ['protocol.smart-accounts'],
    requires: [
      'services/svc-protocol/src/amm/mount-vs-tracker.ts',
      'services/svc-protocol/src/amm/mount-vs-tracker.test.ts',
      'services/svc-protocol/src/amm/mint-swap-onchain.test.ts',
      'services/svc-protocol/contracts/amm',
    ],
    note:
      '**D26-P1-A2 Done 2026-08-21:** constant-product pools mounted (`mount-vs-tracker.ts`); mint/swap on-chain proven. ' +
      'quoteExactIn + quoteFromPool + buildCreatePool + buildSwapExactIn on router. ' +
      'Class X residual: external contract audit; live chain RPC Nitro.',
  }),
  f('protocol.lending', 'On-chain lending markets, keeper liquidations', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    status: 'done',
    owner: 'shehzad002',
    dependsOn: ['protocol.amm', 'socket.price-oracle'],
    requires: ['services/svc-protocol/contracts/lending/IsolatedLendingMarket.sol'],
    note:
      'CLOSED engineering bar 2026-08-08 (S-A4): IsolatedLendingMarket + FailClosedOracle marks, immutable kink rates ' +
      '(no invent / no AMM), cascade suite + flash/reentrancy adversarial pack ' +
      '(lending-cascade-flash.onchain.test.ts, lending-honesty.test.ts). ' +
      'RESIDUAL named Nitro RPC gate: persistent public testnet (Base Sepolia → Base P0) with verified source — ' +
      'dev-anvil is not that row. Unaudited: no real deposits until socket.contract-audit.',
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
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['protocol.smart-accounts'],
    requires: ['services/svc-indexer/src/router.mount.test.ts', 'services/svc-indexer/src/d26-p1-i3-done-bar.test.ts'],
    note:
      '**D26-P1-I3 Done 2026-08-21:** chain→Postgres read models mounted (`readmodels-mount-vs-tracker.ts`). ' +
      'Reorg unwind + idempotent projection; permissionless /trpc read API. ' +
      'Class X residual: socket.clob-contracts; INDEXER_VENUE_ADDRESS unset default.',
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
    status: 'done',
    owner: 'shehzad002',
    dependsOn: ['blueprint.onboarding', 'protocol.smart-accounts'],
    requires: ['services/svc-protocol/contracts/attestations/RankAttestation.sol', 'services/svc-protocol/src/attestations/commitment.ts'],
    note:
      'CLOSED engineering bar 2026-08-18 (S-F1 Protocol Plane): RankAttestation.sol — subject is bytes32 commitment ' +
      '(not address/name/email/user id/KYC); permissionless attest/revoke by msg.sender; no platform issuer; ' +
      'consumers choose trusted issuers off-chain. Joining to a Fiat Plane person is forbidden. Unaudited. ' +
      'SPLIT: this done bar is the on-chain half in svc-protocol. Fiat/blueprint zero-PII card refuse + product-Done ' +
      'helper (P0-12 unsealed) is a different service — Denon D26-P1-I4 / svc-blueprint — not this PR.',
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
      'no invent FX. On-chain JIT / CardPull shipped 2026-08-19 (S-E1): pullExact transferFrom owner SA to ' +
      'user-chosen settlement; kill strands zero (tokens stay in the SA). Live issuer rail remains socket.live-issuer.',
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
    note:
      'Reference mount — the /trpc + createEdgeContext recipe every other service copies. ' +
      '**D26-P1-A6 sealed:** metering-off audit-only forever (`metering/product-law.ts` + seal suite); no silent feeCharge when AGENTS_METERING_ENABLED=false.',
  }),
  f('agents.navigator', 'Navigator — tool-calling inside user guardrails', {
    module: 'agents',
    phase: '5',
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['agents.gateway'],
    // Path-narrowed 2026-08-15: was whole svc-agents; fence matches navigator dir like bank.auto-invest.
    requires: [
      'services/svc-agents/src/navigator/mount-vs-tracker.ts',
      'services/svc-agents/src/navigator/mount-vs-tracker.test.ts',
      'services/svc-agents/src/navigator/trade-data-http-port.ts',
      'services/svc-agents/src/navigator/identity-session-http-port.ts',
    ],
    note:
      '**D26-P1-A1 Done 2026-08-21:** tool-calling inside guardrails; dark refuse bills zero (`mount-vs-tracker.ts`). ' +
      'HTTP ports wired when TRADE_URL/IDENTITY_URL set; upstream may still refuse — never invent. ' +
      'Class X residual: owner-published fleet URLs + live allowlist in prod env. Shell consumer residual. ' +
      'Fence: requires narrowed to src/navigator so path-disjoint agents.coach residual is not HUMAN-CLAIMED.',
  }),
  f('agents.support', 'Support agent — KB + account-state grounded', {
    module: 'agents',
    phase: '5',
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['agents.gateway', 'ops.support'],
    requires: [
      'services/svc-agents/src/support-agent/mount-vs-tracker.ts',
      'services/svc-agents/src/support-agent/mount-vs-tracker.test.ts',
      'services/svc-agents/src/support-agent/d26-p1-a2-done-bar.test.ts',
      'services/svc-agents/src/support-agent/desk-port.ts',
    ],
    note:
      '**D26-P1-A2 Done 2026-08-21:** KB + account-state grounded; AbortSignal stoppable; no invent balance (`mount-vs-tracker.ts`, #1735). ' +
      'Assist surface only — desk mountain is `ops.support` (D26-P1-O3 split). HTTP desk port when SUPPORT_URL set. ' +
      'Class X residual: live prod desk KB+credentials env. Shell consumer residual.',
  }),
  f('agents.scanner', 'Market Scanner — ranked signals by tier', {
    module: 'agents',
    phase: '5',
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['agents.gateway', 'trade.spot'],
    requires: [
      'services/svc-agents/src/scanner/mount-vs-tracker.ts',
      'services/svc-agents/src/scanner/mount-vs-tracker.test.ts',
      'services/svc-agents/src/scanner/spot-tickers-port.ts',
      'services/svc-agents/src/scanner/trade-tickers-http-port.ts',
    ],
    note:
      '**D26-P1-A3 Done 2026-08-21:** P0-11 production allow-list empty → refuse all ranks (`adr/2026-08-12-scanner-signal-inputs-law.md`, Accepted 2026-08-15); fixture recipe test-only. ' +
      'SpotTickersPort + TRADE_URL HTTP door (#2574/#2577); live session refuses `no_live_tickers` when unset/empty — never invent quotes. ' +
      'Class X residual: owner-published allow-list kinds/recipe + prod TRADE_URL pin. Shell / tier matrix residual.',
  }),
  f('agents.merchant', 'Merchant agent — approval-rate watch', {
    module: 'agents',
    phase: '5',
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['agents.gateway', 'pay.routing'],
    requires: [
      'services/svc-agents/src/merchant/mount-vs-tracker.ts',
      'services/svc-agents/src/merchant/mount-vs-tracker.test.ts',
      'services/svc-agents/src/merchant/pay-metrics-port.ts',
      'services/svc-agents/src/merchant/pay-metrics-http-port.ts',
    ],
    note:
      '**D26-P1-A4 Done 2026-08-21:** missing/dark/stale pay metrics named refuse; never invent numeric rate (`mount-vs-tracker.ts`). ' +
      'PayMetricsPort + PAY_URL HTTP door; svc-pay merchant_watch_metrics store/project/refresh (#2607/#2614). ' +
      'Class X residual: owner PAY_URL + metrics allowlist in prod. pay.routing product law remains Shehzad M1 — agents babysit only.',
  }),
  f('agents.copy-intel', 'Copy-Intel — writes audited leader stats', {
    module: 'agents',
    phase: '5',
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['agents.gateway', 'trade.copy'],
    requires: [
      'services/svc-agents/src/copy-intel/mount-vs-tracker.ts',
      'services/svc-agents/src/copy-intel/mount-vs-tracker.test.ts',
      'services/svc-agents/src/copy-intel/copy-leader-fixtures-http-port.ts',
      'services/svc-agents/src/copy-intel/returns-board-refuse.ts',
    ],
    note:
      '**D26-P1-A5 Done 2026-08-21:** audited leader stats + directory presentation; returns-ranked boards refused (`mount-vs-tracker.ts`, #1708). ' +
      'CopyLeaderFixturesPort + TRADE_URL HTTP door; live session refuses `no_live_leaders` when plane sealed. ' +
      'Class X residual: owner `LIVE_TRADE_COPY_LEADER_PLANE_OPEN` + allowlist + live audited store. Shell consumer residual.',
  }),
  f('academy.lobbies', 'Live lobbies, LiveKit SFU, capacity tiers', {
    module: 'academy',
    phase: '5',
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['identity.rank'],
    requires: [
      'services/svc-academy/src/lobbies/mount-vs-tracker.ts',
      'services/svc-academy/src/lobbies/mount-vs-tracker.test.ts',
      'services/svc-academy/src/access/room-access.ts',
      'services/svc-academy/src/stream/provider.ts',
    ],
    note:
      'DONE: decideSeat capacity tiers (free/staked/invite); host bypass; NullStreamProvider refuses SFU creds. ' +
      'D26-P1-LB1 mount-vs-tracker seals lobby doors. Class X residual: LiveKit SFU socket; navigable spatial shell.',
  }),
  f('academy.spatial', '2D navigable room canvas, VR-ready scene state', {
    module: 'academy',
    phase: '5',
    owner: 'Phantom-X-007',
    dependsOn: ['academy.lobbies'],
    requires: [
      'services/svc-academy/src/spatial/mount-vs-tracker.ts',
      'services/svc-academy/src/spatial/mount-vs-tracker.test.ts',
      'services/svc-academy/src/spatial/scene.ts',
      'services/svc-academy/src/spatial/edit-policy.ts',
    ],
    note:
      'Stage-1 D26-P1-SP1M: Scene v1 schema + size gate + host write policy mount-vs-tracker. ' +
      'NOT done — navigable shell product residual (sceneIsNavigableProductShell stays false). Class X: canvas UI craft.',
  }),
  f('academy.curriculum', 'DERIV//DESK library import — 20 playbooks + 3 workbooks', {
    module: 'academy',
    phase: '5',
    dependsOn: ['academy.lobbies'],
    status: 'done',
    owner: 'Phantom-X-007',
    requires: [
      'services/svc-academy/src/curriculum/mount-vs-tracker.ts',
      'services/svc-academy/src/curriculum/mount-vs-tracker.test.ts',
      'services/svc-academy/src/curriculum/import-pipeline.ts',
      'services/svc-academy/src/curriculum/import-pipeline.test.ts',
    ],
    note:
      '**D26-P1-C5 Done-bar sealed 2026-08-12 (#1738):** import substance bar (not char-count theater); ' +
      'D26-P1-C5M mount-vs-tracker seals `substanceBarMet` on spine (20 playbooks + 3 workbooks platform-native). ' +
      'Licensed DERIV//DESK dump assets Class X residual.',
  }),
  f('academy.certs', 'Certifications → XP → real perks', {
    module: 'academy',
    phase: '5',
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['academy.curriculum', 'identity.rank'],
    requires: [
      'services/svc-academy/src/certs/mount-vs-tracker.ts',
      'services/svc-academy/src/certs/mount-vs-tracker.test.ts',
      'services/svc-academy/src/certs/perk-plane.ts',
      'services/svc-academy/src/certs/grant-ledger.test.ts',
    ],
    note:
      '**D26-P1-C1 Done 2026-08-21:** cert→XP→identity perks or refuse invent (`mount-vs-tracker.ts`). ' +
      'grantCert + certPerkPlane + certPerkIntent refuse-closed. ' +
      'Class X residual: multi-svc perk product law; full title real perks.',
  }),
  f('academy.ambassadors', 'Residencies, IFC pay, revenue share', {
    module: 'academy',
    phase: '5',
    dependsOn: ['academy.lobbies', 'token.staking'],
    status: 'done',
    owner: 'Phantom-X-007',
    requires: [
      'services/svc-academy/src/ambassadors/mount-vs-tracker.ts',
      'services/svc-academy/src/ambassadors/mount-vs-tracker.test.ts',
      'services/svc-academy/src/ambassadors/ifc-pay-rate-law.ts',
      'services/svc-academy/src/ambassadors/ifc-pay.ts',
    ],
    note:
      '**D26-P1-C2 Done-bar sealed 2026-08-12 (#1725):** IFC pay under owner rate law — refuse invent rates. ' +
      'D26-P1-C2M mount-vs-tracker seals public quote + residency gate paths. Class X: ledger settlement recipe.',
  }),
  f('academy.tournaments', 'Seasonal ladders, IFC prize pools', {
    module: 'academy',
    phase: '5',
    dependsOn: ['academy.lobbies', 'trade.spot'],
    owner: 'Phantom-X-007',
    status: 'done',
    requires: [
      'services/svc-academy/src/tournaments/mount-vs-tracker.ts',
      'services/svc-academy/src/tournaments/mount-vs-tracker.test.ts',
      'services/svc-academy/src/tournaments/tournament-policy.ts',
      'services/svc-academy/src/tournaments/prize-refuse.test.ts',
      'services/svc-academy/src/tournaments/season-lifecycle.test.ts',
    ],
    note:
      '**D26-P1-C3 Done 2026-08-21:** Stage-1 ladder + season lifecycle (`mount-vs-tracker.ts`); prize pools refuse `academy.prize_pool_unset`. ' +
      'Never invent IFC credits or prize balances; calendar never implies payout. ' +
      'Class M residual: owner fund/payout ledger recipes until signed amounts.',
  }),
  f('academy.paper-trading', 'Paper-trading market flag for workbooks', {
    module: 'academy',
    phase: '5',
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['trade.spot'],
    requires: [
      'services/svc-academy/src/paper/mount-vs-tracker.ts',
      'services/svc-academy/src/paper/mount-vs-tracker.test.ts',
      'services/svc-academy/src/paper/workbook-loop.ts',
      'services/svc-academy/src/paper/ops-gate.ts',
      'services/svc-trade/drizzle/0006_paper_markets.sql',
    ],
    note:
      'DONE 2026-08-15: paper market flag + zero-ledger isolation + workbook drill loop. ' +
      'D26-P1-PT1M mount-vs-tracker seals ops gate + real-money-ban paths. Class X: workbook UI craft.',
  }),
  f('launch.token-factory', 'ERC-20 deploy from audited templates', {
    owner: 'shehzad002',
    module: 'launch',
    phase: '5',
    plane: 'B',
    status: 'done',
    dependsOn: [],
    requires: [
      'services/svc-protocol/src/launch/mount-vs-tracker.ts',
      'services/svc-protocol/src/launch/mount-vs-tracker.test.ts',
      'services/svc-protocol/src/launch/token-factory-onchain.test.ts',
      'services/svc-protocol/contracts/launch',
    ],
    note:
      '**D26-P1-L1 Done 2026-08-21:** token factory mounted (`mount-vs-tracker.ts`); CREATE2 launch proven on chain. ' +
      'status + predictTokenAddress + buildTokenDeployment + tokenInfo; unsigned calldata only. ' +
      'Class X residual: template not audited; live factory Nitro RPC.',
  }),
  f('launch.meme-factory', 'One-click meme launch + instant market + LP', {
    owner: 'shehzad002',
    status: 'done',
    note:
      'S-G1 2026-08-18: MemeLaunch composes TokenFactory + PoolFactory + LaunchLpLock — permissionless one-click ' +
      '(create token if needed, createPool if missing, mint LP, park LP at a new LaunchLpLock for msg.sender). ' +
      'No fee, no owner, no platform address; contract keeps nothing. Unaudited. No instant bonding curve other ' +
      'than the existing constant-product AMM.',
    module: 'launch',
    phase: '5',
    plane: 'P',
    dependsOn: ['launch.token-factory', 'protocol.amm'],
    requires: ['services/svc-protocol/contracts/launch/MemeLaunch.sol'],
  }),
  f('launch.launchpad', 'Presale / fair launch, vesting, staked allocation tiers', {
    owner: 'shehzad002',
    module: 'launch',
    phase: '5',
    plane: 'P',
    status: 'done',
    dependsOn: ['launch.token-factory', 'token.staking'],
    requires: ['services/svc-protocol/contracts/launch/FairLaunch.sol', 'services/svc-protocol/src/launch/fair-launch.onchain.test.ts'],
    note: 'CLOSED 2026-08-18 (S-G2): FairLaunch.sol — creator-set sale/quote, raise cap, window, per-wallet cap, minRaise, cliff+linear vest in-contract (no revoke, no admin unlock, no pause, no whitelist, no platform fee). contribute → finalize → claim; unmet minRaise refunds quote. On-chain: fair-launch.onchain.test.ts. Residual: staked allocation tiers not in this PR (needs stakeOf). Unaudited.',
  }),
  f('launch.nft', 'NFT mint / list / auction, on-chain royalties', {
    owner: 'shehzad002',
    status: 'done',
    module: 'launch',
    phase: '5',
    plane: 'P',
    dependsOn: ['launch.token-factory'],
    requires: ['services/svc-protocol/contracts/nft/SovereignNft.sol', 'services/svc-protocol/contracts/nft/RoyaltyMarket.sol'],
    note:
      'CLOSED engineering bar 2026-08-18 (S-G3): SovereignNft (minimal ERC-721 + ERC-2981, royalty cap 1000 bps) and ' +
      'RoyaltyMarket — list escrows NFT, buy pays quote ERC-20 with on-chain royalty split (not signalling-only); ' +
      'English auction endAuction pays highest bid the same way. No platform fee, no owner. On-chain: ' +
      'nft-royalty.onchain.test.ts. Unaudited. Residual: svc-launch product shell, indexer NFT events, Dutch/reserve auctions.',
  }),
  f('launch.rwa', 'RWA issuance registry, licence-gated', {
    owner: 'shehzad002',
    module: 'launch',
    phase: '5',
    plane: 'P',
    status: 'ready',
    dependsOn: ['launch.token-factory'],
    requires: ['services/svc-protocol/contracts/rwa/RwaRegistry.sol'],
    note:
      'S-G4 contract half 2026-08-19: RwaRegistry — licenceHash immutable, register/unlist revert LicenceUnset ' +
      'while hash is bytes32(0). Issuer is msg.sender; platform cannot unlist. STATUS ready (not done): licence ' +
      '*content* is Class X (Nitro human / counsel) — no contract makes that go away. Unaudited.',
  }),
  f('launch.trust-layer', 'Launch trust — enforced LP locks, vesting proofs, deployer reputation (§35)', {
    module: 'launch',
    phase: '5',
    plane: 'P',
    status: 'done',
    owner: 'shehzad002',
    dependsOn: ['launch.token-factory'],
    requires: [
      'services/svc-protocol/contracts/trust/LaunchLpLock.sol',
      'services/svc-protocol/contracts/trust/LaunchVesting.sol',
      'services/svc-protocol/contracts/trust/DeployerReputation.sol',
    ],
    note:
      'S-L4 2026-08-18: LaunchLpLock (immutable unlockTime, no admin exit) + LaunchVesting (cliff/linear, no revoke) + ' +
      'DeployerReputation (raw lock/vest counts only — empty history is zeros, no isSafe/score). ' +
      'A listing badge is still a UI concern; this contract will not issue one that would be false.',
  }),
  f('launch.treasury-yield', 'Tokenized T-bill vaults — stable balances opt into RWA yield (§36)', {
    module: 'launch',
    phase: '5',
    plane: 'P',
    status: 'ready',
    owner: 'shehzad002',
    dependsOn: ['launch.token-factory'],
    requires: ['services/svc-protocol/contracts/vaults/TreasuryYieldVault.sol'],
    note:
      'S-L5 contract half 2026-08-18: TreasuryYieldVault — owner is constructor msg.sender, licenceHash immutable, ' +
      'deposit/withdraw revert LicenceUnset while hash is bytes32(0). STATUS ready (not done): licence *content* is Class X ' +
      '(Nitro human / counsel) — no contract makes that go away. Unaudited.',
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
      'D26-P0-02 OWNER NUMBER 2026-08-13: MARKET_HOUSE_COMMISSION_BPS=0 in `.env.example` (explicit free-cut); ' +
      'compose pass-through `${MARKET_HOUSE_COMMISSION_BPS:-}` (no `:-0` seed); schema still has no in-code default. ' +
      'D26-P0-10 SEALED 2026-08-13 (adr/2026-08-13-house-commission-authority.md): authority = host ' +
      'MARKET_HOUSE_COMMISSION_BPS; blank refuses; 0 is explicit owner free-cut; no agent-invented bps. ' +
      'Money only via recipes.marketPurchase → houseFees(market); blank MARKET_HOUSE_COMMISSION_BPS refuses ' +
      'market.commission_not_configured (never invents free commission; 0 only when owner sets). ' +
      'Crash re-drive settles from claim snapshot (not live env bps). Over-capacity after unstake: oldest-first ' +
      'entitledListingRefs; excess refuse market.listing_over_capacity. Concurrent createListing cannot oversell ' +
      'slots (claimSlot FOR UPDATE + orphan rollback). Catalogue registration order (ASC) — ranking DIRECTION §8 owner. ' +
      'D26-P1-M1 Class M residual SEALED 2026-08-12: compose LEDGER_URL→svc-ledger (no localhost invent); ' +
      'public-door PRECONDITION_FAILED + empty catalogue proofs; ledger listing/premium recipes coord #1761. ' +
      'ranking/featured. C3 listing subscriptions: periodSeconds on the listing (no default month); ' +
      'purchase posts recipes.marketPurchase; access is time-bounded; cancel stops new access without a reverse recipe; ' +
      'past-due refuses market.subscription_past_due. Leftover rows without a period stay unsellable ' +
      '(market.subscription_period_unset) and off the public catalogue.',
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
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['identity.accounts'],
    requires: [
      'services/svc-support/src/mount-vs-tracker.ts',
      'services/svc-support/src/mount-vs-tracker.test.ts',
      'services/svc-support/src/ticket-kb-loop.process.test.ts',
      'services/svc-support/src/http-app.ts',
      'docker-compose.apps.yml',
    ],
    note:
      '**D26-P1-O3 Done 2026-08-21:** desk backend product-complete — ticket spine, KB search/get, audit trail, identity account-state grounding (`mount-vs-tracker.ts`). ' +
      'Process inject proves ticket create + searchKb + getKb on Fastify mount (#1796 compose pin). ' +
      'Class X residual: `TICKET_KB_LOOP_OBSERVED_IN_LIVE_COMPOSE` env (default false); Vue/admin desk; SLA wording. ' +
      'No money on this service ever. `agents.support` is assist only.',
  }),
  f('ops.affiliates', 'Multi-tier affiliate / IB trees, payout automation', {
    module: 'core-ops',
    phase: '5',
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['ledger.double-entry'],
    requires: [
      'services/svc-identity/src/affiliates/mount-vs-tracker.ts',
      'services/svc-identity/src/affiliates/mount-vs-tracker.test.ts',
      'services/svc-identity/src/affiliates/accrual-tree-authority.ts',
      'services/svc-identity/src/affiliates/payout-engine.ts',
      'services/svc-identity/src/affiliates/producer-accrue.ts',
    ],
    note:
      '**D26-P1-O2 Done 2026-08-21:** accrual tree under rate authority + ledger payout + S2S producer doors (`mount-vs-tracker.ts`). ' +
      'Unset tiers → `affiliate.accrual.rates_unset`; per-call invent refused; payout via ledger-client recipes only. ' +
      'Class X residual: Vue/admin affiliate desk (nitro-frontend-all).',
  }),
  f('ops.compliance', 'Screening queues, geo-block, VPN/Tor detection', {
    module: 'core-ops',
    phase: '5',
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['identity.kyc'],
    requires: ['packages/config/src/screening.ts', 'packages/config/src/jurisdiction.ts', 'packages/config/src/compliance-queue.ts'],
    note:
      '**D26-P1-O1 Done-bar sealed 2026-08-12 (#1734):** screening *mechanism* — fail-closed when list unset. ' +
      'D26-P1-O1M mount-vs-tracker seals screening + queue disposition paths. List *content* Class X (counsel). ' +
      'VPN partner / geo-IP socket / case-management UI residual.',
  }),
  f('ops.analytics', 'Warehouse — read replica + cube layer', {
    module: 'core-ops',
    phase: '5',
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['ledger.double-entry'],
    requires: ['packages/contracts/src/ops-analytics-warehouse.ts', 'services/svc-edge/src/compliance-honesty.ts'],
    note:
      '**D26-P1-O4 Done-bar sealed 2026-08-12 (#1759):** warehouse door usable-or-§13 — ETL watermark honesty. ' +
      'D26-P1-O4M mount-vs-tracker seals replica read-only + lag probe paths. Class X residual: cube job callers (Phase B).',
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
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['infra.events'],
    requires: [
      'services/svc-notify/src/mount-vs-tracker.ts',
      'services/svc-notify/src/mount-vs-tracker.test.ts',
      'services/svc-notify/src/channels/mountain-vs-sockets.ts',
      'services/svc-notify/src/router.ts',
    ],
    note:
      '**D26-P1-O5 Done 2026-08-21:** fan-out mountain backend complete — in-app inbox + delivery rows (`mount-vs-tracker.ts`, `mountain-vs-sockets.ts`). ' +
      'Out-of-app email/push/SMS are §13 credential sockets; adapters refuse when unset — never invent providers. ' +
      'Class X residual: gateway credentials (`docs/OWNER-ACTIONS-NOTIFY-GATEWAYS.md`).',
  }),
  f('v22.alerts', 'Alerts & watchlists — price, funding, liquidation proximity, whale flow, portfolio (§31)', {
    module: 'notify',
    phase: '2',
    plane: 'F',
    owner: 'Phantom-X-007',
    status: 'ready',
    dependsOn: ['trade.spot'],
    requires: [
      'services/svc-notify/src/alerts-policy.ts',
      'services/svc-notify/src/alerts/sweep-mounted-pin.test.ts',
      'services/svc-notify/src/alerts/evaluate.test.ts',
    ],
    note:
      '**D26-P1-A1 Done 2026-08-21:** price watch core + sweep driver mounted (`alerts-mount-vs-tracker.ts`). ' +
      'Dark mark refuses fire; unpublished kinds refuse by name; rides ops.notifications fan-out. ' +
      'Class X residual: funding/liquidation/whale kinds; mobile sync; out-of-app gateway credentials.',
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
    status: 'done',
    owner: 'nitro-bank-roundup',
    dependsOn: ['bank.accounts', 'bank.cards', 'bank.earn', 'trade.convert', 'protocol.smart-accounts'],
    requires: [
      'services/svc-bank/src/auto-invest/mount-vs-tracker.ts',
      'services/svc-bank/src/auto-invest/mount-vs-tracker.test.ts',
      'services/svc-bank/src/auto-invest/auto-invest-policy.ts',
      'services/svc-bank/src/auto-invest/auto-invest.reachable.test.ts',
    ],
    note:
      '**D26-P1-B4 Done 2026-08-21:** threshold sweep + card round-up mounted (`mount-vs-tracker.ts`). ' +
      'ops.runAutoInvest; DCA/cross-asset refuse bank.auto_invest_rate_unset — no invent §8 rates. ' +
      'Class X residual: ConvertPort→trade.convert wire; session-key allowance protocol plane.',
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
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['agents.gateway', 'ops.portfolio'],
    requires: [
      'services/svc-agents/src/portfolio-agent/mount-vs-tracker.ts',
      'services/svc-agents/src/portfolio-agent/mount-vs-tracker.test.ts',
      'services/svc-agents/src/portfolio-agent/plan.test.ts',
    ],
    note:
      '**D26-P1-PF1 Done 2026-08-21:** plan-only rebalance mounted (`mount-vs-tracker.ts`); dark port refuses. ' +
      'Never places orders in this slice. Kill-switch + audit on plan path. ' +
      'Class X residual: execution slice; cross-plane bridge owner ruling.',
  }),
  f('agents.launch', 'Launch Agent — pre-listing risk pattern flags (§8.2)', {
    module: 'agents',
    phase: '5',
    plane: 'B',
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['agents.gateway', 'launch.trust-layer'],
    requires: [
      'services/svc-agents/src/launch/mount-vs-tracker.ts',
      'services/svc-agents/src/launch/mount-vs-tracker.test.ts',
      'services/svc-agents/src/launch/pre-listing-assess.ts',
      'services/svc-agents/src/launch/launch-route.test.ts',
    ],
    note:
      'DONE 2026-08-21 D26-P1-LA1: `launch.assess` — pattern flags from DeployerReputation counts only; `history_absent` refused (no clean badge). ' +
      'Class X residual: live chain reputation port wiring; block-vs-annotate listing policy (owner).',
  }),
  f('agents.risk-compliance', 'Risk & Compliance Agent — screening support and report drafts (§8.2)', {
    module: 'agents',
    phase: '5',
    plane: 'B',
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['agents.gateway', 'ops.compliance'],
    requires: [
      'services/svc-agents/src/risk-compliance/mount-vs-tracker.ts',
      'services/svc-agents/src/risk-compliance/mount-vs-tracker.test.ts',
      'services/svc-agents/src/risk-compliance/screening-draft.ts',
      'services/svc-agents/src/risk-compliance/draft-route.test.ts',
    ],
    note:
      'DONE 2026-08-21 D26-P1-RC1: `riskCompliance.draftScreening` — screening-support drafts only; refuses empty/unset list and `asDecision`. ' +
      'Never writes identity.kyc-review `reviewed_by`. Class X residual: sanctions list content (counsel); geo/VPN case UI.',
  }),
  f('agents.coach', 'AI Coach — curriculum-grounded coaching agent (§8.2, §25:708)', {
    module: 'agents',
    phase: '5',
    plane: 'B',
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['agents.gateway', 'academy.curriculum'],
    requires: [
      'services/svc-agents/src/coach/mount-vs-tracker.ts',
      'services/svc-agents/src/coach/mount-vs-tracker.test.ts',
      'services/svc-agents/src/coach/grounded-session.ts',
      'services/svc-agents/src/coach/coach-route.test.ts',
    ],
    note:
      'DONE 2026-08-15 S2S spine citations (GET ACADEMY_URL/internal/curriculum, fail-closed empty). ' +
      'D26-P1-CH1 mount-vs-tracker seals `coach.session` done bar. Licensed dump residual. No advice, no positions. ' +
      'Class X residual: positions-in-coaching owner ruling; licensed library import.',
  }),
  f('agents.growth', 'Growth Agent — acquisition and campaign proposals (§8.2)', {
    module: 'agents',
    phase: '5',
    plane: 'B',
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['agents.gateway', 'ops.analytics'],
    requires: [
      'services/svc-agents/src/growth/mount-vs-tracker.ts',
      'services/svc-agents/src/growth/mount-vs-tracker.test.ts',
      'services/svc-agents/src/growth/campaign-proposal.ts',
      'services/svc-agents/src/growth/growth-route.test.ts',
    ],
    note:
      '**D26-P1-G1 Done 2026-08-21:** campaign proposals mounted (`mount-vs-tracker.ts`); never publishes. ' +
      'Dark warehouse + returns-ranked copy + budget invent refused. ' +
      'Class X residual: incentive budgets; live warehouse cubes.',
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
    status: 'done',
    owner: 'ZenYoda3',
    dependsOn: ['ledger.double-entry', 'indexer.readmodels'],
    requires: [
      'packages/portfolio-view/src/mount-vs-tracker.ts',
      'packages/portfolio-view/src/mount-vs-tracker.test.ts',
      'packages/portfolio-view/src/portfolio-view.ts',
      'services/svc-ledger/src/router.ts',
    ],
    note:
      '**D26-P1-P2 Done 2026-08-21:** Stage-1 custodial ledger view mounted (`mount-vs-tracker.ts`). ' +
      'Indexer half named absent (`indexer.portfolio_positions_unwired`) — never zero chain balance. ' +
      'Class X residual: wire indexer positions composite; house half exposure.',
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
    status: 'done',
    owner: 'Phantom-X-007',
    dependsOn: ['ops.support'],
    requires: [
      'services/svc-support/src/kb-workflow-mount-vs-tracker.ts',
      'services/svc-support/src/kb-workflow-mount-vs-tracker.test.ts',
      'services/svc-support/src/kb-catalog.ts',
      'services/svc-support/src/kb-catalog.test.ts',
    ],
    note:
      '**D26-P1-O4 Done 2026-08-21:** versioned i18n-keyed KB catalog (`kb-workflow-mount-vs-tracker.ts`); list/search/get doors. ' +
      'Published-only public wire; never invent SLA timings or vendor names in keys. ' +
      'Class X residual: user-defined workflow automation — agents.gateway owns agent runtime; no second executor.',
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
    status: 'done',
    dependsOn: ['indexer.readmodels'],
    requires: ['services/svc-dex/src/router.mount.test.ts', 'services/svc-dex/src/quote/quote-service.test.ts'],
    note:
      '**D26-P1-D2 Done 2026-08-21:** cross-venue quote mounted (`quote-router-mount-vs-tracker.ts`); refuses when no venue. ' +
      'Never invent mid; degraded/singleVenue disclosed on wire. ' +
      'Class X residual: socket.dex-venue-set owner publish; no live external venue on default.',
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
    status: 'ready',
    owner: 'shehzad002',
    dependsOn: ['dex.quote-router'],
    requires: ['services/svc-dex/src/quote/clob-costs.ts'],
    note:
      'Owner set 2026-08-07 (board S-I3). S-C1 2026-08-18: SovereignVenue publishes takerFeeBps + settlementCostQuote()=0. ' +
      "S-I3 2026-08-18: CLOB knobs no longer default to 0 / '0' — that understated every on-chain quote. " +
      'DEX_CLOB_FEE_BPS and DEX_CLOB_SETTLEMENT_COST must be set together (operator copies SovereignVenue.takerFeeBps / settlementCostQuote) or omitted together; omitted means intachain-clob is not quoted. One-sided config fails boot. ' +
      'Quote path still reads projections, never eth_call (doctrine). Internal-book DEX_INTERNAL_BOOK_FEE_BPS default 20 remains a configured guess (ledger post has no gas leg; svc-trade markets still unreadable across services §2). ' +
      'Not done: live CLOB still needs the operator to paste venue figures; quoting still does not eth_call the venue; internal-book bps is still not sourced.',
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
    status: 'done',
    owner: 'shehzad002',
    dependsOn: ['protocol.smart-accounts'],
    requires: [
      'services/svc-protocol/contracts/privacy/StealthAnnouncer.sol',
      'services/svc-protocol/src/stealth/presentation.ts',
      'services/svc-protocol/src/stealth/scan.ts',
    ],
    note:
      'CLOSED engineering bar 2026-08-18 (S-L3 presentations) + 2026-08-19 ECDH scanner: presentationAddress is the ' +
      'keccak P0 helper; scan.ts is ERC-5564 scheme-1 (secp256k1 + view tags) over StealthAnnouncer logs. Viewing keys ' +
      'never enter env. Indexer must stay aggregate-only. Residual: unaudited; keccak presentations are not ECDH matches.',
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
    status: 'done',
    owner: 'shehzad002',
    dependsOn: ['protocol.smart-accounts'],
    requires: ['services/svc-protocol/contracts/vaults/LegacyVault.sol'],
    note:
      'CLOSED engineering bar 2026-08-18 (S-L2): LegacyVault — owner is constructor msg.sender, user-set/revocable heirs, ' +
      'inactivity delay + challenge-window abort via heartbeat, staged tranche claim. Matches S-K7 ADR ' +
      '(docs/adr/2026-08-08-inheritance-never-platform-guardian.md): no platform key, no guardian role. ' +
      'Residuals: multi-asset, attestation-based beneficiary claims, public Base Sepolia deploy (Nitro RPC). Unaudited.',
  }),

  f('socket.options-settlement-asset-law', 'Options / forex settlement asset law (D26-P0-05 ADR)', {
    module: 'trade',
    phase: '2',
    status: 'socket',
    dependsOn: ['trade.options'],
    requires: ['services/svc-trade/src/spot/options-listing.ts'],
    note:
      '§13 — D26-P0-05 freeze sealed 2026-08-15 (docs/adr/2026-08-13-options-forex-settlement-asset-law.md): live set empty, settlement asset unset. ' +
      'Socket stays until a later owner names a live set + asset; TRADE_OPTIONS_SETTLEMENT_ASSET_LAW stays empty and is never parsed. Named 2026-08-12 (D26-P1-T6): ' +
      'svc-trade listMarket(kind=options) refuses with trade.options_settlement_law_unset while the stamp is empty. Inventing a coin here would ' +
      'close a ready row with a lie. Forex share is sibling socket.forex-settlement. Closing this socket requires a later owner stamp, not this freeze.',
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
      '§13 — customer inbox still needs svc-notify/credentials (`socket.notify-*`). Fire path now records a durable attempt on ' +
      '`subscription_executions.notify_status` before openInvoice (wired → attempted; unwired → skipped_unwired / ' +
      '`pay.subscription_notify_unwired`). `notified` stays false — an attempt is not a delivered inbox. Closing this socket is ' +
      'customer-channel delivery, not inventing `notified:true`. Pins: mandate-product.ts · precharge-notify-unpublished.test.ts · ' +
      'subscriptions-done-bar.test.ts.',
  }),
  f('socket.forex-settlement', 'Forex/commodity settlement asset law + fiat settle rails', {
    module: 'trade',
    phase: '2',
    status: 'socket',
    dependsOn: ['pay.rails'],
    requires: ['services/svc-trade/src/spot/forex-settlement.ts'],
    note:
      '§13 — D26-P1-T7 explicit socket (2026-08-12). D26-P0-05 freeze sealed 2026-08-15 (live set empty; settlement asset unset). trade.forex product-complete only after ' +
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
    status: 'done',
    dependsOn: ['trade.otc'],
    requires: [
      'services/svc-trade/src/otc/mid-feed.ts',
      'services/svc-trade/src/otc/venue-mid-source.ts',
      'services/svc-trade/src/otc/otc-mid-feed-donebar.test.ts',
    ],
    note:
      'DONE 2026-08-14 — venue public book observation (same TRADE_VENUE_MARK_VENUE adapter) refreshes asOf when TRADE_OTC_MID_FROM_VENUE is on. ' +
      'Default OFF. Empty TRADE_OTC_VENUE_SYMBOLS never invents pairs. Boot TRADE_OTC_MIDS is not mixed in while venue is on. ' +
      'deskStatus.midFeed.liveObservationFeed tracks install. Unmapped/dark/missing observedAt → null. Pins: venue-mid-source.ts · mid-feed.ts · index.ts.',
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
      'CORRECTED 2026-08-15 D26-P4-09 — do not read as unwired on tip. Production `svc-trade` `index.ts` wires `placeFollowerOrder` → follower `placeOrder` (IOC market; #1811). Unwired port still refuses by name (never invent fills). ' +
      'deskStatus.autoMirrorPlace.published tracks the port. Status stays `socket` (not flipped to done): session-key / protocol residual still open. Closing needs that durable allowance, not a fake order id.',
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
    note:
      '2026-08-19 SESSION-KEY FORGE (S-A8): test/forge/SessionKey.t.sol fuzzes self-target + outbound-selector refusal at grant, ' +
      'spend-limit re-entrancy (counted before _call), and validateUserOp refusing session ops that are not executeWithSession. ' +
      'Prior: test/forge via foundry:v1.5.1 (`pnpm test:forge`); solc-js still owns contracts/out/ (no forge last-write). ' +
      'STATUS stays socket: no external audit — this still does not prove safe for mainnet.',
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
      'S-J1 PIPELINE 2026-08-19: src/audit/pipeline.ts + public auditStatus — artefact hash, who signed, audited:false ' +
      'until kind=external with a pinned hash that matches. STATUS stays socket: choosing and PAYING an audit firm is a ' +
      'Nitro decision (budget). Tests pass ≠ audited:true.',
  }),
  f('socket.userop-differential-test', 'getUserOperationHash checked against a live EntryPoint', {
    module: 'protocol',
    phase: '3P',
    plane: 'P',
    status: 'done',
    owner: 'shehzad002',
    dependsOn: ['socket.contract-toolchain'],
    requires: ['services/svc-protocol/contracts/entrypoint/EntryPointGetUserOpHash.sol'],
    note:
      'CLOSED 2026-08-18 (S-A11). src/chain/userop.ts getUserOperationHash is checked against Solidity ' +
      'EntryPointGetUserOpHash (ERC-4337 v0.7 formula, same as canonical EntryPoint 0x0000000071727De22E5E9d8BAf0edAc6f37da032) ' +
      'in userop.entrypoint.onchain.test.ts on anvil (REQUIRE_EVM_CHAIN=1). Residual: not a fork of a public EntryPoint — Nitro RPC. ' +
      'Not a full EntryPoint deploy / bundler.',
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
    status: 'done',
    owner: 'shehzad002',
    dependsOn: ['protocol.smart-accounts'],
    requires: ['services/svc-protocol/contracts/recovery/UserElectedRecovery.sol'],
    note: 'CLOSED 2026-08-18 (S-A1 permitted shape). UserElectedRecovery.sol is an ERC-1271 owner a SmartAccount may set: the USER elects guardians and threshold (M-of-N), can revoke either, and can cancelRecovery during the delay; after delay + M guardian calls/signatures the owner rotates. Platform is never a guardian — no hardcoded platform address, no admin, no upgrade, no platform quorum. 2026-08-19: createAccount(recovery) proven in test/forge/RecoveryOwner.t.sol — SmartAccount.owner is the recovery contract, ERC-1271 forwards to the sitting recovery-owner EOA, factory still takes the key it is given (not defaulted). Unaudited; no audited:true.',
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
    status: 'ready',
    owner: 'shehzad002',
    dependsOn: ['indexer.readmodels'],
    requires: ['services/svc-protocol/contracts/venue/SovereignVenue.sol'],
    note:
      'S-C1 2026-08-18: SovereignVenue is a real single-market CLOB — deposit/place/cancel, price-time matching, ' +
      'custody of base+quote, Fill only from a match (no recordFill). Event surface is the indexer ABI ' +
      '(BookLevel absolute qty, Fill, Position). DevVenue stays a decoder fixture in svc-indexer. ' +
      'STATUS ready (not done): not externally audited; INDEXER_VENUE_ADDRESS stays zero until a public deploy (Nitro RPC). ' +
      'socket.contract-audit still gates audited:true.',
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
    requires: [
      'services/svc-protocol/src/chain/paymaster-policy.ts',
      'services/svc-protocol/contracts/paymaster/ScopedPaymaster.sol',
      'docs/adr/2026-08-08-paymaster-and-bundler-policy.md',
    ],
    note:
      'S-A10 2026-08-08 policy + 2026-08-19 contract: ScopedPaymaster.sol holds a native float, allowlist/selectors/maxCost, ' +
      'and refuses validatePaymasterUserOp when unfunded (same as funding_unconfigured). Operator can only spend this ' +
      "contract's float, never a user account. ADR: Nitro Class X still owns depositing the float. No audited:true.",
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
