# Paste to Denon (Telegram)

Copy everything inside the fence. Dated 2026-07-27.

---

**INTAFACED — how we ship (accountable version)**

Repo: https://github.com/Phantom-X-007/intafaced  
Law for agents: `AGENTS.md` + `CONTRIBUTING.md` (read once, point every agent at them).

### Non-negotiables (you + every agent)

1. **Never work in the main checkout** — always a worktree / feature branch (`pnpm wt feat/...`). Open the agent **in that folder**.
2. **Never push to `main`** — branch → PR → squash-merge only.
3. **CI green before merge** — `pnpm verify` locally, then green GitHub checks. No exceptions.
4. **One service (or one clear concern) per PR** — if the title needs “and”, split.
5. **Claim work** in the tracker when you start something so we don’t double-build.
6. After merge: delete branch + remove worktree.

### Review (so we stay fast)

You are the experienced coder. **I will not Approve your PRs** — I can’t meaningfully review your code and waiting on me only slows us down.

- **Your PRs:** merge when CI is green. Your **agent must self-audit** first (money paths, doctrine, no cross-service SQL, `pnpm verify`). Put that audit in the PR body/comment so there’s a record.
- **My PRs** (when my agents open them): you or your agent review, then merge.

No mutual-approval theater. Accountability = green CI + agent self-audit + doctrine, not my click.

### What I need from you this week

- Keep using PRs (you already are) — good.
- Point **every** coding agent at `AGENTS.md` so worktrees / verify / self-audit happen without you thinking about it.
- When you start a feature: claim it in tracker + Telegram one-liner.
- If `main` goes red: drop everything and fix — highest priority in the repo.
- Optional: keep open PRs smaller when you can (huge diffs are hard even for you later).

### What my side does

I’m non-technical. **My agents run git/PR for me** (worktree → verify → PR → send me the link). I won’t be configuring GitHub or approving your merges.

If anything in CONTRIBUTING / AGENTS conflicts with speed, say so — we change the doc, we don’t silently skip it.

Questions → Telegram. Ship → green PR.
