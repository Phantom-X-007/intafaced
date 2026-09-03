# SPEC — Harden grokbot landings + finish remainder (backend)

**Status:** Child of [`PRO_TRADER_EXCHANGE_DEFINITIVE_SCOPE.md`](../PRO_TRADER_EXCHANGE_DEFINITIVE_SCOPE.md) **v1.24**  
**Date:** 3 September 2026  
**Audience:** Grok bot + 3 builders. Nitro does not brief you and does not decide engineering.  
**Tip this stamp:** `origin/main` `91c9f2eef`. Re-fetch every card. Door checkout is diverged — ignore it.  
**Frontend:** Codex owns `05_Web_Front` and all M07 (including charts). Not this campaign.

This is **not** a second north-star. Mountains stay M00–M28.

v1.23 constitution/cards/inventory live on open PR **#3708** (`origin/feat/docs-live-depth-v123-20260902`). Merge that PR (H0). Until then, `git show` those three files from that branch.

---

## 0. Why this wave exists

Grokbot merged **~56 IN PRs**. Independent falsify on tip:

| Of 15 headline “landed” cards              |                                                                                                                     Count |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------: |
| Truly LIVE product door                    |                                                         **2** (convert 10/200 refuse; combo POST can rest one instrument) |
| UNIT / hitch / refuse theater / skip-green |                                                                                                                    **12** |
| LIE vs fleet                               | **1** (FIX “live acceptor” — Java exists, **compose still has no svc-fix**, Maven mainClass still stdin `FixAdapterMain`) |

**Spend tokens proving doors, not adding more GET-exists refuses.**

---

## 1. What “done” means here

1. A claimed session/feed/job **runs in compose or a named process**, not only JUnit.
2. Money paths **fail red without Postgres**. Skip-green is a fail.
3. Depth is native (L3 from matching queue) or **named refuse** — never L2 labeled L3.
4. Owner magnitudes stay blank-refuse. Agents **do not invent bps** and **do not ping Nitro**.

---

## 2. No Nitro blockers (how agents decide)

Nitro is out of the engineering loop. That is **not** permission to fill §8 live numbers.

| Class                | Agent does                                                                              | Never                                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **AGENT-NOW**        | Hitch, compose, tests, OSS pin SHA, refuse codes, merge when Gitleaks green, typed ADRs | Wait for Nitro                                                                                                                             |
| **REFUSE-KEEP**      | Keep blank env → named refuse                                                           | Invent fees, MMP sizes, haircuts, jurisdictions, legal entity, insurance, CompID→real customer, rulebook version string, settlement fixing |
| **OPS-NOT-SOFTWARE** | Refuse fake “certified / liquid / insured / best-ex”                                    | KYB shop, hire makers, buy insurance, public cert program                                                                                  |
| **CODEX**            | Skip                                                                                    | Charts, TradingView, `05_Web_Front`                                                                                                        |

**Closed “decisions” (do not re-ask):**

- Charts / TradingView — not a backend gate. Codex.
- Fees / cooling / DMA law / ADL bps / MMP magnitudes / PM scenarios — **unset refuse**. That _is_ the decision until a later go-live.
- Copy jurisdictions — closed everywhere (counsel blank).
- Iceberg as a sold product — C03 unavailable; matching mill may exist; do not advertise.
- QFJ / SBE / QuantLib — already chosen. Hitch them.
- NATS stays. No Aeron swap.
- Dependency audit GHSA on trunk — if **this diff** did not add it and Gitleaks green, merge `--admin`. If GitHub still blocks, leave a comment and continue the next card on a new branch. Do not stop the mill.

Test CompID / ports / symbols are **fixtures**, not owner policy.

---

## 3. OSS (unchanged)

Take: QuickFIX/J **3.0.2**, Real Logic SBE **1.39.0**, QuantLib **1.43**, WebAuthn, `zod-to-openapi@7.3.4`.  
Keep: matching, ledger-client, Fastify, Zod 3, NATS.  
Never: CCXT, npm CLOB, second book, hand-rolled FIX, JS Black-Scholes as QuantLib, IEEE money on the wire.  
Defer: ORE, Aeron, Artio.

**Compose lies still on tip (strip in the owning service PR):**

