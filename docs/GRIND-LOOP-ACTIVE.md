# GRIND LOOP — ACTIVE (compaction-safe)

**Status:** RUNNING · Nitro AFK · agents + 45m scheduler own the loop  
**Scheduler:** every **45 minutes** re-read **this file** on `origin/main` and ship **NEXT QUEUE**  
**Last tip:** re-check `git rev-parse origin/main` (high water through **#150** — balance REST · OHLCV empty · positions empty · convert tracker done · notify fans)

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

UNSPOKEN NEEDS (deduce and ship toward these — Nitro is not present to restate them):
  - Volume + quality without Nitro: keep shipping real product surface, not ceremony.
  - Bots can trade: CCXT public + private REST (and private WS where safe) must stay coherent and grow.
  - In-app notifications: fan safe bus events into svc-notify inbox; skip events without userIds.
  - Continuous light gates + periodic wave audits — peace of mind without reading code.
  - Scoreboard stays current so a human can scan "are we good?" in seconds.
  - NEVER invent green CI, NEVER mark human-only items done, NEVER invent candle data / balances / factory addresses.

GO: NEXT QUEUE #1. If queue empty of agent-cookable work → set Status DRAINED, update scoreboard, stop product ships.
```

---

## MERGED (do not redo) — high water

**#110–#150** area on main, including latest:

| PR | What |
| --- | --- |
| **#145** | Private REST **account/balance** (ledger projection, self-only) |
| **#146** | Public **OHLCV** route — honest empty until candle aggregation |
| **#147** | **GET /positions** — honest `[]` until `trade.futures` |
| **#148** | Notify fans: `rankUpdated`, `stakeCreated`, `p2pEscrowReleased` |
| **#149** | Tracker: **trade.convert** marked done (mounted + money-path tests) |
| **#150** | Notify fan: `p2pEscrowRefunded` |

**Earlier in the same cook (do not redo):**

- Money: yield/buyback, convert (code + tracker), stake/gov earlier
- Auth: webauthn, apikeys exchange, edge `ifc_` bearer
- Trade WS: private orders + fills streams
- Trade: history, cancelAll, fills.forOrder
- Pay: payment links create/list/deactivate + **hosted checkout HTML**
- Notify: svc-notify inbox + i18n + edge + fans above
- Protocol: factory honesty (still not chain-done)
- **CCXT REST public:** markets, orderbook, ticker, tickers, trades (tape), ohlcv (empty)
- **CCXT REST private:** open/create/cancel/get/closed, account/trades, cancel-all, fees, balance, positions empty
- Docs: grind plan, loop files, wave A–C audits, scoreboards

---

## NEXT QUEUE (agent-cookable — honest)

1. **`GET /account/trades?symbol=`** — route exists as `myFills` without market filter; add optional `?symbol=` (resolve market, filter fills) if not already on tip. Re-check before shipping.
2. **Tracker note hygiene** — refresh stale notes (e.g. `ops.notifications` still under-lists fans; keep `trade.ccxt-api` aligned with tip). No status lies.
3. **More notify fans only if safe** — subject already published, maps to userId(s), clear user meaning. **`p2pDisputeResolved` lacks buyer/seller userIds — skip.** `p2pTradeExpired` has no userIds — skip. Prefer remaining high-signal events with principal ids only.
4. **Private balance WS** — only if a safe ledger projection event path exists for self-only stream; otherwise **skip** (do not invent balance events or poll ledger from svc-ws).
5. **`pay.public-api` thin public REST** — only if a cheap slice is clear (e.g. public resolve already exists via links; do not invent webhooks/sandbox). Else skip and note.
6. **Wave audit** — brand / custody / vendor-shell / workspace / tracker on tip; record under `docs/audit/`.
7. **Reassess DRAINED** — when every remaining item is human-blocked or explicitly skipped for safety, flip Status to **DRAINED** and update the scoreboard.

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

Agent queue empty **or** each remaining item is human-blocked / safety-skipped · local doctrine scans green · **Status:** DRAINED on this file · scoreboard Wave row updated · no open agent-owned product PRs rotting.

---

## Scheduler

Every **45 minutes:** re-read this file on `origin/main` → ship NEXT QUEUE #1 (or next free mountain) → update this file before stop.

**Next agent after compact: NEXT QUEUE #1 (`account/trades?symbol=` if still missing; else #2 tracker hygiene).**
