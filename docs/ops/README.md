# Swarm ops (generated board)

**Law:** [`../SWARM-ALL-OUT-ORIENT-2026-08-03.md`](../SWARM-ALL-OUT-ORIENT-2026-08-03.md) · [`SWARM-MANDATE.md`](./SWARM-MANDATE.md)  
**Wave 1 tools:** `pnpm swarm:freeze` · `swarm:status` · `swarm:lanes` · `swarm:report` · `swarm:next`  
**Cold resume:** regenerate `FREEZE-LIVE.md`, then [`../COORDINATION-TRUTH-LAYERS.md`](../COORDINATION-TRUTH-LAYERS.md) § Agent cold-start.  
**Human blockers inbox:** [`../BOARD-CLEAR-HUMAN-BLOCKERS.md`](../BOARD-CLEAR-HUMAN-BLOCKERS.md) (not a second file).  
**Value / churn metric (L0):** `tooling/ci/value-gate.mjs` on Docs format · `Board-Delta:` trailer.

| File                                       | How it appears                               |
| ------------------------------------------ | -------------------------------------------- |
| [DASHBOARD.md](./DASHBOARD.md)             | `pnpm swarm:report` — Nitro one-screen fleet |
| [FREEZE-LIVE.md](./FREEZE-LIVE.md)         | `pnpm swarm:freeze` — free vs blocked + cost |
| [FREEZE-LIVE.json](./FREEZE-LIVE.json)     | Machine form of freeze                       |
| [R00-INVENTORY.md](./R00-INVENTORY.md)     | Tip + free counts                            |
| [R01-PR-MATRIX.md](./R01-PR-MATRIX.md)     | Open PR babysit map                          |
| [R02-FREE-CLAIMS.md](./R02-FREE-CLAIMS.md) | Free/blocked list                            |

**Do not hand-edit generated files** — re-run the scripts after tip moves.

**Kill switch:** remove `swarm:*` from `package.json` and delete `tooling/scripts/swarm.mjs` if these tools thrash; residual + `claim:check` remain.

## Denon hard board

Platform/money tasks agents leave for Denon: [`../DENON-HARD-TASK-BOARD-FROM-NITRO-SWARM-2026-08-03.md`](../DENON-HARD-TASK-BOARD-FROM-NITRO-SWARM-2026-08-03.md)
