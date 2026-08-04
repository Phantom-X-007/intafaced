# OPEN-INSTALL (work order — not law)

**Delete this file when every box is ticked.** It is a temporary work order so AFK/schedulers survive compaction. Not durable doctrine.

**P0 for every AFK cycle:** read this file. If any box is unticked, do that item this cycle before any P1–P5 work. If the file is gone, all install work is done.

---

## The open work (7 items)

- [ ] **1. `tooling/ci/value-gate.mjs` — THE ONE THAT MATTERS.** Git-only, no gh, no network.
  - files = `git diff --name-only origin/main...HEAD`
  - docsOnly = every file starts with `docs/` or ends `.md`
  - normalise(subject): strip `(#\d+)`, strip `[0-9a-f]{7,40}`, strip `/cycle\s*\d+/i`, `\d+` → `N`, lowercase, collapse whitespace
  - sim = best similarity of normalise(HEAD subject) vs normalise(last 10 on origin/main). No dependency — LCS ratio is fine.
  - hasDelta = `git log -1 --format=%B` matches `/^Board-Delta:\s*\S/m`
  - if `(docsOnly && sim >= 0.80 && !hasDelta)` print the colliding previous subject, **exit 1**. Else exit 0.
  - honour `VALUE_GATE_ADVISORY=1` → print, exit 0. Ship advisory for one cycle first.
  - leave a self-test: two fixture subjects, assert exit 1 and exit 0.

- [ ] **2. `.github/workflows/docs-format.yml`** — add AFTER format:check, in the `format` job:

  ```yaml
  - name: value gate
    run: node tooling/ci/value-gate.mjs
  ```

  MUST be here. `ci.yml` has paths-ignore `['docs/**','**/*.md']`, so a gate in `gates.mjs` never runs on a docs-only PR — and 118 of the last 120 commits were docs-only.

- [ ] **3. Board-Delta: trailer.** One line in `CONTRIBUTING.md` section 7. Currently 0 uses.

- [ ] **4. churn counter in `swarm.mjs`** — count consecutive merged commits touching nothing outside `docs/`; print in `swarm:status`; warn at ≥5. Reuse the existing `git()` helper. There is NO counting logic today: grep `function churn|churnCount` = 0 matches.

- [ ] **5. `buildLanes` + `case 'lanes':` + `pnpm swarm:lanes`.** Not implemented — the three "lanes" strings in `swarm.mjs` are printed text, not code. Lift the porcelain parser from `worktree-gc.mjs:39-78`; do not write a third copy. P1 is undiscoverable today.

- [ ] **6. worktrees:** 92 now (was 270 — good). Target &lt;20. Run `worktree-gc.mjs --apply` again.

- [ ] **7. DELETE `docs/ops/AFK-NO-STAMP-MILL.md`.** Fold its table into `SWARM-MANDATE.md`. Do not add law files whose "## Machine enforcement" is only that `swarm:status` PRINTS a ban. Printing is not enforcing.

---

## Honest scoring rule

Report each item done/not-done with the command output that proves it. Do not report "enforced" for anything that only prints. If item 1 is not built, say so plainly — it is the only piece that works when you are not choosing to follow it.

Validation: docs-only + 0.80 similarity over last 400 commits blocks ~169 stamp-mill commits with zero false positives on real work (#489, #468, #464, #711).

## After all boxes ticked

1. Delete this file in a Class N PR.
2. Resume normal AFK: ladder P1–P5, merge only Nitro Class N with full green, never merge Denon/Shehzad, never Shehzad M1–M7 implement, never invent money/depth, NO-FLEET unchanged.