- `TRADE_MM_SEED_HALF_SPREAD_BPS:-10`
- `TRADE_MM_SEED_STEP_BPS:-10`
- `DEX_INTERNAL_BOOK_FEE_BPS:-20`

Convert 10/200 **are gone** (`env.ts` + compose empty). Do not redo A2.

---

## 4. Wave H — harden (do this first)

One service per PR. Proof in the PR body.

### H0 — land parked PRs

| PR                                                            | Work                                         |
| ------------------------------------------------------------- | -------------------------------------------- |
| [#3708](https://github.com/Phantom-X-007/intafaced/pull/3708) | v1.23 spec files onto main                   |
| [#3771](https://github.com/Phantom-X-007/intafaced/pull/3771) | E4 options RFQ refuse unset principal/agency |
| [#3772](https://github.com/Phantom-X-007/intafaced/pull/3772) | A19 four-eyes / attribution                  |

Gitleaks green → merge. Do not rewrite them unless the diff is wrong.

### H1 — FIX fleet (Bob / `svc-fix`)

**Current:** `FixAcceptor` + drop-copy Java + NOS `HttpClient.POST` exist. Tests loopback. **No** `svc-fix` in `docker-compose.apps.yml`. Image does not COPY `services/svc-fix`. `pom.xml` exec mainClass is still `FixAdapterMain` (stdin).

**Target:**

1. Compose (or documented process) runs `FixAcceptorMain`, not stdin CLI.
2. `MATCHING_BASE_URL` + test CompID JSON (fixture) + TIF. Unmapped CompID refuses before POST.
3. One integration: QFJ client logon → NOS → matching 200/refuse → ExecutionReport. No ledger in svc-fix.
4. Drop-copy second session: included sources listed; `claimComplete()` stays refuse until those sources actually publish.

### H2 — L3 is a door (Tom / `svc-matching` then Bob / `svc-ws`)

**Current:** `engine.l3Queue()` unit-only. HTTP `/depth` is L2. WS `depth.l3_unavailable`.

**Target:** GET/WS L3 projected from matching native queue. Never synthesize from L2. Two PRs if two services.

### H3 — SBE is Real Logic in the image (Bob / `svc-ws`)

**Current:** `svc-ws` depends on `sbe-codec`. Tests stub Java (`payloadB64` utf8 marker). Compose has no `INTAFACED_SBE_JAVA`. Unlinked → `depth.sbe_unavailable`.

**Target:** Pin Java SBE in the image. One test proves schema-id’d SBE octets, not a stub.

### H4 — combo actually trades (Tom / matching, then Ken / trade)

**Current:** POST `/orders` can rest a complete combo as one instrument. Incomplete still refuses.

**Target:** Match/unwind as one book. Trade hold/fill recipes on legs via ledger-client. Decimal strings. No silent two-option rest.

### H5 — mass quote HTTP (Tom / `svc-matching`)

**Current:** `massQuote()` not on router. Zod body has no `mmp*`. Magnitudes hardcoded unset.

**Target:** POST mass-quote. Paired-side reject. MMP fields accepted but **blank magnitudes refuse** (do not invent 0).

### H6 — dated settlement JobHost (Ken / `svc-trade`)

**Current:** Job function posts in hermetic test. `futures-jobs.ts` does not call it. Router not recut. Listing still refuses blank fixing (keep).

**Target:** JobHost/cron calls the job. Blank fixing refuses the job. One Postgres money run. Never last-trade.

### H7 — QuantLib on a live mark path (package PR, then `svc-trade`)

**Current:** `greeks-adapter` has no service consumer. `svc-quant` does not depend.

**Target:** One service calls adapter. Blank `INTAFACED_QUANTLIB_NATIVE` → unlink refuse. Linked → decimal strings, no IEEE on wire. Two PRs.

### H8 — money proof hard (Ken / trade, bank, matching)

| ID  | Work                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------ |
| H8a | Fee unpublished refuse **with Testcontainers/per-branch PG**. Delete or register `describe.skip`. Red without DB = fail. |
| H8b | Offramp cooling refuse before hold — PG. Elapsed wait is **not** required until owner hours exist.                       |
| H8c | Matching 200 then trade death: hold stays; no invented settle.                                                           |
| H8d | `pnpm scan:dual-book-door` on every money PR.                                                                            |
| H8e | IFM crash window over HTTP, not only FileJournal vitest.                                                                 |

### H9 — surveillance persist for real (Tom / matching)

**Current:** in-memory `Map`. Detectors always `detector_gap`. Not journalled.

**Target:** Journal or DB. HTTP list open cases. Spoof/layer **refuse auto-adjudicate**. Owner thresholds blank → `detector_gap` (keep). No fines.

### H10 — basket children hit matching (serial / `svc-execution`)

**Current:** POST `/execution/oms/start-basket` exists. tRPC `startBasket` absent. Happy path no matching.

**Target:** Children POST matching. Kill-parent unknown ≠ killed. Paper OMS still must not ledger.

### H11 — strip leftover invented compose bps

Owning service only: MM seed ±10, DEX internal 20. Blank refuses. Same pattern as A2.

---

## 5. Wave R — remainder (after H0–H3 started)

Do not start R money-moving until H1 matching POST and H8a exist **or** the PR names the residual.

| ID         | Service        | Work                                                                                    |
| ---------- | -------------- | --------------------------------------------------------------------------------------- |
| R-A7       | matching       | Compose **pass-through** `MATCHING_RULEBOOK_VERSION` empty. Do not invent a version.    |
| R-E5       | trade          | Exercise/assignment jobs idempotent; blank fixing refuse; ledger recipes.               |
| R-E6       | trade          | Auto delta-hedge: unset target **refuse**. Do not start from `oms-mmp-hedge.ts`.        |
| R-E7       | trade          | Position builder / what-if: **no money posts**. Missing greeks → refuse numbers.        |
| R-E8       | trade          | Options listing stays closed without settlement asset/fixing (keep SOCKET).             |
| R-copy     | trade          | Follow creation closed all regions. Leader ≠ follower money.                            |
| R-agentic  | identity/trade | Keep money denylist. Model cannot override ownership. Tool install ≠ trading authority. |
| R-fx       | trade          | FX products separate; holiday/rail degrade named. No invented pip law.                  |
| R-quant    | trade          | Paper/shadow cannot ledger. Live deploy refuse without eligibility socket.              |
| R-security | identity       | Dual-control privileged; “insured” refuse.                                              |
| R-onboard  | identity       | Limit/fee-tier change dual-control or refuse.                                           |
| R-promo    | trade          | Promotion without budget/end refuse.                                                    |

G-cards already on main as refuse: do not redo (rulebook emergency, liquidity source, statements, custody, finance, resilience, developer OpenAPI, funding recon, haircuts, hedge mode, PM refuse, ADL, credit, COD, halt, bulk, TIF, iceberg/peg OMS refuses).

---

## 6. Three builders

| Builder | Lane                               | Order                                             |
| ------- | ---------------------------------- | ------------------------------------------------- |
| Bob     | `svc-fix` then `svc-ws` / packages | H0 if free → H1 → H3 → H2-ws                      |
| Tom     | `svc-matching`                     | H2-matching → H4 matching → H5 → H9 → R-A7        |
| Ken     | `svc-trade`                        | H0 #3771 → H6 → H8 → H4 trade → H7 trade → Wave R |

`svc-execution` H10 **serial**. `svc-identity` #3772 then R-security. `svc-bank` H8b. `svc-ledger` only if a money proof needs it — do not recut statements.

`pnpm wt feat/…`. Never `git worktree add`. Never push `main`. Never door. One service per PR. Comment [#3446](https://github.com/Phantom-X-007/intafaced/issues/3446).

---

## 7. Waste (do not spend tokens)

- Another unpublished-GET refuse that already exists
- Recooking M00–M28 / docs mill / LIVE-LANES
- Frontend / TradingView / second SPA
- Invented bps, fake cert, fake L3 from L2
- Dual POV / second combo book
- Waiting on Nitro, CI green, FREEZE
- Claiming PROVEN / certified / liquid

---

## 8. Card template (copy into every PR)

```
CARD: H# or R-*
PTX: …
Service: services/<one>
Claim on main today: LIVE | UNIT | REFUSE | LIE vs fleet
Target door: HTTP | tRPC | NATS | FIX process | JobHost
Compose/process change: Y/N
Money: ledger-client? PG required?
Owner sockets I will not fill:
Proof: test name that fails without the door
OSS: keep | EXT lib@sha
```

If the live door is missing, the card is not done.
