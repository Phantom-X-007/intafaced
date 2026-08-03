# TRK-agents.navigator

**Title:** Navigator — tool-calling inside user guardrails  
**Tracker:** `agents.navigator` · phase 5 · plane F · status `ready` · owner none  
**Depends on:** `agents.gateway` (done)  
**Tip freeze:** `origin/main` @ `b3d08931` (re-derive before implement)

## DoD (plain language)

User opens a **Navigator** session; the agent can call **allowed tools** across
module APIs only inside a **snapshotted guardrail**; every think/act/refuse is
in `agent_actions` and the user-visible log; spend meters via existing
`feeCharge`. Write tools that move value require user approval per Agentic Law.
No silent trades, no balance invention, no vendor names in user copy.

## Path on tip

| Area           | Location                                                               |
| -------------- | ---------------------------------------------------------------------- |
| Runtime (done) | `services/svc-agents/` — gateway, runtime, metering, audit, guardrails |
| Register API   | `runtime.registerAgent` / `agent_definitions` table                    |
| Product agents | **Not seeded** — README: register guardrails + drive open→think→act    |
| Doctrine §8.2  | v1 fleet: Navigator = tool-calling over module APIs in user guardrails |
| Tools residual | Tool drivers (HTTP/tRPC to trade/identity/etc.) **not productized**    |

**Tip residual:** product registration + tool adapters + UX. Runtime is ready.

## Blocked by

| Blocker         | Notes                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------ |
| Product law     | Exact tool allowlist (quote-only vs order?) — Denon/Nitro                                  |
| Provider config | Live inference needs `AGENTS_UPSTREAM_*` (Class X secrets)                                 |
| Soft            | Shell chat UI; API-only first is valid                                                     |
| Money           | Use existing metering only; any trade write = user approval + Class M tests if real orders |

Agents gateway is done; this is **fleet product**, not runtime rebuild.

## First PR size (if free)

**S:** seed `agentId: navigator` guardrail (read-heavy tools: portfolio summary,
market list, curriculum read; **no** withdraw/bank write), session open → think
(mock provider) → refuse disallowed tool tests, `agent.get` returns guardrail.
**M later:** real tool drivers + approval UX for write tools. Prefer zero
value-moving tools in first PR.
