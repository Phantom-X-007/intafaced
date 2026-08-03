# TRK-p2p.merchants

**Title:** P2P merchant programme — badges, limits, API  
**Tracker:** `p2p.merchants` · module `p2p` · phase 3 · status `ready` · owner none  
**Depends on:** `p2p.reputation`  
**Tip freeze:** `origin/main` @ `04f9b1f2` (re-derive before implement)  
**Pack type:** thorough research upgrade (`docs/trk-research-pack-drain`) — no implement swarm; no money invention; no dual-edit Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

1. Merchant **programme**: badges, raised limits, API beyond base reputation.
2. Badges from **checkable** rules (seeded in reputation module).
3. Limits consistent across P2P (and rank perks where tied).

## 2 · Current code state (tip `04f9b1f2`)

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

## 4 · DoD sketch (checkable — staged)

### DoD checks

- [ ] Define programme tiers vs organic badges
- [ ] API keys / higher limits law
- [ ] Badge grant/revoke tests
- [ ] Operator freeze tools

### Tracker `done` bar

Flip only when the title’s product promise is true in a real env — not when a stub route or empty skeleton merges.

## 5 · Open questions

1. Same table vs separate programme entity.
2. KYC tier gates for API.

## 6 · Estimated size

| Slice                       | Size    |
| --------------------------- | ------- |
| Badge→limit mapping + tests | **S–M** |
| Full programme              | **M–L** |

## 7 · Related docs / code

- `services/svc-p2p/src/reputation.ts`

## 8 · Explicit non-goals for this pack

- No inventing escrow recipes.
- No fake merchant badges.
