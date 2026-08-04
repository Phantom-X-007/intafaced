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

### Allowed vs forbidden when freeProduct=0

| Allowed                                                   | Forbidden                                               |
| --------------------------------------------------------- | ------------------------------------------------------- |
| P1 land stranded branches (path-clean)                    | R07/R01/P-WS cycle PRs with same freeProduct=0 board    |
| P2 exact partner CI fail comments                         | Merging Denon/Shehzad PRs                               |
| P3 code-grounded TRK research deepen                      | Dual-edit partner open PR paths                         |
| P4 invent/P-WS **only if** code or partner matrix changed | Invent/P-WS stamp with no Board-Delta                   |
| P5 claims truth + merge green Nitro Class N               | freeProduct=0 as session kill **or** as license to spam |

### Machine enforcement (not a banner)

| Mechanism                                      | What it does when context degrades                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`tooling/ci/value-gate.mjs` on Docs format** | **Exits 1** (strict) on docs-only + ≥0.80 subject similarity to last 10 ancestors + no `Board-Delta:` trailer. Git-only. **This is enforcement.** |
| `pnpm swarm:status` ops-churn / Actions 24h    | **Informational only** — prints; does not block                                                                                                   |
| `pnpm swarm:lanes`                             | **Discoverability only** — enumerates P0–P3                                                                                                       |

Self-test (fixtures, no network): `pnpm value-gate:self-test` → near-dup exit-1 path, real work pass.

### F-STANDBY (finish type when freeProduct=0) — corrected

When the primary board finish is met but the session continues (AFK / “never stop”), the state is **F-STANDBY** (OS harvest `shared/S-CORE.md` §1.1).

**Idle is valid ONLY when you can name why no lane has work.** Before any “idle OK” / “board unchanged” report, state in one line each:

| Line            | Required content                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| **P1 stranded** | N path-clear branches vs open partners, and **why each is not landable this cycle** (or “landed #…”) |
| **P2 partner**  | Which partner PRs changed state since last cycle (or “matrix unchanged”)                             |
| **P3 TRK**      | How many specs remain under 100 lines                                                                |

**If P1 path-clear count > 0, IDLE IS NOT A VALID OUTPUT. Land one** (smallest first). One branch → one PR. Re-verify path-clear at the tip you branch from.

- “No delta” justifies **not opening a stamp PR**. It **never** justifies not doing real P1–P3 work.
- Any ship must still be P1–P5 with a real **Board-Delta** (or code). Metric: value-gate (L0 in `docs/BOARD-CLEAR-PROCESS-LOOPS.md`).
- **Report format every cycle:** `P1 N clear / M landed this cycle · P2 <changes> · P3 <thin count> · tip <sha>`

**Spawn width:** target **6–8 concurrent** path-disjoint free product writers when freeProduct>0. When freeProduct=0, spawn **P1–P3** workers (width 3–6), not stamp clones.

**Cold resume (no third file):** regenerate + read [`FREEZE-LIVE.md`](./FREEZE-LIVE.md) · [`../COORDINATION-TRUTH-LAYERS.md`](../COORDINATION-TRUTH-LAYERS.md) § Agent cold-start · human inbox [`../BOARD-CLEAR-HUMAN-BLOCKERS.md`](../BOARD-CLEAR-HUMAN-BLOCKERS.md).

Forbidden unchanged: Shehzad protocol/INTACHAIN implement · Denon open-PR dual-edit · invent money/depth · main-checkout · fake visual under NO-FLEET.
