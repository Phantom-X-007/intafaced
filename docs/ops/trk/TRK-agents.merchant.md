# TRK-agents.merchant — research / spec pack

**Tracker id:** `agents.merchant`  
**Title:** Merchant agent — approval-rate watch  
**Module / phase:** `agents` · phase 5  
**Status on tip:** `ready` · **owner:** none  
**Depends on:** `agents.gateway` · `pay.routing`  
**Tip freeze:** `origin/main` @ `c6d9e89e` (re-derive before implement)  
**Pack type:** research only — no implement swarm; no money invention; no dual-edit of Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

1. Named agent product runs on **`svc-agents` gateway** with task id(s): `merchant.watch`.
2. Outputs are **grounded** (tools + allowlisted data), brand-safe (`copy.ts`), **guardrailed** (`fleet/guardrails.ts`).
3. No agent holds balances or posts ledger; side effects use existing APIs with user scopes.
4. Depends pay.routing — babysit Shehzad pay law; research only here.

## 2 · Current code state (tip `c6d9e89e`)

| Area      | Reality                                                                         |
| --------- | ------------------------------------------------------------------------------- |
| Service   | `services/svc-agents` — gateway, routing, providers, fleet guardrails, metering |
| Tasks     | `gateway/routing.ts` includes navigator / support / scanner / merchant tasks    |
| Depth     | Routing row ≠ full product for every tracker title                              |
| Brand     | `copy.ts` + `copy.test.ts` ban third-party names in user copy                   |
| Readiness | useful-path / readiness tests prove runnable mock paths                         |

## 3 · Doctrine constraints

| Law         | Implication                                       |
| ----------- | ------------------------------------------------- |
| §0.7 brand  | No vendor model names in user-facing agent copy   |
| §0.6        | Agents never `ledger.post`                        |
| Guardrails  | Refuse out-of-policy tool use                     |
| Pay/Shehzad | `agents.merchant` must not invent pay routing law |

## 4 · DoD sketch (staged)

### Stage 1

- [ ] Named task in routing + readiness
- [ ] Guardrail tests for this agent’s tools
- [ ] Copy keys only from catalogue

### Stage 2

- [ ] Real data tools with typed refusals
- [ ] Audit log of user-affecting actions
- [ ] Tier/gating per product law

**Tracker `done`:** Stage 2 for the **title**, not merely a routing entry.

## 5 · Open questions

1. v1 tool allowlist.
2. Human escalation path.
3. Metering / cost attribution.

## 6 · Estimated size

Task+mock tests **S–M**; full grounded product **M–L**.

## 7 · Related

- `services/svc-agents/src/gateway/routing.ts`
- `services/svc-agents/src/fleet/guardrails.ts`
- `services/svc-agents/src/copy.ts`

## 8 · Non-goals

- No inventing prices or pay approval rates.
- No Shehzad implement under merchant agent.
- No `features.mjs` flip from research.
