# TRK-market.vendors

**Title:** Vendor lifecycle — apply, vet, list, stake-gated slots  
**Tracker:** `market.vendors` · phase 5 · plane F · status `ready` · owner none (Denon product direction)  
**Depends on:** token.staking (done)  
**Tip freeze:** `afa73a4f` · research only · no `features.mjs`

## DoD (plain language)

A user can **apply** to be a vendor, ops can **vet**, and approved vendors can **list** within **stake-gated slots** enforced by real `token.stakeOf` (fail closed), not a checkbox.

Slot capacity cannot be oversold under concurrency (serializable / lock pattern as academy seats).

No commerce money movement in this mountain alone — that is `market.commerce`; vendors mountain stops at lifecycle + listing eligibility.

## Path on tip

| Area    | Location               |
| ------- | ---------------------- |
| Service | **svc-market missing** |
| Stake   | svc-token              |
| Scopes  | packages/auth stubs    |

## Blocked by

| Blocker     | Notes                            |
| ----------- | -------------------------------- |
| svc-market  | Service does not exist           |
| Product law | Thresholds + vet policy — Denon  |
| Not blocked | token.staking dependency is done |

## First PR size (if free)

**M — svc-market skeleton + apply/vet** state machine; slots second PR.

**Solid spec:** [TRK-market.vendors.md](./TRK-market.vendors.md)
