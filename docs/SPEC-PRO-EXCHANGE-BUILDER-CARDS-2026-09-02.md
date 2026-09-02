# Builder cards — live-wire + depth v1.23

**Status:** Executable cards for Grok bot. Constitution: [`SPEC-PRO-EXCHANGE-LIVE-AND-DEPTH-2026-09-02.md`](SPEC-PRO-EXCHANGE-LIVE-AND-DEPTH-2026-09-02.md). Inventory: [`SPEC-PRO-EXCHANGE-RITEM-INVENTORY-2026-09-02.md`](SPEC-PRO-EXCHANGE-RITEM-INVENTORY-2026-09-02.md).  
**Tip this stamp:** `origin/main` `34e28e33`. Re-fetch before every card.  
**Law:** `INTAFACED_DEFINITIVE_BUILD.md` → north-star v1.23 §0.3 → this campaign → child `PX-S0x` → this card.

If a card conflicts with doctrine or a child spec, doctrine/child wins and the card is wrong.

### Independent code audit (this stamp, `34e28e33`) — do not ignore

- **`oms-stop` / `oms-expire` / `oms-release-residual` are LIVE** on `createExecutionRouter`. A4 must not “hitch” them again. UNIT_ONLY extras: `oms-pov-slice.ts`, `oms-basket-start.ts`, `oms-paper-*`, `oms-is-*`, `oms-mmp-*`, `oms-credit-mitigate.ts`, `oms-amend-remaining.ts`, `oms-account-*`, `oms-kill-live.ts` (router uses `oms-kill` + `oms-kill-parent`).
- **QFJ is an adapt CLI**, not a session. `FixAdapterMain` reads stdin. No compose service. C1 is greenfield session work on QFJ 3.0.2, not “turn on the gateway.”
- **Matching book already installs** iceberg, peg, AON, min-qty, auction, collar, STP expire. OCO/bracket hitch **through** `trailing-stop.js` → `option.js`. `stop-limit.ts` is UNIT_ONLY. C03 still says iceberg **unavailable as a sold product** — do not advertise; do not reimplement in execution paper files.
- **`statement-pnl` lives in `svc-ledger`** (`router.ts` + `s2s-http.ts` + `ledger/statement-pnl.ts`). Not `svc-trade/spot/statement-pnl.ts`.
- **Cooling is refuse-unset**, not an elapsed wait on dest.
- **FileJournal must encode collar + IFM flag** (peace leftover). B3 is not only crash/replay.
- **Kill-parent unknown ≠ killed.** Hitch with A3/A4 so dual-live children cannot appear.
- **Copy jurisdictions closed everywhere** (D26-P0-15). Do not engineer an allowlist.
- **OMS/SOR plans are LEGGED** (`atomic: false`). Do not report atomic arb.
- Compose also defaults `TRADE_ALGO_JOBS_INTERVAL_MS:-1000`, `JWT_ACCESS_TTL_SECONDS:-900`, `IDENTITY_MAX_SUB_ACCOUNTS:-25` — not this campaign’s 10/200, but do not copy the pattern.

---

## Card template (every PR body copies this)

```
CARD: <id>
PTX: <ids>
Child spec: PX-S0x §
Service: services/<one>
Files (origin/main):
Current: LIVE | UNIT_ONLY | REFUSE | MISSING | OPEN_PR
Target:
OSS: keep-in-repo | EXT <lib>@<ver> adapter-only | none
Owner sockets I will NOT fill:
Hitch proof (command or test name):
Money: ledger-client recipes touched? Y/N
Tests: unit + (if money) Testcontainers/per-branch Postgres
Out of scope: 05_Web_Front, second book, invented bps
```

