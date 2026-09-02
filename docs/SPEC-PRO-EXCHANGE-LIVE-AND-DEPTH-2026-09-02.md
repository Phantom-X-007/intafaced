# SPEC — Live-wire, money proof, and mountain depth (backend)

**Status:** Child contract of [`PRO_TRADER_EXCHANGE_DEFINITIVE_SCOPE.md`](../PRO_TRADER_EXCHANGE_DEFINITIVE_SCOPE.md) **v1.23**  
**Date:** 2 September 2026  
**Audience:** Grok bot + 3 parallel builders. Nitro does not brief you.  
**Scope:** Backend only. Codex owns `vendor/upstream-exchange/05_Web_Front` (all **M07**).  
**This is not a second north-star.** Mountains stay M00–M28. This file is the **implementation campaign**.

**Companions (read in this order):**

1. This file — constitution, OSS, waves, DAG, closed uncertainties.
2. [`SPEC-PRO-EXCHANGE-BUILDER-CARDS-2026-09-02.md`](SPEC-PRO-EXCHANGE-BUILDER-CARDS-2026-09-02.md) — executable cards (A/B/C/D/E…), OMS mill census, persona coverage.
3. [`SPEC-PRO-EXCHANGE-RITEM-INVENTORY-2026-09-02.md`](SPEC-PRO-EXCHANGE-RITEM-INVENTORY-2026-09-02.md) — **all 266** `PTX-Mxx-Ryy` named. No silent drop.

