# Working on INTAFACED

Two humans, several AI agents, one repo. This file is how that stays clean.

Read once, properly. It takes five minutes and saves a week.

> The **what** to build is [`INTAFACED_DEFINITIVE_BUILD.md`](INTAFACED_DEFINITIVE_BUILD.md).
> The **rules** for building it are [`tooling/agent-protocol/AGENT_PROTOCOL.md`](tooling/agent-protocol/AGENT_PROTOCOL.md).
> This file is **how we collaborate**.

---

## 1 · The model: GitHub Flow, nothing else

```
main ─────●──────●──────●──────●─────►   always deployable
           \    /  \    /
            ●──●    ●──●                 short-lived feature branches
```

- `main` is **always deployable**. If `main` is red, that is the only thing anyone works on.
- Every change is a **short-lived branch → PR → merge**. No exceptions, including for "tiny" changes.
- **No long-lived branches.** A branch older than ~2 days is a merge conflict waiting to happen. Split the work instead.
- **No direct pushes to `main`.**

### How "no direct pushes" is actually enforced

Honestly: **partially**, and you should know exactly where the gap is.

GitHub's branch protection and rulesets both require a paid plan on a private repository. We are on Free, so `main` has no server-side protection. What we have instead:

| Layer                              | Enforces                                | Bypassable          |
| ---------------------------------- | --------------------------------------- | ------------------- |
| `.githooks/pre-push`               | blocks `git push` to `main`             | yes — `--no-verify` |
| Squash-only + auto-delete branches | clean history                           | no (server-side)    |
| CI on every PR                     | build, typecheck, tests, doctrine gates | no (server-side)    |
| Us reviewing each other            | everything that matters                 | —                   |

The hook is installed automatically by `pnpm install` (`core.hooksPath`), and it applies in worktrees too. It catches the realistic failure — muscle memory, a stray `git push` in the wrong terminal — which between two people who have agreed to this workflow is essentially the whole risk.

What it does **not** do is make merging conditional on CI passing. CI still _runs_ on every PR and still _reports_; nobody is stopped from clicking merge on a red one. So: **don't.** Check the checks.

> If we later want this enforced properly, GitHub Pro is $4/month and turns on branch protection, required status checks, and required approvals. Worth it the day a third person joins; not worth it for two people who read each other's PRs.

### Branch names

```
feat/<scope>-<short-description>     feat/svc-identity-rank-events
fix/<scope>-<short-description>      fix/ledger-drift-on-retry
chore/<short-description>            chore/bump-drizzle
docs/<short-description>             docs/terminal-architecture
```

Scope is the service or package: `svc-ledger`, `venue-adapter`, `ui`.

---

## 2 · Worktrees are mandatory

**Nobody works in the main checkout. Not you, not me, not any agent.**

This is the single highest-leverage rule in this file. With multiple people and multiple AI agents running at once, the failure mode is always the same: two agents edit the same working directory, `git stash` eats something, and an afternoon disappears. Worktrees make that structurally impossible — each branch gets its own directory, its own `node_modules`, its own running dev server.

```bash
pnpm wt feat/svc-identity-rank-events   # create worktree + install deps
pnpm wt:list                            # what exists
pnpm wt:rm feat/svc-identity-rank-events  # clean up after merge
```

Worktrees live in `../intafaced-worktrees/<branch>` — a sibling of the main checkout, never inside it.

**The main checkout is for one thing only:** `git pull` on `main`, and reading. Never edit there.

### Why each worktree gets its own `node_modules`

It has to — the dev server, the TypeScript server, and the test runner all resolve from it. pnpm's content-addressed store hardlinks the actual files, so ten worktrees cost roughly one worktree of disk. `pnpm wt` runs the install for you.

### Pointing an AI agent at a worktree

Open the agent **in the worktree directory**, not the main checkout. Claude Code, Cursor, whatever — the agent's working directory is the worktree, so it physically cannot touch another branch's files.

Two agents on two worktrees can run at the same time with zero coordination. That is the whole point.

---

## 3 · Pull requests are the product review layer

We are not going to maintain a project board. **Product** coordination (what changed, why, how you know) lives on PRs.  
**Not** a chat log: do not open PRs whose only job is status, R07/peace, FREEZE tip-bump, claims meter, or “board unchanged.” Those stay files; see `AGENTS.md` thrift · `docs/ops/SWARM-MANDATE.md`.

**Small and focused.** One service per PR (§15.1). If a PR needs the word "and" to describe it, it is two PRs. A 200-line PR gets a real review; a 2,000-line PR gets "LGTM" and a bug in production.

