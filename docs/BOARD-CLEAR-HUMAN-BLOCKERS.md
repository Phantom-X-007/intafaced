# Board Clear — Human blockers (deferred queue)

**Rule:** Append only while agent residual remains.  
**Flush:** After AGENT-COMPLETE (all agent-owned rows Done/Cut), orchestrator finalizes this file and reports once.

**Agent residual remaining?** **No** — AGENT-COMPLETE 2026-08-02 (see scoreboard + NEXT).

---

## Deferred X1–X5 (Nitro only)

| ID           | Queued (UTC) | Issue | Sandbox/§13 tried? | Status |
| ------------ | ------------ | ----- | ------------------ | ------ |
| _(none yet)_ |              |       |                    |        |

---

## Human mountain rows still open at last flush

| Row                        | Owner      | What’s left (honest)                                       | Waiting on        |
| -------------------------- | ---------- | ---------------------------------------------------------- | ----------------- |
| pay.gateway (+ expand)     | shehzad002 | Card sandbox + KYB + durable list — PR #346 dirty/conflict | shehzad merge fix |
| protocol.smart-accounts    | shehzad002 | Deploy + audit package                                     | M2 implement      |
| protocol.amm (+ lending/…) | shehzad002 | After SA                                                   | M2                |
| trade.futures              | shehzad002 | Risk/margin/liq/mark truth; unlocks B-WS-2 live positions  | M3                |
| trade.otc / copy / algo    | shehzad002 | Real engines (agents must not invent)                      | M4                |
| identity sub-account money | shehzad002 | Money routing graph (UI list already shipped)              | M5                |
| Phase 5 bank money         | shehzad002 | earn/cards/ramps                                           | M6                |
| dual-book / Java residual  | shehzad002 | M7 — agents never steal                                    | M7                |

### Agent §13 residual (not a human steal)

| ID     | Row        | Socket                                                                 | Owner after |
| ------ | ---------- | ---------------------------------------------------------------------- | ----------- |
| B-WS-2 | ws.gateway | Live futures **position** private stream E2E — needs correct M3 events | M3 + agent  |

---

## Open shehzad/Denon PRs needing human eyes (snapshot)

_Re-derive with `gh pr list`. Snapshot is advisory._

| PR   | Note                                               |
| ---- | -------------------------------------------------- |
| #346 | shehzad M1 pay — **mergeable dirty**; babysit only |
| #350 | Denon copy-spec docs — do not steal                |

---

## Last flush

**2026-08-02** — AGENT-COMPLETE. Human M1–M7 still OPEN → BOARD-COMPLETE not claimed.  
Nitro report: agent residual cleared; shehzad owns the remaining board.
