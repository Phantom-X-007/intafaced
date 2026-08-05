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
4. **Internet leverage (mandatory before product code):** [`docs/INTERNET-LEVERAGE-LAW.md`](docs/INTERNET-LEVERAGE-LAW.md) · Phase A [`docs/INTERNET-LEVERAGE-CURRENT-AUDIT-2026-08-04.md`](docs/INTERNET-LEVERAGE-CURRENT-AUDIT-2026-08-04.md) · residual paths [`docs/INTERNET-LEVERAGE-PHASE-B-FULL-HORIZON-2026-08-05.md`](docs/INTERNET-LEVERAGE-PHASE-B-FULL-HORIZON-2026-08-05.md). **Do not ask Nitro** — Phase A is finished for NOW residual craft; prefer in-repo shell + ledger + `svc-*`.
5. The target service's `README.md`.
6. [`CONTRIBUTING.md`](CONTRIBUTING.md) — branch, PR, worktree workflow.
7. If orienting Nitro (status / plan / “where are we”): [`docs/START-HERE.md`](docs/START-HERE.md). Live swarm board: [`docs/ops/README.md`](docs/ops/README.md) (`pnpm swarm:freeze` / `status` / `lanes`).
8. Before multi-agent code: [`docs/LIVE-LANES.md`](docs/LIVE-LANES.md) + residual campaign on tip.
9. Multi-dev / claim / “what’s free”: [`docs/COORDINATION-TRUTH-LAYERS.md`](docs/COORDINATION-TRUTH-LAYERS.md) — product tracker vs campaign NEXT vs session lanes (do not collapse).
10. **Shehzad Protocol Plane + INTACHAIN (sole human chain owner):** [`docs/SHEHZAD-BLOCKCHAIN-TASK-BOARD-2026-08-03.md`](docs/SHEHZAD-BLOCKCHAIN-TASK-BOARD-2026-08-03.md) · [`docs/THREE-WAY-DISTRIBUTION-2026-08-04.md`](docs/THREE-WAY-DISTRIBUTION-2026-08-04.md) · reclaim non-chain for agents.
11. **All-out swarms / max parallel (Nitro go all-out):** [`docs/SWARM-ALL-OUT-ORIENT-2026-08-03.md`](docs/SWARM-ALL-OUT-ORIENT-2026-08-03.md) · **AFK ladder / no stamp mill:** [`docs/ops/SWARM-MANDATE.md`](docs/ops/SWARM-MANDATE.md) · `pnpm swarm:freeze` / `swarm:next` / `swarm:report` · Denon queue [`docs/REGROUP-2026-08-03.md`](docs/REGROUP-2026-08-03.md) · residual-register · `pnpm claim:check` before edit. Specs = main **+** open PRs **+** branches. When `freeProduct=0`, do **P1–P3 real work** (stranded branches, partner unblock, TRK research) — **not** R07/R01 tip-bump cycle spam.
    9b. **Denon hard tasks (not agent free craft):** [`docs/DENON-HARD-TASK-BOARD-FROM-NITRO-SWARM-2026-08-03.md`](docs/DENON-HARD-TASK-BOARD-FROM-NITRO-SWARM-2026-08-03.md) — mega hard board + product-law spec factory (D-S-*); money Class M under his open PRs; Nitro agents babysit his open files only.

---

## Internet leverage law (mandatory — no Nitro pick list)

**Auto-load.** Cold agents read this via `AGENTS.md` / `CLAUDE.md`. Home: [`docs/INTERNET-LEVERAGE-LAW.md`](docs/INTERNET-LEVERAGE-LAW.md).

| Rule                                        | Agent duty                                                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Phase A **finished for NOW** residual craft | Prefer vendor shell UI + `ledger-client` + existing `svc-*` — **wire/extend, do not rebuild**                                   |
| Before first product edit                   | Open Phase A audit + full-horizon **named row** for the tracker id                                                              |
| PR body                                     | Name **which leverage** you used (path) or justify greenfield in one line                                                       |
| Forbidden rebuilds                          | Second product SPA · second money book · invent mids/depth · full new exchange kit while shell exists                           |
| Phase B                                     | Residual **path map** only — not an excuse to skip Phase A; safe EXT (e.g. RE2, Gitleaks) agents may start without asking Nitro |
| Class X / LAW / S                           | X = never agent-close · LAW = Denon first · S = Shehzad babysit                                                                 |

