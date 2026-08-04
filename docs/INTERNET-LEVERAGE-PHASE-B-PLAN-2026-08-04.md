# Internet leverage — Phase B plan (new external candidates)

**Status:** PLAN / SPEC — **executed** (v1 thin #772; **v2 all-out** report is canonical)  
**Depends on:** Phase A complete on tip — [`INTERNET-LEVERAGE-CURRENT-AUDIT-2026-08-04.md`](INTERNET-LEVERAGE-CURRENT-AUDIT-2026-08-04.md)  
**Canonical report:** [`INTERNET-LEVERAGE-PHASE-B-REPORT-V2-2026-08-05.md`](INTERNET-LEVERAGE-PHASE-B-REPORT-V2-2026-08-05.md)  
**Term:** **Internet leverage** = already-built systems we adopt/wire/wrap instead of rebuilding.

**Phase B is not shopping for fun.** It is a disciplined landscape of **candidates that fill real gaps** left after Phase A, filtered by doctrine, ownership, cost, and dual-build risk.

---

## 0 · High-level overview (what good looks like)

| Dimension     | Good job                                                                                                 | Failure (lazy / dangerous)                     |
| ------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Scope**     | New leverage **outside** monorepo (or not yet adopted) for Nitro + Denon work                            | Re-auditing prior kits as if new               |
| **Anchor**    | Every search lane starts from a **named gap** (Phase A G-\* + tracker ready + Denon D-S-\* / hard board) | “Cool projects on GitHub” with no job          |
| **Planes**    | Fiat vs Protocol vs shell clearly labeled                                                                | Handing Shizu UI kits or agents chain L1 cores |
| **Doctrine**  | Ledger-only money; no dual-book; no invent prices; partner names in adapters                             | “Just use their wallet balances”               |
| **Ownership** | Candidate → who would adopt (N / D / S)                                                                  | Agents invent futures risk via a random lib    |
| **Depth**     | Multi-source (docs, license, maturity, ops, security)                                                    | One README screenshot                          |
| **Output**    | Ranked shortlist + kill list + next 90-day adopt queue                                                   | 200-link dump nobody can act on                |
| **Peace**     | You can see: adopt / adapt / reject / later for each                                                     | “We should look into X someday”                |

**Unspoken needs (inferred):**

1. **Don’t compromise Phase A wins** — no second product SPA, no Java second book.
2. **All-out research without thrash** — wide fan-out, narrow decisions.
3. **Denon/Nitro/Shizu stay collision-free** — candidates tagged to a lane.
4. **Class X stays human** — custody keys, sanctions content, go-live not “npm install.”
5. **Cost honesty** — license, ops, audit, integration months.
6. **Actionable** — top N with Done-shaped next steps, not encyclopedia.
7. **Survives chat death** — durable tip (or harvest) report.
8. **You can decide in minutes** — plain ranking, not code dumps.

---

## 1 · Methodology audit (what to watch out for)

| Risk                    | Why it appears in “leverage research” | Control in this plan                         |
| ----------------------- | ------------------------------------- | -------------------------------------------- |
| **Solution-first bias** | Cool project found → invent a problem | Gap-first matrix only                        |
| **License landmines**   | GPL/AGPL into monorepo                | License tier gate before shortlist           |
| **Custody creep**       | “Drop-in wallet” holds keys wrong way | Forbidden if dual-book / platform withdrawal |
| **Shell dual-kit**      | Another full exchange Vue             | Auto-reject if Phase A kit covers surface    |
| **Fake maturity**       | Stars ≠ production                    | Evidence: users, releases, CVEs, maintainers |
| **Scope explosion**     | Research forever                      | Timeboxed stages + candidate caps per lane   |
| **Ignoring in-repo**    | Re-find what we already vendor        | Phase A asset register is exclusion list     |
| **Agent overclaim**     | “We should use X” without Denon law   | Product-law-touching → D seal required       |
| **Shizu bleed**         | L1 frameworks dumped on Nitro         | Protocol candidates → S lane only            |
| **Security theater**    | Long blog, no threat model            | Security pass mandatory for custody/crypto   |
| **Integration fantasy** | “Two week plug-in”                    | Integration cost score 1–5                   |
| **Stamp research**      | Docs PR with no decision              | Kill list + adopt queue required             |
| **Thrift / CI thrash**  | 50 tiny research PRs                  | One fat report PR (or harvest then one PR)   |

---

## 2 · Scope boundaries

### In scope (Phase B)

- OSS libraries, services, protocols, SDKs, hosted APIs **not yet** our default path
- Categories tied to **open work**: pay residual, bank, P2P/disputes (post-ruling), notifications, indexing, observability, card rails, KYC **adapters**, mobile later, matching/perf **libraries** (not invent mids), ReDoS-safe parsers, etc.
- Re-evaluation of **V-WALLET-RPC alternatives** only as “after security review” options

### Out of scope

- Replacing vendored trader shell wholesale
- Replacing ledger-client as book
- Sanctions **list content**, licence purchase, mainnet keys (Class X)
- Building Shehzad’s L1 for him (may **list** Cosmos/Hyperliquid-class **references** for his board only)
- Implementing adopt PRs in the research pass (research → decide → later implement)

---

## 3 · Phases (program shape)

```
B0  Orient + freeze gap backlog from Phase A + boards + tracker
B1  Taxonomy — research lanes (what buckets exist)
B2  Fan-out collection — candidates per lane (wide, cheap)
B3  Hard filters — license, doctrine, ownership, dual-kit, Class X
B4  Deep evaluation — shortlist only (expensive judgment)
B5  Score + rank — decision matrix
B6  Recommendations — adopt / adapt / reject / later + owners
B7  Durable report + operator one-screen + optional Denon/Shizu notes
B8  STOP — no implement until you pick from shortlist
```

---

## 4 · Phase depth specs

### B0 — Orient (no shopping yet)

**Inputs (must re-derive tip):**

- Phase A audit + gap register
- Denon hard board + product rulings (disputes human, etc.)
- Three-way ownership
- Tracker ready/socket non-chain rows
- Open Denon PRs (avoid dual-building mid-flight)

**Output:** `Gap backlog` table: GapID · need · owner · phase-A status · research-lane tags

**Done when:** ≥1 research lane per open need; no orphan “random interest” lanes without a gap.

---

### B1 — Taxonomy (research lanes)

Mandatory lanes (adjust names, don’t drop categories without writing “N/A — covered by Phase A”):

| Lane ID         | Question                                            | Typical gaps                                   |
| --------------- | --------------------------------------------------- | ---------------------------------------------- |
| **L-UI**        | UI components / patterns beyond kit?                | a11y, charts (already decided?), admin widgets |
| **L-PAY**       | Card/PSP/crypto pay adapters                        | pay residual after #346 handoff                |
| **L-BANK**      | Earn/cards/ramps adapters                           | bank residual                                  |
| **L-P2P**       | Dispute tooling, moderation UX, safe parsers        | post-ruling P2P integrity                      |
| **L-ID**        | KYC/WebAuthn/step-up vendors as **adapters**        | identity residual                              |
| **L-MSG**       | Email/SMS/push providers                            | notify residual                                |
| **L-DATA**      | Indexer/ETL/search                                  | indexer / ops analytics                        |
| **L-OBS**       | Metrics/logs/traces (beyond current otel)           | ops                                            |
| **L-SEC**       | Secret scanning, ReDoS-safe regex, dependency audit | ReDoS ruling, CI                               |
| **L-CUSTODY**   | Wallet/custody stacks (review-first)                | wallet_rpc alternative                         |
| **L-MATCH**     | Matching/perf libraries (not price invent)          | scale — Denon seal                             |
| **L-CHAIN-REF** | L1/L2 stacks **reference only for Shizu**           | INTACHAIN sequencing                           |
| **L-MOBILE**    | Mobile (Phase A: stubs only)                        | future app                                     |
| **L-KILL**      | Explicit non-goals                                  | dual-kit, second ledger, etc.                  |

**Done when:** each lane has purpose, in/out, primary owner (N/D/S).

---

### B2 — Fan-out collection (all-out width)

**How to go all-out without drowning:**

| Rule                      | Spec                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Sources per lane**      | ≥3 independent (e.g. official docs, GitHub/awesome lists, eng blogs/HN, competitor teardown, existing ADRs) |
| **Candidates per lane**   | Cap **8–12** raw → expect most to die in B3                                                                 |
| **Fields captured (raw)** | name, url, one-line job, license, last release, stars/forks (weak), used-by if known, fits which GapID      |
| **Parallelism**           | One subagent/source-batch per lane; **judgment model** only at B4+                                          |
| **No implement**          | Collection only                                                                                             |
| **Deduplicate**           | Canonical name map                                                                                          |

**Anti-lazy:** empty lane must say “searched X Y Z — no fit” with sources.

**Done when:** raw candidate table exists for every non-N/A lane.

---

### B3 — Hard filters (fast death)

Drop or quarantine if **any**:

1. License incompatible with monorepo policy (flag GPL/AGPL/unknown)
2. Requires second balance book or platform withdrawal of user chain funds without SA model
3. Duplicates Phase A kit surface (full exchange UI)
4. Touches Class X content (sanctions lists as data product) without human path
5. Unmaintained >18 months **and** security-critical
6. Forces partner name into user-facing copy
7. Ownership mismatch with no path (e.g. only works as Shizu L1 core but pitched for Nitro shell)

**Output:** survivors + kill list with one-line reason each.

**Done when:** every raw candidate is keep or kill.

---

### B4 — Deep evaluation (shortlist only)

For each survivor (target **≤3 per lane**, **≤25 global**):

| Criterion            | Score / note                         |
| -------------------- | ------------------------------------ |
| Gap fit              | Which GapID / mountain               |
| Integration cost     | 1 (adapter) … 5 (rewrite platform)   |
| Ops burden           | self-host / SaaS / keys / SLAs       |
| Security posture     | audits, issue hygiene, supply chain  |
| Doctrine fit         | ledger, honesty, custody-scan        |
| Lane owner           | N / D / S                            |
| Replaces what build? | months saved estimate (honest range) |
| Residual risk        | what we still own after adopt        |

**Done when:** deep cards exist; no raw-only survivors.

---

### B5 — Score + rank

Composite for operator view (weights adjustable, state them):

| Weight | Factor                                  |
| ------ | --------------------------------------- |
| 30%    | Gap severity (blocks money/UX/security) |
| 25%    | Doctrine/safety fit                     |
| 20%    | Integration cost (invert)               |
| 15%    | Maturity/maintenance                    |
| 10%    | Strategic (unlocks multiple mountains)  |

**Output:** ranked table Top 15 + “do not adopt” top rejects.

---

### B6 — Recommendations

For each Top item:

- **Adopt** — wrap adapter, own interface
- **Adapt** — fork/subset
- **Trial** — spike ≤3 days in worktree
- **Later** — after D-S-x or Class X
- **Reject** — reason

Plus **90-day queue** (max 5 active adopt tracks) so all-out research doesn’t become all-out implement thrash.

---

### B7 — Deliverable

**Primary:** `docs/INTERNET-LEVERAGE-PHASE-B-REPORT-2026-08-XX.md` on tip (one PR)  
**Must include:** gap backlog · lane map · kill list · ranked shortlist · 90-day queue · explicit non-goals · Phase A non-regression checklist

**Chat to you:** one screen — Top 5 + decisions you must make (Class X / Denon seal).

---

### B8 — Stop line

Research does **not** auto-merge dependencies.  
Implement only after you pick (or standing order “trial top 3 spikes”).

---

## 5 · Max out / all-out playbook

| Lever                  | How                                                                     |
| ---------------------- | ----------------------------------------------------------------------- |
| **Width**              | All L-\* lanes in parallel collection (B2)                              |
| **Depth**              | Only shortlist gets B4 (don’t deep-dive 100)                            |
| **Models**             | Cheap bulk collect → strong model for B4–B6 judgment                    |
| **Reuse Phase A**      | Exclusion list = asset register + forbidden leverage                    |
| **Denon alignment**    | Any candidate needing product law → “needs D-S-x” tag, not silent adopt |
| **Shizu alignment**    | L-CHAIN-REF is **reference pack for him**, not Nitro build              |
| **Security**           | Custody/pay/crypto shortlist always security subsection                 |
| **Completeness proof** | Checklist §7 must all be true to claim done                             |

---

## 6 · What “done” means for Phase B (peace criteria)

- [ ] Every Phase A open gap either has a candidate lane or “no external leverage — greenfield OK”
- [ ] Kill list ≥ shortlist (proves filtering)
- [ ] No full-UI kit competitor recommended without explicit “replace shell” decision (default: reject)
- [ ] No second ledger recommended
- [ ] Top 5 have owner + next action ≤ 1 sprint each
- [ ] Class X items listed separately for you only
- [ ] Durable report on tip or harvest+PR
- [ ] You can decide Top 5 in <10 minutes from one screen

---

## 7 · Completeness checklist (cannot claim finished without)

- [ ] B0 gap backlog from tip re-derive
- [ ] All L-\* lanes addressed or N/A
- [ ] ≥3 sources cited per active lane
- [ ] Raw caps respected; kills reasoned
- [ ] Deep cards for shortlist
- [ ] Rank weights stated
- [ ] 90-day adopt queue ≤5
- [ ] Collision with open Denon PRs noted
- [ ] Shizu chain refs isolated
- [ ] Non-regression: Phase A kit + ledger-only restated

---

## 8 · Enhanced execute prompt (paste when you say GO Phase B)

```
INTERNET LEVERAGE PHASE B — execute the plan on tip.

PLAN LAW: docs/INTERNET-LEVERAGE-PHASE-B-PLAN-2026-08-04.md (full). Re-derive origin/main first.

GOAL: Ranked external leverage candidates that fill REAL gaps after Phase A — not a second exchange kit, not a second ledger.

UNSPOKEN / IMPLICIT
- Preserve Phase A: vendor shell = product UI; ledger-client = only book.
- All-out width in collection; ruthless filters; small actionable shortlist.
- Tag every candidate N/D/S owner; product-law → Denon seal; chain L1 refs → Shehzad only.
- Class X never agent-closed.
- One durable report; chat = Top 5 + decisions only.
- No dependency installs / adopt implement in this pass unless I say trial.

METHOD: B0→B8 exactly. Gap-first. Multi-source. Kill list required. Score weights stated.

ANTI-LAZY FAIL if: no kill list; only GitHub stars; recommends replacing shell; invents money paths; skips license; skips ownership tags; dumps 100 links without rank.

OUTPUT: docs/INTERNET-LEVERAGE-PHASE-B-REPORT-<date>.md + PR (batch one fat docs PR; thrift-aware).

FORBIDDEN: dual-edit Denon open PRs; Shehzad protocol implement; invent mids; partner names in UI copy.
```

---

## 9 · Relationship to open human threads

| Thread                     | Phase B impact                                                           |
| -------------------------- | ------------------------------------------------------------------------ |
| #346 handoff asserted      | Pay residual can use L-PAY findings later                                |
| Denon product rulings sent | L-P2P research respects human disputes, no chain escrow handoff          |
| Denon open PRs             | Note collisions; don’t redesign his mid-flight P2P in research implement |
| Fleet/depth done           | L-UI depth not a priority lane                                           |

---

## 10 · Your go options

| Command                           | Meaning                               |
| --------------------------------- | ------------------------------------- |
| **GO Phase B**                    | Execute this plan (research + report) |
| **Revise plan**                   | Change lanes/weights first            |
| **Trial only Top-N after report** | Default stop at B8                    |

**Recommendation:** Land #346 handoff docs → then **GO Phase B** as research-only.
