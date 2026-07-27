# Instructions for AI agents

You are working in the INTAFACED monorepo. Read this before your first edit.

## Who is driving (read this)

| Human                        | Role                                                               | GitHub |
| ---------------------------- | ------------------------------------------------------------------ | ------ |
| **Nitro** (`@ZenYoda3`)      | Non-technical operator. Directs work; does not run git/PR by hand. | write  |
| **Denon** (`@Phantom-X-007`) | Experienced builder. Owns technical quality of what he ships.      | admin  |

**Review is asymmetric — on purpose (not slower theater):**

- **Denon’s PRs:** he may merge when **CI is green**. He does **not** wait for Nitro to click Approve. His **agent must self-audit** (doctrine + money paths + `pnpm verify`) before he merges.
- **Nitro’s PRs:** the agent opens the PR; **Denon (or his agent) reviews before merge**. Nitro is not expected to Approve Denon’s code.

Do not invent a mutual-approval gate. That slows two people who already know who can read what.

---

## GitHub auth (sandboxed agents — every session)

This environment often cannot read the macOS keychain. Before any `gh` or authenticated git:

```bash
export GH_TOKEN="$(tr -d '\n\r ' < /Users/Nitro/.grok/agent-auth/github_token)"
```

- Token file is created once by Nitro outside the agent; do **not** ask him to re-auth each chat.
- Never print, log, commit, or embed the token in a remote URL.
- If auth fails: tell him to re-run `gh auth token > ~/.grok/agent-auth/github_token` once.

---

## Read these, in order

1. [`INTAFACED_DEFINITIVE_BUILD.md`](INTAFACED_DEFINITIVE_BUILD.md) — the law.
2. [`tooling/agent-protocol/AGENT_PROTOCOL.md`](tooling/agent-protocol/AGENT_PROTOCOL.md) — hard prohibitions.
3. The target service's `README.md`.
4. [`CONTRIBUTING.md`](CONTRIBUTING.md) — branch, PR, worktree workflow.
5. If orienting Nitro (status / plan / “where are we”): [`docs/START-HERE.md`](docs/START-HERE.md).

---

## Check where you are, first

```bash
git rev-parse --show-toplevel && git branch --show-current
```

**If you are in the main checkout, stop editing.** Create or switch to a worktree (`pnpm wt <branch>` from main, or equivalent). Two agents in one working directory is how a day gets lost.

**Never push to `main`.** Branch → PR → merge only.

---

## Nitro operator mode (mandatory when working for Nitro)

Nitro does not know GitHub workflow. **You run the whole loop.** Do not hand him git commands and walk away.

### Every task — do this without asking him to do it

1. **Claim** — confirm the feature in tracker / his words; one service (or one app concern) only.
2. **Worktree** — ensure work is on `feat/|fix/|chore/|docs/…`, never on `main` checkout.
3. **Implement** — surgical; match repo style; no drive-by refactors.
4. **`pnpm verify`** — run it; paste real output. Not “should pass.”
5. **Commit** only if he asked to commit, or he explicitly asked you to ship / open a PR (shipping implies commit).
6. **Push + open PR** with the template filled (what / why / how you know). Title: `type(scope): …`
7. **Reply to him in plain language only:** what changed, PR link, CI green/red, anything **he** must decide. No raw git lesson unless he asks “why.”

### Never put on Nitro

- “Run `git …` / `gh …` / `pnpm wt` yourself”
- “Please approve Denon’s PR”
- “Please configure branch protection”
- Multiple choice technical forks he cannot judge — pick the safe default, say it in one line, proceed

### When Denon has open PRs and Nitro asks “are we good?”

- Check CI status and whether money/doctrine paths are touched.
- Summarize risk in plain language + link.
- Do **not** require Nitro to Approve. Optional: run a doctrine-focused audit and post a PR comment as the agent.

---

## Denon agent mode (mandatory when working for Denon)

His agents exist so **he does not have to remember process**. Every Denon session:

1. Work only in a **worktree** / feature branch — never main checkout.
2. **Claim** work in tracker (`tooling/tracker/features.mjs` owner + wip) when starting a feature.
3. **One service per PR.** If the title needs “and”, split.
4. Before merge: **`pnpm verify` green** and CI green on the PR.
5. **Self-audit** on every PR (post in the PR body or a comment):
   - money path? ledger recipes + failure tests?
   - cross-service only via contracts/events?
   - no balances outside ledger?
   - brand scan / custody scan clean?
6. **Squash-merge** only with green CI. Delete branch + `pnpm wt:rm` after.
7. **Telegram Nitro** only when: needs a product decision, main is red, or a PR waits on him (Nitro’s PR).

Denon does **not** wait for Nitro’s Approve. Accountability is **CI + self-audit + doctrine**, not a second click from a non-coder.

---

## The six that get a PR rejected

1. Writing SQL against another service's tables. Use `packages/contracts` or `packages/events`.
2. Moving value outside `packages/ledger-client`. Add a recipe instead.
3. Holding a balance in your service.
4. Storing money in a `number`.
5. Naming a partner or model vendor in user-facing copy.
6. Leaving anything "temporary" without a §13 socket entry.

---

## Before you say you are done

```bash
pnpm verify    # build · typecheck · test · DoD gate
```

Report what it actually printed. If tests fail, say so with the output.

## Scope

One service per task. Cross-service: contracts/events PR **first**, then implement.

## When the spec is ambiguous

Doctrine (§0) decides. If it does not: **stop and ask.** Never guess on money, custody, or jurisdiction.
