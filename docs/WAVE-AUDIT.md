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
3. **Machine truth:** `pnpm scan:brand`, `pnpm scan:custody`, `pnpm format:check`, `pnpm tracker:check`, CI status, `pnpm verify` if feasible
4. **Risk layers (only on delta):**
   - money recipes / ledger posts
   - new publicProcedure / unauth routes / ownership
   - edge routes + compose ports + Dockerfile list
   - tracker `done` honesty for touched features
   - vendor / brand names
5. **Adversarial pass** on every new P0/P1 claim
6. **Update** `PEACE-OF-MIND-AUDIT-CURRENT.md` scoreboard + residual queue
7. **Fix P0** without waiting; open PR

---

## Workflow automation

Project workflow (when saved): `.grok/workflows/denon-wave-audit.rhai`

Args:

```json
{ "since_sha": "<last peace-of-mind baseline>", "worktree": "<path to clean checkout>" }
```

Manual equivalent if workflow unavailable: this checklist + parallel explore agents on L2/L3/L5 for the delta only.

---

## Exit criteria for a wave

- [ ] New tip SHA recorded
- [ ] Brand/custody/format/tracker stated
- [ ] Every new money or auth surface judged
- [ ] P0 fixed or blocked with reason
- [ ] Peace-of-mind scoreboard lines updated
