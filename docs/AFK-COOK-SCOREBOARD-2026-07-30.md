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
- Custody / vendor-shell / tracker: green  
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
| Positions WS | After private orders |
| Hosted checkout UI | Links exist; full merchant UI does not |
| protocol.smart-accounts | Chain non-propped |
| Real rails / kill drill / licences | Denon + counsel |

## Config notes for Denon

- svc-ws private path needs `JWT_ACCESS_SECRET` (same as identity/edge)
- pay links need migration `0002_pay_payment_links.sql` applied on deploy

## Free mountains next

1. Positions private stream  
2. ops.notifications skeleton  
3. protocol.smart-accounts non-propped slice  
4. secret-scan CI (needs Nitro go)  
5. Human: **fix GitHub Actions billing**

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

**Audit:** `docs/audit/WAVE-D-2026-07-30.md` — light gates this docs PR; full monorepo scans if install allows, else run-on-return.

### Unspoken needs (Wave D progress)

| Need | Status after #145–#150 |
| --- | --- |
| Volume + quality without Nitro | Continuous product PRs through #150; loop file is compaction survival |
| Bots can trade (CCXT public+private) | Balance + positions empty + OHLCV empty on tip; write path already on main |
| In-app notifications | Fans expanded (rank/stake/p2p release+refund); dispute-resolved still skipped (no userIds) |
| Continuous light gates + wave audits | Policy still every PR / every 3–4 ships; Wave D audit doc |
| Peace-of-mind scoreboard | This table + GRIND-LOOP-ACTIVE high water |
| Never fake human blockers | CI billing still human; factory/rails/futures still human or later |

### Still agent-cookable (see loop NEXT QUEUE)

1. `account/trades?symbol=` if filter still missing  
2. Tracker note hygiene (notify fans under-listed)  
3. Safe notify fans only  
4. Private balance WS only if event path is safe — else skip  
5. Thin `pay.public-api` only if cheap  
6. Wave audits + DRAINED reassess  

**Loop file:** [`GRIND-LOOP-ACTIVE.md`](GRIND-LOOP-ACTIVE.md) · **Status: RUNNING** · scheduler 45m
