# TRK-ops.admin

**Title:** apps/admin — listings, fee params, treasury, kill-switches  
**Tracker:** `ops.admin` · phase 5 · plane F · status `ready` · owner none  
**Depends on:** `infra.ui-tokens` (done)

## DoD (plain language)

An operator can open `apps/admin`, see **live** kill-switch and ledger-freeze
state from the edge control plane, flip modules / freeze with real effect on
production traffic, and never see a pretend toggle that only changes React
state. Fee params, listings, and treasury screens either call real endpoints or
clearly refuse as “not wired.” Console sits behind operator auth (SSO or BFF
shared secret), not open network ACL alone. Reconcile does not invent balances.

## Path on tip

| Area | Location |
| --- | --- |
| Console app | `apps/admin/` |
| Kill / freeze BFF | `apps/admin/src/app/api/`, `src/lib/control-plane-*.ts` |
| Edge control plane | `services/svc-edge` — `/admin/kill-switches`, `/admin/ledger/*` |
| Runbook | `docs/OPS-KILL-SWITCH-RUNBOOK.md` |
| Flags | `packages/config` flag registry (§13 staged flags) |

**Tip residual (honest):** module kill-switches and ledger freeze **are wired**
when `EDGE_URL` + operator tokens set. Per-flag rows still **session-staged**.
Ledger **reconcile** still stubbed in `operator-commands.ts`. No SSO; optional
`ADMIN_BFF_SHARED_SECRET`. Multi-edge shared kill state is §13. Tracker note
that said “zero tests / pure useState” is **stale** vs tip — re-derive before
claiming work.

## Blocked by

| Blocker | Notes |
| --- | --- |
| Deploy / secrets | Operator tokens, EDGE_URL, BFF secret — Class X ops, not craft |
| SSO | Product/ops decision for production exposure |
| Flag store (§13) | Durable remote flags not fully productized |
| Free residual | Reconcile wire + freeze UI page using live BFF only |

Not blocked by Shehzad money spine for kill-switch residual. Do **not** invent
treasury money flows.

## First PR size (if free)

**S — one console residual slice:** wire Ledger page freeze/unfreeze exclusively
through `/api/ledger-freeze` (drop stub path for that action) + tests that
forbid silent local-only success when edge is configured. No listings/fees yet.
No `features.mjs` flip to `done` until SSO story or explicit §13 “ACL-only ops
console” acceptance.
