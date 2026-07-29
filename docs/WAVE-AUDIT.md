# Wave audit — after Denon ships again

**Purpose:** cheap, complete-enough re-scan after a merge wave — not full archaeology.  
**Full method:** [`FULL-AUDIT-PROGRAM-2026-07-29.md`](FULL-AUDIT-PROGRAM-2026-07-29.md)  
**Last full floor:** [`PEACE-OF-MIND-AUDIT-CURRENT.md`](PEACE-OF-MIND-AUDIT-CURRENT.md)

---

## When to run

After Denon merges a burst of PRs (or you notice main moved a lot).  
Do **not** re-run A–E full program unless: main is red on doctrine/money tests, law version changes, or peace-of-mind and reality violently disagree.

---

## Operator steps (agent does these — Nitro does not)

1. **Freeze tip:** `git fetch origin && git rev-parse origin/main`
2. **Delta list:** commits/PRs since last peace-of-mind SHA
3. **L0 machine truth first:** `pnpm scan:brand`, `pnpm scan:custody`, `pnpm format:check`, `pnpm tracker:check`, CI status, `pnpm verify` if feasible
4. **Risk layers (only on delta):**
   - money recipes / ledger posts / claim-before-post / reverse atomicity
   - new publicProcedure / unauth routes / ownership
   - edge routes + compose ports + Dockerfile list
   - tracker `done` honesty for touched features
   - vendor / brand names
5. **Adversarial = maker-checker** on every new P0/P1:
   - fresh context · read-only tools · assume broken
   - prefer **cross-family** model when available
   - critic does not implement the fix
6. **False-done check** on fix diffs (weakened tests, empty catch, type-suppression on money files)
7. **Update** `PEACE-OF-MIND-AUDIT-CURRENT.md` scoreboard + residual queue
8. **Fix P0** without waiting; open PR

Method depth: [`PLAN-META-AUDIT-FULL-AUDIT-PROGRAM-2026-07-29.md`](PLAN-META-AUDIT-FULL-AUDIT-PROGRAM-2026-07-29.md) · residual money program: [`AUDIT-V2-RESIDUAL-AND-STRESS-2026-07-29.md`](AUDIT-V2-RESIDUAL-AND-STRESS-2026-07-29.md)

---

## Workflow automation

Project workflow: `.grok/workflows/denon-wave-audit.rhai`

Args:

```json
{ "since_sha": "<last peace-of-mind baseline>", "worktree": "<path to clean checkout>" }
```

Stage routing (judgment vs mechanical): mechanical = inventory/CI/greps · judgment = money/auth/doctrine · skeptic = separate strong model.

Manual equivalent if workflow unavailable: this checklist + parallel explore agents on L2/L3/L5 for the delta only.

---

## Exit criteria for a wave

- [ ] New tip SHA recorded
- [ ] Brand/custody/format/tracker stated (L0)
- [ ] Every new money or auth surface judged (with coverage counts if possible)
- [ ] P0 fixed or blocked with reason
- [ ] Adversarial pass named for each P0/P1 (not self-grade only)
- [ ] Peace-of-mind scoreboard lines updated
