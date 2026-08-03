# TRK-academy.tournaments

**Title:** Seasonal ladders, IFC prize pools  
**Tracker:** `academy.tournaments` · phase 5 · plane F · status `ready` · owner none  
**Depends on:** `academy.lobbies` (done), `trade.spot` (done)  
**Tip freeze:** `origin/main` @ `b3d08931` (re-derive before implement)

## DoD (plain language)

Seasons expose **ladders** (rankings) users can join; **IFC prize pools** fund
and pay winners through ledger recipes with full dual-book honesty. A tournament
that only mutates local scores without escrow/payout is incomplete for this
title. Paper leagues may reuse paper-market flags (`academy.paper-trading`) but
must stay labeled non-real-money.

## Path on tip

| Area          | Location                                                            |
| ------------- | ------------------------------------------------------------------- |
| Academy       | `services/svc-academy/` — no tournament tables or APIs              |
| Explicit gap  | README: tournaments / ladders / prize pools = money + season engine |
| Doctrine      | Events & tournaments gated on **season engine** (phase 5 table)     |
| Trade         | `services/svc-trade` spot exists for competition fills if needed    |
| Season engine | **Not built** as a service on tip (product/infra residual)          |

**Tip residual:** entire feature. Lobbies are a venue shell only.

## Blocked by

| Blocker             | Notes                                                                |
| ------------------- | -------------------------------------------------------------------- |
| **Season engine**   | Doctrine dependency — no seasons package/service on tip              |
| **Money / Class M** | Prize pool escrow + payout recipes — do not invent                   |
| Product law         | Ladder rules, eligibility, IFC vs card-tier prizes — Denon           |
| Soft                | Overlap with paper leagues vs real-money tournaments — label clearly |
| Shehzad             | Not an M1–M7 claim, but any trade path still one-service / contracts |

## First PR size (if free)

**S Class N:** season + tournament **domain doc + schema sketch** only if still
blocked on engine — do not ship fake pools. **First code PR when unblocked:**
tournament registry + ladder **read model** with **zero prize movement**,
explicit “prizes not armed.” Prize arming is a **separate Class M** PR after
ledger recipes. Prefer season engine PR before academy tournament surface.
