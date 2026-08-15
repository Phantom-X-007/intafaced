# Incident runbook — money path (ledger / trade red)

**Tracker:** D26-P3-10 · **Class:** Ops (not Class X)  
**Law:** Doctrine §0.6 (one book) · §4.2 (unverifiable book → freeze posting) · §14.6 (every route killable, fail-closed, never trap funds)  
**Sibling (do not confuse):** D26-P3-02 is the threat model. This file is **who does what when the book or trade door is red**.  
**Leverage (Phase A IN):** existing operator surfaces — [`OPS-KILL-SWITCH-RUNBOOK.md`](OPS-KILL-SWITCH-RUNBOOK.md), ledger freeze on svc-edge, compose `/health` vs `/ready`, Grafana edge SLO panel.

No secret values belong in this document. Name env vars and routes only.

---

## 0 · Thirty-second version

1. **Detect** — `/ready` on ledger and trade, `GET /admin/status` on edge, fatal ledger logs. Compose “healthy” is **not** enough.
2. **Contain** — kill the **module** (`trade` / `pay` / …) to stop new risk; **freeze ledger posting** if the book is unverifiable. Prefer the existing switches over a deploy.
3. **Page** — Denon for money-path technical contain; Nitro **Class X** for prod keys / wallet-RPC / go-live; **do not touch Shehzad** chain/protocol during a Fiat-plane incident.
4. **Do not** invent balances, patch the vendored Java book in prod, unfreeze without a reconcile that is `ok`, or rotate production secrets as an agent.

---

## 1 · Detect

Money-path red means **new posting or new risk is unfit**, not “a container restarted once.”

### 1.1 · Probes that actually answer the question

Compose healthchecks hit **`/health`**, never `/ready`, so a frozen ledger still looks “healthy” to `docker compose ps`. That is deliberate (kill/freeze must not become a boot deadlock). Operators must probe `/ready` themselves.

| Surface                                 | What “red” looks like                                                                    | How to read it                                                                                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **svc-ledger `GET /ready`**             | **503** `{ ready: false, reason }`                                                       | Posting is frozen (`status.frozenReason`). The process can still be `/health` ok. Internal port **4001** (compose network only — not published on the host). |
| **svc-ledger `GET /health`**            | Process up + `ledger.status()`                                                           | Alive ≠ posting enabled.                                                                                                                                     |
| **svc-trade `GET /ready`**              | **503** `trade.spot flag is off` **or** engine sequence **regressions** vs settled fills | Spot flag off, or matching journal behind Postgres `trade.fills` (idempotency key risk). Internal port **4004**.                                             |
| **svc-edge `GET /ready`**               | Usually **200** even when modules are killed                                             | Kill state is **absent** here on purpose (`/ready` is unauthenticated). Do **not** infer halt from this body. Host **:4000**.                                |
| **svc-edge `GET /admin/status`**        | Kill list, freeze reachability, control-plane summary                                    | **The operator probe.** Bearer `admin:write` + MFA. See kill-switch runbook.                                                                                 |
| **svc-edge `GET /admin/kill-switches`** | Module disabled flags + audit                                                            | Same credential.                                                                                                                                             |
| **svc-edge `GET /admin/ledger/freeze`** | Freeze state                                                                             | Bearer `admin:treasury` (+ MFA). Needs `LEDGER_URL` on edge; unset → **503** `edge.ledger_unreachable` (never a fake success).                               |

Break-glass curl shapes (tokens from the deployment env, never pasted into chat or this file): [`OPS-KILL-SWITCH-RUNBOOK.md`](OPS-KILL-SWITCH-RUNBOOK.md).

### 1.2 · Dashboards and logs

| Place                                                                        | What to look for                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Grafana** (local compose host **:3001**, provisioned `edge-slo` dashboard) | Edge request SLO / error rate at the **front door**. Prometheus scrapes `svc-edge:4000/metrics` (`tooling/infra/prometheus.yaml`). This is **local-compose observability**, not a production pager (D26-P3-08 residual). |
| **Prometheus** (compose **:9090**)                                           | Same edge series. Do not treat NATS/`go_*` scrapes as a money-book proof.                                                                                                                                                |
| **svc-ledger logs**                                                          | `LEDGER RECONCILIATION FAILED — posting frozen, operator paged` at **fatal** — reconcile cron already froze posting. Treat as contain already in progress; do not “unfreeze to see if it recovers.”                      |
| **svc-trade logs**                                                           | Sequence-guard regressions on `/ready` (`engine-ledger` / fill sequence).                                                                                                                                                |
| **`pnpm platform:logs`**                                                     | Fleet follow; filter ledger/trade/edge.                                                                                                                                                                                  |
| **`apps/admin` Kill-switches page**                                          | Control-plane panel must show **reachable**. Unconfigured / unreachable → fix env; a local staged flip is not live.                                                                                                      |

