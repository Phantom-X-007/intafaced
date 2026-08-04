# Swarm mandate scope

**Shell product craft** (REGROUP / AFK residual / LANDER / INTEGRITY report) is the swarm free-product board.

| Signal           | Meaning                                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `freeProduct=0`  | Shell craft queue empty or blocked-only — **not** “platform done”                                                                        |
| `freeTracker≈40` | `features.mjs` ready/unowned platform features (chain, academy, launch, …)                                                               |
| Tracker free     | **Research/spec first** unless DoD is tiny — implement swarms there are a **new wave** and need a path matrix + Class rules before spawn |

## AFK priority ladder (anti-drift — mandatory)

When `freeProduct=0`, **do not** burn the night on tip-bump stamp PRs (R07/R01/P-WS “cycle N” with identical board).  
**Re-freeze only on board delta** (new free product, partner PR state change, invent findings >0, new open Nitro Class N).

| Priority | Lane                   | What counts as real work                                                                                       | Ban                                         |
| -------- | ---------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **P0**   | SPAWN_NOW free product | Claim + worktree + ship Class N/P path-disjoint residual                                                       | stamp mill while free product still waits   |
| **P1**   | Stranded branches      | Rebase/land `origin/feat/*` / `fix/*` with path-intersect clean vs open partner PRs                            | dual-edit Denon file sets                   |
| **P2**   | Partner unblock        | Exact CI fail extract; one comment when NEW red/conflict; never merge partners                                 | dual-edit / merge Denon·Shehzad             |
| **P3**   | Tracker research       | Deepen thin `docs/ops/trk/*` for **ready** non-shehzad rows (code-grounded)                                    | auto-implement TRK swarms                   |
| **P4**   | Integrity              | Invent re-scan **only if** shell code changed since last scan; P-WS report **only if** #433/#432 state changed | cycle stamp every few minutes with no delta |
| **P5**   | Hygiene                | LIVE-LANES / claims truth when false free rows; Class N merge green Nitro                                      | R07 peace rows for unchanged freeProduct=0  |

**Night/AFK after freeProduct=0:** P1→P5 above. Class N merge when green. **Not** invent depth UI. **Not** R07 cycle spam.  
**One-pager:** [`AFK-NO-STAMP-MILL.md`](./AFK-NO-STAMP-MILL.md) · **machine:** `pnpm swarm:status` / `swarm:next` print `afk-ladder` + `stamp-mill: BAN` when freeProduct=0.

**Spawn width:** target **6–8 concurrent** path-disjoint free product writers when freeProduct>0. When freeProduct=0, spawn **P1–P3** workers (width 3–6), not 6–8 stamp clones. Anti-under-spawn logs `available` / `active_spawned` / `gap`.

Forbidden unchanged: Shehzad M1–M7 implement · Denon open-PR dual-edit · invent money/depth · main-checkout · fake visual under NO-FLEET.
