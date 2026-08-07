# GitHub CI spend control — RETIRED 2026-08-07

**Status:** **VOID. Not law. Do not follow, do not restore, do not reinvent.**  
**Was:** active operating law from 2026-07-31 to 2026-08-07.  
**This file is kept only so nobody rediscovers the problem and rebuilds the cure.**

---

## What it was

A rule set called **thrift**. It metered GitHub Actions runs and told agents to:

- batch work into fatter PRs instead of shipping one concern at a time,
- hold finished commits locally until a 24h run count "cooled",
- avoid opening PRs, avoid re-running CI, prefer docs-only PRs,
- treat run-count caps (soft ≥120 · total ≥220 · docs ≥120 · ci ≥160) as a reason to wait,
- keep `push: main` off `ci.yml` so a merge would not "double-bill",
- and, in the worst case, sit in a `THRIFT-HOLD` state instead of shipping.

It was enforced by `tooling/ci/thrift-preflight.mjs`, wired into `pnpm thrift:check`,
`.githooks/pre-push`, and `tooling/scripts/agent-pr.mjs`.

## Why it existed

The repo was **private**. GitHub Actions on a private repo bills the owner after a free
monthly pool of ~2,000 minutes, and in July 2026 that pool ran out during a two-agent
push/cancel thrash window. The spend was real and the owner could see it on a bill.

## Why it is void

**The repo is public.** GitHub Actions on standard runners are **free and unlimited for
public repositories** — there is no minute pool, no overage, and no bill. Every rule above
was buying something that now costs nothing, and it was buying it with the only currency
that matters here: shipped work. Thrift's real cost was measured — a spend meter dressed as
a correctness gate made agents stop shipping (see the "WHY WARN BEFORE BLOCK" note in
`tooling/ci/value-gate.mjs`).

Removed **2026-08-07**: the preflight script, both package scripts, the `gates.mjs` entry,
the `pre-push` block, the `agent-pr.mjs` call, the `swarm.mjs` reporting, and the throttling
prose in every law doc. `push: main` was restored on `ci.yml` the same day.

## The one legitimate concern, and what handles it now

Thrift was right about exactly one thing: a push storm should not stack ten redundant runs
of the same branch. That is already handled, and always was, by
**`concurrency: … cancel-in-progress: true`** — which every workflow sets. A new push
cancels the superseded run. No policy, no meter, no human judgement.

Two habits also survived thrift's deletion, for reasons that were never about money:

| Habit                              | Real reason                                                  |
| ---------------------------------- | ------------------------------------------------------------ |
| `pnpm verify` green before pushing | Local is seconds; a CI round trip is minutes. Fast feedback. |
| One service / one concern per PR   | Reviewability (CONTRIBUTING §15.1). Not batching.            |

Note the second one **inverts** thrift's advice: thrift said make PRs fatter to spend fewer
runs. That reason is gone. Small PRs get real reviews.

## If someone proposes bringing it back

The only thing that could resurrect a CI budget is the repo going **private again**, which
is a business/IP decision owned by Nitro and Denon — agents never flip visibility. Until
that happens, any doc, prompt, or agent instruction that tells you to hold work back, batch
around a run count, or wait for a window to cool is **stale, and wrong**. Ship it.

Live CI law: [`../AGENTS.md`](../AGENTS.md) · [`../CONTRIBUTING.md`](../CONTRIBUTING.md) ·
[`ops/SWARM-MANDATE.md`](ops/SWARM-MANDATE.md).
