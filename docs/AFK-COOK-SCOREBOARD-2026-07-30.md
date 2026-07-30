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
