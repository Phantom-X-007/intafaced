# GitHub CI spend control — law for agents + humans

**Status:** Active operating law (not a one-off chat note).  
**Home for this fact:** this file + the thrift section in [`AGENTS.md`](../AGENTS.md). Do not fork a second policy in random docs.  
**Repo:** `Phantom-X-007/intafaced` (private) · Actions bill **repo owner** (`Phantom-X-007` / Denon).  
**Prior research (background only):**  
[`GITHUB-ACTIONS-BILLING-FIX-2026-07-30.md`](GITHUB-ACTIONS-BILLING-FIX-2026-07-30.md) ·  
[`CI-COST-AND-ALTERNATIVES-2026-07-30.md`](CI-COST-AND-ALTERNATIVES-2026-07-30.md) ·  
[`CI-FREE-OPTIONS-RESEARCH-2026-07-30.md`](CI-FREE-OPTIONS-RESEARCH-2026-07-30.md)

---

## Product intent (why this exists)

We ship **fast, autonomous, parallel**. We do **not** slow for thrift theater.  
We only stop paying for **waste** (remote CI used as a debugger, push storms, docs burning full matrix).  
**Merge safety stays:** green full CI + doctrine. **No new Denon review gate** for Nitro merge-ready work. Asymmetric review unchanged.

---

## Anti-stale rules

| Claim type                  | How not to rot                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Behavior rules** (thrift) | Canonical in **`AGENTS.md`** · mirrored here · session paste points here. Change one place → update the other same PR.       |
| **$ / minutes / “$10/day”** | Illustrative snapshots only. Re-derive: Actions run history + Denon billing page. Tag fresh numbers `[VERIFIED YYYY-MM-DD]`. |
| **Runner vendor prices**    | Re-check vendor + GitHub billing before wiring; market moves.                                                                |
| **Workflow truth**          | Read `.github/workflows/ci.yml` — path-ignore, jobs, `runs-on` win over memory.                                              |

---

## Verdict (one screen)

| Question                              | Answer                                                                                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| What costs money?                     | **GitHub Actions** machines on a **private** repo after free minutes (~2k/mo Free). Not browsing GitHub.                                 |
| Why it spiked                         | Free pool empty + dual-agent **thrash** (push → CI → cancel → push) + late failures after almost full matrix.                            |
| Proper solution                       | **(1) Agent hygiene** + **(2) cheaper managed runners** for heavy jobs. Stacked target ~**85–95%** off thrash $ without cutting quality. |
| Limits speed / parallel / automation? | **No** when rules are the neutralized set below.                                                                                         |
| Leave GitHub / public repo?           | **No.**                                                                                                                                  |

---

## Neutralized thrift (no medicine side effects)

### Explicitly NOT rules (never invent these)

| Anti-rule                                    | Why                                                              |
| -------------------------------------------- | ---------------------------------------------------------------- |
| **No max open PR count** for thrift          | Parallel shipping is how we work                                 |
| **No ban on parallel agents / streams**      | Autonomy stays                                                   |
| **No “wait for CI idle before coding”**      | Only avoid mindless re-push storms without local green           |
| **No new Denon Approve for Nitro**           | Asymmetric review unchanged                                      |
| **No weaker tests / skip doctrine**          | Critical zone                                                    |
| **Budget stop-at-cap is not a speed target** | High fuse (~$50–80) after cheap runners so it almost never trips |

### Binding agent rules (both Nitro and Denon agents)

1. **`pnpm thrift:check` / `pnpm pr` / pre-push before every CI-starting open/push.**  
   Hard-fails at default **≥220 runs/24h** or **Docs≥120** or **CI≥80** (`tooling/ci/thrift-preflight.mjs`). Soft-warns ≥120. Emergency only: `THRIFT_ALLOW=1` + PR note. [MECHANICAL 2026-08-04 deep]

2. **Local is the filter; remote is the seal.**  
   `pnpm verify` **green** before the push that **opens or updates** a code PR. Remote CI proves merge; it is not the first debugger.

3. **Prefer batching, not push storms.**  
   Finish a coherent change-set (or real fix bundle), then push. Mid-debug: stay local until green. Soft preference — not “one push per day.”

