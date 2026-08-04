# Instructions for AI agents

You are working in the INTAFACED monorepo. Read this before your first edit.

## Who is driving (read this)

| Human                        | Role                                                                                                                                                                                                                                                        | GitHub |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **Nitro** (`@ZenYoda3`)      | Non-technical operator. Directs work; does not run git/PR by hand.                                                                                                                                                                                          | write  |
| **Denon** (`@Phantom-X-007`) | Experienced builder. Owns technical quality of what he ships. Direction on spine law.                                                                                                                                                                       | admin  |
| **Shehzad** (`@shehzad002`)  | Senior **Protocol Plane + INTACHAIN** builder (on-chain only). Board: [`docs/SHEHZAD-BLOCKCHAIN-TASK-BOARD-2026-08-03.md`](docs/SHEHZAD-BLOCKCHAIN-TASK-BOARD-2026-08-03.md). Lock: [`docs/GITHUB-OWNERSHIP-SHEHZAD.md`](docs/GITHUB-OWNERSHIP-SHEHZAD.md). | write  |

**Agents must not implement on Shehzad chain mountains** (protocol/chain/bridge/launch contracts / dex self-custody) — babysit only.  
**Three-way split:** [`docs/THREE-WAY-DISTRIBUTION-2026-08-04.md`](docs/THREE-WAY-DISTRIBUTION-2026-08-04.md).  
**GitHub lock (read every session):** ownership Shehzad · LIVE-LANES · tracker `owner: shehzad002` on chain rows · CODEOWNERS on `svc-protocol` / `svc-dex`.  
**Agents keep:** shell (P-UI), reclaimed pay/bank/identity residual (after #346 handoff), trade-light, WS client, academy/ops thin, tracker honesty. Pay/bank **no longer** blanket human-locked.

### Operating split (durable decision — 2026-07-31)

| Layer                                                                                   | Owner                                                 |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Direction** — high-altitude plan + product/money/spine **law** for greenfield engines | **Denon** (specs/ADRs/issues; free hands)             |
| **Execution + merge** — residual board, Stream A, honesty, audits, research packs, PRs  | **Nitro agents** (merge when Class matrix gates pass) |
| **Class X** — secrets, prod go-live, licence purchase, sanctions **content**            | **Nitro human** (+ counsel)                           |

- Denon is **not** the default residual ship machine; he **sets direction** so agents can go hard in parallel.
- Agents ship implementation under doctrine + Class matrix — they do **not** invent futures/OTC/multi-asset product law or force-push his `feat/spine-*`.
- Full law + memory architecture + merge matrix: [`docs/NITRO-OWNERSHIP-AND-DENON-DIRECTION-2026-07-31.md`](docs/NITRO-OWNERSHIP-AND-DENON-DIRECTION-2026-07-31.md). Campaign: `docs/NITRO-RESIDUAL-CAMPAIGN-2026-07-31.md`. Lanes: `docs/LIVE-LANES.md`.
- **Live tip / open PRs are never “in AGENTS.md”** — re-derive: `git fetch && git log -1 --oneline origin/main` · `gh pr list --state open`.

**Review is asymmetric — on purpose (not slower theater):**

- **Denon’s PRs:** he may merge when **CI is green**. He does **not** wait for Nitro to click Approve. His **agent must self-audit** (doctrine + money paths + `pnpm verify`) before he merges.
- **Nitro’s PRs:** agents open PRs and **merge when Class N/P/M gates pass** (see ownership law). Denon may still review; Nitro is not blocked waiting for Approve on agent-gated work. Class **M** requires money self-audit + second-pass adversarial + green CI (and no hold). Class **X** never agent-done.

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
3. [`docs/NITRO-OWNERSHIP-AND-DENON-DIRECTION-2026-07-31.md`](docs/NITRO-OWNERSHIP-AND-DENON-DIRECTION-2026-07-31.md) — who directs vs executes vs merges (durable).
4. The target service's `README.md`.
5. [`CONTRIBUTING.md`](CONTRIBUTING.md) — branch, PR, worktree workflow.
6. If orienting Nitro (status / plan / “where are we”): [`docs/START-HERE.md`](docs/START-HERE.md). Live swarm board: [`docs/ops/README.md`](docs/ops/README.md) (`pnpm swarm:freeze` / `status` / `lanes`).
7. Before multi-agent code: [`docs/LIVE-LANES.md`](docs/LIVE-LANES.md) + residual campaign on tip.
8. Multi-dev / claim / “what’s free”: [`docs/COORDINATION-TRUTH-LAYERS.md`](docs/COORDINATION-TRUTH-LAYERS.md) — product tracker vs campaign NEXT vs session lanes (do not collapse).
9. **Shehzad Protocol Plane + INTACHAIN (sole human chain owner):** [`docs/SHEHZAD-BLOCKCHAIN-TASK-BOARD-2026-08-03.md`](docs/SHEHZAD-BLOCKCHAIN-TASK-BOARD-2026-08-03.md) · [`docs/THREE-WAY-DISTRIBUTION-2026-08-04.md`](docs/THREE-WAY-DISTRIBUTION-2026-08-04.md) · reclaim non-chain for agents.
10. **All-out swarms / max parallel (Nitro go all-out):** [`docs/SWARM-ALL-OUT-ORIENT-2026-08-03.md`](docs/SWARM-ALL-OUT-ORIENT-2026-08-03.md) · **AFK ladder / no stamp mill:** [`docs/ops/SWARM-MANDATE.md`](docs/ops/SWARM-MANDATE.md) · `pnpm swarm:freeze` / `swarm:next` / `swarm:report` · Denon queue [`docs/REGROUP-2026-08-03.md`](docs/REGROUP-2026-08-03.md) · residual-register · `pnpm claim:check` before edit. Specs = main **+** open PRs **+** branches. When `freeProduct=0`, do **P1–P3 real work** (stranded branches, partner unblock, TRK research) — **not** R07/R01 tip-bump cycle spam.
    9b. **Denon hard tasks (not agent free craft):** [`docs/DENON-HARD-TASK-BOARD-FROM-NITRO-SWARM-2026-08-03.md`](docs/DENON-HARD-TASK-BOARD-FROM-NITRO-SWARM-2026-08-03.md) — mega hard board + product-law spec factory (D-S-*); money Class M under his open PRs; Nitro agents babysit his open files only.

---

## Coordination truth layers (mandatory — not a speed limit)

**Auto-load (no Nitro paste):** This section + [`docs/COORDINATION-TRUTH-LAYERS.md`](docs/COORDINATION-TRUTH-LAYERS.md) bind on every cold agent that reads `AGENTS.md` / `CLAUDE.md`. Session prompt is optional sugar, not the enforcement path.  
**Home:** [`docs/COORDINATION-TRUTH-LAYERS.md`](docs/COORDINATION-TRUTH-LAYERS.md).

| Question                                | File                                          |
| --------------------------------------- | --------------------------------------------- |
| Product free / wip / done / human-owned | `tooling/tracker/features.mjs`                |
| Campaign “ship next”                    | `docs/BOARD-CLEAR-NEXT.md` (sequence only)    |
| Session who-codes-what + dual-build     | `docs/LIVE-LANES.md` + open PR path intersect |
| Code on main                            | git                                           |

**Tracker touch = mountain events only** (claim, owner handoff/human lock, done/cut, optional wave note) — **not** every craft PR under an already-`wip` row.  
**Does not add:** PR caps, Denon Approves, CI “must edit features.mjs,” or Nitro manual steps. Thrift + parallel + Class merge matrix unchanged.

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

1. **Claim** — LIVE-LANES session row + tracker mountain if free (owner/wip in `features.mjs` on first PR for that mountain). Shehzad chain mountains (protocol/INTACHAIN) → babysit only; pay/bank reclaimed for agents after #346 handoff. See COORDINATION-TRUTH-LAYERS.
2. **Worktree** — ensure work is on `feat/|fix/|chore/|docs/…`, never on `main` checkout.
3. **Implement** — surgical; match repo style; no drive-by refactors.
4. **`pnpm verify`** — run it; paste real output. Not “should pass.”
5. **Commit** if he asked to ship / open a PR, residual campaign / “go all out” is active, or he already authorized autonomous ship for this program (shipping implies commit).
6. **Push + open PR** with the template filled (what / why / how you know). Title: `type(scope): …`
7. **Merge when Class matrix gates pass** (ownership law) — do not wait for Denon Approve on Class N/P/M-gated work. Post self-audit on money. Never merge Class X as agent-done.
8. **Reply to him in plain language only:** what changed, PR link, CI green/red / merged, anything **he** must decide (Class X only). No raw git lesson unless he asks “why.”

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

## GitHub Actions thrift (mandatory — Nitro and Denon agents)

**Intent:** cut **wasted** Actions spend on a private repo. Does **not** slow parallel shipping, kill automation, or add a Denon review gate.  
**Full law + economics:** [`docs/GITHUB-CI-SPEND-CONTROL-2026-07-31.md`](docs/GITHUB-CI-SPEND-CONTROL-2026-07-31.md). Keep this section and that doc in sync.

### Speed / autonomy preserved (explicit)

- **Parallel agents and many open PRs are allowed** — no thrift max-PR cap.
- **No new human approval** beyond existing asymmetric review + green CI.
- **Remote CI stays the merge seal** (full matrix green). Local `pnpm verify` is the filter so we do not pay for “push to discover red.”
- Budget stop-at-cap is Denon’s **high fuse** (infra), not a reason to open fewer PRs.

### Do

1. **`pnpm verify` green locally** before the push that opens or updates a **code** PR.
2. **Batch** coherent change-sets; avoid push storms (push → CI → push 2 min later → cancel → repeat) while iterating without local green.
3. Prefer **pure docs/markdown** commits when the work is docs-only (`ci.yml` path-ignore skips full CI).
4. **Re-run all jobs** only for flake or known infra fix.

### Never (false thrift)

- Make the repo public, skip doctrine/money tests, claim green without verify, or disable required checks “to save money.”

### Denon-only infra (agents may implement workflow PR after he installs the runner app)

- Actions budget ~$50–80/mo, stop-when-reached ON, alerts.
- Prefer cheaper managed runners (e.g. Ubicloud) for heavy jobs — same GitHub checks UI; see spend-control doc.

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
pnpm verify    # doctrine gates · format · build · typecheck · test · DoD gate
```

`verify` runs the **same doctrine gate list CI runs** — `tooling/ci/gates.mjs`, one list both consume, so a gate can no longer be in CI and missing locally. Those gates run **first** and take about two seconds, so brand / custody / secrets / dual-book / migration feedback arrives before the build rather than behind it.

```bash
pnpm gates     # the 14 doctrine gates alone (~2s) — the fast pre-flight
pnpm gate      # the per-service §14 Definition of Done alone
```

Report what it actually printed. If tests fail, say so with the output.

## Scope

One service per task. Cross-service: contracts/events PR **first**, then implement.

## When the spec is ambiguous

Doctrine (§0) decides. If it does not: **stop and ask.** Never guess on money, custody, or jurisdiction.
