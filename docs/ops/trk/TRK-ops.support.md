# TRK-ops.support — research / spec pack

**Tracker id:** `ops.support`  
**Title:** Support desk, tickets, KB  
**Module / phase:** `core-ops` · phase 5  
**Status on tip:** `ready` · **owner:** none  
**Depends on:** `identity.accounts`  
**Tip freeze:** `origin/main` @ `c6d9e89e` (re-derive before implement)  
**Pack type:** research only — no implement swarm; no money invention; no dual-edit of Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

1. A user can **open a support ticket** (authenticated) with category + body.
2. An operator can **list, assign, comment, resolve** without holding or moving balances.
3. Both can search a **KB of our articles** (i18n-keyed; no third-party product names in user copy).
4. Account-state for support is **read-only** identity/ledger projections — never a second balance store.
5. Refunds/chargebacks are **requests** only; money only via existing pay/ledger recipes elsewhere.
6. Human desk works without `agents.support` (agent optional later).

## 2 · Current code state (tip `c6d9e89e`)

| Area                   | Reality                                                                      |
| ---------------------- | ---------------------------------------------------------------------------- |
| `services/svc-support` | **Missing**                                                                  |
| UI desk routes         | Not in `apps/web` / `apps/admin` as a ticket product                         |
| `svc-agents`           | Tasks `support.reply` / `support.classify` are **routing names**, not a desk |
| `packages/i18n`        | Product copy; no support-KB catalog yet                                      |

Order-ticket UI strings ≠ support tickets.

## 3 · Doctrine constraints

| Law              | Implication                                              |
| ---------------- | -------------------------------------------------------- |
| §0.6             | No ledger posts from support; no balances on ticket rows |
| Fabricated money | Never invent refunds                                     |
| Brand scan       | KB/agent copy vendor-clean                               |
| Class X          | PII visibility rules for staff                           |
| One service / PR | Contracts first when cross-service                       |

## 4 · DoD sketch (staged)

### Stage 1 — ticket spine

- [ ] Contracts (+ events if needed): create/list/comment/status + empty KB list
- [ ] New `svc-support` (default) + schema + auth tests
- [ ] No UI required to merge Stage 1

### Stage 2 — operator queue

- [ ] Admin/staff list+detail; read-only account panel via contracts
- [ ] KB home decision (repo md / CMS); first articles keyed

### Stage 3 — optional agent

- [ ] `agents.support` only after KB + account reads exist

**Tracker `done`:** Stages 1–2 live in a real env. Agent not mandatory unless product says so.

## 5 · Open questions

1. SLA / ticket model product law.
2. KB storage.
3. PII redaction.
4. Refund-request owner (pay vs support vs admin).

## 6 · Estimated size

| Slice                       | Size             |
| --------------------------- | ---------------- |
| Contracts + service + tests | **M** (first PR) |
| Admin queue                 | **M**            |
| User UI                     | **S–M**          |
| Agent assist                | **M**            |

## 7 · Related

- `docs/ops/trk/ops.support.md` (short stub)
- `services/svc-agents/src/gateway/routing.ts`
- `docs/ops/trk/TRK-ops.admin.md`

## 8 · Non-goals

- No refund recipes under this id.
- No Shehzad implement.
- No `features.mjs` edit.
- No dual-edit Denon open PRs.
