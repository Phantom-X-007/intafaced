# TRK-ops.admin

**Title:** apps/admin — listings, fee params, treasury, kill-switches  
**Tracker:** `ops.admin` · phase 5 · plane F · status `ready` · owner none  
**Depends on:** `infra.ui-tokens` (done) · **requires:** `apps/admin`  
**Tip freeze:** `origin/main` @ `c773dafa` (re-derive before implement)  
**Pack type:** research only — no invent treasury money; no `features.mjs` edit.

## DoD (plain language)

An operator can open `apps/admin`, see **live** kill-switch and ledger-freeze
state from the edge control plane, flip modules / freeze with real effect on
production traffic, and never see a pretend toggle that only changes React
state. Fee params, listings, and treasury screens either call real endpoints or
clearly refuse as “not wired.” Console sits behind operator auth (SSO or BFF
shared secret), not open network ACL alone. Reconcile does not invent balances.

## Path on tip

| Area               | Location                                                          |
| ------------------ | ----------------------------------------------------------------- |
| Console app        | `apps/admin/` (Next, port **3100**)                               |
| Routes             | `/` kill-switches · `/launch` · `/jurisdiction` · `/ledger`       |
| Kill / freeze BFF  | `apps/admin/src/app/api/` · `src/lib/control-plane-*.ts`          |
| Edge control plane | `services/svc-edge` — `/admin/kill-switches`, `/admin/ledger/*`   |
| Runbook            | `docs/OPS-KILL-SWITCH-RUNBOOK.md`                                 |
| Inventory          | `docs/ADMIN-0-INVENTORY-VENDOR-VS-APPS-2026-08-02.md`             |
| Tests (tip)        | `console-status*.test`, `control-plane-client.test`, banner tests |

**Tip residual (honest):** module kill-switches and ledger freeze **are wired**
when `EDGE_URL` + operator tokens set. Tracker note (“ZERO tests / pure
useState”) is **stale** vs tip — re-derive before claiming work. Per-flag rows
still **session-staged**. Ledger **reconcile** still stubbed/simulated in
operator commands. No SSO; optional `ADMIN_BFF_SHARED_SECRET`. Listings / fee
edit / full treasury UI not in monorepo console (vendored admin is separate).

## Blocked by

| Blocker          | Notes                                                          |
| ---------------- | -------------------------------------------------------------- |
| Deploy / secrets | Operator tokens, EDGE_URL, BFF secret — Class X ops, not craft |
| SSO              | Product/ops decision for production exposure                   |
| Flag store (§13) | Durable remote flags not fully productized                     |
| Free residual    | Reconcile wire + freeze UI honesty polish                      |
| Product law      | Vendor admin port order / fee-edit SoT — Denon direction       |

Not blocked by Shehzad for kill-switch residual. Do **not** invent treasury
money flows or port FeeManage without SoT + Class M if money.

## First PR size (if free)

**S — one console residual slice:** edge reconcile proxy **or** admin residual
that cannot invent money (freeze already live; ban any path that reintroduces
fake freeze). Prefer **one service per PR** if edge route missing first. No
listings/fees yet. No `features.mjs` flip to `done` until SSO story or explicit
§13 “ACL-only ops console” acceptance for Stage 1.
