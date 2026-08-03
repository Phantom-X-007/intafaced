# TRK-p2p.merchants

**Title:** P2P merchant programme — badges, limits, API  
**Tracker:** `p2p.merchants` · phase 3 · plane F · status `ready` · owner none  
**Depends on:** `p2p.reputation` (done)

## DoD (plain language)

Qualified P2P counterparties can earn a **merchant** badge, higher limits, and
programmatic API access under explicit rules. Reputation stays computed from
real trade outcomes (no borrowed trust). Programme tables are first-class —
not a boolean hack on users.

## Path on tip

| Area               | Location                                                               |
| ------------------ | ---------------------------------------------------------------------- |
| P2P core (done)    | `services/svc-p2p` — trades, escrow, disputes, reputation              |
| Merchant programme | **Not built** — README: `p2p_merchants` is this feature; no half table |
| Copy keys          | `p2p.merchant.badge` / `p2p.merchant.trades` in i18n (UI strings only) |
| Not this mountain  | Pay **acquiring** merchants (`pay:read` scopes, clearing recipes)      |

Doctrine §6.2 fifth table named; migration deliberately deferred to this mountain.

## Blocked by

| Blocker        | Notes                                                                   |
| -------------- | ----------------------------------------------------------------------- |
| Product law    | Qualification thresholds, limit matrix, API surface — Denon/Nitro       |
| Soft dep       | Reputation counters already enforce “no flawless fresh account” honesty |
| Money          | Limit raises must not bypass escrow/ledger integrity                    |
| Open Denon P2P | Re-check open PRs path-intersect before implement                       |

## First PR size (if free)

**S–M:** migration `p2p_merchants` + apply/approve state machine + badge read on
profile; limits applied at trade create; tests for ineligible apply and for
limit ceiling. API keys / merchant API = second PR. No pay-rail merchant
conflation.
