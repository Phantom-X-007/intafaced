# TRK-trade.forex

**Title:** Fiat pairs on the same engine  
**Tracker:** `trade.forex` · phase 2 · plane F · status `ready` · owner none  
**Depends on:** trade.spot (done), pay.rails (done as adapter — not full fiat settlement story)  
**Tip freeze:** `afa73a4f` · research only · no `features.mjs`

## DoD (plain language)

Users can trade **fiat pairs** (e.g. EUR/USD) on the **same spot engine** as crypto with correct schedules, pips, and refuse-when-closed behavior.

**Fiat settlement** is real (pay rails / banking path) — not a crypto ledger balance labeled “USD” without redeemability story.

Weekend/holiday closes take **no hold** and write **no intent** (already proven for hours machinery).

## Path on tip

| Area        | Location                    |
| ----------- | --------------------------- |
| Engine      | services/svc-trade          |
| Instruments | packages/contracts          |
| Settlement  | pay/bank — product law open |

## Blocked by

| Blocker             | Notes                          |
| ------------------- | ------------------------------ |
| Fiat settlement law | Still missing product decision |
| pay/bank rails      | Crypto rail ≠ full fiat        |
| Not blocked         | Hours + instrument model       |

## First PR size (if free)

**Docs settlement decision** first; then M flag-gated listing.

**Solid spec:** [TRK-trade.forex.md](./TRK-trade.forex.md)