**CI:** `agent-autoload-scan` fails if this section or the law home disappears from the auto-load chain.

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
2. **Leverage** — Phase A first ([`INTERNET-LEVERAGE-LAW.md`](docs/INTERNET-LEVERAGE-LAW.md)): name in-repo asset (shell / ledger / `svc-*`) or full-horizon path before writing product code. Do **not** ask Nitro for a leverage pick list.
3. **Worktree** — ensure work is on `feat/|fix/|chore/|docs/…`, never on `main` checkout.
4. **Implement** — surgical; match repo style; no drive-by refactors.
5. **`pnpm verify`** — run it; paste real output. Not “should pass.”
6. **Commit** if he asked to ship / open a PR, residual campaign / “go all out” is active, or he already authorized autonomous ship for this program (shipping implies commit).
7. **Push + open PR** with the template filled (what / why / how you know + **leverage used**). Title: `type(scope): …`
8. **Merge when Class matrix gates pass** (ownership law) — do not wait for Denon Approve on Class N/P/M-gated work. Post self-audit on money. Never merge Class X as agent-done.
9. **Reply to him in plain language only:** what changed, PR link, CI green/red / merged, anything **he** must decide (Class X only). No raw git lesson unless he asks “why.”

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

**Intent:** cut **wasted** Actions spend without slowing delivery. GitHub is the **merge seal**, not the workshop.  
**Full law + economics:** [`docs/GITHUB-CI-SPEND-CONTROL-2026-07-31.md`](docs/GITHUB-CI-SPEND-CONTROL-2026-07-31.md). Keep this section and that doc in sync.

### Local-first (habit — not a hard exit)

1. **Workshop is local.** Write and prove as much as the machine can run locally. Remote CI is the seal after a coherent unit is done — not the first debugger.
2. **Push once per finished unit.** Do not re-push every tiny edit to watch CI. Re-push only after a real local fix.
3. **`pnpm thrift:check` meters and WARNs** (pre-push + `pnpm pr`). **It never exit-1s on run counts.** Stamp-mill protection is **value-gate** (content), not a volume gate.
4. **`pnpm verify` honesty:** if the machine has no Docker, verify may exit 0 with **INCOMPLETE** — do **not** call that full green. Install local infra once: `tooling/scripts/local-infra-bootstrap.sh` (Colima/Docker + Foundry; see script header). Foundry lives under `.tools/foundry` when bootstrapped in-repo.
5. **Open product PRs** via **`pnpm pr -- …`**. Prefer path-cluster batches over one micro-PR per residual id when they share a service — soft preference, not a hard “one PR per day.”
6. Prefer **pure docs/markdown** when docs-only (full CI skipped; Docs format **PR only**).
7. **`pnpm value-gate:self-test`** stays green; docs tip-bumps without `Board-Delta:` fail Docs format (STRICT).
8. **Re-run all jobs** only for flake or known infra fix.

### Coordination PRs — forbidden

**Do not open a PR whose only job is status, keepalive, peace, cycle stamp, FREEZE tip-bump, claims-only meter, or “board unchanged.”**  
Claims / FREEZE / R00–R02 / DASHBOARD stay **files** agents edit in worktrees. They ship **only** when a real product or law PR needs them as part of that delta — never alone as swarm chat.

### Never (false thrift — integrity only)

These are **integrity violations**, not cost preferences:

- Skip doctrine/money tests “to save money.”
- Claim green without an honest verify (including calling an INCOMPLETE local run full green).
- Disable required checks “to save money.”
- Restore `push: main` full CI / Docs-format without a spend review (double-bill thrash).

### Public vs private (not thrift)

**Making the repo public is a business/IP decision (Nitro + Denon), not thrift and not an integrity sin.**  
Agents **do not** flip visibility. Standard GitHub-hosted Actions minutes are free on public repos; private Free plan has a minute pool. Do **not** invent security myths to justify staying private, and do **not** go public to “save money” without an explicit owner decision. Secrets unique-to-this-repo vs public CoinExchange vendor import: see forensic notes / spend-control — the #197 “secrets ban” is not a thrift rule.

### Denon-only infra (agents may implement workflow PR after he installs the runner app)

- Actions budget ~$50–80/mo, stop-when-reached ON, alerts — high fuse while private.
- Prefer cheaper managed runners (e.g. Ubicloud) for heavy jobs if the repo stays private — same GitHub checks UI; see spend-control doc.

---

## The seven that get a PR rejected

1. Writing SQL against another service's tables. Use `packages/contracts` or `packages/events`.
2. Moving value outside `packages/ledger-client`. Add a recipe instead.
3. Holding a balance in your service.
4. Storing money in a `number`.
5. Naming a partner or model vendor in user-facing copy.
6. Leaving anything "temporary" without a §13 socket entry.
7. **Rebuilding product UI kit / second money book / inventing live prices** while Phase A leverage exists — use shell + ledger + `svc-*` (see Internet leverage law).

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