**Title:** `<type>(<scope>): <what changed>` — `feat(svc-identity): rank recalculation on XP events`

**Description:** the template asks what changed, why, and how you know it works. Fill it in. "Why" is the part reviewers cannot reconstruct from the diff.

**Review is asymmetric (on purpose).** Nitro is not a code reviewer; forcing him to Approve Denon’s PRs is theater and slows shipping.

| Who opened the PR            | Before merge                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| **Denon**                    | CI green + his agent’s doctrine/money self-audit. He may squash-merge without Nitro’s Approve. |
| **Nitro** (or Nitro’s agent) | Denon (or Denon’s agent) reviews, then merges.                                                 |

**Optional, not blocking:** Nitro’s agent may post an audit comment on Denon’s PR. That is signal, not a gate.

**What to actually look at when reviewing Nitro’s PR / self-auditing Denon’s** (priority order):

1. Does it touch money? Then read every line, and check the tests cover the failure branches.
2. Does it cross a service boundary without going through `packages/contracts` or `packages/events`? Reject.
3. Does it hold a balance outside the ledger? Reject (Doctrine §0.6).
4. Is anything "temporary"? Reject, or make it a §13 socket entry.
5. Everything else.

Approving something you have not read (when you _are_ the technical reviewer) is the only real failure mode. Rubber-stamp Approves from a non-coder do not count as review.

**Merge:** squash. One commit per PR on `main`, so history reads as a list of changes rather than a list of keystrokes.

**Delete the branch on merge**, and remove the worktree: `pnpm wt:rm <branch>`.

---

## 3.5 · The tracker — how you find work

[`docs/TRACKER.md`](docs/TRACKER.md) lists **every feature in the build**, with its phase, its plane, and whether it can be started right now.

```bash
pnpm tracker          # regenerate + summary
pnpm tracker ready    # just what is claimable today
pnpm tracker trade    # everything for one module
pnpm tracker 2        # everything in a phase
```

**To claim something:** find it under 🟢, then in `tooling/tracker/features.mjs` set `owner` and `status: 'wip'`, run `pnpm tracker`, and include both files in your first PR. That is how the other person knows not to start the same thing.

**To ship something:** set `status: 'done'` and list the paths it created in `requires`.

**Mountain events only (not every micro-PR):** touch `features.mjs` on claim, owner handoff / human lock, done/cut, or an optional wave note after real progress. Craft under an already-`wip` mountain does **not** require a registry edit. Session dual-build prevention is `docs/LIVE-LANES.md` + open PRs — full contract: [`docs/COORDINATION-TRUTH-LAYERS.md`](docs/COORDINATION-TRUTH-LAYERS.md).

Two things keep this honest, because a tracker nobody trusts is worse than none:

- **`blocked` is computed, never declared.** A feature is blocked when a dependency is not done. You cannot mark something ready by wishing.
- **`done` is validated against the repo.** A feature claiming done whose service does not exist on disk fails CI. You cannot tick a box for code that is not there.

This is why we can stay off a project board: the tracker is derived from the same registry the code is checked against, so it cannot quietly go stale the way a board does.

---

## 4 · Issues only when useful

Do **not** file an issue for everything. A tracker nobody reads is worse than no tracker.

**File an issue when:**

- The work will take more than a day
- It needs discussion or a decision before anyone writes code
- It is a bug someone else might hit and needs to find
- You want it on record but nobody is doing it yet

**Otherwise:** claim it in Telegram, open the branch, open the PR. The PR _is_ the record.

---

## 5 · CI

Every PR runs, and all of it must be green to merge:

| Check                | What it protects                                                        |
| -------------------- | ----------------------------------------------------------------------- |
| `Doctrine gates`     | brand-scan (§0.7), custody-scan (§16.10), migration reversibility (§14) |
| `Typecheck & build`  | the whole monorepo compiles, and formatting is consistent               |
| `Tests`              | every package's suite, against real Postgres/Redis/NATS                 |
| `Definition of Done` | the §14 gate per service                                                |

Run the same thing locally before pushing — it is faster than waiting for CI, and it is **required thrift** (Actions is metered on private Free plans after free minutes; public standard runners are free — visibility is a business decision, not thrift):

```bash
pnpm verify    # build · typecheck · test · DoD gate
```

