# AFK cook scoreboard — 2026-07-30

**Operator:** Nitro AFK · full autonomous cook  
**Intent:** fix everything fixable, audit, front-run, ship, merge. More volume than 07-29 night.

## Shipped this cook

| PR | What |
| --- | --- |
| #118 | Brand-scan fix (PARALLEL-OPS model vendor name) + delta audit docs |
| #119 | **Private order stream** — `orderUpdated` event, trade publish, `/private/stream` JWT |
| #120 | **Payment links** — createLink + public resolveLink + migration 0002 |

Plus prior night still on main: #110–#117 (yield/buyback, apikeys, edge ifc_, subaccounts, parallel-ops).

## Audit (local)

- Brand: **was red on main** → fixed #118  
- Custody / vendor-shell / tracker: green (re-check after product ships; tracker:check may still want `pnpm tracker` if markdown stale)  
- GitHub Actions: **still billing-blocked** (jobs never start) — human Billing & plans  
- Residual money table unchanged for Denon-owned items (rails, licences, counsel list)

Full: `docs/audit/AFK-WAVE-2026-07-30.md`

## Unspoken needs addressed

| Need | What we did |
| --- | --- |
| Don't leave red doctrine | Fixed brand scan failure introduced by ops docs |
| Front-run Denon product holes | Private orders + payment links |
| Peace of mind without reading code | Scoreboards + claim board |
| More volume than 10-minute cook | Multiple sequential product PRs + audit |

## Still open (honest)

| Item | Why |
| --- | --- |
| GitHub CI green | Org payment / spending limit — **not agent-fixable** |
| Positions product | Honest `[]` REST only; futures later |
| Hosted checkout UI | Links + minimal HTML exist; full merchant UI does not |
| protocol.smart-accounts | Chain non-propped |
| Real rails / kill drill / licences | Denon + counsel |
| DoD gate svc-notify OTEL | Pre-existing red — agent queue #1 |
| tracker:check | May still be red if TRACKER.md markdown stale — agent queue #2 |

## Config notes for Denon

- svc-ws private path needs `JWT_ACCESS_SECRET` (same as identity/edge)
- pay links need migration `0002_pay_payment_links.sql` applied on deploy

## Free mountains next

1. svc-notify OTEL (DoD gate)  
2. tracker:check if TRACKER.md stale  
3. p2pTradeDisputed notify (openedBy only)  
4. identity subAccounts.revoke if cheap  
5. Human: **fix GitHub Actions billing**  
6. Prefer skip: private balance WS, pay.public-api  

## Grind continuation (same AFK)

| PR | What |
| --- | --- |
| #122 | Private **fills** stream (`fillSettled` + channel=fills) |
| #123 | **orders.history** terminal orders |
| #124 | Payment links **list + deactivate** |


## Wave B (parallel agents + continuous audit)

| PR | What |
| --- | --- |
| #126 | Grind plan + audit cadence |
| #127 | **orders.cancelAll** |
| #128 | **protocol factory honesty** (no fake addresses) |
| #129 | **svc-notify** in-app inbox + 3 event fans |

**Audit:** `docs/audit/WAVE-B-2026-07-30.md` — all local doctrine gates green.

## Wave C (parallel)

| PR | What |
| --- | --- |
| #130 | Wave B audit gates green |
| #131 | **Public REST** `/api/v1/markets` + orderbook (ccxt-api partial) |
| #127–#129 | cancelAll · protocol honesty · svc-notify |

**Audit policy in force:** light gates every PR; wave audit every 3–4 ships (`docs/GRIND-PLAN-2026-07-30.md`).

## Compaction survival

**Loop file:** [`GRIND-LOOP-ACTIVE.md`](GRIND-LOOP-ACTIVE.md) — paste prompt + queue. Next chat continues without Nitro.

## Loop after compact

| PR | What |
| --- | --- |
| #135–#137 | Grind loop docs + queue refresh |
| #139 | Pay **hosted checkout** HTML for payment links |
| #140 | CCXT private REST **create/cancel/get/closed/trades** |

**Continue:** `docs/GRIND-LOOP-ACTIVE.md` · scheduler every 45m

## Wave D (bots trade + notify + honest empties)

| PR | What |
| --- | --- |
| #141–#144 | Loop docs after checkout/REST; cancel-all + fees; fills.forOrder; pre-compact high water |
| #145 | **Private REST account/balance** (ledger projection, self-only) |
| #146 | **Public OHLCV** — honest empty until candle job |
| #147 | **GET /positions** — honest `[]` until futures |
| #148 | Notify fans: rankUpdated · stakeCreated · p2pEscrowReleased |
| #149 | Tracker: **trade.convert** done (mounted + money-path tests) |
| #150 | Notify fan: **p2pEscrowRefunded** |
| #151 | Docs: Wave D grind loop high-water + compaction survival |
| #152 | Tracker honesty wave D — notes match main code |
| #153 | Docs(audit): Wave D doctrine scan log with real exit codes |
| #154 | SQL **symbol filter** on account/trades + positions health log |

**Audit:** `docs/audit/WAVE-D-2026-07-30.md` · scan log: `docs/audit/WAVE-D-SCANS-2026-07-30.md` — brand/custody/vendor-shell/workspace green at Wave D; OTEL/tracker reds cleared in Wave E.

## Wave E (queue clear → DRAINED)

| PR | What |
| --- | --- |
| #155 | Docs: grind loop high water past #154 + AFK scoreboard |
| #156 | **svc-notify OpenTelemetry** + tracker:check green |
| #157 | Notify fan: **p2pTradeDisputed** (openedBy only) |
| #158 | Identity **subAccounts.revoke** soft-disable |
| (this) | Loop + scoreboard **DRAINED**; tracker note honesty for sub-accounts create/list/revoke |

### Unspoken needs (post-#158)

| Need | Status |
| --- | --- |
| Volume + quality without Nitro | Product queue emptied through #158; no padding ceremony |
| Bots can trade (CCXT public+private) | Balance · positions empty · OHLCV empty · mytrades `?symbol=` · write path on main |
| In-app notifications | Fans include rank/stake/p2p lock/release/refund + **dispute opened** (openedBy) |
| Continuous light gates + wave audits | Local green at drain: brand/custody/vendor-shell/workspace/dod-gate/tracker:check |
| Peace-of-mind scoreboard | This file + GRIND-LOOP-ACTIVE high water **#158** · **Status DRAINED** |
| Compaction survival | Loop file still law for every 45m fire |
| Never fake human blockers | CI billing · chain factory · futures · candles · push/email/SMS still human/later |

### Agent queue disposition

| Item | Result |
| --- | --- |
| svc-notify OTEL | **DONE** #156 |
| tracker:check | **DONE** #156 (+ note honesty this PR) |
| p2pTradeDisputed fan | **DONE** #157 |
| pay.public-api | **SKIP** |
| Private balance WS | **SKIP** |
| subAccounts.revoke | **DONE** #158 |
| Reassess DRAINED | **Met** |

### Still open (honest — not agent product)

| Item | Why |
| --- | --- |
| GitHub CI green | Org billing / spending limit — **human** |
| Futures / real positions | Honest `[]` only |
| Candle aggregation / OHLCV data | Honest empty until real job |
| protocol.smart-accounts chain | Factory honesty only — not propped |
| Push / email / SMS | §13 sockets |
| Real rails / kill drill / licences / counsel | Denon + counsel |

**Loop file:** [`GRIND-LOOP-ACTIVE.md`](GRIND-LOOP-ACTIVE.md) · **Status: DRAINED** · high water **#158** · scheduler 45m re-check only
