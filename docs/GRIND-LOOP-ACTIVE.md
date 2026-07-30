# GRIND LOOP — ACTIVE (compaction-safe)

**Status:** DRAINED · Nitro AFK · 45m scheduler re-checks for regressions / open PRs only  
**Scheduler:** every **45 minutes** re-read **this file** on `origin/main` — product queue empty of agent-cookable work  
**Last tip:** high water through **#158** (identity subAccounts soft-revoke). Prior: **#155–#157** (loop docs · notify OTEL + tracker green · p2pTradeDisputed fan)

---

## How to survive compaction / new chat

1. Read **this file** on `origin/main` first (`git show origin/main:docs/GRIND-LOOP-ACTIVE.md` or pull tip).
2. Read `docs/GRIND-PLAN-2026-07-30.md` (audit cadence) and `docs/AFK-COOK-SCOREBOARD-2026-07-30.md` (peace-of-mind map).
3. `git fetch origin main && git log --oneline origin/main -25`
4. `gh pr list --state open` and `gh pr list --state merged --limit 20`
5. Continue **NEXT QUEUE** from #1 — **never re-ship MERGED**.
6. **Worktree only** (`pnpm wt <branch>` / worktree create). Never edit the main checkout.
7. Light gates every product PR; full wave audit every 3–4 product PRs (brand / custody / vendor-shell / workspace / tracker).
8. **Update this file** after each batch (or before you stop) so the next compact session inherits truth.
9. If GitHub Actions never starts: **billing-blocked** (human) — prove local green + admin-merge when allowed; do **not** claim CI green.

---

## Enhanced AFK prompt (paste)

```
AFK GRIND LOOP — full autonomous cook (Nitro away). COMPACTION SURVIVAL first.

READ (in order, on tip):
  1) docs/GRIND-LOOP-ACTIVE.md   ← queue + MERGED high water + human-only
  2) docs/GRIND-PLAN-2026-07-30.md
  3) docs/AFK-COOK-SCOREBOARD-2026-07-30.md
  4) live: git fetch origin main · git log origin/main -25 · gh pr list open/merged

RULES (hard):
  - Worktree only from origin/main — never main checkout; never push main.
  - One service (or one docs concern) per PR; parallel independent mountains OK.
  - Light gates every PR; wave audit every 3–4 product ships.
  - CI may be billing-blocked → local green + admin merge when policy allows; never fake CI green.
  - Brand clean: no model-vendor names in brand-scanned docs (say agent / session model / operator).
  - Doctrine: no balances outside ledger-client; no money as number; cross-service only via contracts/events.
  - Update docs/GRIND-LOOP-ACTIVE.md BEFORE you stop (queue + high water + honest status).
  - Front-run Denon product holes without fake "done" on human blockers.
  - After compact / new chat: this file is law — re-read tip, never re-do MERGED.

UNSPOKEN NEEDS (deduce and ship toward these — Nitro is not present to restate them):
  - Volume + quality without Nitro: keep shipping real product surface, not ceremony.
  - Bots can trade: CCXT public + private REST (and private WS where safe) must stay coherent and grow.
  - In-app notifications: fan safe bus events into svc-notify inbox; skip events without userIds.
  - Continuous light gates + periodic wave audits — peace of mind without reading code.
  - Scoreboard stays current so a human can scan "are we good?" in seconds.
  - Compaction survival: every stop updates this loop file so the next session continues cold.
  - NEVER invent green CI, NEVER mark human-only items done, NEVER invent candle data / balances / factory addresses.
  - NEVER fake human-only work as agent-done (billing, chain props, licences, counsel, kill drill, multi-asset rails).

GO: NEXT QUEUE #1. If Status is DRAINED → babysit open PRs / scan for honest tracker lies / brand-scan red only; do not pad ceremony.
```

---

## MERGED (do not redo) — high water

**#110–#158** on main. Latest agent-cookable wave:

