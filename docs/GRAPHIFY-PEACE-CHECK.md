# Graphify peace check

**As of:** 2026-08-16. **Tip then:** `7d05b13e`.  
**What this is:** how we know Graphify is real, and how to re-check after a cook.  
**Not:** a second OS. Agents run the checks. You read the RESULT line.

Substance: maximize impact ÷ compute. Existence ≠ use.

---

## 1 · What “working” means (official claim, not ours)

Graphify’s own always-on rule: for codebase questions, run `graphify query` / `path` / `explain` first. That returns a **scoped subgraph**, usually much smaller than `GRAPH_REPORT.md` or raw grep.

We treat that as true only when we can measure it.

---

## 2 · Now-tests (ran this turn)

| #   | Test                                                 | Result                                                                                                                                 | Provenance           |
| --- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1   | Engine is official PyPI, current                     | **PASS** `graphify` 0.9.44 = PyPI latest. No Graphify repo clone.                                                                      | RAN-IT               |
| 2   | Query-first is on main                               | **PASS** `AGENTS.md` §§ graphify                                                                                                       | RAN-IT `origin/main` |
| 3   | Graph loads, no broken edges                         | **PASS** 16 012 nodes → after update **16 590** / 35 117 edges. Diagnose: 0 missing/dangling/self-loop/collapse                        | RAN-IT               |
| 4   | Corpus lock (no paste walls / docs / vendor / `.md`) | **PASS** 0 hits. Roots: `services` + `packages` only                                                                                   | RAN-IT               |
| 5   | Cited files exist on tip                             | **PASS** `payment-service.ts`, `checkout-page.ts`, `ledger.test.ts` on `origin/main`                                                   | RAN-IT               |
| 6   | Query smaller than reading the file                  | **PASS** checkout query **2 824** chars vs checkout-page **27 075** bytes vs payment-service **131 047** vs GRAPH_REPORT **112 585**   | RAN-IT               |
| 7   | Vague query can miss                                 | **KNOWN** “where does ledger-client move value” also hits `moveAvatar()` — size is small, **aim can be wrong**. Narrow the question.   | RAN-IT               |
| 8   | Incremental update after 128 new commits             | **PASS** with `GRAPHIFY_MAX_WORKERS=1`. First try failed (`Operation not permitted` on multiprocess). Then `built_at` = tip `7d05b13e` | RAN-IT               |
| 9   | SQL files in the map                                 | **WARN** 252 `.sql` files empty (optional extra not installed)                                                                         | RAN-IT               |

**Now verdict:** the map is real and smaller than raw files. It is not a mind-reader — vague questions stay noisy. Update works. You can trust **query-after-extract**, not “any English sentence.”

---

## 3 · What we still cannot prove until a cook

| Claim                               | Why not now                                                     |
| ----------------------------------- | --------------------------------------------------------------- |
| The next builder _will_ query first | That is behaviour. Law is on disk; obedience is a later session |
| Tokens on a whole PR went down      | Need one real mountain with query vs a prior cook that grepped  |
| “Faster” in wall-clock              | Same — one cook, timed by what landed, not by feeling           |

Flip: if a cook greps `services/` for 20 files and never runs `graphify query`, the install did not pay. Fix the agent, not Graphify.

---

## 4 · How you check later (after you have coded)

You do not run tools. Ask in chat: **“graphify peace.”**

The agent must, in that turn:

1. Run `pnpm graphify:peace` and paste the **RESULT** line.
2. Say whether **this cook** ran `graphify query` / `path` / `explain` **before** a broad search of `services/` or `packages/`. Yes / no / not a code cook.
3. If the map was missing or RED: they extract/update, then re-run the check.

Green RESULT + “yes we queried first” = Graphify was used as intended.  
Green RESULT + “no we grepped the universe” = tool works, we wasted it.  
RED RESULT = do not trust the map until extract/update.

---

## 5 · Commands (agents, not you)

```
pnpm graphify:peace          # this file’s machine half
pnpm graphify:extract        # first time in a worktree
GRAPHIFY_MAX_WORKERS=1 graphify update .   # after code, if multiprocess is blocked
graphify query "<one mountain question>" --budget 1500
```

---

## 6 · Unspoken needs (locked)

- Peace of mind is a **RESULT line**, not “we installed it.”
- You will not remember to check — the phrase **graphify peace** is enough.
- Benefits are **smaller context + right file**, not a second dashboard.
- We do not vibe token savings. We re-measure on the next real cook.

---

## 7 · After the next product cook

The builder’s last lines to you:

- Peace: `RESULT GREEN` or `RED`
- Used: queried first — yes/no
- Needle: PR link