**Actions thrift (both of you / all agents):** local workshop first; one push per unit — do not use remote CI as a debugger (push storms still bill partial minutes when cancelled). Parallel **product** PRs stay allowed; coordination-only PRs are banned. Docs-only changes skip full CI via path filters in `.github/workflows/ci.yml`. Full law: [`docs/GITHUB-CI-SPEND-CONTROL-2026-07-31.md`](docs/GITHUB-CI-SPEND-CONTROL-2026-07-31.md) · `AGENTS.md`. Does **not** add a review gate or hard-cap how many product PRs you open.

Because merging is not _blocked_ on CI (see §1), reading the checks before you approve is a real responsibility rather than a formality. A green tick you did not look at is the same as no CI at all.

**If `main` goes red, fixing it is the highest priority work in the repo.** Not "after this PR". Now.

---

## 6 · Day one

```bash
gh repo clone Phantom-X-007/intafaced && cd intafaced
pnpm install
cp .env.example .env
docker compose up -d
pnpm --filter @intafaced/svc-ledger db:migrate
pnpm build && pnpm test          # expect green
```

Then make your first change in a worktree:

```bash
pnpm wt feat/my-first-change
cd ../intafaced-worktrees/feat-my-first-change
# ... work, commit ...
gh pr create --fill
```

Infrastructure ports (Postgres `5433`, Redis `6380`) are deliberately non-standard — a native Postgres usually owns `5432`, and the platform must not depend on that being free.

---

## 7 · Commits

Conventional commits, because the scope prefix makes `git log` scannable:

```
feat(svc-ledger): hash-chain every transaction
fix(venue-adapter): exclude stale venues from routing
chore(ci): cache pnpm store between runs
docs(terminal): record the cross-venue architecture
test(ledger): conformance suite against Postgres
```

Commit messages inside a PR do not need to be perfect — the squash-merge title is what lands on `main`. Make _that_ one good.

---

## 8 · The short version

1. Never work in the main checkout — `pnpm wt <branch>`
2. Never push to `main` — PR, always
3. Small PRs, real reviews, "Request changes" freely
4. Green CI before merge, no exceptions
5. Delete the branch and the worktree when it merges
6. If `main` is red, drop everything

Agents automate process so humans don’t re-learn it: see **Nitro operator mode** and **Denon agent mode** in [`AGENTS.md`](AGENTS.md).

- Plain map (Nitro): [`docs/START-HERE.md`](docs/START-HERE.md)
- Paste prompt every chat: [`docs/NITRO-SESSION-PROMPT.md`](docs/NITRO-SESSION-PROMPT.md)
- Paste for Denon: [`docs/MESSAGE-DENON-WORKFLOW.md`](docs/MESSAGE-DENON-WORKFLOW.md)

## Board-Delta trailer (docs / AFK)

When a change is **docs-only**, declare real work in the commit body (git trailer form):

```
Board-Delta: free product count changed
```

**Valid:** free product count changed · partner PR changed state · scan finding count changed · new Class N PR opened/merged · a spec gained substantive content.  
**Not valid:** tip SHA, cycle number, "re-freeze ran".

Enforced by `tooling/ci/value-gate.mjs` on the Docs format workflow (advisory → strict).  
See `docs/BOARD-CLEAR-PROCESS-LOOPS.md` L0 and `docs/ops/SWARM-MANDATE.md`.

## Serial-Work trailer (code series)

The same gate runs on the CI `gates` job, and there it asks a different question.
It looks at a **code** PR when two things are true at once:

1. the subject is a near-duplicate of a recent one **once the per-PR detail in
   brackets is stripped** — `feat: L3 free-TRK wave45 (…)` and `wave12 (…)` are
   the same series key; and
2. the change adds new named symbols and **none of them is referenced from a
   non-test file outside the files it added symbols to**.

Similar titles are fine on their own — real migrations and per-service rollouts
produce them honestly, and those pass because they wire what they add. Similar
titles plus nothing calling the result is the same work counted twice.

The first two in a row **warn**. The **fourth consecutive** one is red. If the
series is genuinely right, say so on the record:

```
Serial-Work: per-service rollout of the rail adapter, one service per PR by design
```

The reason is echoed into the CI log and is greppable forever:
`git log --grep '^Serial-Work:'`. A bare `Serial-Work:` with no reason is not an
escape. This is **not** a `Board-Delta:` — that trailer is the docs escape and is
too common to mean anything here.

**Never** satisfied by touching the tracker: `features.mjs` is for mountain
events only (`docs/COORDINATION-TRUTH-LAYERS.md`), and this gate deliberately
does not ask about it.