4. **If you already started CI, don’t spam re-pushes** for every tiny local edit until the next coherent fix is ready. Concurrency cancel still bills partial minutes.

5. **Parallel PRs are fine** when thrift level is ok/soft. Hard thrift → stop opening new CI-starting PRs until the 24h window cools.

6. **Docs-only:** pure `docs/**` / markdown skips full CI; Docs format runs on **PR only** (not again on main merge). Stamp mill: value-gate STRICT.

7. **Re-run all jobs** only for flake or known infra fix — not curiosity.

8. **Never “save money” by:** public repo, skipping money/doctrine tests, claiming green without verify, or disabling required checks.

### Workflow thrift (shipped — do not silently revert)

| Workflow             | Trigger thrift                                                              | Why                                                            |
| -------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `ci.yml`             | **`pull_request` + `workflow_dispatch` only** — no `push: main` full matrix | Merge used to re-run ~11–12 min billable job-sum on every land |
| `docs-format.yml`    | **PR only** + exclude FREEZE/claims/R00–R02/DASHBOARD                       | Post-merge doubles + claim-file spam                           |
| value-gate           | STRICT on Docs format                                                       | Stops freeProduct=0 tip-bump mill                              |
| pre-push + `pnpm pr` | thrift hard-fail                                                            | Agents cannot forget the meter on push/open                    |
| Caps                 | soft 120 / hard 220 / docs 120 / ci 80                                      | Tighter AFK thrift wave                                        |

[VERIFIED 2026-08-04] Prior thrash window ~776–785 runs / ~$15–20 list; double-bill + micro-PR mill were first-class root causes.

### Humans / autonomy (unchanged)

- Nitro agents: full operator loop; merge-ready Class N per campaign rules; **no** invented Denon product-law gate for residual/Stream A execution.
- Denon: merges on green + self-audit; direction for engines.
- Both: ship fast; thrift only removes waste $ .

---

## Infra half (Denon owns — max $)

| Step | What                                                                                                                                                                                   | Why                                             |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| A    | Billing: payment OK; Actions budget **~$50–80/mo**; **stop when reached ON**; alerts 75/90/100%                                                                                        | High fuse, no surprise infinite bill            |
| B    | Wire **cheaper managed runners** (e.g. Ubicloud standard ~$0.0010/min or premium ~$0.0016/min vs GH ~$0.006/min) for heavy jobs (`Typecheck & build`, `Tests`); optional all four jobs | ~**6×** cheaper remaining minutes; often faster |
| C    | Keep full green CI required to merge; keep private; keep main CI for now                                                                                                               | Critical zone                                   |
| D    | First week: confirm invoice (runner $ + any GH platform fee on third-party minutes)                                                                                                    | Ground truth                                    |

Self-host = optional later only if still expensive after thrift + cheap runners. **Not** week-1 requirement.

---

## Stacked economics (illustrative — re-verify)

| Mode                       | Hard-day order | Monthly overage (hard dual-agent) |
| -------------------------- | -------------- | --------------------------------- |
| Thrash + GH-hosted         | ~$10           | ~$50–100+                         |
| Thrift only                | ~$3–5          | ~$20–40                           |
| **Thrift + cheap runners** | ~$0.50–1.50    | ~**$5–15**                        |

Snapshots from 2026-07-31 Actions history live in the max-savings section of research chats; re-count runs when debating numbers.

---

## Snapshot evidence `[VERIFIED 2026-07-31]` (may age)

~600 recent runs: ~44% failure (often ~9–12 min burned), ~20% cancelled (often 3–11 min already), ~37% main pushes. Full green ~12–13 billable min. Docs path-ignore already in workflow.

---

## Success criteria (check any time — re-derive)

1. Hard day overage **under ~$2** target / **$5** worst after thrift + cheap runners.
2. Agents still ship **parallel** and **autonomous** — no new review theater.
3. Code PR: local green first; remote CI still required to merge.
4. Budget fuse on; almost never hit.
5. This file + `AGENTS.md` thrift section still match.

---

## Sources

- Live Actions API + job timings (2026-07-31)
- `.github/workflows/ci.yml`
- [GitHub Actions billing](https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions)
- [Runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing)
- Ubicloud public Actions pricing (standard/premium) — re-check before install
