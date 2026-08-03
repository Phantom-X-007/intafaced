# TRK-p2p.merchants — research / spec pack

**Tracker id:** `p2p.merchants`  
**Title:** P2P merchant programme — badges, limits, API  
**Module / phase:** `p2p` · phase 3  
**Status on tip:** `ready` · **owner:** none  
**Depends on:** `p2p.reputation`  
**Tip freeze:** `origin/main` @ `c6d9e89e` (re-derive before implement)  
**Pack type:** research only — no implement swarm; no money invention; no dual-edit of Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

1. Merchant **programme**: badges, raised limits, API beyond base reputation.
2. Badges from **checkable** rules (seeded in reputation module).
3. Limits consistent across P2P (and rank perks where tied).

## 2 · Current code state (tip `c6d9e89e`)

| Area                | Reality                                        |
| ------------------- | ---------------------------------------------- |
| Service             | `services/svc-p2p` spine exists                |
| Badges              | `reputation.ts` computes badges from snapshots |
| Programme packaging | Beyond organic badges — residual               |
| Open PRs            | Path-check Denon p2p work                      |

## 3 · Doctrine constraints

| Law           | Implication                 |
| ------------- | --------------------------- |
| Escrow money  | Ledger only                 |
| Badge honesty | Revoke when conditions fail |
| No dual-edit  | Open p2p PRs                |

## 4 · DoD sketch

- [ ] Define programme tiers vs organic badges
- [ ] API keys / higher limits law
- [ ] Badge grant/revoke tests
- [ ] Operator freeze tools

## 5 · Open questions

1. Same table vs separate programme entity.
2. KYC tier gates for API.

## 6 · Estimated size

**M–L**. First PR: badge→limit mapping + tests — **S–M**.

## 7 · Related

- `services/svc-p2p/src/reputation.ts`

## 8 · Non-goals

- No inventing escrow recipes.
- No fake merchant badges.
