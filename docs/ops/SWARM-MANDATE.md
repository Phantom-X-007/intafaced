# Swarm mandate scope

## ONE SURFACE — read before any front-end work (mandatory)

`vendor/coinexchange/05_Web_Front`, served on `:8090`, is the **sole product surface**.
Law: ADR [`../adr/2026-08-03-retire-apps-web-port-to-vue-shell.md`](../adr/2026-08-03-retire-apps-web-port-to-vue-shell.md) (Accepted, owner decision) and doctrine §5.3. **Settled — implement it, do not re-litigate it.**

| Rule                      | What it means in a PR                                                                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`apps/web` is retired** | No craft, no fixes, **no new tests** there. A PR touching `apps/web/**` is rejected on sight — "shell craft" in the body does not make it the shell.                       |
| **Audience**              | Pro trader workbench. Retail arrives via **Convert**; "retail IA as terminal default" is a listed anti-pattern, not a direction.                                           |
| **One kit**               | iView 3, restyled through CSS variables in `intafaced.css`. Never fork the kit. No Tailwind / shadcn / Radix / Element / Ant / Naive / Quasar.                             |
| **Palette**               | P21 provisional. Re-picking it is **Nitro-only** — agents never decide taste.                                                                                              |
| **Honesty**               | No fake prices · empty ≠ zero · loading / failed / empty are three states · brand scrub · Nitro is never the runner.                                                       |
| **Still to port**         | Runtime shape validation of edge responses; decimal-safe desk arithmetic (`bignumber` is vendored but `ix-trade.js` does not use it). Live WS depth client landed in #748. |

This section exists because the decision lived only in an ADR for a day, and in that day
a PR put six files of craft into `apps/web` and called it shell work. If it is not in
this file, the coordinator does not know it.

---

**Shell product craft** (REGROUP / AFK residual / LANDER / INTEGRITY) **plus non-money implementable tracker rows** is the swarm free-product board.

| Signal              | Meaning                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `freeProduct`       | Spawnable Class N craft: REGROUP/AFK/LANDER/INTEGRITY **+ implementable TRK**                                   |
| `freeImplementable` | Tracker rows that pass the implementable gate (counted inside freeProduct)                                      |
| `freeProduct=0`     | No spawnable craft and no implementable TRK — **not** “platform done”                                           |
| `freeTracker`       | Ready/unowned tracker rows that are **not** implementable (money-gated, dep-blocked, thin spec, wave-1 exclude) |

### Tracker implementable gate (Nitro approved — open non-money)

A tracker row is **IMPLEMENTABLE** when **all** hold:

1. `status` is `ready`, `owner` is none, every `dependsOn` is `done`
2. Spec at `docs/ops/trk/<id>.md`, **≥100 lines**, code-grounded
3. `id` does **not** match `/^(trade|pay|bank|venue|p2p|market)\./` — money stays gated

Implementable rows enter **freeProduct** under normal Class N: path-disjoint, width **3–6**, worktrees, thrift, claim files.

**`residual-own` on a TRK claim** means “spec done, awaiting implement.” It **MUST NOT** hide implementable rows from the free board. Only **`claimed` | `pr-open` | `done`/`merged`/`retired` | money-gated | dep-blocked** hide them.

**Money-class (closed until Nitro opens a wave):** any id matching the money prefix rule (includes futures/otc/copy/forex/algo/ccxt-api, venue.aggregation, pay.\*, p2p.merchants, bank.earn/cards/ramps, market.vendors).

**Wave-1 exclude from auto-spawn** even if non-money: `ops.admin`, `ops.compliance`.

Machine: `pnpm swarm:status` prints `freeImplementable=N` and implementable ids.

## AFK priority ladder (anti-drift — mandatory)

When `freeProduct=0`, **do not** burn the night on tip-bump stamp PRs (R07/R01/P-WS “cycle N” with identical board).  
**Re-freeze only on board delta** (new free product, implementable TRK, partner PR state change, invent findings >0, new open Nitro Class N).

| Priority | Lane                   | What counts as real work                                                                  | Ban                                 |
| -------- | ---------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------- |
| **P0**   | SPAWN_NOW free product | Claim + worktree + ship Class N/P path-disjoint residual **or implementable TRK Stage-1** | stamp mill while free product waits |
| **P1**   | Stranded branches      | Rebase/land `origin/feat/*` / `fix/*` after path-intersect vs open partner PRs            | dual-edit Denon file sets           |
| **P2**   | Partner unblock        | Exact CI fail extract; one NEW comment only; never merge partners                         | dual-edit / merge Denon·Shehzad     |
| **P3**   | Tracker                | Deepen thin specs **or** implement Stage-1 from implementable TRK                         | stamp mill; invent money-class      |
| **P4**   | Integrity              | Invent re-scan only if shell code changed; P-WS only if partner matrix changed            | cycle stamp with no delta           |
| **P5**   | Hygiene                | Claims truth; Class N merge green Nitro                                                   | R07 peace rows for unchanged board  |

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
| **`pnpm thrift:check` / `pnpm pr` / pre-push** | **Exits 1** at hard caps (default 220 total / 120 Docs / 80 CI). Soft ≥120. **`pnpm pr` fail-closes open.**                                       |
| **CI / Docs-format triggers**                  | **PR only** (no push:main). Docs-format skips FREEZE/claims/R00–R02/DASHBOARD-only. Manual: `workflow_dispatch`.                                  |
| `pnpm swarm:status` ops-churn / Actions 24h    | Prints meter + thrift level; hard level is a **FAIL line** agents must not ignore                                                                 |
| `pnpm swarm:lanes`                             | **Discoverability only** — enumerates P0–P3                                                                                                       |

Self-test (fixtures, no network): `pnpm value-gate:self-test` · `pnpm thrift:self-test`.

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

### AFK PR batch law (Actions thrift — mandatory)

Parallel **coding** is free. Parallel **CI-starting PR opens** are not.

| Rule               | Detail                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Fat PRs**        | Prefer **one PR per coherent path-cluster**, not one PR per residual id when ids share a service or can land together.             |
| **Max CI-starts**  | Soft target: **≤5 new code PRs / hour** per coordinator wave; when `thrift: soft                                                   | hard`, **≤1** until cool. |
| **Open path**      | `pnpm thrift:check` then `pnpm pr -- …` (wraps thrift + `gh pr create`). Bare `gh pr create` is a thrift hole — do not use in AFK. |
| **Push path**      | `.githooks/pre-push` runs thrift-preflight (hard fail). `THRIFT_ALLOW=1` only with PR note.                                        |
| **Caps (default)** | soft≥120 · hard≥220 total · docs≥120 · ci≥80 (24h). Env override only for measured incidents.                                      |

**Cold resume (no third file):** regenerate + read [`FREEZE-LIVE.md`](./FREEZE-LIVE.md) · [`../COORDINATION-TRUTH-LAYERS.md`](../COORDINATION-TRUTH-LAYERS.md) § Agent cold-start · human inbox [`../BOARD-CLEAR-HUMAN-BLOCKERS.md`](../BOARD-CLEAR-HUMAN-BLOCKERS.md).

Forbidden unchanged: Shehzad protocol/INTACHAIN implement · Denon open-PR dual-edit · invent money/depth · main-checkout · fake visual under NO-FLEET.
