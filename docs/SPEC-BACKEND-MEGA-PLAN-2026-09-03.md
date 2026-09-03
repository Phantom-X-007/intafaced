# SPEC — Mega backend plan (everything except frontend)

**Status:** Execution contract for this chat after Nitro says **go**. Not a second north-star.  
**Date:** 3 September 2026  
**Tip this stamp:** `origin/main` `de0a9cb4b` (re-fetch every card). Grok door is diverged — ignore it.  
**Grokbot:** paused, will not be used. **This owner** ships backend. Codex owns all frontend.  
**Audience:** builders after **go**. Nitro does not brief and does not decide engineering.

Companions: v1.24 harden [`SPEC-PRO-EXCHANGE-HARDEN-AND-REMAINDER-2026-09-03.md`](SPEC-PRO-EXCHANGE-HARDEN-AND-REMAINDER-2026-09-03.md) on [#3777](https://github.com/Phantom-X-007/intafaced/pull/3777); v1.23 inventory on [#3708](https://github.com/Phantom-X-007/intafaced/pull/3708). Merge those in Wave 0.

---

## 0. What “mega” means here

Mega is **complete remaining non-frontend work**, not a longer refuse mill.

| Layer                      | In this plan                                                                                                                                                                   | Not this plan                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| **H — Harden**             | Prove grokbot claims that are unit/JUnit/skip-green (FIX compose, L3 door, SBE Java, PG money, combo match, JobHost, QuantLib consumer, surveillance journal, basket→matching) | Another GET-exists refuse                                    |
| **R — Exchange remainder** | Named leftover cards (RFQ, four-eyes, exercise jobs, copy/agentic/FX/quant refuses)                                                                                            | Recook M00–M28                                               |
| **Q — Other backend**      | Protocol, pay/bank rails, token, DEX invented bps, mining payout JobHost, edge, notify-dark, agents denylist                                                                   | Vue, charts, TradingView, `05_Web_Front`, `packages/ui`, M07 |
| **Human-only**             | Named and left refuse                                                                                                                                                          | Inventing fees/legal/lists                                   |

**Done after go (software):** every HARDEN card has a compose or HTTP/FIX/JobHost door; money tests red without Postgres; no invented compose bps; leftover products are live-path refuse.  
**Still not a live venue:** no makers, no licensed entity, no fee schedule — those stay closed on purpose.

---

## 1. Out of scope (Codex / other agent)

`vendor/upstream-exchange/05_Web_Front` · M07 · TradingView / advanced charts · `packages/ui` · Vue cmd-palette/tickets/layouts · frontend test PRs. If a card needs a UI, ship the **backend contract** only.

Shehzad protocol Solidity audit **firm pay** is OWNER. Merging engineering-ready `#3746` is AGENT-NOW (Wave Q).

---

## 2. Human-only (the only real Nitro blockers)

Blank env → named refuse. Never git-default a number. Never ping.

| #   | Plain                           | Env / socket                                               | Refuse                           |
| --- | ------------------------------- | ---------------------------------------------------------- | -------------------------------- |
| 1   | Who may be served (countries)   | counsel lists; copy `TRADE_COPY_JURISDICTION_LAW`          | follow closed; do not draft ISO  |
| 2   | Sanctions **list content**      | `INTAFACED_SANCTIONS_*`                                    | never author the list            |
| 3   | Licensed entity / “we’re legal” | Class X licence                                            | no public-money claim            |
| 4   | Fee table                       | `TRADE_FEE_SCHEDULE`                                       | `trade.fee_schedule_blank`       |
| 5   | Convert / slippage bps          | `TRADE_CONVERT_SPREAD_BPS` `TRADE_MARKET_SLIPPAGE_CAP_BPS` | unset refuse; **no 10/200**      |
| 6   | Offramp wait hours              | `BANK_OFFRAMP_COOLING_HOURS`                               | `bank.offramp_cooling_unset`     |
| 7   | Rulebook version / “certified”  | `MATCHING_RULEBOOK_VERSION`                                | unpublished                      |
| 8   | FIX customer map                | `FIX_COMPID_ACCOUNT_JSON`                                  | `matching_account_unmapped`      |
| 9   | DMA tree                        | `IDENTITY_DMA_HIERARCHY_LAW_JSON`                          | DMA refuse                       |
| 10  | Options settlement asset/fixing | `TRADE_OPTIONS_SETTLEMENT_*`                               | listing/job refuse               |
| 11  | Dated futures fixing            | `TRADE_FUTURES_SETTLEMENT_FIXING`                          | listing/job refuse               |
| 12  | ADL size                        | `maxReduceBps`                                             | `trade.adl_unconfigured`         |
| 13  | Haircuts                        | `TRADE_COLLATERAL_HAIRCUT_BPS`                             | `trade.haircut_unset`            |
| 14  | MMP sizes                       | `EXECUTION_MM_MMP_THRESHOLDS`                              | unset-refuse                     |
| 15  | Portfolio-margin scenarios      | owner set                                                  | `trade.portfolio_margin_unset`   |
| 16  | QuantLib “we sell Greeks”       | `INTAFACED_QUANTLIB_NATIVE`                                | unlink refuse                    |
| 17  | Maker rebates / affiliate MM    | §8.9                                                       | unset program does not pay       |
| 18  | Insurance legal / “insured”     | §8.15                                                      | claim refuse                     |
| 19  | Custody partners / off-exchange | §8.11                                                      | product refuse                   |
| 20  | SLOs / RTO / compensation       | §8.13                                                      | measure raw; no invented targets |
| 21  | CompID real customers           | same as 8                                                  | fixtures in tests only           |
| 22  | Notify email/SMS/push creds     | Class X                                                    | in-app only                      |
| 23  | DEX partner venues              | `DEX_EXTERNAL_VENUES`                                      | `dex.quote.no_venue_available`   |
| 24  | Token emission/buyback numbers  | PKT-C9                                                     | unpublished                      |
| 25  | Tax jurisdiction map            | `TAX_JURISDICTION_MAP_JSON`                                | refuse completeness              |
| 26  | Prod host / keys / go-live      | Class X                                                    | paper/dev only                   |
| 27  | PSP / card BIN / Hyperswitch    | Class X                                                    | no Hyperswitch                   |
| 28  | Merchant `pay:*` grantor        | A2                                                         | unpublished grant                |
| 29  | Listing which assets            | P0-06                                                      | empty catalogue                  |
| 30  | CORS prod origins               | `CORS_ALLOWED_ORIGINS`                                     | no `*` invented                  |

**Already sealed — do not re-open:** isolated IM is the live margin product; 10×; house execution **external-only**; copy geo refuse; no second SPA/book.

---

## 3. Agent-closeable (never ask)

Compose `${VAR:-}` empty · Testcontainers or per-branch PG (skip ≠ green) · test CompID fixtures · FIX BeginString 4.2/4.4/5.0 else refuse · L3 from matching queue never L2 · hitch or document extra OMS files · QFJ/SBE/QuantLib pins already chosen · merge `--admin` if Gitleaks green and dep GHSA is trunk-identical; if GitHub still blocks, comment and continue · one service per PR · `pnpm wt`.

---

## 4. Wave 0 — parked PRs (first after go)

| PR                                                            | Action                                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [#3777](https://github.com/Phantom-X-007/intafaced/pull/3777) | v1.24 harden spec                                                               |
| [#3708](https://github.com/Phantom-X-007/intafaced/pull/3708) | v1.23 inventory/cards                                                           |
| [#3771](https://github.com/Phantom-X-007/intafaced/pull/3771) | E4 options RFQ refuse                                                           |
| [#3772](https://github.com/Phantom-X-007/intafaced/pull/3772) | A19 four-eyes                                                                   |
| [#3746](https://github.com/Phantom-X-007/intafaced/pull/3746) | protocol audit registry — merge **code**; do not stamp “audited”                |
| [#3707](https://github.com/Phantom-X-007/intafaced/pull/3707) | GHSA — merge if Gitleaks green **or** leave OPS if required-check cannot bypass |

This mega spec PR is Wave 0 as well.

---

## 5. Wave H — exchange harden (substance; first mill)

Prior falsify: **2 of 15** grokbot headline cards are live doors. Treat the rest as **not done**.

| ID  | Service                         | Today                                                                               | Target                                                                                      |
| --- | ------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| H1  | `svc-fix`                       | Java acceptor + JUnit; **no compose**; Maven mainClass still stdin `FixAdapterMain` | Compose/`FixAcceptorMain`; NOS → matching POST; unmapped CompID refuses; BeginString refuse |
| H1b | `svc-fix`                       | Drop-copy completeness always refuse                                                | Second session; list included sources honestly                                              |
| H2  | `svc-matching` then `svc-ws`    | `l3Queue()` unit; HTTP depth L2; WS `l3_unavailable`                                | L3 from native queue; never from L2                                                         |
| H3  | `svc-ws`                        | SBE stub utf8; no `INTAFACED_SBE_JAVA`                                              | Real Logic octets in image                                                                  |
| H4  | matching then trade             | Combo can **rest**; no take/fill as one                                             | Match/unwind one instrument; ledger holds                                                   |
| H5  | matching                        | `massQuote()` off router; MMP hardcoded unset                                       | POST mass-quote; magnitudes stay unset-refuse                                               |
| H6  | trade                           | Settlement job hermetic; not on `futures-jobs.ts`                                   | JobHost + PG; blank fixing refuses; never last trade                                        |
| H7  | greeks-adapter then trade/quant | No service consumer                                                                 | One caller; IEEE off wire                                                                   |
| H8  | trade/bank/matching             | Fee/cooling tests skip without PG                                                   | Testcontainers; red without DB; dual-book scan                                              |
| H8c | trade+matching                  | B4 never dispatched                                                                 | Matching 200 then trade death: hold stays                                                   |
| H9  | matching                        | Surveillance `Map`; always `detector_gap`                                           | Journal/DB; HTTP list; no auto-fine                                                         |
| H10 | execution                       | Basket HTTP exists; children don’t POST matching                                    | Children → matching; kill-parent unknown ≠ killed                                           |
| H11 | trade/dex compose               | MM seed ±10; `DEX_INTERNAL_BOOK_FEE_BPS:-20`                                        | Blank refuses                                                                               |

OSS: QFJ 3.0.2, SBE 1.39.0, QuantLib 1.43. Never CCXT/CLOB/second book.

---

## 6. Wave R — exchange remainder

After H1 matching POST and H8a exist, or name the residual.

| ID         | Service               | Work                                                                            |
| ---------- | --------------------- | ------------------------------------------------------------------------------- |
| R-A7       | matching              | Compose pass-through empty `MATCHING_RULEBOOK_VERSION` — do not invent a string |
| R-E5       | trade                 | Exercise/assignment/expiry jobs; blank fixing refuse                            |
| R-E6       | trade                 | Delta-hedge unset → refuse; do not start `oms-mmp-hedge.ts`                     |
| R-E7       | trade                 | What-if posts **no money**; missing greeks → refuse numbers                     |
| R-E8       | trade                 | Already SOCKET — do not redo                                                    |
| R-copy     | trade                 | Follow closed all regions; leader ≠ follower money                              |
| R-agentic  | agents/identity/trade | Keep money denylist; install ≠ trading authority                                |
| R-fx       | trade                 | FX products separate; holiday/rail named degrade                                |
| R-quant    | quant/trade           | Paper cannot ledger; live deploy refuse                                         |
| R-security | identity              | Dual-control privileged; “insured” refuse                                       |
| R-onboard  | identity              | Limit/fee-tier change dual-control                                              |
| R-promo    | trade                 | Promotion without budget/end refuse                                             |

Do **not** redo G-cards already on main (rulebook emergency, liquidity source, statements, custody, finance, resilience, OpenAPI, funding, haircuts, hedge mode, PM, ADL, credit, COD, halt, bulk, TIF, iceberg/peg OMS refuses).

---

## 7. Wave Q — other backend (second queue; parallel lanes)

Exchange mill must **not** edit protocol Solidity. One service per PR.

| ID          | Service                    | Work                                                                                            | Not                                    |
| ----------- | -------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------- |
| Q-proto     | `svc-protocol`             | Merge #3746 intake; keep unaudited; AMM factory 0x0 stays refuse                                | Fake `audited:true`; invent EntryPoint |
| Q-index     | `svc-indexer`              | `socket.clob-contracts` fixture ABI honesty                                                     | Invent pool reserves                   |
| Q-dex       | `svc-dex`                  | Strip invented 20 bps (H11); do not sell internal CLOB as non-custodial                         | Wire AMM without indexer               |
| Q-pay       | `svc-pay`                  | Chargeback recipes posted or named refuse; no invented smart-routing; `bank-payout` door honest | Hyperswitch; grant `pay:*`             |
| Q-bank      | `svc-bank`                 | H8b PG cooling; card-sim ≠ live issuer                                                          | Invent PSP                             |
| Q-token     | `svc-token`                | Yield/buyback **no cron** honesty; do not mint unpublished magnitudes                           | Invent emission                        |
| Q-mine      | `svc-mining-pool`          | Prove JobHost+PG mint/rewardPay; epoch set or refuse                                            | Money in `number` amounts              |
| Q-edge      | `svc-edge`                 | WS proxy leftover; kill multi-replica honesty                                                   | Invent geo/VPN lists                   |
| Q-notify    | `svc-notify`               | Keep in-app; Class X creds stay dark                                                            | Fake email delivery                    |
| Q-p2p       | `svc-p2p`                  | Instruments not encrypted — refuse live offers or OWNER KMS; do not seed method registry        |                                        |
| Q-market    | `svc-market`               | Recurring sub not built — refuse; commission env blank ≠ 0                                      |                                        |
| Q-ledger    | `svc-ledger`               | Do not recut statements; paged history SOCKET stay refuse                                       | Second book                            |
| Q-ops       | `svc-ops`                  | Wrap/freeze unset refuse; payroll invent forbidden                                              |                                        |
| Q-tax       | `svc-tax`                  | Jurisdiction map OWNER                                                                          | Invent map                             |
| Q-academy   | `svc-academy`              | Paper never ledger (keep); prize recipes refuse                                                 | Import licensed library                |
| Q-support   | `svc-support`              | No refund money (keep)                                                                          |                                        |
| Q-blueprint | `svc-blueprint`            | Mock — SKIP money                                                                               |                                        |
| Q-rust      | `svc-matching-rust-stage1` | Study only — SKIP cutover                                                                       | Replace TS matching                    |

---

## 8. DAG after **go** (3 writers)

Parallel only across **different** `services/*`.

```
Wave 0 merges (#3777 #3708 #3771 #3772; #3746 code; #3707 if allowed)
        │
   ┌────┴────┬────────────────┐
Ken trade    Tom matching     Bob fix → ws
H6 H8 H4t    H2m H4m H5 H9    H1 H1b H3 H2ws
H7t R-E*     R-A7             then Q-edge
R-copy/fx                    then Q-dex bps
        │
Identity serial: rest of #3772 path then R-security / R-onboard
Execution serial: H10
Bank serial: H8b
Protocol: Shehzad lane or Bob when free — Q-proto only
```

`pnpm wt feat/…`. Never door. Never `05_Web_Front`. Decimal strings. `GRAPHIFY_MAX_WORKERS=1 graphify update .` after code; do not commit `graphify-out` in product PRs.

---

## 9. All 26 services (named)

`svc-academy` `svc-agents` `svc-bank` `svc-blueprint` `svc-dex` `svc-edge` `svc-execution` `svc-fix` `svc-identity` `svc-indexer` `svc-ledger` `svc-market` `svc-matching` `svc-matching-rust-stage1` `svc-mining-pool` `svc-notify` `svc-ops` `svc-p2p` `svc-pay` `svc-protocol` `svc-quant` `svc-support` `svc-tax` `svc-token` `svc-trade` `svc-ws`.

None silently dropped. SKIP money: blueprint, rust-stage1, support refunds, academy SFU.

---

## 10. Waste

Docs mill / recook mountains · frontend · invent bps · fake cert/L3/SBE stub as “done” · dual POV/combo · CCXT · wait Nitro/CI · redo convert 10/200 · protocol audited without firm hash · seed P2P registry · academy library import.

---

## 11. Card template

```
CARD: H# | R-* | Q-*
Service: services/<one>
Today: LIVE | UNIT | REFUSE | LIE vs compose
Target door: HTTP | tRPC | NATS | FIX process | JobHost
PG required: Y/N
Owner sockets I will not fill:
Proof: test that fails without the door
```

---

## 12. After this spec

Nitro says **go**. Then this owner executes Wave 0 + H in worktrees. No grokbot. No frontend.
