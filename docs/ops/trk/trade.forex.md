# TRK-trade.forex

**Title:** Fiat pairs on the same engine  
**Tracker:** `trade.forex` · module `trade` · phase 2 · status `ready` · owner none  
**Depends on:** `trade.spot` · `pay.rails`  
**Tip freeze:** `origin/main` @ `04f9b1f2` (re-derive before implement)  
**Pack type:** thorough research upgrade (`docs/trk-research-pack-drain`) — no implement swarm; no money invention; no dual-edit Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

1. Fiat pairs trade on the **same** engine path as crypto spot where product allows.
2. Venue hours enforced (`trade.market_closed` when closed — not a funded hold).
3. Pay rails ready for fiat funding/withdrawal as product requires.
4. No second forex ledger silo.

## 2 · Current code state (tip `04f9b1f2`)

| Area     | Reality                                                |
| -------- | ------------------------------------------------------ |
| Product  | Tracker: **not started as a product**                  |
| Model    | `asset_class` + schedule; `assertMarketOpen` on create |
| Residual | Full FX listing, risk, rails UX                        |
| Pay      | `pay.rails` / Shehzad — babysit money law              |

## 3 · Doctrine constraints

| Law             | Implication                                      |
| --------------- | ------------------------------------------------ |
| Same engine     | No parallel matching money path                  |
| Hours fail-safe | Unrecognised schedule must not open accidentally |
| Class M / pay   | Funding not free craft                           |

## 4 · DoD sketch (checkable — staged)

### DoD checks

- [ ] Product law: pairs + calendars
- [ ] Market rows + hours tests
- [ ] Pay rail readiness
- [ ] FX risk/ops runbook

### Tracker `done` bar

Flip only when the title’s product promise is true in a real env — not when a stub route or empty skeleton merges.

## 5 · Open questions

1. Liquidity/MM for fiat pairs.
2. Regulatory posture per region.

## 6 · Estimated size

| Slice                 | Size           |
| --------------------- | -------------- |
| Schedule honesty only | **S** first PR |
| Full FX program       | **L–XL**       |

## 7 · Related docs / code

- `services/svc-trade` market hours/rows
- pay/Shehzad boards

## 8 · Explicit non-goals for this pack

- No pretend EURUSD without hours + rails.
- No Shehzad implement from this pack.
