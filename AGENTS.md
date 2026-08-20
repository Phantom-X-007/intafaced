# Instructions for AI agents

You are in the INTAFACED monorepo. **Denon owns direction.** Close product mountains. Do not run a stamp mill.

## Who is driving

| Human                        | Role                                                                                        | GitHub |
| ---------------------------- | ------------------------------------------------------------------------------------------- | ------ |
| **Denon** (`@Phantom-X-007`) | Builder. Spine law + what “done” means. His agents **complete** features.                   | admin  |
| **Nitro** (`@ZenYoda3`)      | Non-technical operator. Class X (secrets, prod go-live, licences). Do not hand him git.     | write  |
| **Shehzad** (`@shehzad002`)  | Protocol Plane + INTACHAIN only. Agents **babysit** chain mountains — never implement them. | write  |

Denon does **not** wait for Nitro Approve. Merge when CI + self-audit pass. Class **X** is never agent-done.

## What “done” means (read this twice)

A run is finished when a **user-visible mountain** is `done` or honestly `cut` in `tooling/tracker/features.mjs`, or you are blocked on Class X / Shehzad / Denon product numbers.

**Not done:** CI-green PR, leftover rebase, another i18n consumer pin, another “refuse when dark” test, LIVE-LANES occupancy, “kept 3 agents going.”

`pnpm verify` proves a **module** is shippable. That bar is satisfiable forever. After verify, `pnpm ledger open-count` — if it is non-zero, the **run** is not finished. If it prints `RESUME HERE`, finish those rows first.

Home: [`docs/ops/FINISH-ONTOLOGY.md`](docs/ops/FINISH-ONTOLOGY.md) (**F-PRODUCT** = a behaviour, not a PR count).

## Sand-castle — forbidden

Do **not**:

- Fill idle slots by rebasing leftover honesty PRs or chaining i18n pin allowlists.
- Spawn on “keep going / 3 more agents / go all out” without a Tracker ID whose Done-bar a **user can do in the shell**.
- Mint D26 / Denon-hard residual IDs as if they were product-complete engines.
- Open PRs whose only job is status, keepalive, board unchanged, or tracker restamp.
- Mark `done` because tests passed while the mountain constitution (live rail, 100 locales, navigable canvas, chain) is still open — **cut** the constitution with Denon, or leave it `ready`/`wip` and say so in one line.

Do **yes**:

- Pick one tracker id. Claim it. Ship the constitution. Flip `done` or `cut`. Stop.
- Prefer wiring the vendored shell (`:8090`) + existing `svc-*` + ledger recipes.

## Money (non-negotiable)

1. Never work in the **main checkout**. `git rev-parse --show-toplevel` — if it is main, `pnpm wt <branch>` (not bare `git worktree add`).
2. Never move value outside `packages/ledger-client`. No service holds a balance.
3. Never store money in a `number`. Decimal strings on the wire, scaled bigint in memory.
4. Never invent mids / depth / live books / card rails so the UI “looks live.”
5. Never implement Shehzad chain (`owner: shehzad002`, `svc-protocol` / `svc-dex` cores).
6. Doctrine (§0) on money/custody/jurisdiction. If it does not decide: **stop and ask Denon.**

Law: [`INTAFACED_DEFINITIVE_BUILD.md`](INTAFACED_DEFINITIVE_BUILD.md). Hard bans: [`tooling/agent-protocol/AGENT_PROTOCOL.md`](tooling/agent-protocol/AGENT_PROTOCOL.md).

## Read these — and stop. Do not load the dated swarm / LANE-STOP / peace-of-mind pile.

1. This file.
2. Target service `README.md`.
3. [`docs/COORDINATION-TRUTH-LAYERS.md`](docs/COORDINATION-TRUTH-LAYERS.md) — free / owner / done = `features.mjs`. Session paths = `docs/LIVE-LANES.md`. **Tracker touch = mountain events only** (claim, handoff, done/cut). Not every craft PR.
4. [`docs/INTERNET-LEVERAGE-LAW.md`](docs/INTERNET-LEVERAGE-LAW.md) before product code — Phase A: shell + ledger + `svc-*`. No second SPA, no second money book.
5. [`CONTRIBUTING.md`](CONTRIBUTING.md) — branch, PR, worktree.

Status for humans: [`docs/START-HERE.md`](docs/START-HERE.md). Tip is never in this file — `git fetch && git log -1 --oneline origin/main` · `gh pr list --state open`.

## Internet leverage law

**Auto-load.** Home: [`docs/INTERNET-LEVERAGE-LAW.md`](docs/INTERNET-LEVERAGE-LAW.md). Phase A is finished for NOW residual craft: wire/extend, do not rebuild. PR body names which leverage you used. Class X = never agent-close. LAW = Denon first. S = Shehzad babysit.

## Coordination truth layers

**Auto-load.** Home: [`docs/COORDINATION-TRUTH-LAYERS.md`](docs/COORDINATION-TRUTH-LAYERS.md). Product map = tracker. Next = `pnpm swarm:next` only when the Done-bar is a mountain close, not leftover land. No PR cap. No extra Approves.

Dated campaign boards are sequence/history aids, not live product queues; their completion or babysit labels never override the current tracker, GitHub tip/open PRs, claims, or ledger.

## Check where you are

```bash
git rev-parse --show-toplevel && git branch --show-current
pnpm ledger
```

Never push `main`. Branch → PR → squash-merge on green CI.

GitHub (sandboxed): `GH_TOKEN` from `~/.grok/agent-auth/github_token` or `C:\Users\User\.grok\agent-auth\github_token`. Never print it.

```bash
pnpm ledger start <id> <branch>
pnpm ledger pr    <id> <url>
pnpm ledger done  <id> <url>    # proof link required
pnpm ledger block <id> "<reason>"
```

## Loop (Denon and Nitro agents)

1. Claim tracker + LIVE-LANES if the mountain is free.
2. One service per PR.
3. Implement the constitution — not a refuse pin beside it.
4. `pnpm verify` — report what it printed. INCOMPLETE (no Docker) is not full green.
5. Self-audit money paths. Merge Class N/P/M when gates pass. Never Class X.

Repo law beats installed skills. `pnpm wt`, not `git worktree add`. `pnpm verify`, not a skill’s private Done.

## The seven that get a PR rejected

1. SQL against another service’s tables.
2. Value outside `ledger-client`.
3. A balance in your service.
4. Money in a `number`.
5. Partner/vendor names in user-facing copy.
6. “Temporary” without a §13 socket.
7. Second SPA / second book / invented live prices.

## Before you say you are done

```bash
pnpm verify
pnpm ledger open-count
```

If `open-count` is non-zero, work remains. “Made good progress” is not a finish state.
