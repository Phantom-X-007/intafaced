# Denon ↔ Nitro parallel board

**Snapshot:** 2026-07-30 · live-checked against `origin/main`  
**Main tip at write:** `2fec526` (**#168** grind high-water after **#167** fleet migration fix)  
**Open PRs:** none  
**Agent AFK queue:** **DRAINED** (`docs/GRIND-LOOP-ACTIVE.md`) — micro-features agents can invent are largely gone  
**If this file disagrees with live git/PRs/tracker:** live wins — re-fetch, then fix this file.

**Purpose:** one light two-column board so Denon and Nitro work in parallel without double-building or over-engineering a third project system.

---

## How to use this (do not invent tooling)

| Surface | Job |
| --- | --- |
| **This file** | Who should do *what class* of work *now* (judgment split) |
| **`docs/TRACKER.md` / `pnpm tracker ready`** | Full feature scoreboard (generated from `tooling/tracker/features.mjs`) |
| **`docs/SPLIT-BOARD.md` + `docs/NITRO-STREAM-A-CLAIM.md`** | File territory (Stream A shell vs Stream B spine) |
| **`docs/LIVE-LANES.md`** | Which *agent sessions* currently claim a lane |
| **`gh pr list`** | What is in flight on GitHub |

**Rule of thumb:** Denon gets decisions + money/spine product that needs a human builder. Nitro + agents get autonomous-safe work that does not invent product/tech forks.

---

## Live truth (one screen)

| Fact | State |
| --- | --- |
| Product UI | Vendored exchange shell `vendor/coinexchange/05_Web_Front` → **:8090** — **not** `apps/web` |
| Money books | TypeScript ledger only — shell never sells balances as truth |
| Audit program | Closed (#80/#81/#86 + wave cleanups). After Denon waves: **WAVE-AUDIT only** |
| AFK cook (Nitro agents) | Huge ship wave **#110–#168** on main (CCXT REST, notify fans, private streams, payment links, honesty empties, OTEL, sub-account revoke, tape, etc.) |
| CI | May be **billing-blocked** on GitHub Actions — do not claim CI green without live check |
| Multi-asset | Branch `feat/multi-asset-instruments` still **unmerged** — **Denon-only** money-enum merge |
| Local main checkout | Often **behind** `origin/main` — always `git fetch` before claiming work |

---

## Column A — DENON (human judgment / spine)

Work that needs Denon’s product sense, ops access, licence choice, or money-path ownership.  
**Agents must not invent the answer and mark it done.**

### Priority 1 — decisions that unblock go-live shape

| # | Task | Why Denon | Source |
| --- | --- | --- | --- |
| D1 | **Chart licence path** — keep TradingView (get grant) **or** switch to lightweight-charts per `TERMINAL.md` | Legal/product fork; two different workstreams | Residual #6 · PEACE · STATUS evening |
| D2 | **MySQL Connector/J GPL** — swap to MariaDB Connector/J (or other allowed path) | Licence in money path | Residual #7 · LICENCE-POSITION |
| D3 | **Merge or refuse `feat/multi-asset-instruments`** | Changes ledger asset enum — owner merges money personally | SPLIT-BOARD · residual |
| D4 | **Wallet secrets / empty keystores / host perimeter** | Ops secrets, not a code PR | Residual #5 |
| D5 | **Real rails + live chain** (not propped) | Product infra; not agent fiction | Residual #12 · PEACE |
| D6 | **Kill / freeze drill end-to-end** + Nitro sign-off | Proof path, not a patch | Residual #13 |
| D7 | **GitHub Actions billing / spending limit** (if still red) | Org billing — human only | AFK scoreboard |

### Priority 2 — high-leverage spine product (tracker ready / near-ready)

These are large or architectural. Denon owns design + first honest implementation; agents may assist *after* he sets the path.

| # | Tracker id | Why not pure agent-cook |
| --- | --- | --- |
| D8 | `protocol.smart-accounts` | Unblocks **~27** features; needs real chain RPC/factory, not propped honesty |
| D9 | `pay.rails` | Deposit/withdraw rails — money path design |
| D10 | `trade.futures` | Perps margin/funding/liquidation — money model |
| D11 | `trade.otc` / `trade.copy` / `trade.algo` / `trade.mm-bot` | Trade expansion — desk design + risk |
| D12 | `venue.aggregation` | External venue fabric — adapter contracts |
| D13 | `ops.admin` kill-switches / treasury params | Operator power surface |
| D14 | Java package / Mongo `_class` rebrand strategy | Live data migration hazard (SPLIT-BOARD §5) |

### Priority 3 — review / absorb what Nitro agents already shipped

| # | Task | Note |
| --- | --- | --- |
| D15 | Read `docs/AFK-COOK-SCOREBOARD-2026-07-30.md` + `docs/GRIND-LOOP-ACTIVE.md` | Map of #110–#168 so he does not rebuild |
| D16 | Skim PEACE + residual after agent waves | Confirm leftover list matches his taste |
| D17 | Self-audit any spine PR he opens; merge on green CI + doctrine (asymmetric review) | AGENTS.md |

**Suggested first three for Denon today:** **D1, D2, D3** (or D15 orient → then D1–D3). Everything else waits on those forks cleanly.

---

## Column B — NITRO + agents (autonomous-safe)

Work that keeps product moving **without** inventing Denon’s decisions.

### B1 — Stream A (app surface) — Nitro’s home lane

Territory: `docs/NITRO-STREAM-A-CLAIM.md` · issue **#83** · branches `feat/app-*`  
**May edit:** vendor shell pages / components / images / `App.vue` / `routes.js`  
**Must not edit:** `services/`, `packages/`, edge, compose, Java, proxy `config/index.js`, `main.js` — open `[cross-stream]` instead.

| # | Task | Done when |
| --- | --- | --- |
| N1 | Human (or screenshot) **browser pass** of terminal | Layout/chart/depth seen; bugs listed |
| N2 | **Visual sign-off** on rebrand (black/orange English shell) | Nitro yes/no on “this is the product look” |
| N3 | Order-entry polish | Validation, precision, fee preview, confirm states |
| N4 | Account panes honesty | Balances / positions / open orders / history — real data or honest empty/unknown |
| N5 | Mobile drawer after retheme | Usable small screen |
| N6 | Empty + error states | Backend down never blank-screens |
| N7 | Cross-stream issue for anything blocked on proxy/edge | `[cross-stream]` issues, not silent spine edits |

### B2 — Agent cook (only when not inventing “done”)

| # | Task | Rule |
| --- | --- | --- |
| N8 | Re-read `GRIND-LOOP-ACTIVE.md` on tip | If **DRAINED** → babysit PRs / tracker honesty / brand red only — **no ceremony pad** |
| N9 | WAVE-AUDIT after Denon merges | Delta only — not full archaeology |
| N10 | Tracker / residual honesty | Notes match main; never mark human-only items done |
| N11 | Stream A / terminal surface that is already contracted | Small PRs; one concern each; `pnpm verify` |
| N12 | Docs that orient Nitro (START-HERE, PEACE tip SHA) | After real main moves only |

### B3 — Explicitly **not** agent-done (leave for Denon / counsel)

Licences · multi-asset merge · rails/chain · kill drill · sanctions **list content** · inventing candle/balance/factory data · faking CI green · dual-book habit sold as real money.

---

## Classification rule (for every new task)

When an agent finds work, classify before coding:

1. **Needs a product/legal/ops fork Denon would argue about?** → Column A. Stop. Put it on this board.
2. **Touches ledger enum, custody perimeter, real rails, Java money DAO, licence?** → Column A.
3. **Is it shell look/feel, honesty empty states, wired-to-existing-contract UI, tracker honesty, wave audit?** → Column B.
4. **Unclear?** Prefer Column A (ask / list for Denon) over inventing.

---

## Live Grok sessions (Sovereign) — do not steal their mountain

Checked 2026-07-30 from `~/.grok/active_sessions.json` + session summaries. Titles are approximate; re-check dashboard.

| Session (short id) | Role (from summary) | Implication |
| --- | --- | --- |
| `019fae69…` | **This coordination chat** — Denon parallel board | Air-traffic / board owner |
| `019fae3d…` | Multi-agent parallel + AFK grind cook | Heavy ship history; may still babysit loop |
| `019fb069…` | Stream A product owner (shell :8090) | Prefer Stream A UI here |
| `019fae32…` | Denon handover / merge-ready | Historical merge lane |
| `019fae30…` | Mega audit of Denon shipments | Audit lane — not product features |
| Subagents under grind | AFK grind loop (45m scheduler) | Only when queue not DRAINED |

**Before any agent edits code:** claim a row in `docs/LIVE-LANES.md` and avoid the other sessions’ scopes.

---

## Tracker ready list (snapshot — re-run on tip)

From `origin/main` `docs/TRACKER.md` (~37/107 shipped · ~30 ready · 2 wip):

**Wip:** `ws.gateway` (Nitro) · `pay.gateway` (Nitro)

**Ready (pick carefully):**  
`infra.i18n` · `trade.futures` · `trade.otc` · `trade.copy` · `trade.algo` · `trade.ccxt-api` · `trade.mm-bot` · `venue.aggregation` · `web.terminal` · `p2p.merchants` · `protocol.smart-accounts` · blueprint/bank/agents/academy/market/mining/ops\* cluster · `ops.notifications` …

**Routing hint:** most Phase-2 trade / protocol / rails-adjacent ready items → **Denon column** unless a thin honesty/wire PR is obvious and already contracted. Stream A + residual polish → **Nitro column**.

---

## Message Denon can paste (Telegram / chat)

```
Parallel board is live: docs/DENON-NITRO-PARALLEL-BOARD-2026-07-30.md

You: Column A — decisions + spine (licences, multi-asset merge, rails/chain, kill drill, big trade/protocol).
Me + agents: Column B — Stream A shell (:8090), honesty UI, wave audits, no inventing your forks.

Main has a big agent cook through ~#168. Open PRs were empty at board write — re-check gh.
Please don’t rebuild what AFK-COOK-SCOREBOARD already lists as shipped.
First three asks for you: chart licence path, MySQL/MariaDB licence path, multi-asset merge/refuse.
```

---

## Enhanced director prompt (for Nitro → any new agent)

Use this when opening a session that must *understand* Nitro’s parallel intent (not only code):

```
You work for Nitro on INTAFACED (Phantom-X-007/intafaced). He is non-technical director; you run git/PR (operator mode). Denon is the experienced builder.

GOAL OF THIS MODE
- Parallel with Denon without over-engineering.
- Denon gets high human-reasoning tasks (money, licences, rails/chain, multi-asset, architecture forks).
- Nitro+agents keep autonomous-safe work (Stream A shell, honesty UI, tracker truth, wave audits).
- Cognitive depth stays on: classify hard vs safe, never invent Denon decisions, never fake done.

SOURCE ORDER (live wins)
1) docs/DENON-NITRO-PARALLEL-BOARD-2026-07-30.md (this split)
2) docs/LIVE-LANES.md (who is coding what session)
3) docs/START-HERE.md · PEACE · residual · GRIND-LOOP-ACTIVE on origin/main
4) docs/TRACKER.md + gh pr list / git fetch origin/main
5) Law: INTAFACED_DEFINITIVE_BUILD.md · AGENTS.md · agent protocol
6) Grok sibling sessions only if board is missing/stale

TERRITORY
- Stream A (Nitro): vendor shell pages/components/images, App.vue, routes.js — feat/app-*
- Stream B (Denon): services, packages, tooling, edge, compose, Java, proxy, main.js
- Never merge multi-asset without Denon. Shell ≠ books.

DO / DON’T
- DO claim one lane, worktree only, one concern per PR, pnpm verify, plain-language status.
- DO put judgment forks on Denon’s column and stop.
- DON’T rebuild main services, reopen closed audits, pad ceremony when queue is DRAINED.
- DON’T invent CI green, candles, balances, factory addresses, licence answers, or rails.

WHEN I SAY “what should we do?”
- Refresh live state → update board if needed → give me: Denon’s top 3, my top 3 agent-safe, one recommended move.
```

---

## Maintenance

- After Denon accepts a D-row or ships a wave: move row to “done” here + residual/PEACE if trust floor changes.
- After agent ships: high water lives in GRIND-LOOP / scoreboard — don’t duplicate PR tables here.
- Re-verify SHA + open PRs every orient (60s).
