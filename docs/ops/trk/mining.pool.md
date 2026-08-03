# TRK-mining.pool

**Title:** Stratum share protocol, PPLNS payouts  
**Tracker:** `mining.pool` · module `mining-pool` · phase 5 · status `ready` · owner none  
**Depends on:** `token.emissions`  
**Tip freeze:** `origin/main` @ `04f9b1f2` (re-derive before implement)  
**Pack type:** thorough research upgrade (`docs/trk-research-pack-drain`) — no implement swarm; no money invention; no dual-edit Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

1. Miners submit shares (Stratum or successor).
2. PPLNS (or chosen) payouts via ledger/token emissions recipes — no shadow pool balances.
3. Miner-visible shares and owed payouts.

## 2 · Current code state (tip `04f9b1f2`)

| Area               | Reality                         |
| ------------------ | ------------------------------- |
| Pool service       | **None** under `services/`      |
| Stratum/PPLNS impl | **Not present** as product code |
| Dependency         | `token.emissions`               |

## 3 · Doctrine constraints

| Law         | Implication                                    |
| ----------- | ---------------------------------------------- |
| §0.6        | Payouts via recipes/emissions only             |
| Token/chain | May hit Shehzad/token law — re-check ownership |
| Fail closed | Invalid shares never pay                       |

## 4 · DoD sketch (checkable — staged)

### DoD checks

- [ ] ADR: asset, scheme, fee
- [ ] Stratum gateway
- [ ] Share accounting + PPLNS
- [ ] Payout job
- [ ] Miner API/UI

### Tracker `done` bar

Flip only when the title’s product promise is true in a real env — not when a stub route or empty skeleton merges.

## 5 · Open questions

1. v1 coin/asset.
2. Who operates the pool.

## 6 · Estimated size

| Slice             | Size   |
| ----------------- | ------ |
| ADR               | **S**  |
| Full pool program | **XL** |

## 7 · Related docs / code

- `token.emissions`
- token service
- chain boards

## 8 · Explicit non-goals for this pack

- No mock Stratum paying invent balances.
