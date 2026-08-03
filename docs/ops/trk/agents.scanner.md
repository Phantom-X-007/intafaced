# TRK-agents.scanner

**Title:** Market Scanner — ranked signals by tier  
**Tracker:** `agents.scanner` · phase 5 · plane F · status `ready` · owner none  
**Depends on:** `agents.gateway` (done), `trade.spot` (done)

## DoD (plain language)

A user (by rank/tier) can open a Market Scanner agent session that returns
**ranked market signals** under a snapshotted guardrail; every completion is
metered and audited; signals never place orders or move money. Missing market
data or model upstream produces a **typed refuse**, not invent numbers.

## Path on tip

| Area              | Location                                                               |
| ----------------- | ---------------------------------------------------------------------- |
| Runtime (done)    | `services/svc-agents/` — sessions, guardrails, metering, audit         |
| Task route (done) | `scanner.rank` in `src/gateway/routing.ts` (model alias + price table) |
| Product agent     | **Not registered** — README: Scanner is separate work on the runtime   |
| Market data       | Trade/public book contracts — no CCXT; no invented mid                 |
| UI                | No dedicated Scanner product surface claimed under this id             |

Gateway useful-path is completion-only; product fleet registration is residual.

## Blocked by

| Blocker         | Notes                                                                 |
| --------------- | --------------------------------------------------------------------- |
| Product law     | What a “signal” is, tier gating, liability copy — Denon direction     |
| Data honesty    | Must bind tools to live books/marks or refuse — no synthetic rankings |
| Provider config | Live inference = Class X upstream secrets                             |
| Soft block      | Rank tier product (`identity.rank`) for gating may need clear matrix  |

Not money invention if tools are read-only. Do not auto-trade from Scanner.

## First PR size (if free)

**S:** register `agentId=scanner` + guardrail (tools: `markets.list`,
`book.snapshot` read-only), `scanner.rank` completion path with fixtures,
tests that (1) refuse when book null, (2) never call place-order tools,
(3) meter via existing `feeCharge`. UI later. No new ledger recipes.