Issue home: [#3446](https://github.com/Phantom-X-007/intafaced/issues/3446).

---

## 0. Why v1.22 was not enough

v1.22 was 158 lines and named **32 of 266** requirements. Independent re-audit against `origin/main` `34e28e33` (Grok door checkout is **diverged** — never audit it):

| Finding                                                                    |                                       Number |
| -------------------------------------------------------------------------- | -------------------------------------------: |
| Unique north-star R-items                                                  | **266** (255 in §13.2 census + 11 later IDs) |
| v1.22 A/B/D named                                                          |                                       **33** |
| v1.22 silently dropped                                                     |                                      **233** |
| DEPTH / OWNER / ON_MAIN / FRONTEND / OPS / HITCH / MONEY_PROOF / DEFER_OSS |      **153 / 43 / 20 / 18 / 15 / 8 / 8 / 1** |
| Builder-product GAP (HITCH+MONEY+DEPTH)                                    |      **169** grouped into waves, not 169 PRs |
| `svc-execution` `oms-*.ts` (not tests)                                     |                     **187** (81 paper-named) |

v1.22 also missed **drop-copy** (`PTX-M05-R03`), **native amend priority** (`PTX-M03-R03`), **cancel-on-disconnect** (`PTX-M03-R04`), **auctions** (`PTX-M03-R05`), **MMP / mass quote** (`PTX-M11-R05/R11/R12`), **options RFQ** (`PTX-M11-R06`), **exercise/assignment jobs** (`PTX-M11-R08`), **care-desk OMS** (M25), and the **compose defaults `10` / `200` bps** still on `origin/main`.

North-star §7.3 still holds: **do not convert every gap into a ticket.** Every R-item has a **disposition**. Only hitch / money-proof / depth cards are builder-now.

---

## 1. What “done” means (unchanged, now enforced)

A professional venue is **not** “a refuse module exists” and is **not** “the leftover mill closed.” It is:

1. The live path actually calls the door (**hitch**). Unit-only is a lie.
2. Money cannot move on an invented rate, fill, or book (**proof** with real Postgres).
3. Depth a primary venue needs is real behavior **or** a **named** refuse on the live path — never a silent weaken.

**Stop inventing owner numbers.** Fees, cooling hours, DMA law, portfolio scenarios, MMP magnitudes, haircuts, rulebook version, ADL `maxReduceBps`, CompID maps, settlement fixings stay `OWNER-SET`. Blank refuses.

**Stop vibe-coding codecs.** FIX / SBE / Greeks use north-star §0.3. Matching, money, MMP stay in-repo.

**Stop dual-implementing.** If generic `oms-slice.ts` already covers POV, do not ship a second POV engine. Document the extra files in the PR body.

---

## 2. Unspoken needs (inferred, now binding)

These are what Nitro will leave over if the bot only “finishes leftover queue”:

| Unspoken                       | Consequence for builders                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Leftover mill ≠ venue          | Hitch then depth. Do not declare the exchange done when A/B close.                                              |
| He cannot read code            | Every card has a **proof a human can check**: refuse code string, HTTP path, or test name.                      |
| He will not answer questions   | Closed sockets. If blocked, ship typed refuse. Never ping for bps.                                              |
| 3 builders, one service per PR | Lanes below. Collision = STOP.                                                                                  |
| Codex owns the desk UI         | **M07 is out.** Backend may still expose the contracts the desk needs (M05/M06/M25).                            |
| OSS-first                      | QFJ / Real Logic SBE / QuantLib. Never CCXT, npm CLOB, second book, JS Black-Scholes labeled QuantLib.          |
| Impact / compute               | Waves, not 184 PRs of refuse theater. One PR can hitch a **family** of OMS files in `svc-execution`.            |
| Door is diverged               | `git fetch`; `origin/main` only.                                                                                |
| Merge when done                | Gitleaks green. Dependency audit may be trunk-wide GHSA — `--admin` only if **this diff** did not add the GHSA. |
| Personas who leave             | Market maker, options desk, broker/DMA, fund, systematic — see builder-cards §personas.                         |

---

## 3. Landscape (OSS) — 2026-09-02 pass (still current)

Re-checked against public stack. Does **not** replace §0.3.

| Job                                       | Take (pin SHA)                                                             | Keep                                       | Never                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Match / IFM / STP / combo book / L3 / MMP | —                                                                          | `svc-matching`                             | OpenDAX, Hummingbot-as-venue, npm CLOB, Java `exchange-core`, Calvera/IronFix **as the book** |
| Money                                     | —                                                                          | `ledger-client` + `svc-ledger`             | Formance, TigerBeetle, Hyperswitch, CCXT, decimal.js on the wire                              |
| FIX session + drop-copy                   | **QuickFIX/J 3.0.2** already in `services/svc-fix`                         | fills → matching → ledger                  | `node-quickfix`, AGPL jPOS, hand-rolled FIX, FalconFIX (not a mature public engine)           |
| SBE codec + **feed**                      | **Real Logic SBE 1.39.0** already in `packages/sbe-codec`                  | our schema; publish via `svc-ws` / MD path | Protobuf-as-SBE; IronSBE swap; Aeron bus replace (NATS stays)                                 |
| Greeks / calendars                        | **QuantLib 1.43** already in `packages/greeks-adapter`                     | live mark + ledger clock ours              | QuantLib-Python hot path; JS Black-Scholes labeled QuantLib; IEEE NPV on the wire             |
| Portfolio **scenario** math (later)       | **Open Source Risk Engine (ORE)** — QuantLib-based, when PM mountain is on | IM/MM still our ledger                     | ORE as money book; vibe-coded VaR                                                             |
| Tests                                     | Testcontainers-node **or** per-branch Postgres                             | law: no shared `intafaced_test`            | Skipping the money path and calling it green                                                  |
| WebAuthn / OpenAPI / FIX XML              | as §0.3                                                                    | —                                          | Zod 4 silent upgrade                                                                          |

**Defer (good, wrong now):** Aeron (NATS is the bus); Artio (Aeron-coupled; first FIX door is QFJ); ClickHouse/Kafka warehouse; ORE until isolated IM + owner scenarios exist.

**Compose lie on `origin/main` (must die in A2):**

```
docker-compose.apps.yml
  TRADE_MARKET_SLIPPAGE_CAP_BPS: ${TRADE_MARKET_SLIPPAGE_CAP_BPS:-200}
  TRADE_CONVERT_SPREAD_BPS: ${TRADE_CONVERT_SPREAD_BPS:-10}
```

Those defaults **are invented owner numbers**. #3703 must strip them. Blank stays blank.

---

## 4. Waves (DAG)

Do not start a later wave’s **money-moving** cards until earlier gates say so. Refuse-closed cards may land anytime.

```
Wave 0  open PRs #3703 (Ken/trade) + #3702 (Tom/matching)
   │
Wave A  hitch — live path calls the mill (incl. 187 OMS modules, FIX identity, compose)
   │
Wave B  money proof — Testcontainers / per-branch Postgres (B1–B8)
   │
   ├─ Wave C  professional access: FIX session, drop-copy, SBE feed, native L3
   ├─ Wave D  matching depth: native amend, COD/kill, auctions refuse, halt≡cancel-only
   ├─ Wave E  options/vol: QuantLib link-or-refuse, combo book, MMP refuse, exercise jobs
   ├─ Wave F  risk/default: PM refuse, dated settlement job, ADL unconfigured, credit refuse
   └─ Wave G  integrity + OMS care + remaining mountains as live-path refuse
```

**Gate:** Wave C+ money-moving (combo **book**, settlement **job** that posts, MMP that rests) waits until A1–A2 on `main` and B1 has a live DB proof **or** the PR names the residual.

**Parallelism:** Ken `svc-trade` · Tom `svc-matching` · Bob `svc-fix`+packages. `svc-execution` hitch is **serial** when a lane is free (do not fourth-writer collide). `svc-ledger` / `svc-bank` / `svc-identity` / `svc-ws` take a free lane; never two PRs in the same `services/*`.

---

## 5. Already on `origin/main` (do not redo)

Prove with `git show origin/main:path` if someone claims otherwise.

| Thing                                    | Evidence (tip)                                                            | Residual                                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| IFM in engine                            | matching engine journal flag                                              | B3 crash/replay proof                                                                                              |
| Fee schedule on placeOrder + preview     | `svc-trade` `spot/fee-schedule.ts`                                        | B1 unpublished refuse before `withdrawHold`; schedule still OWNER-SET                                              |
| Bank cooling refuse                      | `svc-bank` `offramp-cooling.ts`                                           | B2 blank hours                                                                                                     |
| Dated-futures **listing** refuse         | `svc-trade` `futures/dated-futures.ts`                                    | D7 **settlement job** still missing                                                                                |
| Margin-mode 2×2 names                    | `futures/margin-mode.ts`                                                  | Isolated live; PM remains refuse (D6)                                                                              |
| Combo **refuse**                         | matching `option.ts` / comboIntentRefuse                                  | Keep until combo **book** (E)                                                                                      |
| DMA refuse                               | identity `createDmaHierarchyProduct`                                      | OWNER JSON blank                                                                                                   |
| Rulebook GET                             | matching `rulebook.ts`                                                    | A7 compose pin without inventing version                                                                           |
| Statement PnL refuse                     | ledger `statement-pnl`                                                    | D10 happy path when lots exist; never `0`                                                                          |
| ADL disclosure + unconfigured            | `futures/adl-disclosure.ts`                                               | Do not invent ranking / `maxReduceBps`                                                                             |
| Generic OMS slice `kind` twap\|vwap\|pov | `oms-slice.ts`                                                            | **LIVE.** `oms-stop` / `oms-expire` / `oms-release-residual` also LIVE. `oms-pov-slice` + basket remain UNIT_ONLY. |
| QFJ **adapt CLI**                        | `FixAdapterMain` stdin→JSON                                               | **Not a session.** No compose `svc-fix`. C1 is real work.                                                          |
| SBE codec + QuantLib adapter             | packages                                                                  | **ORPHAN vs services** — no consumer `package.json`                                                                |
| Matching book mill                       | iceberg/peg/AON/auction/collar/STP expire + OCO/bracket via trailing-stop | Do not dual-implement in execution paper files. C03 iceberg still unavailable as a **sold** product.               |
| Convert/slippage **defaults 10/200**     | `env.ts` `.default(10/200)` **and** compose `:-10` / `:-200`              | **#3703 must kill both**                                                                                           |

Open PRs (as of this stamp): **#3703** trade refuse, **#3702** STP surveillance hitch. Dependabot #3707 is not this campaign.

---

## 6. Owner / ops (not builder invent)

| Knob                                                         | When Nitro sets it               | Until then                                            |
| ------------------------------------------------------------ | -------------------------------- | ----------------------------------------------------- |
| `TRADE_FEE_SCHEDULE`                                         | Before a live fill               | `trade.fee_schedule_blank`                            |
| `BANK_OFFRAMP_COOLING_HOURS`                                 | Before a live offramp            | `bank.offramp_cooling_unset`                          |
| `MATCHING_RULEBOOK_VERSION`                                  | Before best-ex / certified claim | unpublished                                           |
| `IDENTITY_DMA_HIERARCHY_LAW_JSON`                            | First broker client              | DMA refuse                                            |
| `TRADE_FUTURES_SETTLEMENT_FIXING`                            | First dated listing that settles | dated refuse                                          |
| ADL `maxReduceBps`                                           | Liquidation desk exists          | `trade.adl_unconfigured`                              |
| CompID→account JSON                                          | First FIX customer               | `matching_account_unmapped`                           |
| `INTAFACED_QUANTLIB_NATIVE`                                  | Selling options Greeks           | adapter unlink refuse                                 |
| `TRADE_CONVERT_SPREAD_BPS` / `TRADE_MARKET_SLIPPAGE_CAP_BPS` | Convert / market-buy live        | refuse — **no default 10/200**                        |
| MMP quantity/delta/vega/interval/freeze                      | Options MM desk                  | MMP unset-refuse                                      |
| Portfolio scenario set                                       | PM product                       | `trade.portfolio_margin_unset`                        |
| Off-book RFQ leverage cap                                    | RFQ live                         | blank cap refuses; does **not** inherit book schedule |
| Copy jurisdictions                                           | Counsel list                     | follow creation closed everywhere                     |
| SLOs / RTO / RPO                                             | Ops                              | measure raw; do not invent targets                    |
| Haircuts / insurance legal entity / KYB shop                 | Legal/ops                        | refuse the dependent product                          |

§8 of the north-star is the full socket list. Child specs name typed projections. **Do not fill examples.**

---

## 7. How three builders work

Grok bot dispatches. **One service per PR.** `pnpm wt feat/…`. Never `git worktree add`. Never push `main`. Never the Grok door. Never `05_Web_Front`.

| Builder | Lane                 | First cards                                                                                          |
| ------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| Ken     | `svc-trade`          | A2 (#3703, **strip compose defaults**) → B1 → F (D6/D7/D8)                                           |
| Tom     | `svc-matching`       | A1 (#3702) → A7 → A8 → Wave D → Wave E combo/MMP refuse                                              |
| Bob     | `svc-fix` + packages | A5 → A6 → Wave C (session, drop-copy, SBE). QuantLib package PR is **not** the same PR as `svc-fix`. |

When Ken/Tom/Bob free: **execution hitch Wave A9–A18** (one family per PR), then `svc-ledger` B5/D10, `svc-bank` B2, `svc-ws` SBE feed (not same PR as matching), `svc-identity` four-eyes/attribution.

PR names: `IN <svc>` or `EXT <lib>@<sha> adapter-only`. Money: ledger-client, decimal strings, never JS `number`. Comment #3446 when one lands.

If already on `origin/main`, STOP that card.

---

## 8. Hallucination guards

- Re-fetch `origin/main` every card. Do not audit the Grok **door**.
- `graphify query` then one file.
- After `services/` / `packages/` edits: `GRAPHIFY_MAX_WORKERS=1 graphify update .` — do not commit `graphify-out` in a product PR.
- Do not read Phase A “FIX not found” as a ban on QuickFIX/J.
- Do not use `SPEC-FACTORY-INDEX-2026-08-04.md` as this campaign’s index.
- Tests that skip Postgres are **not** B-green.
- Child specs `PX-S01`–`PX-S16` are the product contract. This campaign does not rewrite them.
- A mill `oms-*.ts` with only a `*.test.ts` sibling is UNIT_ONLY until a router/engine import is shown.
- Do not treat north-star §13 `BUILT` / `PARTIAL` as live-path proof. Re-read the importer.

---

## 9. Out of campaign

Frontend / Codex / M07. New SPA. Second money book. Invented bps/hours. Recooking M00–M28 as a new mountain list. Aeron-for-NATS. CCXT. Public marketing site. KYB shop. Insurance legal entity. Filling §8 sockets. Dependabot GHSA as “the work.”

---

## 10. Closed uncertainties

| Maybe                                             | Closed as                                                                                                                         |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Is leftover mill the remaining work?              | **No.** First slice only.                                                                                                         |
| Is a refuse module “shipped”?                     | **No.** Hitch or document extra.                                                                                                  |
| Can builders invent 10/200 until Nitro sets fees? | **No.** Compose defaults are a bug.                                                                                               |
| FalconFIX / Calvera / IronFix as book?            | **Never.**                                                                                                                        |
| ORE now?                                          | **Defer** until PM scenarios are an owner product. Isolated IM stays.                                                             |
| Artio / Aeron now?                                | **Defer.** QFJ first. NATS stays.                                                                                                 |
| Zod 4?                                            | **No** in the same PR as OpenAPI. Pin `zod-to-openapi@7.3.4`.                                                                     |
| M07 in this bot?                                  | **No.** Codex.                                                                                                                    |
| Drop-copy in v1.22?                               | **Missed.** Now Wave C card C3.                                                                                                   |
| Native amend / COD / auctions?                    | **Missed.** Wave D.                                                                                                               |
| 187 OMS files?                                    | **Missed.** Wave A9–A18 census.                                                                                                   |
| Combo book vs refuse?                             | Keep refuse until E book card. Do not silently rest two options.                                                                  |
| L3 from L2?                                       | **Never.** Native matching queue or refuse.                                                                                       |
| #3702/#3703 blocked by Dependency audit?          | If GHSA is trunk-identical and Gitleaks green, `--admin` is the historical mill path. If **this** diff adds a GHSA, fix the scan. |
| Shared `intafaced_test`?                          | **Never.**                                                                                                                        |
| Paper OMS vs live OMS?                            | Paper must not move ledger. Live must hitch or stay named extra.                                                                  |
| Best-execution / insured / certified claims?      | Refuse without `MATCHING_RULEBOOK_VERSION` + owner evidence.                                                                      |
| Copy / agentic money?                             | Ordinary account checks. Leader/agent never authority over follower/user money. Jurisdictions blank → closed.                     |
| Permissionless HIP-3 listings?                    | Not implied. Separate consented product or refuse (`PTX-M02-R08`).                                                                |

No remaining “we’ll see.” Anything not builder-now is OWNER, OPS, FRONTEND, DEFER_OSS, or ON_MAIN.

---

## 11. Child-spec map (do not rewrite)

| Child  | File                                                                            | Mountains     | Campaign waves                                   |
| ------ | ------------------------------------------------------------------------------- | ------------- | ------------------------------------------------ |
| PX-S01 | `SPEC-PRO-EXCHANGE-RULEBOOK-LIFECYCLE-INTEGRITY-2026-08-23.md`                  | M00, M02, M16 | A7, D9, G                                        |
| PX-S02 | `SPEC-PRO-EXCHANGE-AUTHORITY-AND-PARTICIPANT-SECURITY-2026-08-23.md`            | M01, M17      | DMA on main; four-eyes/attribution G             |
| PX-S03 | `SPEC-PRO-EXCHANGE-MICROSTRUCTURE-AND-ORDER-EXECUTION-2026-08-24.md`            | M03, M04      | A, D                                             |
| PX-S04 | `SPEC-PRO-EXCHANGE-CONNECTIVITY-DATA-AND-CERTIFICATION-2026-08-24.md`           | M05, M06, M19 | C                                                |
| PX-S05 | `SPEC-PRO-EXCHANGE-TERMINAL-OMS-AND-TCA-2026-08-24.md`                          | M07, M25      | M07 Codex; M25 A9–A18                            |
| PX-S06 | `SPEC-PRO-EXCHANGE-COLLATERAL-RISK-LIQUIDATION-DEFAULT-2026-08-24.md`           | M08, M09      | F                                                |
| PX-S07 | `SPEC-PRO-EXCHANGE-LINEAR-PRODUCTS-CONVERT-AND-FX-2026-08-24.md`                | M10, M27      | A2, D7                                           |
| PX-S08 | `SPEC-PRO-EXCHANGE-OPTIONS-AND-VOLATILITY-2026-08-24.md`                        | M11           | E                                                |
| PX-S09 | `SPEC-PRO-EXCHANGE-RFQ-BLOCK-OTC-AND-ALLOCATION-2026-08-24.md`                  | M12           | G refuse until principal/agency owner            |
| PX-S10 | `SPEC-PRO-EXCHANGE-LIQUIDITY-FEES-AND-MAKER-CONSTITUTION-2026-08-24.md`         | M13, M21      | B1; maker program OWNER                          |
| PX-S11 | `SPEC-PRO-EXCHANGE-PORTFOLIO-INSTITUTIONAL-REPORTING-AND-SERVICE-2026-08-24.md` | M14, M20      | B5, D10; KYB OPS                                 |
| PX-S12 | `SPEC-PRO-EXCHANGE-CUSTODY-RECONCILIATION-AND-WIND-DOWN-2026-08-24.md`          | M15, M23      | B6; custody models OWNER                         |
| PX-S13 | `SPEC-PRO-EXCHANGE-RESILIENCE-AND-INCIDENT-COMMAND-2026-08-24.md`               | M18           | OPS + refuse split-brain money                   |
| PX-S14 | `SPEC-PRO-EXCHANGE-MULTI-VENUE-AND-ONCHAIN-EXECUTION-2026-08-24.md`             | M22           | adapters ON_MAIN; SOR/best-ex refuse fake claims |
| PX-S15 | `SPEC-PRO-EXCHANGE-QUANT-AND-DELEGATED-STRATEGY-LIFECYCLE-2026-08-24.md`        | M24, M26      | G refuse live deploy / copy jurisdictions        |
| PX-S16 | `SPEC-PRO-EXCHANGE-AGENTIC-TRADING-AUTHORITY-AND-SAFETY-2026-08-24.md`          | M28           | G: model cannot override deterministic money     |

---

## 12. Card ID index (full)

See builder-cards file for the actual work. IDs here so the bot can grep.

| ID     | Wave | Service                    | One line                                                                                                                       |
| ------ | ---- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| A1     | 0/A  | matching                   | #3702 STP opens surveillance case on live book                                                                                 |
| A2     | 0/A  | trade                      | #3703 convert/slippage refuse; **strip compose 10/200**                                                                        |
| A3     | A    | execution                  | Basket hitch vs generic slice                                                                                                  |
| A4     | A    | execution                  | POV hitch vs `oms-slice` `kind:pov`                                                                                            |
| A5     | A    | fix                        | CompID→account + TIF on matching command                                                                                       |
| A6     | A    | fix                        | Strip matching ack passthrough                                                                                                 |
| A7     | A    | matching                   | Rulebook compose pin, no invented version                                                                                      |
| A8     | A    | matching                   | Keep combo refuse until E book                                                                                                 |
| A9–A18 | A    | execution                  | OMS mill families (see cards): iceberg, pegged, OCO/bracket, scale/IS, MMP, care/claim, kill/COD, TCA, trailing/sniper, census |
| B1–B8  | B    | trade/bank/matching/ledger | Money proof with real DB                                                                                                       |
| C1–C6  | C    | fix/ws/matching            | FIX session, NOS, drop-copy, SBE feed, L3 native, cert refuse                                                                  |
| D1–D8  | D    | matching                   | Native amend, COD, auctions refuse, halt, collars, journal, bulk, STP identity group                                           |
| E1–E10 | E    | matching/trade/greeks      | QuantLib, combo book, MMP, RFQ refuse, exercise, delta-hedge refuse, chain data                                                |
| F1–F8  | F    | trade                      | PM refuse, dated settlement job, ADL, credit refuse, hedge mode, funding recon                                                 |
| G1–G20 | G    | mixed                      | Live-path refuse for remaining DEPTH rows (RFQ caps, copy, agentic, custody, four-eyes, claims, statements happy path)         |

v1.22 `D1–D12` map into C/E/F above and **remain valid**. New work is everything else in this index.

---

## 13. Assurance (do not fake PROVEN)

North-star §18 stages apply. This campaign can take a card to `IMPLEMENTED` + `LOCALLY_VERIFIED`, and Wave B toward `INTEGRATED` / `RECONCILED`. It cannot claim `PROVEN`, `CUSTOMER_EVIDENCED`, or `EXTERNALLY_CERTIFIED` without owner/ops. Do not write those words in a PR.
