# Onboarding — second developer

Paste the block below into Telegram. Everything after it is context for whoever is doing the onboarding.

---

## Paste this

> **INTAFACED repo access**
>
> Repo: https://github.com/Phantom-X-007/intafaced (private — check your email for the invite)
>
> Read **CONTRIBUTING.md** first. It's five minutes. The one rule that actually matters is **§2: worktrees**.
>
> **Why worktrees:** we're both running AI agents. If two agents edit the same working directory, one stashes over the other's work and an afternoon disappears. A worktree gives each branch its own directory, its own `node_modules`, its own dev server. Two agents, two worktrees, zero coordination needed.
>
> **Never work in the main checkout.** Ever. Not you, not me, not an agent.
>
> Getting started:
>
> ```bash
> gh repo clone Phantom-X-007/intafaced && cd intafaced
> pnpm install
> cp .env.example .env
> docker compose up -d
> pnpm --filter @intafaced/svc-ledger db:migrate
> pnpm verify          # expect green — if not, tell me before doing anything else
> ```
>
> Then your first change:
>
> ```bash
> pnpm wt feat/your-thing              # creates the worktree + installs
> cd ../plug-x-inta-worktrees/feat-your-thing
> # work here. open your editor AND your agent in THIS directory.
> git push -u origin feat/your-thing
> gh pr create --fill
> ```
>
> Heads up: Postgres is on **5433** and Redis on **6380**, not the defaults — a local Postgres usually owns 5432 and the platform can't depend on that being free.
>
> A pre-push hook blocks pushing to `main`. That's deliberate, not a bug. Branch → PR → I review → merge.
>
> Also read `AGENTS.md` and point your AI agent at it — it's the brief that stops an agent doing something the doctrine forbids.

---

## Context for you (not for the paste)

### Status

- **Collaborator:** `@ZenYoda3` invited with **write** permission. ✅
- **CODEOWNERS:** both handles on every protected path. ✅
- **`.env`:** they generate their own — nothing in `.env.example` is a real secret. `JWT_ACCESS_SECRET` must be 32+ chars or the service refuses to boot.

> CODEOWNERS lines naming `@ZenYoda3` do nothing until the invitation is **accepted** — a pending invite does not grant write access, and GitHub silently ignores the entry rather than warning. Confirm once they're in:
>
> ```bash
> gh api /repos/Phantom-X-007/intafaced/codeowners/errors
> ```

### What to watch in their first week

- **Are they using worktrees?** `pnpm wt:list` shows every worktree and how stale it is. If they're committing from the main checkout, catch it early — the habit is what matters, not the one commit.
- **PR size.** The first instinct is always a big PR. One service per PR (§15.1). A 200-line PR gets a real review; a 2,000-line one gets "LGTM" and a bug in production.
- **Do they read CI?** Merging is _not_ blocked on green (we're on GitHub Free — see CONTRIBUTING §1). A green tick nobody looked at is the same as no CI.

### Where they can safely start

Good first PRs — real work, no way to break the Core:

- `apps/web` scaffold (Next.js 15 + `@intafaced/ui` tokens) — nothing depends on it yet
- External venue adapters in `packages/venue-adapter` — the `LiquiditySource` interface is done and tested, adding a CCXT-backed venue is self-contained
- `packages/ui` primitives beyond the five that exist
- i18n scaffolding (§9) — needed everywhere, blocks nothing

Where they should **not** start: `packages/ledger-client`, `svc-ledger`, or anything in Phase 1. Not because they can't, but because the Core is the foundation everything else is being built on right now, and two people editing it in week one is how the foundation gets wobbly.
