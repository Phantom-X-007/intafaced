# GRIND LOOP — ACTIVE (compaction-safe)

**Status:** RUNNING · Nitro AFK · agents + 45m scheduler own the loop  
**Scheduler:** every **45 minutes** re-read **this file** on `origin/main` and ship **NEXT QUEUE**  
**Last tip:** re-check `git rev-parse origin/main` (high water through **#154** — balance · OHLCV · positions · notify fans · convert done · grind loop · tracker honesty · wave D scans · mytrades symbol filter)

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

GO: NEXT QUEUE #1. If queue empty of agent-cookable work → set Status DRAINED, update scoreboard, stop product ships.
```

---

## MERGED (do not redo) — high water

**#110–#154** on main, including latest wave:

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

1. **Fix DoD gate `svc-notify` OTEL** — if still open (`node tooling/ci/dod-gate.mjs` red: no OpenTelemetry instrumentation §14). Ship minimal instrumentation matching other services; do not invent SLO panels.
2. **Fix `tracker:check` if `TRACKER.md` still stale** — run `pnpm tracker` / regenerate and commit only if `--check` is red. No status lies.
3. **`p2pTradeDisputed` notify fan (openedBy only)** — if not shipped: event has `openedBy` userId; fan that principal only. **Still skip** `p2pDisputeResolved` (no buyer/seller userIds) and events with no principal ids.
4. **`pay.public-api` thin slice — SKIP (proven not worth it)** — public resolve already exists via payment links / hosted checkout. Do not invent webhooks/sandbox.
5. **Private balance WS** — only if a safe ledger projection event path exists for self-only stream; **prefer skip** (do not invent balance events or poll ledger from svc-ws).
6. **Identity `subAccounts.revoke`** — if still missing and cheap (create/list exist; no revoke). Soft-delete or status flag only if schema supports it cleanly; else skip with note.
7. **Reassess DRAINED** — when only human blockers + large phase features remain (futures, candle job, chain factory, push/email/SMS), flip Status to **DRAINED** and update the scoreboard. Do not pad the queue with ceremony.

---

## Human-only (never fake done)

- GitHub Actions **billing** / spending limit (jobs never start)
- Real chain factory + RPC for smart-accounts **done**
- Licences, wallet secrets, counsel list, kill drill, multi-asset rails
- Push / email / SMS notification channels (§13 sockets)
- Futures / positions product (honest empty is the agent floor)
- Candle aggregation job (OHLCV stays `[]` until real source)

---

## Exit (DRAINED)

Agent queue empty **or** each remaining item is human-blocked / safety-skipped / large phase feature · local doctrine scans green · **Status:** DRAINED on this file · scoreboard Wave row updated · no open agent-owned product PRs rotting.

---

## Scheduler

Every **45 minutes:** re-read this file on `origin/main` → ship NEXT QUEUE #1 (or next free mountain) → update this file before stop.

**Next agent after compact: NEXT QUEUE #1 (`svc-notify` OTEL / DoD gate if still red; else #2 tracker:check).**