| PR | What |
| --- | --- |
| **#145** | Private REST **account/balance** (ledger projection, self-only) |
| **#146** | Public **OHLCV** route — honest empty until candle aggregation |
| **#147** | **GET /positions** — honest `[]` until `trade.futures` |
| **#148** | Notify fans: `rankUpdated`, `stakeCreated`, `p2pEscrowReleased` |
| **#149** | Tracker: **trade.convert** marked done (mounted + money-path tests) |
| **#150** | Notify fan: `p2pEscrowRefunded` |
| **#151** | Docs: Wave D grind loop high-water + compaction survival |
| **#152** | Tracker honesty wave D — notes match main code |
| **#153** | Docs(audit): Wave D doctrine scan log with real exit codes |
| **#154** | SQL **symbol filter** on `account/trades` + positions health log |
| **#155** | Docs: grind loop high water past #154 + AFK scoreboard |
| **#156** | **svc-notify OpenTelemetry** + `tracker:check` green |
| **#157** | Notify fan: **`p2pTradeDisputed`** (openedBy only) |
| **#158** | Identity **`subAccounts.revoke`** soft-disable (`revoked=true`) |

**Earlier in the same cook (do not redo):**

- Money: yield/buyback, convert (code + tracker), stake/gov earlier
- Auth: webauthn, apikeys exchange, edge `ifc_` bearer
- Trade WS: private orders + fills streams
- Trade: history, cancelAll, fills.forOrder
- Pay: payment links create/list/deactivate + **hosted checkout HTML**
- Notify: svc-notify inbox + i18n + edge + fans above
- Protocol: factory honesty (still not chain-done)
- **CCXT REST public:** markets, orderbook, ticker, tickers, trades (tape), ohlcv (empty)
- **CCXT REST private:** open/create/cancel/get/closed, account/trades (+ symbol filter), cancel-all, fees, balance, positions empty
- Docs: grind plan, loop files, wave A–D audits, scoreboards

---

## NEXT QUEUE (agent-cookable — honest)

**Empty of product ships.** Remaining items are human-only, safety-skipped, or large phase features.

| # | Item | Disposition |
| --- | --- | --- |
| 1 | svc-notify OTEL / DoD | **DONE** #156 · local `dod-gate` green including svc-notify |
| 2 | tracker:check | **DONE** #156 · green on tip (sub-account note honesty may land with drain docs) |
| 3 | p2pTradeDisputed fan | **DONE** #157 · openedBy only; still **skip** p2pDisputeResolved (no buyer/seller ids) |
| 4 | pay.public-api thin slice | **SKIP** — public resolve via payment links / hosted checkout |
| 5 | Private balance WS | **SKIP** — no safe ledger projection event path; do not invent poll from svc-ws |
| 6 | identity subAccounts.revoke | **DONE** #158 · soft `revoked`; no hard delete |
| 7 | Reassess DRAINED | **THIS FILE** — Status **DRAINED** |

**Drained-mode work only (each fire):**

1. `gh pr list --state open` — babysit; local verify + admin-merge if CI billing-stuck  
2. Local doctrine: brand / custody / vendor-shell / workspace / dod-gate / tracker:check  
3. Honest tracker lies only if `--check` red or notes contradict main code  
4. Do **not** invent product surface for futures, candles, chain factory, push/email/SMS  

---

## Human-only (never fake done)

- GitHub Actions **billing** / spending limit (jobs never start)
- Real chain factory + RPC for smart-accounts **done**
- Licences, wallet secrets, counsel list, kill drill, multi-asset rails
- Push / email / SMS notification channels (§13 sockets)
- Futures / positions product (honest empty is the agent floor)
- Candle aggregation job (OHLCV stays `[]` until real source)

---

## Exit (DRAINED) — met

Agent queue empty · remaining items human-blocked / safety-skipped / large phase · local doctrine scans green (brand/custody/vendor-shell/workspace/dod-gate/tracker:check) · **Status:** DRAINED · scoreboard Wave row updated · no open agent-owned product PRs (only long-lived docs PR if any).

---

## Scheduler

Every **45 minutes:** re-read this file on `origin/main`.

- If **DRAINED:** babysit open PRs + scan for real regressions only; update high water if something merged.  
- If a human or Denon re-opens agent-cookable work: set Status **RUNNING**, put items in NEXT QUEUE, ship.

**Next agent after compact: Status DRAINED — do not re-ship #110–#158; only babysit / honest fixes.**