One service per PR. Decimal strings. `pnpm wt`. Comment [#3446](https://github.com/Phantom-X-007/intafaced/issues/3446).

---

## Wave 0 — finish open PRs

### A2 — `svc-trade` — #3703

- **PTX:** `PTX-M27-R01` `PTX-M27-R02` plus market-buy slippage (`PTX-M04-R04` slippage caps).
- **Child:** PX-S07.
- **Current:** OPEN PR https://github.com/Phantom-X-007/intafaced/pull/3703. `origin/main` still has compose defaults:
  - `docker-compose.apps.yml` `TRADE_MARKET_SLIPPAGE_CAP_BPS:-200`
  - `docker-compose.apps.yml` `TRADE_CONVERT_SPREAD_BPS:-10`
- **Target:** Blank env refuses convert quote/execute and market-buy hold **before** `withdrawHold`. Compose must **not** inject 10/200. No fallback literals in trade code.
- **Proof:** Container without those env vars refuses. With owner-set decimal-string bps, quote binds exact input/output amounts.
- **If PR is missing compose strip:** add it in `svc-trade` PR only if compose is considered that service’s wiring; otherwise a follow-up still named A2, still one concern. Do not leave the `:-10` / `:-200`.
- **Merge:** Gitleaks green. Trunk-wide GHSA → `--admin` only if this diff did not add it.

### A1 — `svc-matching` — #3702

- **PTX:** `PTX-M03-R01` `PTX-M16-R02` `PTX-M16-R04`.
- **Child:** PX-S03 §8.1 STP; PX-S01 §7 cases.
- **Current:** OPEN PR https://github.com/Phantom-X-007/intafaced/pull/3702. Helper `engine/surveillance-case.ts` on main is UNIT_ONLY until `book.match` / `engine.submit` opens a case.
- **Target:** Submit STP → named `self_trade` case. No fine, no ledger. STP group is beneficial-owner, not merely leaf account (PX-S03). Missing STP identity refuses the match, does not invent a group.
- **v1 STP mode** is `CANCEL_RESTING_CONTINUE`. Do not add cancel-aggressor/both without a new rule version.

---

## Wave A — hitch (unit-only is a lie)

### A3 — basket — `svc-execution`

- **PTX:** `PTX-M04-R11`.
- **Files:** `oms-basket-start.ts` (+ test). Also search router/tRPC/`sliceLiveAlgoParent`.
- **Target:** One HTTP/tRPC admin door exercises `startBasketParent` **or** PR body proves generic live slice already covers basket and the unit file is extra (do not dual-implement).
- **Proof:** Call path uses ledger qty strings. Partial-failure policy is deterministic (refuse or named residual) — no silent drop of legs.

### A4 — POV extras vs live slice — `svc-execution`

- **PTX:** `PTX-M04-R04`.
- **LIVE already:** `oms-slice.ts` (`kind` twap\|vwap\|pov) via `sliceLiveAlgoParent`; `oms-stop.ts` `stopRunningAlgoParent`; `oms-expire.ts` `expireAlgoParent`; `oms-release-residual.ts` `releaseExpiredParentResidual`.
- **UNIT_ONLY extras:** `oms-pov-slice.ts`, `oms-paper-pov-*`.
- **Target:** Document extras in the PR body. Do **not** hitch a second POV. Kill-parent **unknown ≠ killed** (peace leftover) — add that proof on the live kill/expire path, not a new engine.

### A5 — FIX account + TIF — `svc-fix`

- **PTX:** `PTX-M05-R02` `PTX-M05-R10`.
- **Files:** Java `FixGatewayAdapter`; TS `matching-port.ts` / `command.ts` (may be unused — prove). Matching submit needs `accountId`, UUID `orderId`, `tif`, `lifecycleProof`.
- **Target:** Unmapped CompID → `matching_account_unmapped` **before** POST. Missing TIF → `tif_missing`. Mapped CompID posts decimal qty/price. CompID JSON is OWNER-SET; blank refuses. Never invent an account.
- **OSS:** QuickFIX/J 3.0.2. Live FIX is Java. Do not replace with node-quickfix.

### A6 — matching ack passthrough — `svc-fix`

- **PTX:** `PTX-M05-R02` `PTX-M04-R07`.
- **Target:** Schema: only named ack fields. Do not relay extra `fills[]` / last / account from HTTP 200 as if svc-fix minted them. `sequence` is matching’s. Not IEEE money.

### A7 — rulebook compose — `svc-matching`

- **PTX:** `PTX-M00-R01` `PTX-M00-R06`.
- **Files:** `rulebook.ts`, `GET /rulebook`.
- **Target:** Pass `MATCHING_RULEBOOK_VERSION` in compose **without inventing a version**. Blank stays unpublished. “Certified” / “best execution” refuse while unpublished.

### A8 — combo refuse stays — `svc-matching`

- **PTX:** `PTX-M11-R04` `PTX-M04-R05`.
- **Files:** `option.ts` / `comboIntentRefuse`, `option-combo.ts`.
- **Target:** Live `submit` already refuses. Keep until E combo **book**. Do not silently rest two options.

### A9 — iceberg family — `svc-execution` (do not dual-implement matching)

- **PTX:** `PTX-M04-R09` display quantity.
- **Matching:** `book.ts` already installs iceberg. C03 still treats iceberg as **unavailable sold product** — do not advertise hidden qty as native if the socket says unavailable.
- **Execution files:** `oms-paper-iceberg-*.ts` are PAPER. Must not call `withdrawHold`.
- **Target:** Paper stays paper. Live display-qty from OMS that is not matching iceberg **refuses** rather than silently full-display. Do not write a second iceberg book.

### A10 — pegged / midpoint — `svc-execution` + maybe matching

- **PTX:** `PTX-M04-R09`.
- **Files:** `oms-paper-pegged-*.ts`.
- **Target:** Unsupported peg/midpoint **refuses by field**. Never map to a plain limit without preview+consent (PX-S03 invariant 12).

### A11 — OCO / bracket — `svc-execution`

- **PTX:** `PTX-M04-R02`.
- **Files:** `oms-paper-oco-*`, `oms-paper-bracket-*`. Hunt live conditional doors in `svc-trade` too.
- **Target:** Live hitch **or** refuse unsupported conditional on the place-order path. Guaranteed cancel of the other side is required if live. Paper: no ledger.

### A12 — scale / implementation-shortfall / schedule — `svc-execution`

- **PTX:** `PTX-M04-R11` `PTX-M04-R04`.
- **Files:** `oms-paper-scale-in-*`, `oms-is-*`, `oms-is-paper-*`, schedule/sniper/trailing families.
- **Target:** Same hitch-or-document-extra rule. Worst-case pre-trade risk must refuse if buying-power path unset.

### A13 — MMP modules in execution — `svc-execution` (not the matching book)

- **PTX:** `PTX-M11-R05` `PTX-M11-R12`.
- **Files:** `oms-mmp-post.ts`, `oms-mmp-hedge.ts`, `oms-mmp-mqq.ts`.
- **Target:** These are **not** the matching MMP engine. Hitch as OMS helpers **or** extras. Real MMP is Wave E in `svc-matching`. Do not invent quantity/delta/vega.

### A14 — care desk: claim / assign / pass / shift / fill-confirm — `svc-execution`

- **PTX:** `PTX-M25-R01`–`R05` `PTX-M01-R07`.
- **Files:** `oms-claim.ts`, `oms-assign.ts`, `oms-pass.ts`, `oms-shift.ts`, `oms-fill-confirm.ts`, `oms-fill-assign.ts`, `oms-manual-fill.ts`, `oms-abandon.ts`.
- **Target:** Hitch a real door **or** keep UNIT_ONLY with PR-body extras list. Manual fill must be permissioned and must use ledger recipes — never a sidecar balance. Unset discretion caps refuse.

### A15 — kill / drain / cancel-on-disconnect / venue halt — `svc-execution` + matching

- **PTX:** `PTX-M03-R04` `PTX-M25-R12`.
- **Files:** `oms-kill.ts`, `oms-kill-live.ts`, `oms-kill-parent.ts`, `oms-drain.ts`, `oms-matching-venue-halt.ts`.
- **Target:** Prove which is live. Matching halt **≡ cancel-only** (doctrine). Dead-man / COD: session drop cancels in-scope opens or named refuse if unset. Do not flatten inventively.

### A16 — TCA — `svc-execution`

- **PTX:** `PTX-M25-R07` `PTX-M25-R08` `PTX-M04-R08`.
- **Files:** `oms-*tca*`.
- **Target:** TCA without owner benchmark + retained market data must **refuse the claim**, not emit a fake “beat VWAP.” Hitch or extra.

### A17 — trailing / sniper / TWAP / VWAP paper vs live — `svc-execution`

- **PTX:** `PTX-M04-R04`.
- **Files:** 13 twap, 13 vwap, trailing, sniper, paper-* variants.
- **Target:** Generic `oms-slice.ts` is suspected LIVE for twap/vwap/pov. Census must say which files are extras. Do not dual-implement.

### A18 — OMS census PR (required once)

- **Service:** `svc-execution` **documentation in the PR body**, not a new markdown mountain. Optional: a test that imports the live router and asserts the live symbol set.
- **Work:** List all **187** `oms-*.ts` (non-test) as LIVE / PAPER / UNIT_ONLY / EXTRA. Group by family (already counted: vwap 13, twap 13, pov 13, is 13, scale 12, …).
- **Why:** v1.22 named 2 files. Builders otherwise re-litigate this every card.
- **Do not** commit a docs-only PR if you can attach the census to A3 or A4. Prefer one execution PR that lands A18 + one family hitch.

### A19 — four-eyes / attribution hitch — `svc-identity`

- **PTX:** `PTX-M01-R04` `PTX-M01-R05`.
- **Child:** PX-S02 §§6–7.
- **Target:** Policy change / key change / high-risk transfer without dual-control **refuses**. Session/API-key id survives onto order/fill/ledger or named refuse. Do not invent approval thresholds.

### A20 — fee preview already on main — do not redo; verify

- **PTX:** `PTX-M21-R02` `PTX-M04-R06`.
- **Files:** `spot/order-preview-rest.ts`, `spot/fee-schedule.ts`.
- **Target:** If preview omits fee basis/rate/asset while schedule is published, hitch. If unpublished, preview refuses — never shows 10/20 bps from listing comments.

---

## Wave B — money proof (Postgres down ≠ green)

Use Testcontainers-node **or** per-branch Postgres. `fast-check` is in-repo.

### B1 — unpublished fee schedule — `svc-trade`

- **PTX:** `PTX-M21-R01` `PTX-M03-R02`.
- **Target:** Place/fill with unpublished `TRADE_FEE_SCHEDULE` refuses **before** `withdrawHold` / fill recipe. Published schedule drives `ratesForFill`, never listing 10/20.
- **Proof:** Red without DB is a fail.

### B2 — offramp cooling — `svc-bank`

- **PTX:** `PTX-M17-R03`.
- **Target:** Blank `BANK_OFFRAMP_COOLING_HOURS` refuses before `withdrawHold`. Journal empty.

### B3 — IFM crash window — `svc-matching`

- **PTX:** `PTX-M03-R09`.
- **Target:** Crash after `in_flight` journal, before apply → `in_flight_unknown`; no second rest; no duplicate fill. Replay must not invent cancel. FileJournal encode includes the flag.

### B4 — matching 200 then trade death — `svc-trade` + matching (two PRs if needed; matching first)

- **PTX:** `PTX-M03-R02`.
- **Target:** Hold stays; no invented settle. Reconcile job default remains honest (off ≠ silent fill).

### B5 — statement PnL missing lots — `svc-ledger`

- **PTX:** `PTX-M14-R02`.
- **Target:** Missing lots/marks/NAV → named refuse, never `0`. Router hitch already; add S2S if missing.

### B6 — dual-book door — every money PR

- **PTX:** `PTX-M23-R01`.
- **Target:** `pnpm scan:dual-book-door` (or gates). Fail the PR if a new balance appears outside ledger-client.

### B7 — convert settle recipe — `svc-trade`

- **PTX:** `PTX-M27-R02`.
- **Files:** `convert/settle.ts`, `convert/quote.ts`.
- **Target:** Quote acceptance binds exact decimal in/out; one balanced recipe. Depends on A2 (no invented spread). Idempotent accept. Expiry refuses a second settle.

### B8 — liquidation / insurance no invented waterfall — `svc-trade`

- **PTX:** `PTX-M09-R04` `PTX-M09-R05`.
- **Files:** `liquidation-planner.ts`, `insurance-bound.ts`, `adl-last-resort.ts`.
- **Target:** Partial liq uses book; insurance/ADL without owner caps stay `trade.adl_unconfigured`. No socialized-loss default.

---

## Wave C — professional access (v1.22 D1–D3, D11–D12 + drop-copy)

### C1 — live FIX session — `svc-fix` (was D1)

- **PTX:** `PTX-M05-R02` `PTX-M05-R10`.
- **OSS:** QFJ 3.0.2 already in `services/svc-fix` (`PIN.quickfixj`).
- **Current:** `FixAdapterMain` is stdin→JSON **adapt CLI**. `FixGatewayAdapter.java` parses. **No** acceptor session, **no** compose `svc-fix`, **no** POST to matching. TS `matching-port.ts` is UNIT_ONLY.
- **Target:** Real QFJ acceptor: logon / heartbeat / resend / logout. Versions 4.2 / 4.4 / 5.0 explicit. Unsupported BeginString refuses. Official FIX XML dictionaries per version. Then C2 NOS after A5. Certification program is OPS; code refuses “certified” without rulebook version (C6).

### C2 — NewOrderSingle → matching — `svc-fix` (was D2)

- **Depends:** A5.
- **Target:** NOS after account+TIF map. ExecutionReport from matching ack. **No ledger in svc-fix.**

### C3 — independent drop-copy — `svc-fix` (**v1.22 missed**)

- **PTX:** `PTX-M05-R03`.
- **Child:** PX-S04.
- **Target:** A second QFJ session (or named drop-copy app) streams executions from UI/REST/WS/FIX/algo/liquidation/RFQ/broker sources. It is **not** the order-entry session. Until all sources exist, drop-copy **refuses completeness claims** and lists included sources. Do not synthesize missing sources.

### C4 — SBE public tape — `svc-ws` or `packages/market-data` (was D3)

- **PTX:** `PTX-M05-R04` `PTX-M06-R01`.
- **OSS:** Real Logic SBE 1.39.0 already in `packages/sbe-codec`.
- **Target:** Publish L2 using our schema. Entitlements refuse unauthorized. **Never** call this L3.

### C5 — native L3 / queue — `svc-matching` (was D12)

- **PTX:** `PTX-M06-R01` `PTX-M06-R06` `PTX-M06-R11`.
- **Target:** L3/queue is matching truth. WS may project it. Queue-probability tooling from L2 alone **refuses**. Public maker identity / L4 **refuses** if not produced.

### C6 — testnet / cert refuse — `svc-matching` (was D11)

- **PTX:** `PTX-M19-R01` `PTX-M19-R03` `PTX-M00-R06`.
- **Target:** Refuse “certified” / “testnet parity proven” without `MATCHING_RULEBOOK_VERSION` and an owner program. Do not fake a cert suite.

---

## Wave D — matching depth (v1.22 missed almost all of M03)

### D-amend — native amend priority — `svc-matching`

- **PTX:** `PTX-M03-R03`.
- **Child:** PX-S03 §8.2.
- **Target:** State when queue priority is retained or lost. Cancel/replace is **never** presented as atomic amend. Unsupported amend refuses by field.

### D-cod — cancel-on-disconnect / mass cancel / session fence — `svc-matching`

- **PTX:** `PTX-M03-R04`.
- **Target:** Scoped mass cancel works during partial failure. Split brain refuses order entry (PX-S03). Kill switch is dual-controlled where material (M09-R09) — unset authority refuses.

### D-auction — `svc-matching`

- **PTX:** `PTX-M03-R05`.
- **Target:** If uncrossing rules unset: auction states **refuse** rather than a fake uncross. Do not invent uncrossing.

### D-collars — `svc-matching`

- **PTX:** `PTX-M03-R06`.
- **Target:** Fat-finger / collars / throttles: owner magnitudes blank → those controls unpublished, not zero. Severe-market mode is explicit.

### D-journal — `svc-matching`

- **PTX:** `PTX-M03-R07`.
- **Target:** Engine journal + gateway timestamps reconstruct transitions. Gaps are named, never healed by invented events.

### D-halt — `svc-matching`

- **PTX:** `PTX-M02-R03` `PTX-M00-R04`.
- **Target:** Halt ≡ cancel-only. Reduce-only / post-only are distinct. Restart cannot reset a market to OPEN.

### D-bulk — `svc-matching` / `svc-trade`

- **PTX:** `PTX-M04-R03`.
- **Target:** Bulk place/amend/cancel: per-item results, idempotency. Atomic vs non-atomic explicit. Partial bulk cannot hide rejects.

### D-core-tif — `svc-matching` / `svc-trade`

- **PTX:** `PTX-M04-R01`.
- **Note:** Core schema BUILT. Residual: GTD/GTT, close-position, client IDs uniqueness domain (PX-S03). Hitch missing TIF rather than mapping to GTC.

---

## Wave E — options / volatility (v1.22 named 2 of 12)

Live options settlement asset/fixing is OWNER (`PTX-M11-R01`). Until set: listing/exercise **refuse**. Isolated from “we have option.ts refuse.”

### E1 — QuantLib link or refuse (was D4) — `packages/greeks-adapter`

- **PTX:** `PTX-M11-R02` (greeks fields).
- **OSS:** QuantLib 1.43.
- **Target:** Link native **or** keep refuse. Decimal strings out. Fix `ieee-decimal` / N-API double if linking — **no IEEE on the wire**. No JS Black-Scholes labeled QuantLib. `INTAFACED_QUANTLIB_NATIVE` blank → unlink refuse.
- **Consumers:** no service depends today. A later `svc-trade` PR (not this package PR) may call it.

### E2 — combo book (was D5) — `svc-matching`

- **Depends:** A8 keep-refuse until this card.
- **PTX:** `PTX-M11-R04`.
- **Target:** Named legs + ratios rest as **one** instrument. Until then keep refuse. Do not rest two options independently and call it a combo.

### E3 — mass quote + paired-side (MMP) — `svc-matching`

- **PTX:** `PTX-M11-R05` `PTX-M11-R11` `PTX-M11-R12`.
- **Target:** Mass quote API. If one side of a required two-sided set is rejected, cancel/reject the pair unless the set permits one-sided. MMP magnitudes OWNER-SET → unset-refuse. MMP may reserve margin from quoted qty only with ledger holds — no sidecar.
- **Keep MMP law in-repo.** Not a vendor MM.

### E4 — options RFQ — `svc-trade` / matching

- **PTX:** `PTX-M11-R06` `PTX-M12-R02`.
- **Target:** Until principal/agency owner socket is set, RFQ **refuses**. No undisclosed last look. Off-book leverage cap blank does **not** inherit book (`PTX-M12-R09`).

### E5 — exercise / assignment / expiry jobs — `svc-trade`

- **PTX:** `PTX-M11-R08`.
- **Target:** Idempotent jobs. Missing settlement asset/fixing → refuse the job, do not use last trade. Reconcile through ledger-client.

### E6 — automated delta hedge — `svc-trade` / execution

- **PTX:** `PTX-M11-R09`.
- **Target:** Unset target/range/instrument → refuse. Do not silently start hedging from a mill `oms-mmp-hedge.ts`.

### E7 — position builder / what-if — `svc-trade`

- **PTX:** `PTX-M11-R03` `PTX-M11-R10`.
- **Target:** What-if must not post money. Missing greeks adapter → refuse numbers rather than JS fake greeks.

### E8 — options listing class — `svc-trade`

- **PTX:** `PTX-M02-R07` `PTX-M11-R01`.
- **Files:** `spot/options-listing.ts`, `options-policy.ts`.
- **Target:** Empty live settlement law keeps production closed (scorecard SOCKET). Do not admit a chain.

---

## Wave F — risk / default / linear products

### F1 — portfolio margin refuse (was D6) — `svc-trade`

- **PTX:** `PTX-M08-R01` `PTX-M08-R04` `PTX-M08-R10`.
- **Target:** Isolated remains the live IM product. Cross / multi-collateral / PM: `trade.portfolio_margin_unset` (or existing name). **ORE later** — not this card. Four combinations of segregation × margin are named; switching follows R02.

### F2 — mode switch — `svc-trade`

- **PTX:** `PTX-M08-R02`.
- **Target:** Switch without eligibility/consent/preview **refuses**. Open-risk constraints. Full audit. No silent cross from aggregate reads (`PTX-M08-R08`).

### F3 — dated futures settlement job (was D7) — `svc-trade`

- **PTX:** `PTX-M10-R03`.
- **Target:** Owner fixing decimal string; never last trade. Blank `TRADE_FUTURES_SETTLEMENT_FIXING` already refuses listing — keep. Job posts balanced recipes.

### F4 — ADL unconfigured (was D8) — `svc-trade`

- **PTX:** `PTX-M09-R05`.
- **Target:** Keep `trade.adl_unconfigured` without owner `maxReduceBps`. Do not invent ranking.

### F5 — pre-trade credit dimensions — `svc-trade`

- **PTX:** `PTX-M09-R10`.
- **Target:** Unset max-order / max-position / max-loss **refuse** new risk. Do not invent a flatten.

### F6 — hedge / one-way position mode — `svc-trade`

- **PTX:** `PTX-M10-R07`.
- **Target:** Explicit mode. Migration with open orders/positions refuses if unset. Order-side semantics documented in API; unsupported refuses.

### F7 — funding recon across surfaces — `svc-trade` + ledger

- **PTX:** `PTX-M10-R05`.
- **Target:** Predict/accrue/settle/correct/report one recipe. UI/API/ledger cannot diverge by silent default.

### F8 — collateral haircuts — `svc-trade`

- **PTX:** `PTX-M08-R03` `PTX-M08-R11`.
- **Target:** OWNER. Yield-bearing / staked collateral **refuses** unless a separate product. Do not turn posted margin into a loan.

---

## Wave G — remaining DEPTH as live-path refuse or real door

These are the 150 DEPTH rows that v1.22 dropped. **Do not skip a mountain.** Prefer refuse-on-live-path over a fake product. Group PRs by service.

### G-rulebook — `svc-matching` / identity

- **PTX:** `PTX-M00-R04` `PTX-M02-R03` `PTX-M02-R04` `PTX-M02-R06` `PTX-M02-R08`.
- **Target:** Emergency actions have authority+evidence or refuse. Corporate actions / delist without policy refuse. Permissionless listings refuse (`PTX-M02-R08`).

### G-identity — `svc-identity`

- **PTX:** `PTX-M01-R01` `PTX-M01-R03` `PTX-M01-R08`.
- **Target:** Distinct roles (no “same org” money shortcut). ABAC missing operand refuses. Routing profiles show resolved account before commit.

### G-data — `svc-ws`

- **PTX:** `PTX-M06-R02`–`R05` `PTX-M06-R08`–`R10`.
- **Target:** Trades labelled by aggressor/auction/liq/block. Synthetic/implied distinguished from native. No global “connected” lie. Adapters cannot reinterpret instruments.

### G-rfq — `svc-trade`

- **PTX:** `PTX-M12-R01`–`R08` (R01/R09 are OWNER).
- **Target:** Live RFQ without principal/agency socket **refuses**. Give-up/allocation without carrying-account identity refuses. Voice/manual must hit the same ledger path or refuse.

### G-liquidity — `svc-matching` / trade

- **PTX:** `PTX-M13-R02` `PTX-M13-R05` `PTX-M13-R06`.
- **Target:** External depth visibly sourced. Incentives must not reward wash — if program unset, do not pay rebates. Quality telemetry may exist without proving “liquid” (`PTX-M00-R06`).

### G-reporting — `svc-ledger`

- **PTX:** `PTX-M14-R03`–`R07` (D10 happy path was v1.22).
- **Target:** Statements when lots exist. NAV/SFTP/regulator export: refuse completeness if IDs missing. Never invent cost basis.

### G-custody — `svc-ledger` / bank

- **PTX:** `PTX-M15-R03`–`R05` `PTX-M15-R07`.
- **Target:** Chain/fiat adapters stay adapters. Breaks age, never auto-disappear. Off-exchange models OWNER — refuse the product.

### G-surveillance persist (was D9) — `svc-matching`

- **PTX:** `PTX-M16-R01`–`R09`.
- **Target:** Persist open cases. Spoofing/layering remain named reasons that **refuse auto-adjudicate**. Missing owner thresholds disable that detector with an explicit gap — never threshold `0`.

### G-security — `svc-identity`

- **PTX:** `PTX-M17-R04`–`R08`.
- **Target:** Privileged access dual-control for material actions. “Insured” claims refuse (`PTX-M17-R08` `PTX-M00-R06`).

### G-resilience — matching / ledger

- **PTX:** `PTX-M18-R02` `PTX-M18-R04` `PTX-M18-R05`.
- **Target:** Degraded dependency → refuse new risk. Split-brain money impossible. SLO **numbers** are OWNER; still emit raw metrics.

### G-developer — `packages/contracts` / fix

- **PTX:** `PTX-M19-R02` `PTX-M19-R04` `PTX-M19-R05` `PTX-M05-R08`.
- **Target:** OpenAPI from Zod 3 via `zod-to-openapi@7.3.4`. Changelog/deprecation is contractual — do not break silently. SDKs: decimal handling explicit.

### G-onboarding — `svc-identity`

- **PTX:** `PTX-M20-R06`.
- **Target:** Account/limit/fee-tier changes dual-controlled. Closures: residual liability refuse-until-zero.

### G-fees — `svc-trade`

- **PTX:** `PTX-M21-R06`.
- **Target:** Promotions without budget/source/end refuse. No truthful-label lies.

### G-multivenue — `svc-execution`

- **PTX:** `PTX-M22-R02`–`R07`.
- **Target:** Adapters ON_MAIN. SOR/best-ex **claim** refuses without owner law. Outage cannot invent fills. DEX routing names gas/MEV/reorg or refuses.

### G-finance — `svc-ledger`

- **PTX:** `PTX-M23-R03` `PTX-M23-R07`.
- **Target:** Client vs corporate assets distinct. Finance close: refuse if recipes incomplete. No misleading PoR (`PTX-M23-R04` OWNER).

### G-quant — `svc-trade`

- **PTX:** `PTX-M24-R03`–`R11`.
- **Target:** Paper/shadow cannot move money. Live deploy without eligibility socket refuses. Simulated PnL never labeled live. Marketplace ranking refuses (`PTX-M24-R12` OWNER).

### G-copy — `svc-trade`

- **PTX:** `PTX-M26-R02`–`R10`.
- **Target:** D26-P0-15 jurisdictions blank → **every follow closed**. Leader is intent, never authority over follower money. P&L fees absent unless separately authorized.

### G-fx — `svc-trade`

- **PTX:** `PTX-M27-R03`–`R08`.
- **Target:** Spot FX / stable convert / derivative FX are separate products. Holiday/rail outage: deterministic degrade. New adjacent products go through M02.

### G-agentic — `svc-identity` / trade

- **PTX:** `PTX-M28-R01`–`R10` `PTX-M28-R12`.
- **Child:** PX-S16.
- **Target:** Modes visually distinct (backend: grant object). Model text cannot override ownership/margin/balance. High-consequence actions use structured preview. Untrusted content isolated. Installation of a tool **never** implies trading authority. Withdrawal not on agent credential unless separately approved (OWNER).

### G-statements-happy (was D10) — `svc-ledger`

- **PTX:** `PTX-M14-R05`.
- **Target:** When lots **exist**, statements reproduce. Plus existing missing-lot refuse.

---

## OMS mill census (A18 input)

Counted on `origin/main` `34e28e33`: **187** `services/svc-execution/src/oms-*.ts` excluding tests. **81** name `paper`. Families (prefix after stripping `paper-`):

| Family                                                   | Approx files | Default disposition                                    |
| -------------------------------------------------------- | -----------: | ------------------------------------------------------ |
| twap / vwap / pov / is                                   |      13 each | LIVE suspected via `oms-slice.ts`; rest EXTRA or PAPER |
| scale                                                    |           12 | PAPER vs hitch                                         |
| stop / bracket                                           |            7 | conditional                                            |
| trailing / sniper / pegged / oco / iceberg / market      |       6 each | PAPER unless importer found                            |
| tca / mmp / kill / account                               |            3 | hitch or extra                                         |
| claim / assign / shift / pass / manual-fill / basket / … |          1–2 | M25 care desk                                          |

**Rule:** `git grep` the symbol from the module’s export against `origin/main` routers. No importer → UNIT_ONLY or PAPER. Do not delete in this campaign unless the file is a lie that can mint money.

---

## Personas — leave-without vs this campaign

| Persona                   | Leave-without                                   | Covered by                        |
| ------------------------- | ----------------------------------------------- | --------------------------------- |
| Systematic                | idempotency, replay, bulk, timestamps           | A5/A6, D-bulk, C1, G-developer    |
| Market maker              | mass quote, MMP, COD, STP, queue, fee certainty | E3, D-cod, A1, C5, B1             |
| Options desk              | chain, greeks, combos, RFQ, exercise, delta     | Wave E                            |
| Basis desk                | dated futures, spreads, funding, offsets        | F3, F6, F7, D combo later         |
| Fund                      | orgs, statements, approvals, custody choice     | A19, G-reporting, G-custody OWNER |
| Broker/DMA                | FIX, drop-copy, tags, allocations               | A5, C1–C3, DMA ON_MAIN, G-rfq     |
| Agency desk               | claim/shift/TCA                                 | A14–A16                           |
| Agentic                   | modes, preview, revoke                          | G-agentic                         |
| Risk operator             | kill, surveillance, rulebook                    | A15, A1, A7, G-surveillance       |
| Discretionary trader (UI) | M07                                             | **Codex — out**                   |

If a persona row has no card, that is a bug in this file — add a G-card, do not ignore.

---

## Impact / compute (how not to waste the bot)

1. **Wave 0 first** (#3703, #3702). Highest money-integrity, already written.
2. **A18 census** early on the execution lane so A9–A17 are not archaeology.
3. **One family per execution PR**, not 187 PRs.
4. **Refuse-on-live-path** for DEPTH where owner sockets are blank — cheaper and honest.
5. **Do not** recook child specs or north-star mountains.
6. **Do not** open frontend PRs.
7. **Do not** “implement portfolio margin” without scenarios — that is how venues die.

---

## Out of cards (explicit)

M07 all. §8 magnitudes. KYB shop. Insurance entity. Public cert ops. Dependabot. Aeron/Artio/ORE-now. Second SPA. CCXT. Invented uncrossing, invented MMP numbers, invented copy jurisdictions.
