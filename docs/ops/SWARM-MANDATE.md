# Swarm mandate scope

## ONE SURFACE — read before any front-end work (mandatory)

`vendor/upstream-exchange/05_Web_Front`, served on `:8090`, is the **sole product surface**.
Law: ADR [`../adr/2026-08-03-retire-apps-web-port-to-vue-shell.md`](../adr/2026-08-03-retire-apps-web-port-to-vue-shell.md) (Accepted, owner decision) and doctrine §5.3. **Settled — implement it, do not re-litigate it.**

> **Path warning, 2026-08-04.** 17 docs now spell that directory `vendor/upstream-exchange`
> after the #743/#745 brand-scrubs. **No such directory exists.** The tree on disk is
> `vendor/upstream-exchange` and always has been; the scrub renamed the docs and not the code, so
> the rename the brand-scan allowlist keeps anticipating ("remove this entry once the vendor
> directory is renamed") is still pending. Until it happens: `cd` to `vendor/upstream-exchange`,
> and do not "fix" a doc that disagrees — fix the directory, once, deliberately.

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
| `freeShell`         | REGROUP/AFK/LANDER/INTEGRITY only — shell craft                                                                 |
| `freeImplementable` | Tracker rows that pass the implementable gate                                                                   |
| `freeProduct`       | `freeShell` **+** `freeImplementable` (spawn total)                                                             |
| `freeShell=0`       | No shell craft — **not** all-clear if `freeImplementable>0` or path-clear P1 remains                            |
| `freeProduct=0`     | Both shell and implementable empty — **not** “platform done”; run P1–P5                                         |
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

Machine: `pnpm swarm:status` lane line is always:

`free=N freeShell=N freeImplementable=N freeTracker=N blocked=N`

`freeProduct` appears only on the spawn line as shell+implementable. **`freeShell=0` / `freeProduct=0` must never be read as all-clear** when `freeImplementable>0` or stranded P1 remains.

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

| Mechanism                                      | What it does when context degrades                                                                                                                                                                                                                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`tooling/ci/value-gate.mjs` on Docs format** | **Exits 1** (strict) on docs-only + ≥0.80 subject similarity to last 10 ancestors + no `Board-Delta:` trailer. Git-only. **This is stamp enforcement.**                                                                                                                                         |
| **`tooling/ci/value-gate.mjs` on CI `gates`**  | Same gate, **code half** (2026-08-06 · #832–#876). **Exits 1** on ≥0.80 **series** similarity **and** zero new symbols reached from a non-test file outside them **and** no `Serial-Work:` trailer **and** consecutive run ≥3. Run 1–2 **WARN, exit 0** — the first offence is loud, not fatal. |
| **Zero-walk guard (both wirings)**             | No subject / no diff / no ancestors / broken symbol walk ⇒ **exit 1, advisory included**. Both checkouts pin `fetch-depth: 0`; under the `actions/checkout` default of 1 this gate printed `OK` having compared nothing to nothing.                                                             |
| **`pnpm thrift:check` / `pnpm pr` / pre-push** | **Meter + WARN only** — never exit-1 on run counts. Delivery is never blocked by a volume number.                                                                                                                                                                                               |
| **CI / Docs-format triggers**                  | **PR only** (no push:main). Docs-format skips FREEZE/claims/R00–R02/DASHBOARD-only. Manual: `workflow_dispatch`.                                                                                                                                                                                |
| **Coordination PR ban**                        | No PR whose sole job is R07/peace/cycle/FREEZE tip-bump/claims meter/status. Those stay files; ship only with a real product/law delta.                                                                                                                                                         |
| `pnpm swarm:status` ops-churn / Actions 24h    | Prints meter + thrift level (soft/ok) — informational                                                                                                                                                                                                                                           |
| `pnpm swarm:lanes`                             | **Discoverability only** — enumerates P0–P3                                                                                                                                                                                                                                                     |

Self-test (fixtures, no network): `pnpm value-gate:self-test` · `pnpm thrift:self-test`.

### F-STANDBY (finish type when freeProduct=0) — corrected

When the primary board finish is met but the session continues (AFK / “never stop”), the state is **F-STANDBY** ([`FINISH-ONTOLOGY.md`](./FINISH-ONTOLOGY.md) §1, §3 — in-repo home; readable by every teammate and every machine).

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

Parallel **coding** is free. GitHub is the **merge seal**, not the workshop or the chat log.

| Rule                      | Detail                                                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Local-first**           | Finish a unit locally; push once. Never re-push only to watch CI.                                                                      |
| **No coordination PRs**   | Forbidden: R07 / peace / cycle N / FREEZE-only / claims-only / “board unchanged” PRs. Files stay local until a real product/law delta. |
| **Path-cluster batching** | Soft prefer **one PR per coherent path-cluster** when residual ids share a service — not a hard “one PR per day” gate.                 |
| **Open path**             | `pnpm thrift:check` (warn meter) then `pnpm pr -- …`.                                                                                  |
| **Push path**             | `.githooks/pre-push` runs thrift meter (never blocks on counts) + format:check.                                                        |
| **Caps**                  | Warn-only refs (soft≥120 · total≥220 · docs≥120 · ci≥160). **No exit-1 on volume.** Stamp mill = value-gate.                           |

**Cold resume (no third file):** regenerate + read [`FREEZE-LIVE.md`](./FREEZE-LIVE.md) · [`../COORDINATION-TRUTH-LAYERS.md`](../COORDINATION-TRUTH-LAYERS.md) § Agent cold-start · human inbox [`../BOARD-CLEAR-HUMAN-BLOCKERS.md`](../BOARD-CLEAR-HUMAN-BLOCKERS.md).

Forbidden unchanged: Shehzad protocol/INTACHAIN implement · Denon open-PR dual-edit · invent money/depth · main-checkout · fake visual under NO-FLEET.
