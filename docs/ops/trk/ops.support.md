# TRK-ops.support

**Title:** Support desk, tickets, KB  
**Tracker:** `ops.support` · module `core-ops` · phase 5 · status `ready` · owner none  
**Depends on:** `identity.accounts`  
**Tip freeze:** `origin/main` @ `04f9b1f2` (re-derive before implement)  
**Pack type:** thorough research upgrade (`docs/trk-research-pack-drain`) — no implement swarm; no money invention; no dual-edit Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

1. A user can **open a support ticket** (authenticated) with category + body.
2. An operator can **list, assign, comment, resolve** without holding or moving balances.
3. Both can search a **KB of our articles** (i18n-keyed; no third-party product names in user copy).
4. Account-state for support is **read-only** identity/ledger projections — never a second balance store.
5. Refunds/chargebacks are **requests** only; money only via existing pay/ledger recipes elsewhere.
6. Human desk works **without** `agents.support` (agent optional later).

## 2 · Current code state (tip `04f9b1f2`)

| Area                   | Reality                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `services/svc-support` | **Does not exist**                                                                   |
| UI desk routes         | No support-ticket product in `apps/web` / `apps/admin`                               |
| `svc-agents`           | Tasks `support.reply` / `support.classify` are **routing names**, not a desk product |
| `packages/i18n`        | Product copy keys; no support-KB catalog yet                                         |
| Doctrine home          | core-ops phase 5 / plane F                                                           |

Incidental “ticket” strings in trading UI mean **order tickets**, not support tickets.

## 3 · Doctrine constraints

| Law                 | Implication                                                        |
| ------------------- | ------------------------------------------------------------------ |
| §0.6                | Support never posts ledger entries; no balances on ticket rows     |
| Fabricated money    | Never invent refund amounts into ledger                            |
| Brand / vendor scan | KB + agent copy: no partner/model vendor names in user-facing text |
| PII / Class X       | What support may see needs ops law                                 |
| One service per PR  | Contracts/events first if cross-service                            |

## 4 · DoD sketch (checkable — staged)

### Stage 1 — ticket spine (no money)

- [ ] `packages/contracts` (+ events if needed): ticket create/list/comment/status + empty KB list
- [ ] Thin `svc-support` (default new service if lifecycle is rich) + schema + auth tests
- [ ] No UI required for Stage 1 merge

### Stage 2 — operator queue

- [ ] Operator list/detail in `apps/admin` (or staff surface after Admin-0 SoT)
- [ ] Read-only account panel via identity/ledger **read** contracts only
- [ ] KB storage decision recorded; first N articles i18n-keyed

### Stage 3 — optional agent

- [ ] Wire `agents.support` only after KB + account read models exist

### Tracker `done` bar

Flip only when the title’s product promise is true in a real env — not when a stub route or empty skeleton merges.

## 5 · Open questions

1. Ticket model + SLA (Denon/Nitro product law).
2. KB storage: repo markdown vs CMS vs blueprint-adjacent.
3. PII redaction rules for support.
4. Refund **request** workflow owner: pay vs support vs admin.

## 6 · Estimated size

| Slice                           | Size                       |
| ------------------------------- | -------------------------- |
| Contracts + svc-support + tests | **M** (first implement PR) |
| Admin operator queue            | **M**                      |
| User ticket UI                  | **S–M**                    |
| Agent assist                    | **M**                      |

## 7 · Related docs / code

- `services/svc-agents/src/gateway/routing.ts` (`support.*` tasks)
- `packages/auth` scopes pattern for future `support:*`
- `docs/ops/trk/TRK-ops.admin.md` (operator surface SoT)

## 8 · Explicit non-goals for this pack

- No inventing refund ledger recipes under this id.
- No Shehzad money-lane implement.
- No tracker ownership flip from research.
- No dual-edit of open Denon PRs.