### 1.3 · Symptom → first probe

| You see                                                 | First check                                                                      |
| ------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Users cannot place; cancels still work                  | Kill-switch (expected). Confirm `/admin/status`.                                 |
| Balances unreadable **and** posts failing               | Ledger process / DB — `/health` then `/ready`.                                   |
| Place succeeds then settle refuses / duplicate fill ids | Trade `/ready` sequence regressions — **contain trade**, do not invent fill ids. |
| Edge 503 `edge.module_killed`                           | Already contained at the door.                                                   |
| Edge 503 `edge.kill_switch_undecidable`                 | Fail-closed: treat as killed until the check works again.                        |
| Java / wallet-rpc / vendor console looking “wrong”      | **Stop.** Fiat TypeScript book is the SoT. See §4. Do not “fix” Java balances.   |

---

## 2 · Contain

Two different authorities. Mixing them is how funds get trapped or the book gets worse.

| Control                   | Authority              | Stops                                                                | Does **not** stop                                                            |
| ------------------------- | ---------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Module kill-switch**    | `admin:write` + MFA    | **New commitments** on that module (place, deposit, …) → 503         | Cancels, documented release REST, **reads**, `/admin/*`, `/health`, `/ready` |
| **Ledger posting freeze** | `admin:treasury` + MFA | **All value movement** through `packages/ledger-client` / svc-ledger | Process liveness; reads that do not post                                     |

**Rule:** halt **one market / one module** with a kill. Freeze the **book** only when posting is unverifiable (§4.2) or reconcile already failed.

### Contain steps (do these)

1. **Snapshot facts** — time, `/admin/status`, ledger `/ready` body, last fatal ledger log line. Do not edit balances “to match.”
2. **Stop new risk** — kill `trade` (and `pay` if rails are moving) via `apps/admin` or `POST /admin/kill-switches`. Reason ≥ 12 characters. Confirm audit line.
3. **If the book is unverifiable** — `POST /admin/ledger/freeze` with a human reason. Confirm `GET /admin/ledger/freeze`. If edge has no `LEDGER_URL`, you do **not** have freeze — fail closed, do not invent a SQL freeze.
4. **Leave the exit doors open** — do not take edge out of the load balancer because a module is killed; that removes cancels and the un-kill surface.
5. **Do not deploy, restart-all, or bounce ledger replicas to “clear” freeze** — freeze at boot (`LEDGER_POSTING_ENABLED=false`) can freeze and **cannot thaw** from that flag; thaw is the operator unfreeze path. Multi-replica kill state is still per-host unless `EDGE_KILL_STATE_PATH` is understood (§13 in the kill-switch runbook).
6. **Vendored Java / wallet_rpc** — leave it. Edge kills `/api/*` TypeScript modules; a foreign book needs its **own** halt and is **not** a second SoT. No production Java “balance repair.”
7. **Shehzad Protocol / INTACHAIN** — do not open chain PRs, do not “pause the chain” from this runbook, do not mix protocol keys into Fiat contain.

Exact curl: [`OPS-KILL-SWITCH-RUNBOOK.md`](OPS-KILL-SWITCH-RUNBOOK.md) (module kill + ledger freeze/unfreeze).

---

## 3 · Who pages

| Who                                               | Page them when                                                                                                                        | They do **not**                                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Denon** (technical owner of money-path quality) | Ledger `/ready` 503, reconcile fatal, trade sequence red, freeze/kill decision, dual-book suspicion                                   | Rotate prod secrets; counsel/sanctions content                                                              |
| **Nitro Class X** (human)                         | Production keys, wallet-RPC disclosed-secret rotation, go-live “is customer money on this host?”, sanctions **list content**, licence | Operate kill/freeze (agents/Denon can, with tokens already in the **deployment** — not by inventing tokens) |
| **Shehzad**                                       | **Do not page for Fiat ledger/trade red.** Protocol Plane + INTACHAIN only                                                            | Fiat contain, Java dual-book “fix”, ledger recipes                                                          |
| **Agents**                                        | Execute this runbook in a worktree / against staging; **never** Class X                                                               | Invent balances; generate replacement hot-wallet keys; merge Class X as done                                |

Owner action lists (human, no values in-repo):

- [`OWNER-ACTIONS-WALLET-RPC-SECRETS.md`](OWNER-ACTIONS-WALLET-RPC-SECRETS.md) — rotation / sweep if a wallet secret was ever in git; **incident if a disclosed withdraw address still holds value**
- [`OWNER-ACTIONS-NOTIFY-GATEWAYS.md`](OWNER-ACTIONS-NOTIFY-GATEWAYS.md) — notify channels (margin-call reachability is Class X config, not a ledger patch)
- [`OWNER-OPS-CHECKLIST-2026-07-31.md`](OWNER-OPS-CHECKLIST-2026-07-31.md) — human vs agent split
- [`SECURITY-WHEN-PLAIN.md`](SECURITY-WHEN-PLAIN.md) — no production attack-style testing during an incident

