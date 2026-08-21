# Working on INTAFACED

Two humans, several AI agents, one repo. This file is how that stays clean.

Read once, properly. It takes five minutes and saves a week.

> The **what** to build is [`INTAFACED_DEFINITIVE_BUILD.md`](INTAFACED_DEFINITIVE_BUILD.md).
> The **rules** for building it are [`tooling/agent-protocol/AGENT_PROTOCOL.md`](tooling/agent-protocol/AGENT_PROTOCOL.md).
> This file is **how we collaborate**.

---

## 0 · 60-second ship (Denon, Shehzad, Nitro agents)

1. One service per PR. Worktree. Squash-merge your own green PR.
2. **Denon / Shehzad** merge when CI is green + self-audit. **Nitro agents** merge Class N/P/M when gates pass. Nobody waits for Nitro to Approve.
3. CI red → the **job name** is the failure (`Doctrine gates`, `Tests (protocol)`, `Tests (full)`, …). Fix that job. Re-push. Do not ask Nitro.
4. `audited:true` stays false until a paid external audit. Leave it. Keep shipping.
5. Money still through `packages/ledger-client`. No balances in a service. No money in a `number`. No fake books, mids, or vendor names in the UI.
6. Coordination-only PRs (status, keepalive, board unchanged) are forbidden. Near-duplicate unwired series: warn, then block on the fourth; escape is `Serial-Work: <why>`.
7. Class X (secrets, prod go-live, licences, sanctions, audit **budget**) is Nitro the human. Everything else ships.

---

## 1 · The model: GitHub Flow, nothing else

```
main ─────●──────●──────●──────●─────►   always deployable
           \    /  \    /
            ●──●    ●──●                 short-lived feature branches
```

- `main` is **always deployable**. Green tip is the goal; red tip is a defect, not a mode of work.
- **If `main` is red** (doctrine gates, typecheck, tests, money paths): **one heal lane**, not a fleet freeze.
  - First free agent claims `main-heal` in [`docs/LIVE-LANES.md`](docs/LIVE-LANES.md) (or the `blocked-main` label) and opens **one** fix PR.
  - Do **not** open competing fix PRs for the same red.
  - Other agents may keep **path-disjoint craft** in existing worktrees (swarm width stays). They **must not merge to `main`** until tip is green again (the heal PR is the merge that clears the tip).
  - Telegram Nitro only if the heal is blocked on Class X / a human ruling — not for every red.
- Every change is a **short-lived branch → PR → merge**. No exceptions, including for "tiny" changes.
- **No long-lived branches.** A branch older than ~2 days is a merge conflict waiting to happen. Split the work instead.
- **No direct pushes to `main`.**
- **Trunk CI finishes every merge.** `ci.yml` does **not** cancel in-progress runs on `main` (PR branches still cancel superseding pushes). Unlimited parallel ship stays; the trunk signal must not be sacrificed to a cancel storm.

### How "no direct pushes" is actually enforced

The repo is **public**. Branch protection is free. Intended admin settings live in [`docs/ops/OWNER-GITHUB-CONFIG.md`](docs/ops/OWNER-GITHUB-CONFIG.md) — Denon clicks them; agents do not `PUT` protection.

| Layer                              | Enforces                                         | Bypassable                                     |
| ---------------------------------- | ------------------------------------------------ | ---------------------------------------------- |
| `.githooks/pre-push`               | blocks `git push` to `main`                      | yes — `--no-verify`                            |
| Squash-only + auto-delete branches | clean history                                    | no (server-side)                               |
| CI on every PR                     | doctrine gates, typecheck, tests, secrets, brand | merge still a click until required checks land |
| Required **human** reviews         | **off on purpose** — nobody waits for Nitro      | —                                              |
| CODEOWNERS                         | review **request**, not a merge wait             | —                                              |

The hook is installed automatically by `pnpm install` (`core.hooksPath`), and it applies in worktrees too.

Until required CI checks are on: CI still _runs_ and _reports_; nobody is stopped from clicking merge on a red one. So: **don't.** The job **name** is the failure. Fix that job. Re-push. Do not ask Nitro.

Do **not** turn on required approvals or required code-owner reviews. That re-creates the human bottleneck this file exists to kill. Auto-merge is an admin click (Denon) so green PRs queue instead of being polled.

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
**Not** a chat log: do not open PRs whose only job is status, R07/peace, FREEZE tip-bump, claims meter, or “board unchanged.” Those stay files; see `AGENTS.md` · `docs/ops/SWARM-MANDATE.md`.

**Small and focused.** One service per PR (§15.1). If a PR needs the word "and" to describe it, it is two PRs. A 200-line PR gets a real review; a 2,000-line PR gets "LGTM" and a bug in production.

**Title:** `<type>(<scope>): <what changed>` — `feat(svc-identity): rank recalculation on XP events`

**Description:** the template asks what changed, why, and how you know it works. Fill it in. "Why" is the part reviewers cannot reconstruct from the diff.

**Review is asymmetric (on purpose).** Nitro is not a code reviewer; forcing him to Approve anyone’s PRs is theater and slows shipping.

| Who opened the PR                      | Before merge                                                                                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Denon**                              | CI green + doctrine/money self-audit. Squash-merge. No Nitro Approve.                                                                                     |
| **Shehzad** (protocol/INTACHAIN paths) | CI green + self-audit. Squash-merge. No Nitro Approve.                                                                                                    |
| **Nitro agent**                        | Class N/P/M: CI green + self-audit (Class M = money self-audit + second-pass). Squash-merge. Denon may review asynchronously. Class X: never agent-merge. |

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

Every PR runs, and all of it must be green to merge. The **job name** is the diagnosis — open that log, not Telegram.

| Check                                                                       | What it protects                                                                       |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `Doctrine gates`                                                            | brand-scan (§0.7), custody-scan (§16.10), migration reversibility (§14), money honesty |
| `Format`                                                                    | prettier — fails in seconds, not behind typecheck                                      |
| `Typecheck & build`                                                         | the whole monorepo compiles                                                            |
| `Tests (protocol)` / `Tests (money)` / `Tests (trade)` / `Tests (pay-bank)` | affected shards only                                                                   |
| `Tests (full)`                                                              | entire suite: tooling, lockfile, contracts/events, `push:main`, or 3+ shards           |
| `CI merge seal`                                                             | aggregator so skipped shards cannot pend a required check                              |
| `Definition of Done`                                                        | the §14 gate per service                                                               |
| `Gitleaks` / `Dependency audit`                                             | secrets and known CVEs                                                                 |

Run the same thing locally before pushing. It is **required** — not to save anything, but because local is seconds and a CI round trip is minutes:

```bash
pnpm verify    # build · typecheck · test · DoD gate
```

**No CI budget, no throttle.** This repo is public and GitHub Actions on standard runners are free and unlimited for it. Open the PR when the unit is done; never sit on finished work to keep a run count down. There is no PR cap and no review gate on how many you open. (Old Actions spend thrift deleted 2026-08-07 — [`docs/GITHUB-CI-SPEND-CONTROL-2026-07-31.md`](docs/GITHUB-CI-SPEND-CONTROL-2026-07-31.md).) Coordination-only PRs stay banned for noise, not cost.

Because merging is not _blocked_ on CI (see §1), reading the checks before you approve is a real responsibility rather than a formality. A green tick you did not look at is the same as no CI at all.

**If `main` goes red, healing it is the highest-priority _merge_ work in the repo** — claimed as a single `main-heal` lane (see §1). Not five agents rewriting the same gate. Other path-disjoint craft may continue in worktrees; **no product merges onto a red tip.**

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
