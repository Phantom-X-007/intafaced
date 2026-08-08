# The plan for all eight axes — 2026-08-08

Every number below was re-derived against `origin/main` at `d7c44333` (2026-08-08 11:48 +0800) from a worktree cut at that tip. Where the 2026-08-08 axis audit disagreed, this document corrects it and says so.

**Nothing here puts a person in the merge path.** No required review, no approval gate, no reading of code by anyone. Every enforcement proposed is one cheap automated check that fails open, or is stated honestly as "no machine version exists".

---

## Corrections to the axis audit

The audit was computed from the main checkout, which is **315 commits behind `origin/main`** (`git rev-list --count HEAD..origin/main` → 315). Eight of its numbers are stale or overstated.

| Audit said                                                                    | Actually, at tip                                                                                                                                                                                                             | How to check                                                                                                                                 |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 133 features, 44 done                                                         | **148 features, 45 done.** `bank` is 4/6 not 2/6; `ops` is 0/7 not 0/6                                                                                                                                                       | `node -e 'import("./tooling/tracker/features.mjs").then(m=>console.log(m.FEATURES.length, m.FEATURES.filter(f=>f.status==="done").length))'` |
| Promise-falsification: 2 of 18 services                                       | **9 of 18.** Unaudited: academy, agents, dex, identity, notify, **pay**, protocol, **trade**, ws                                                                                                                             | `for s in $(ls services); do [ -f "docs/audit/2026-08-08-$s.md" ] \|\| echo $s; done`                                                        |
| 657 documents; 193 loose at docs root; 87 audits                              | **674**; 187 loose; 102 audits                                                                                                                                                                                               | `git ls-tree -r origin/main --name-only \| grep -c '^docs/'`                                                                                 |
| Vendor: 1,768 files                                                           | **1,692.** The 896 Java / 162 Vue / 91 JS split is correct                                                                                                                                                                   | `git ls-tree -r origin/main --name-only \| grep -c '^vendor/'`                                                                               |
| `swarm:status` reports a thrift HARD FAIL and a spend cap that does not exist | **No longer true** — it was fixed. It now prints a free board and self-flags a stale checkout                                                                                                                                | `node tooling/scripts/swarm.mjs status`                                                                                                      |
| Your name blocks six surfaces via claims; stale claim locks                   | **Claim hygiene is clean** — 1 open claim, 0 stale `TRK-*` locks. The block is the tracker `owner` field: **9 non-done rows** owned by Nitro                                                                                 | `grep -h '^\*\*status:\*\*' docs/ops/claims/*.md \| sort \| uniq -c`                                                                         |
| `docs/ops` is the single most-changed area over 30 days                       | **`vendor/` is** (4,369 file-changes) — but 3,434 of those are one import (#73) and one rename (#771). Net of those, the audit's read holds, and sharpens: the sink is **`docs/ops` root — 21 files, 936 changes in 7 days** | `git log origin/main --since='30 days ago' --name-only --pretty=format: \| awk -F/ '{print $1}' \| sort \| uniq -c \| sort -rn`              |
| The 896 vendored Java files are outside every scan                            | **Overstated.** Two CI scans target `vendor/` specifically (`vendor-java-money-scan.mjs`, `vendor-shell-scan.mjs`). What is true: never compiled, typechecked, tested, or dependency-scanned                                 | `ls tooling/ci \| grep vendor`                                                                                                               |
| 33 worktrees, 30 stranded branches                                            | **24 worktrees (cap 20), 20 stranded**                                                                                                                                                                                       | `node tooling/scripts/swarm.mjs status`                                                                                                      |

Everything else in the audit reproduced. Throughput reproduced and is higher than stated: **710 commits and 707 merged pull requests in the last seven days**, one open PR right now, no branch protection on `main` (API returns 404).

**Three findings the audit did not have.** They are load-bearing and each is the reason its axis is ordered where it is.

1. **The dispatcher is hard-coded to refuse every money vertical.** `tooling/scripts/swarm.mjs:239` — `const money = /^(trade|pay|bank|venue|p2p|market)\./.test(f.id)` — and line 262, `const impl = r.depsDone && !r.money && !r.wave1ex && specOk`. `docs/ops/SWARM-MANDATE.md:52` states it plainly: _"Money-class (closed until Nitro opens a wave)."_
2. **Eight of the twenty feature-tagged open issues describe work the tracker already calls `done`** — `identity.webauthn`, `matching.engine`, `web.shell`, `p2p.offers`, `blueprint.onboarding`, `bank.accounts`, `agents.gateway`, `academy.lobbies`.
3. **The customer platform runs Spring Boot 1.5.9 / 1.5.10** (`vendor/upstream-exchange/00_framework/pom.xml`, `01_wallet_rpc/pom.xml`) — end of life since August 2019 — and `.github/dependabot.yml` covers `npm` and `github-actions` only. There is no `maven` ecosystem entry, so nothing has ever checked those 32 jars or their transitive dependencies for known vulnerabilities.

---

## A1 · Product build

**Where it stands.** 45 of 148 features are done. Strip out the 39 rows that are deliberate v1 exclusions and 45 of 109 are done — 41%. The spine is finished; the business is not. `pay` is 2 of 11, `trade` 2 of 10, `ops` 0 of 7.
Evidence: `node -e 'import("./tooling/tracker/features.mjs").then(m=>{const F=m.FEATURES,r=F.filter(f=>f.status!=="socket");console.log(r.length,r.filter(f=>f.status==="done").length)})'`

**What should change.** Nothing about this axis directly. A1 is not a decision — it is the output of A5. Sixteen features have every dependency satisfied and no owner right now, including `trade.futures`, `trade.forex`, `trade.ccxt-api`, `pay.routing`, `pay.settlement`, `p2p.merchants`, `market.vendors`, `ops.compliance`. The swarm cannot see nine of them because of the money gate in A5. Fix A5 and this axis moves on its own.

**Why this and not something else.** The alternative is a separate "money build coordinator" that hand-dispatches pay and trade work. Rejected: it re-creates by hand the thing the dispatcher already does, and it dies the moment that chat closes.

**What it unlocks.** The nine unblocked money and ops mountains become dispatchable by the machine that is already merging a hundred PRs a day.

**How it stays true without a human.** Already automated. `pnpm swarm:next` prints a ready-to-paste worker brief with allowed paths; `features.mjs` is the single source of done.

**Effort.** Zero for this axis. It is a consequence of A5.

**Risk if we do nothing.** The swarm keeps shipping academy and agent features at full speed while the payments business stays at 2 of 11.

**DECISION:** none — this axis has no separate decision. Answer A5.

---

## A2 · The customer surface

**Where it stands.** What customers see is a vendored third-party exchange — 1,692 files, 896 Java and 162 Vue — carrying our own patches as `assets/js/ix-*.js`. `pnpm-workspace.yaml` lists `apps/*`, `services/*`, `packages/*`, `tooling/*`; it does not list `vendor/*`, so CI never compiles, typechecks, builds or tests it. Two targeted scans do run over it (money-write hazards, residual hazards) — that part of the audit was overstated. The tracker marks `web.shell` **done**.
Evidence: `cat pnpm-workspace.yaml` · `grep -c vendor .github/workflows/ci.yml` → 0 · `ls tooling/ci | grep vendor`

**What should change.** Three things, all machine-run, none of them a build system for Java.

1. Add `maven` to `.github/dependabot.yml` for the two `pom.xml` roots. This is four lines and turns on vulnerability alerting for the 32 jars for the first time.
2. Add a job that runs `mvn -q -DskipTests compile` over `vendor/upstream-exchange/00_framework` on pull requests touching `vendor/**`, `continue-on-error: true`. Reporting only, never blocking — so a broken vendor build can never stop a merge.
3. Regenerate `NOTICE`. It was compiled 2026-07-29 against commit `4311cff`, hundreds of commits ago. Whatever produced it runs again.

**Why this and not something else.** The obvious alternative is to pull `vendor/*` into the pnpm workspace so `pnpm verify` covers it. Rejected on evidence: the vendor tree builds with webpack 3 and cannot parse modern syntax — the `web.shell` tracker note records that `ix-money.js` had to use `bignumber.js` instead of `bigint` for exactly this reason. Adding it to the workspace breaks the workspace, not the other way round.

**What it unlocks.** The first honest answer to "is the thing customers look at safe to run", and a licence record that matches the tree.

**How it stays true without a human.** Dependabot opens the PRs itself. The compile job is a status line on a PR nobody has to read. Both fail open.

**Effort.** One agent session for the CI changes, one for the `NOTICE` regeneration.

**Risk if we do nothing.** An eight-year-old, end-of-life Java stack serves customers with no vulnerability alerting of any kind, and the licence record is provably stale.

**DECISION:** Do we turn on dependency alerting and a non-blocking compile check for the vendored customer platform? Yes / no.

---

## A3 · Shipping

**Where it stands.** Five CI workflows and none of them deploy. No Terraform, no Kubernetes, no Helm, no Pulumi, no staging, no environment promotion, no rollback. One `Dockerfile` of ours plus the vendor's, two local `docker-compose` files. Nothing matches any secret-manager tooling, so there is no answer to how a production instance would receive a credential.
Evidence: `git ls-files | grep -Ei 'terraform|\.tf$|helm|k8s|kubernetes|kustomize|pulumi'` → empty · `grep -il deploy .github/workflows/*` → `ci.yml` only, and its four `deploy` lines are a local test chain, not a release

**What should change.** One agent session that produces a deploy workflow to a single staging environment on a single host, from the existing `Dockerfile` and compose files. Manual trigger (`workflow_dispatch`) plus deploy-on-merge-to-main. Secrets go in GitHub Actions secrets — not a vault, not yet. Rollback is redeploying the previous image tag, which is one command in the same workflow.

**Why this and not something else.** The alternative is proper infrastructure-as-code — Terraform, a cluster, environment promotion. Rejected for now: it is weeks of work that produces nothing observable until the last day, and every axis downstream of this one only needs _something that runs somewhere other than a laptop_. Start with the smallest thing that satisfies that, and let the shape of the real infrastructure be argued from a running system.

**What it unlocks.** Everything in the sequencing note below — observability, load testing, backup and restore, retention. None of them can be built or tested against a laptop.

**How it stays true without a human.** The deploy workflow is its own check: if it stops working, the deploy fails and says so on the commit. No ritual.

**Effort.** One agent session for the workflow. A host has to exist first, and that is a purchase, which is yours.

**Risk if we do nothing.** The product cannot be shown to anyone, and four further axes stay theoretical.

**DECISION:** Do we stand up one staging host and deploy to it, before building any real infrastructure? Yes / no.

---

## A4 · Money correctness

**Where it stands.** The promise-falsification method — read what a service claims in writing, then try to falsify each claim against reachable state — has now covered **9 of 18 services**, not 2. Today's lanes added most of them. The nine still unaudited are `svc-academy`, `svc-agents`, `svc-dex`, `svc-identity`, `svc-notify`, **`svc-pay`**, `svc-protocol`, **`svc-trade`**, `svc-ws`.
Evidence: `for s in $(ls services); do [ -f "docs/audit/2026-08-08-$s.md" ] || echo $s; done`

**What should change.** Keep going, and re-order. The next three are `svc-trade`, `svc-pay`, `svc-identity` — the two largest money services and the one that decides who you are. `svc-trade` is 122 source files and the largest service in the repo; it has never been falsified, and three of this week's merged fixes came out of this method on smaller services.

**Why this and not something else.** The alternative is to raise test coverage instead — 286 test files against 674 sources, and only 8 `test:` commits in 30 days. Rejected as the _next_ move: coverage tells you the code does what it does, falsification tells you the code does what the README promised. On this repo the second has produced the bugs. Coverage is worth raising, but after.

**What it unlocks.** The money paths customers will actually touch get the same treatment the spine already got.

**How it stays true without a human.** Every finding lands as a test or a scan in `tooling/ci`, which CI runs on every PR. The audit document itself is a record, not a gate.

**Effort.** One agent session per service, three sessions for the three named.

**Risk if we do nothing.** The two services that move customer money are the two least examined in the repository.

**DECISION:** Do we run the next three falsification passes on `svc-trade`, `svc-pay` and `svc-identity` before the other six? Yes / no.

---

## A5 · Knowing what's next

**Where it stands.** This is the axis with the real problem, and it is not the one the audit named. `pnpm swarm:next` _does_ answer "what next" — it prints a full worker brief with allowed paths. But it is hard-coded to refuse every money vertical: `swarm.mjs:239` marks any `trade.`, `pay.`, `bank.`, `venue.`, `p2p.` or `market.` feature as `money`, and line 262 excludes `money` from the dispatchable board. `docs/ops/SWARM-MANDATE.md:52` records why — _"Money-class (closed until Nitro opens a wave)"_. The gate landed in #749 and nobody re-opened it. So the board offers seven things today and all seven are academy, agents or notifications.

Separately, the issue board is write-only: 35 open, **0 ever closed**, and eight of the twenty feature-tagged issues describe work the tracker already marks `done`.
Evidence: `grep -n 'const money = \|const impl = ' tooling/scripts/swarm.mjs` · `sed -n '52p' docs/ops/SWARM-MANDATE.md` · `node tooling/scripts/swarm.mjs status` · `gh issue list --state closed --limit 200 --json number --jq 'length'` → 0

**What should change.** Two changes, both small.

1. **Open the money wave.** Delete the `!r.money` term from the `impl` condition in `swarm.mjs`, and update the mandate line that documents it. That single change makes `trade.futures`, `trade.forex`, `trade.ccxt-api`, `pay.routing`, `pay.settlement`, `p2p.merchants`, `market.vendors` and `venue.aggregation` dispatchable — subject to the existing spec-length gate, which five of them already pass — `trade.forex`, `trade.ccxt-api`, `venue.aggregation`, `p2p.merchants` and `market.vendors` all have specs over 100 lines today.
2. **Close the shipped issues automatically.** One script in `tooling/ci` reads the `[feature.id]` tag out of each open issue title, looks up its status in `features.mjs`, and closes any issue whose feature is `done` with a comment naming the tracker row. Run it on a schedule. Eight issues close on the first run.

**Why this and not something else.** The alternative is to rewrite the 35 template-stub issue bodies into real specifications. Rejected: the specifications already exist. There are 60 spec documents under `docs/ops/trk/` and 25 ADRs, and the dispatcher reads them directly. Rewriting issue bodies would duplicate the law into a fourth place that then has to be kept true.

**What it unlocks.** The swarm that is currently merging a hundred PRs a day gets pointed at payments and trading instead of academy. This is the single highest-leverage change in the document, and it is one line of code.

**How it stays true without a human.** The issue-reconciler is the machine check, and it fails open — if it errors, it closes nothing and nothing stops. The money gate needs no maintenance once removed.

**Effort.** One agent session for both.

**Risk if we do nothing.** The swarm keeps working at full speed on the least commercially important part of the product, and the board keeps telling anyone who reads it that finished work is unfinished.

**DECISION:** Do we open the money wave — let agents take `pay`, `trade`, `bank`, `venue`, `p2p` and `market` features off the free board without asking you first? Yes / no.

---

## A6 · The documentation estate

**Where it stands.** 674 documents. But the audit's read — that this is a documentation problem and the fix is deletion — does not survive checking, and I disagree with it. Of the 254 files under `docs/ops`, **78 are machine-written claim locks, 60 are dispatcher spec inputs, and 95 are coordinator slices**. Only 21 are documents a person wrote to be read. `docs/ops` is not a doc estate; it is the swarm's database, kept in markdown because git is the only store it has. Deleting it would break `pnpm swarm:next`, which reads `docs/ops/trk/*.md` and requires a spec of 100 lines or more before it will dispatch a feature.

The real churn sink is much narrower than "657 documents": **21 files at the root of `docs/ops` absorbed 936 file-changes in seven days** — 44 rewrites each. And 106 of the 254 `docs/ops` files are referenced by nothing outside that directory.
Evidence: `git ls-files docs/ops | awk -F/ 'NF>3{print $3}' | sort | uniq -c` · `git log origin/main --since='7 days ago' --name-only --pretty=format: -- docs/ops | awk -F/ 'NF==3{print "(root)"} NF>3{print $3}' | sort | uniq -c`

**What should change.** Separate the machine's state from the humans' documents, then leave the documents alone.

1. Move `docs/ops/claims/` and `docs/ops/slices/` to a generated directory outside `docs/` — `.swarm-state/` — and point `swarm.mjs` and `claim-check.mjs` at the new path. `docs/ops/trk/` stays where it is; those are real specifications.
2. That drops the document count by 173 without deleting a single thing anyone wrote, and makes the doc-count number mean something for the first time.
3. Do nothing about the 21 root files. Their churn is coordinators correcting each other in the only place they share, which is the machine working, not effort being wasted.

**Why this and not something else.** The alternative is a deletion pass over the 106 unreferenced files. Rejected: 78 of the 254 are claim locks whose whole purpose is to be found by a script, not linked from a document, so "unreferenced" does not mean "dead" — it is the wrong test. A deletion pass run on that test would delete the swarm's state.

**What it unlocks.** A document count that reflects documents, and a `docs/` directory a new session can orient in.

**How it stays true without a human.** One check in `tooling/ci` that fails a PR adding a file under `docs/ops/claims` or `docs/ops/slices` after the move — three lines, and it fails open.

**Effort.** One agent session.

**Risk if we do nothing.** Every future audit re-derives the same alarming document count from machine state and proposes deleting the swarm's memory.

**DECISION:** Do we move the swarm's own bookkeeping out of `docs/` and leave the written documents untouched? Yes / no.

---

## A7 · Security

**Where it stands.** Four security documents, newest 5 August. The secret scanning is real and layered — `gitleaks` on every PR plus `tooling/ci/secret-scan.mjs`, which already knows about roughly forty credentials that arrived inside the vendored tree. But `.gitleaks.toml` allowlists `vendor/` and `docs/` by path, dependency scanning covers `npm` and `github-actions` only, and the customer-facing Java platform is Spring Boot 1.5.9 — end of life since August 2019 — with 32 vendored jars nothing has ever checked. No current threat model, no penetration test, no session or authentication review.
Evidence: `.gitleaks.toml:12` · `grep package-ecosystem .github/dependabot.yml` · `grep -A1 spring-boot-starter-parent vendor/upstream-exchange/00_framework/pom.xml`

**What should change.** The dependency half is A2, item 1 — the same four lines of `dependabot.yml` fix both axes, and it should be done once. What is left for A7 alone is the review half: one falsification pass over `svc-identity` covering sessions, tokens, step-up and API keys, written the same way the money audits are written. That is the authentication review, and it is the same method that has already produced this repo's best fixes.

**Why this and not something else.** The alternative is commissioning a penetration test. Rejected as the next step, not on principle: a penetration test needs a running deployed system, which is A3, and it is worth far more after `svc-identity` has been falsified than before.

**What it unlocks.** A written account of what happens when someone tries to become someone else, which no document currently contains.

**How it stays true without a human.** Findings become scans in `tooling/ci`, which CI runs on every PR. Dependabot maintains itself.

**Effort.** One agent session, shared with A4 — `svc-identity` is on both lists.

**Risk if we do nothing.** The one service that decides who a user is has never been adversarially examined, and its platform's dependencies have never been checked at all.

**DECISION:** Is a penetration test deferred until something is deployed and `svc-identity` has been falsified? Yes / no.

---

## A8 · The agent machine

**Where it stands.** The machine is real and it is working: 710 commits and 707 merged pull requests in seven days, one open PR, no branch protection anywhere. It is also more written down than the audit credited — `swarm.mjs`, `claim-check.mjs`, `claim-staleness.mjs`, `worktree.mjs`, `SWARM-MANDATE.md` and `AGENT_PROTOCOL.md` are all in the repository. What lives only in chat is the _coordinator_ layer: how a wave is planned, how lanes are fenced, how the falsification method is actually run. And two of its own numbers are drifting — 24 worktrees against a cap of 20, 20 stranded branches.
Evidence: `git log origin/main --since='7 days ago' --oneline | wc -l` → 710 · `node tooling/scripts/swarm.mjs status` → `worktrees: 24 ⚠ OVER CAP 20`, `stranded(P1): 20`

**What should change.** One thing, and it is a chore, not an axis: `pnpm wt:gc:apply` already exists and already knows how to clear both. Run it on a schedule.

For the coordinator layer, the honest answer is the one the brief asked for: **there is no machine version of this.** Writing down how to run a falsification wave is a person writing a document, and keeping it true is a person maintaining it. I am not proposing that, because it needs the weekly ritual the constraint forbids. What I would propose instead is narrower and self-maintaining: the _next_ coordinator chat, whichever axis it takes, writes its own dispatch brief into `tooling/agent-protocol/` as a side effect of running. The method gets recorded by being used, or it does not get recorded.

**Why this and not something else.** The alternative is a deliberate "document the agent operating system" project. Rejected against the constraint — it produces a document that is true on the day it ships and rots by the following week, in a repository whose churn data shows exactly that happening 44 times over to the files that already try.

**What it unlocks.** The stranded-branch and worktree drift stops being something anyone notices.

**How it stays true without a human.** A scheduled workflow running `pnpm wt:gc:apply`. Everything else in this section is explicitly not automatable, and is stated as such.

**Effort.** One agent session for the scheduled cleanup. Zero for the rest, by design.

**Risk if we do nothing.** Worktree and branch drift keeps growing, and the coordinator method stays in transcripts. The second risk is real and I have no machine answer for it.

**DECISION:** Do we schedule the existing worktree and branch cleanup to run itself, and accept that the coordinator method stays undocumented rather than build a process to maintain it? Yes / no.

---

## The sequencing note — agreed, with one exception

The coordinator's claim is that observability, load testing, backup and disaster recovery, and data retention are one axis until something deploys, and that treating them as four parallel fronts invents work. **Agreed, and the evidence supports it:** there is no host, no environment and no secret delivery mechanism, so an alerting configuration would have nothing to alert on, a load test would measure a laptop, and a restore drill would restore a database with no production data in it.

**One exception.** Data retention is not only an operational concern. It is a written commitment that has to exist before customers arrive, and it sits alongside the KYC and jurisdiction work already in code and alongside `docs/LICENCE-POSITION.md`. It belongs with the compliance work, not behind the deploy. Everything else in that group is correctly downstream of A3.

---

## The dispatch plan

Five coordinator chats. The path fences below are disjoint; no two chats can write the same file. **Do not start all five.** The recommended opening is the first two.

| Chat                          | Owns                              | May write                                                                                                                                                | Forbidden                                                                       |
| ----------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **C1 — the board**            | A5, and therefore A1              | `tooling/scripts/swarm.mjs`, `tooling/ci/claim-check.mjs`, `tooling/tracker/features.mjs`, `docs/ops/SWARM-MANDATE.md`, `docs/ops/trk/**`, GitHub issues | `services/**`, `vendor/**`, `docs/audit/**`, `.github/workflows/**`             |
| **C2 — the customer surface** | A2, and the dependency half of A7 | `vendor/**`, `.github/dependabot.yml`, `.github/workflows/supply-chain.yml`, `.github/workflows/vendor-*.yml`, `NOTICE`                                  | `services/**`, `tooling/scripts/**`, `docs/ops/**`, `docs/audit/**`             |
| **C3 — money correctness**    | A4, and the review half of A7     | `services/svc-{trade,pay,identity,academy,agents,dex,notify,protocol,ws}/**`, `docs/audit/2026-08-**`, `tooling/ci/*-scan.mjs`                           | `vendor/**`, `tooling/scripts/swarm.mjs`, `docs/ops/**`, `.github/workflows/**` |
| **C4 — shipping**             | A3                                | `.github/workflows/deploy.yml`, `Dockerfile`, `docker-compose*.yml`, `tooling/infra/**`                                                                  | `services/*/src/**`, `vendor/**`, `docs/ops/**`                                 |
| **C5 — the estate**           | A6, A8                            | `docs/**` except `docs/audit/**` and `docs/ops/trk/**`, `.swarm-state/**`, `tooling/agent-protocol/**`, `tooling/scripts/worktree*.mjs`                  | `services/**`, `vendor/**`, `tooling/scripts/swarm.mjs`, `docs/audit/**`        |

Two standing fences apply to all five: **nobody touches `docs/audit/2026-08-08-*`** while the falsification lanes are live, and **nobody implements in `services/svc-protocol` or anything under the `protocol.`, `chain.`, `launch.`, `mining.` or `bridge.` prefixes** — that is Shehzad's plane, 18 tracker rows under owner `shehzad002`.

C1 and C3 both read `features.mjs`; only C1 writes it. C2 and C3 both touch `tooling/ci`, but on different files — C2 owns the vendor and supply-chain scans, C3 owns the service scans.

---

## The order

**C1 first, alone, and it is not close.** Removing the money gate is one term in one boolean on line 262 of `swarm.mjs`. The swarm behind it is already merging a hundred pull requests a day at full speed. Every other axis in this document proposes building something new; this one proposes deleting a restriction, and the machine that immediately starts working on the commercial product is a machine that already exists and already works. Nine mountains with satisfied dependencies and no owner become visible the moment it merges. Nothing else in these eight axes has that ratio, and nothing else changes what the swarm does tomorrow morning.

**C2 second, started as soon as C1 has merged.** It is four lines of `dependabot.yml` before it is anything else, and those four lines are the first vulnerability check ever run against the software customers actually look at. It shares no files with C1.

**C3 third.** It is already running — the four live lanes are C3. It continues; the only change is the order of the queue, `svc-trade` and `svc-pay` ahead of the rest.

**C4 and C5 after those, and C4 only once a host exists**, because a deploy workflow with nowhere to deploy is a file, not a capability. C5 last: it is the axis whose absence costs least per day, and the one most likely to be reshaped by whatever C1 changes about how the swarm stores its state.

**Decisions waiting: six.** A2, A3, A4, A5, A6, A8. A1 has none — it resolves with A5. A7's decision is a deferral you can answer in a word.
