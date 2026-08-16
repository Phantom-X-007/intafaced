# Local git + Graphify — permanent criteria

**As of:** 2026-08-16. **Tip then:** `62c0968f` (#2079).  
**Home folder:** `~/projects/Sovereign` is now on **local `main` = origin/main** (0 behind). Map present.  
**This file:** what “done properly” means. Executor + independent auditor use it.  
**Not:** a reason to keep planning. Gaps below are the remaining work.

Nitro never types git. Agents do.

---

## 1 · What you actually need (unspoken)

1. One project folder forever: `Sovereign`. You do not hop worktree paths.
2. Local git is the **working copy**. Graphify reads **disk**, not GitHub.
3. GitHub is **sync + Denon PRs**, not the knowledge base.
4. Dual-build: one cheap `gh pr list`, stay off his open files.
5. Agents query Graphify, update the map, cut/remove worktrees — **automatic for you**.
6. No 22 ghost trees. No 485-behind home. No “please rebase.”
7. Independent auditor because this planner chat is long and can drift.
8. You start coding chats now; leftover janitor is agent work, not a gate on you.

---

## 2 · Areas and pass/fail (the real list)

| Area                      | Pass looks like                                                                         | Fail looks like                                              | Now (RAN-IT 2026-08-16)                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| **A · Home checkout**     | `main`, `HEAD == origin/main`, no product edits                                         | Detached / hundreds behind / dirty cook                      | **PASS** `main` `62c0968f` = tip. Only `?? .scratch/` + one new paste doc                  |
| **B · Worktrees**         | One tree per live cook, cut from **today’s** main, removed after merge                  | 20+ trees, 400–1700 behind, remotes `[gone]`                 | **FAIL** 23 trees; almost all cemetery                                                     |
| **C · Graphify map**      | `graphify-out/graph.json` **in git** on tip; query works; corpus lock                   | Gitignored map; query missing; paste walls ingested          | **PASS** on tip. Peace script smokes query/explain/diagnose                                |
| **D · Graphify use**      | First code move = `graphify query` on the **worktree**                                  | Grep `services/` or GitHub file API as the map               | **INSTRUCTED**, not locked. One execute-agent did it                                       |
| **E · Graphify refresh**  | After code in `services/`/`packages/`: `graphify update .` and commit map if it changed | Map 128 commits stale vs files                               | **AGENT-MUST**. Hook **skips worktrees** (upstream)                                        |
| **F · GitHub role**       | `git fetch` + `gh pr list` once per cook                                                | Treating GitHub as the filesystem / “always rebase from web” | **LAW is right**; agents still drift                                                       |
| **G · Dual-build**        | Re-derive Denon open PRs; no path intersect                                             | Dual-edit `svc-trade` / his open files                       | **LIVE** he has several open (support/market/p2p/docs) — re-derive, don’t quote this table |
| **H · Token**             | Query + one file, not AGENTS.md + 16 coordinators                                       | 16 judgment chats; reread universe                           | **METHOD ready**; next cook is the proof                                                   |
| **I · Stash / leftovers** | Stashes named and triaged or dropped                                                    | Mystery stashes, 84 dirty files on home                      | **PARTIAL** home cleaned; stash@{0} holds old coordinator leftovers (not deleted)          |
| **J · Engine**            | Official `graphifyy` via `uv`, auto-upgrade                                             | Cloned Graphify-Labs; marketplace fiction                    | **PASS** 0.9.44 = PyPI                                                                     |

---

## 3 · Permanent loop (do not invent another)

```
You open chat in ~/projects/Sovereign
        ↓
Agent: git fetch; if on main → pnpm wt feat/<job> from origin/main
        ↓
Local tree already has graph.json (from git)
        ↓
graphify query "<mountain>" → edit one file
        ↓
gh pr list (Denon collide only)
        ↓
graphify update .  (if services/packages changed) + commit map if needed
        ↓
PR → merge → pnpm wt:rm
```

**You never:** rebase, `cd` to worktree paths, extract, update, or “graphify peace” unless you want a check.

---

## 4 · What is still to fix (executor chat)

1. **Janitor worktrees** — inventory 23 trees; drop SAFE/idle/`[gone]` remotes; do **not** delete dirty trees until the leftover file is named trash or committed. Use `pnpm wt:gc` plan first. Attended `--yes` only after the list is honest.
2. **Stash triage** — `stash@{0}` is this session’s park. Auditor: keep or drop. Older stashes: name them, don’t apply blindly.
3. **Home stays at tip** — every agent that lands on `main` runs `git pull --ff-only` (never rebase home). Never detach home again.
4. **Do not invent GitHub-as-disk.** After pull, Graphify + files are local.
5. **Optional later:** Grok Bot `uv tool install graphifyy` once on its VM (map already in repo).
6. **Do not** re-enable whole-`~/projects` graph-autosync (burned a session once).

---

## 5 · This chat vs new chats

**This planner chat is worn.** Do not janitor 23 trees or start product here.

| Chat         | Job                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| **You**      | Open two new Grok chats, both `cd` Sovereign. Paste below.                                                         |
| **Executor** | Janitor + lock the loop in §3–4. One PR if law/docs need a line. No product mountain in the same PR.               |
| **Auditor**  | Independent. Does not trust the executor or this chat. Uses §2 table. Writes PASS/FAIL. Does not “help implement.” |

---

## 6 · Paste — executor

```
Sovereign. Nitro never runs git.

Home is now local main at tip (verify: git branch --show-current && git rev-parse --short HEAD origin/main). Law: CONTRIBUTING — main = pull/read only; cook = pnpm wt from origin/main.

Do the janitor in docs/LOCAL-GIT-AND-GRAPHIFY-PERMANENT-2026-08-16.md §4. Worktree from tip. Do not edit home.

pnpm wt:gc dry first. Name every tree you remove and why. Dirty trees: name the leftover file before drop.

Graphify: query local graph.json. Do not use GitHub as the file store. gh pr list once for Denon.

Return: trees removed, home still at tip, peace RESULT if you run it.
```

---

## 7 · Paste — independent auditor

```
Independent auditor. Do not implement. Do not trust the planner chat or the executor.

Re-derive live (RAN-IT): home branch, HEAD vs origin/main, graphify-out/graph.json exists, pnpm graphify:peace, worktree list + behind counts, stash list, gh pr list --state open.

Score docs/LOCAL-GIT-AND-GRAPHIFY-PERMANENT-2026-08-16.md §2 A–J as PASS/FAIL/PARTIAL with one fact each.

Adversarial: is home still the place Nitro should open chats? Would a new agent query Graphify before grepping? Would they treat GitHub as the disk?

Return only the score table + the one thing still blocking “go code.”
```
