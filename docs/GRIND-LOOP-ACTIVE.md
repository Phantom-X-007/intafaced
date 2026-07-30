# GRIND LOOP — ACTIVE (compaction-safe)

**Status:** RUNNING · Nitro AFK · agents own the loop  
**Last tip write:** re-check `git rev-parse origin/main`  
**Law:** worktree only · never main checkout · one service/concern per PR · `pnpm verify` / package tests before merge  
**CI note:** GitHub Actions may be **billing-blocked** — local gates substitute; merge with admin when local green

---

## How to survive compaction / new chat

1. Read **this file first** (`docs/GRIND-LOOP-ACTIVE.md` on `origin/main`).
2. Read `docs/GRIND-PLAN-2026-07-30.md` (audit cadence).
3. `git fetch origin main && git log --oneline origin/main -15`
4. `gh pr list --state open`
5. Continue **NEXT QUEUE** below — do not re-do MERGED set.
6. After every 3–4 product PRs: wave audit (brand/custody/vendor-shell/workspace/tracker) → append `docs/audit/WAVE-*.md`
7. Update this file’s NEXT QUEUE + last tip in the same PR as scoreboard.

If this file says `Status: DRAINED`, stop product grind; only human blockers remain.

---

## Enhanced AFK prompt (paste into any new session)

```
AFK GRIND LOOP — full autonomous control (Nitro, non-technical director)

WHO: You run git/worktree/PR/verify. Plain language only when I return. I only gate money custody product-trust forks.

READ SAME TURN (mandatory):
1. docs/GRIND-LOOP-ACTIVE.md  ← source of truth for queue; survives compact
2. docs/GRIND-PLAN-2026-07-30.md
3. docs/AFK-COOK-SCOREBOARD-2026-07-30.md
4. git log origin/main -20 · gh pr list · pnpm tracker ready

RULES:
- Never stop because I am AFK. Loop until GRIND-LOOP-ACTIVE says DRAINED or only human blockers remain.
- Worktree only. Claim lane in docs/LIVE-LANES.md. One PR one concern.
- Parallel: independent mountains in parallel agents/worktrees; serial when same files/money path.
- Audit: light gates every PR; full local doctrine wave every 3–4 product PRs (NOT only at end).
- CI may be billing-blocked — run local build/tests/scans; merge green local work.
- Front-run Denon with tracker-ready high leverage that does not invent licences/rails/chain deploys.
- Before compact/end: update GRIND-LOOP-ACTIVE NEXT QUEUE + scoreboard so the next chat continues without me.

UNSPOKEN: volume + quality · no fake done · peace of mind scoreboard · bots can trade · notifications real · no stomping Denon money enum.

GO. Enhance the queue if live main changed. Ship.
```

---

## MERGED this cook (do not redo)

#110–#134 region includes (among others):
- Token yield/buyback · apikeys exchange · edge ifc_ · subaccounts list
- Private orders + fills WS · order history · cancelAll
- Payment links create/resolve/list/deactivate
- svc-notify inbox + i18n · protocol factory honesty
- CCXT public REST: markets, orderbook, ticker, trades
- Grind plan · wave audits · scoreboards

---

## NEXT QUEUE (ordered)

### Ready to cook (agent)

1. **trade.ccxt-api private REST** — `GET /api/v1/orders/open` + `GET /api/v1/tickers` if not already merged after #133
2. **trade.ccxt-api** — createOrder/cancelOrder REST mapping to existing tRPC money paths (careful mount + principal)
3. **Public REST tickers list** if not shipped
4. **fills.forOrder** query if missing
5. **ops.notifications** — mark-read polish / edge product path smoke if gaps remain
6. **pay.gateway** hosted checkout **minimal HTML** page resolving link token (UI thin is still a hole)
7. **infra.i18n** — first real consumer outside package (one surface) OR honest keep ready
8. **trade.convert** — edge product path check + tracker flip only if DoD met
9. **ws** private positions — only if futures positions exist; else leave socket note

### Human-only (never fake-ship)

- GitHub Actions **billing / spending limit**
- Real chain factory addresses + RPC for smart-accounts **done**
- Licences, wallet secrets, counsel sanctions list, kill drill, multi-asset merge

---

## Parallel recipe

| Lane | Owner | Isolation |
| --- | --- | --- |
| A REST private | agent | worktree feat/* |
| B pay checkout HTML | agent | worktree feat/* |
| C wave audit | agent | read-only then docs PR |
| Never two writers | same service files | serial |

---

## Exit criteria (DRAINED)

All of:
- NEXT QUEUE agent items empty or each has a named human blocker
- Local doctrine green on tip
- GRIND-LOOP-ACTIVE Status: DRAINED + date
- Scoreboard updated

---

## Last agent note

Session will compact. **Next agent: start at NEXT QUEUE #1.** In-flight: REST tickers+private open orders agent may still be running — check `gh pr list` before duplicating.