---

## 4 · What not to do

- **Invent or “correct” balances** in SQL, Java tables, or a service-local cache. The only book is `svc-ledger` via `packages/ledger-client` recipes.
- **Patch vendored Java dual-book in production** to make numbers match. Dual-book doors are a **scan + refuse** problem (`pnpm scan:dual-book-door`), not a live UPDATE. D26-P2-07/P2-02 maps are inventory — not a repair playbook.
- **Unfreeze** because “users are waiting.” Unfreeze only after reconcile reports `ok` and Denon (or the treasury operator) says the book is verifiable.
- **Kill `ledger` / `matching` / `ws` on the edge board and assume traffic stopped.** Those rows are **audit-only** until a real control path exists (“Not edge-enforced”).
- **Restart the fleet to clear a kill** unless you know kill durability (`EDGE_KILL_STATE_PATH`) on **every** replica.
- **Rotate or generate production secrets** in chat, PRs, or `.env` committed to git. Class X: [`SECRET-ROTATION-READINESS-2026-08-03.md`](SECRET-ROTATION-READINESS-2026-08-03.md).
- **Touch Shehzad chain mountains** (protocol, bridge, dex self-custody, INTACHAIN) “because money is red.”
- **Open Vue / `apps/web` / shell craft** to hide the outage. Honesty > a green spinner.
- **Call local Grafana “production alerting.”** P3-08 (alerts + one real dashboard beyond compose) is a different mountain.

---

## 5 · After contain (not “done”)

1. Keep kills in place while investigating.
2. Reconcile via the **existing** operator path (`POST /admin/ledger/…` / ledger `operator/reconcile`) — console reconcile is still a **stub** in places; do not fake a green report. See kill-switch runbook §13.
3. Un-kill modules before unfreeze only if posting is already frozen and you need reads/cancels without new posts — default: **unfreeze last**, after the book verifies.
4. Write the incident note: what `/ready` said, which switch flipped, who authorized freeze. No secret material.
5. Class X leftovers (key rotation, disclosed wallet sweep) stay on the OWNER-ACTIONS lists — they are **not** closed by this runbook existing.

---

## 6 · Pointers (do not fork a second procedure)

| Need                                              | File                                                                                                                                                        |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How to flip kills / freeze (curl + admin console) | [`OPS-KILL-SWITCH-RUNBOOK.md`](OPS-KILL-SWITCH-RUNBOOK.md)                                                                                                  |
| When security work is everyday vs later campaign  | [`SECURITY-WHEN-PLAIN.md`](SECURITY-WHEN-PLAIN.md)                                                                                                          |
| Wallet-RPC / disclosed-secret **human** actions   | [`OWNER-ACTIONS-WALLET-RPC-SECRETS.md`](OWNER-ACTIONS-WALLET-RPC-SECRETS.md)                                                                                |
| Notify gateway strings (human)                    | [`OWNER-ACTIONS-NOTIFY-GATEWAYS.md`](OWNER-ACTIONS-NOTIFY-GATEWAYS.md)                                                                                      |
| Secret rotation blast radius (no values)          | [`SECRET-ROTATION-READINESS-2026-08-03.md`](SECRET-ROTATION-READINESS-2026-08-03.md)                                                                        |
| Who directs vs executes vs Class X                | [`NITRO-OWNERSHIP-AND-DENON-DIRECTION-2026-07-31.md`](NITRO-OWNERSHIP-AND-DENON-DIRECTION-2026-07-31.md)                                                    |
| Shehzad chain — babysit only                      | [`GITHUB-OWNERSHIP-SHEHZAD.md`](GITHUB-OWNERSHIP-SHEHZAD.md) · [`SHEHZAD-BLOCKCHAIN-TASK-BOARD-2026-08-03.md`](SHEHZAD-BLOCKCHAIN-TASK-BOARD-2026-08-03.md) |
| Session claim for this mountain                   | [`LIVE-LANES.md`](LIVE-LANES.md) lane `denon-d26-p3-10-incident`                                                                                            |

---

## 7 · Honest residuals (not hidden)

- Multi-replica shared kill store — §13 socket; file/memory per host today.
- Operator SSO on `apps/admin` — deployment tokens; do not expose admin without network ACL.
- Production alert routing / pager — D26-P3-08, not this file.
- Console ledger reconcile live path — stub until swapped.
- This runbook does **not** certify go-live or customer-money readiness.
