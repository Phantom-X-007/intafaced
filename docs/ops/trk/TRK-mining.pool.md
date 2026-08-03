# TRK-mining.pool — research / spec pack

**Tracker id:** `mining.pool`  
**Title:** Stratum share protocol, PPLNS payouts  
**Module / phase:** `mining-pool` · phase 5  
**Status on tip:** `ready` · **owner:** none  
**Depends on:** `token.emissions`  
**Tip freeze:** `origin/main` @ `c6d9e89e` (re-derive before implement)  
**Pack type:** research only — no implement swarm; no money invention; no dual-edit of Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

1. Miners submit shares (Stratum or successor).
2. PPLNS (or chosen) payouts via ledger/token emissions recipes — no shadow pool balances.
3. Miner-visible shares and owed payouts.

## 2 · Current code state (tip `c6d9e89e`)

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

## 4 · DoD sketch

- [ ] ADR: asset, scheme, fee
- [ ] Stratum gateway
- [ ] Share accounting + PPLNS
- [ ] Payout job
- [ ] Miner API/UI

## 5 · Open questions

1. v1 coin/asset.
2. Who operates the pool.

## 6 · Estimated size

**XL** greenfield. First PR: ADR — **S**.

## 7 · Related

- `token.emissions`, token service, chain boards

## 8 · Non-goals

- No mock Stratum paying invent balances.
