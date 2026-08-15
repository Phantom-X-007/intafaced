# CORS production posture — staging/prod origin contract

**Board:** D26-P3-07 (Class: Deploy).  
**Done bar:** staging/prod origin contract documented. This is a **deploy decision**, not a wildcard “fix.”  
**Law (code):** `services/svc-edge/src/cors.ts` — Phase A IN. Do not rebuild; do not mass-edit Java CORS in this mountain.  
**Sibling (do not dual-edit):** svc-edge code (`cors.ts` and the rest of that service) is a separate lane. This file names what operators must set.

_Board-Delta: D26-P3-07 — documented APP_ENV origin contract; credentials+wildcard forbidden on staging/prod edge; Java wildcard-with-credentials residual named, not mass-edited._

---

## 0 · What this is

The product front door for browser REST is **svc-edge**. CORS there is already an allowlist, never `*`, and never credentialed. Staging and prod do **not** get a convenient default origin. The remaining work is to **name the real origins at deploy time**.

This document does not invent a production hostname. There is none in-tree to guess (`OWNER-DECISIONS-OPEN.md` §4 already closed that: no invented production domain list in code).

---

## 1 · Env contract (operators)

Two different variables. Mixing them is a misconfig, not a merge.

| Surface                         | Variable                | Credentials | Wildcard `*`                         | Unset on `APP_ENV=staging` or `prod`                                      |
| ------------------------------- | ----------------------- | ----------- | ------------------------------------ | ------------------------------------------------------------------------- |
| **svc-edge** (browser REST)     | `EDGE_ALLOWED_ORIGINS`  | **never**   | **boot failure**                     | **closed door** (process still boots; no browser origin is echoed)        |
| **Vendored Java HTTP** (shell)  | `CORS_ALLOWED_ORIGINS`  | **true**    | **silently skipped** (fail closed)   | Falls back to **localhost defaults**, not a closed door                   |

Shape for both lists: comma-separated **exact** origins — `scheme://host[:port]`, no path, no trailing slash, no `null`, no userinfo.

### Per `APP_ENV` (edge — the production door)

| `APP_ENV`        | Allowed origins                                                                                         | What happens if you leave `EDGE_ALLOWED_ORIGINS` empty                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `dev` / `test`   | Dev default only: `http://localhost:3100`, `http://127.0.0.1:3100` (`CORS_ENFORCED_ENVS` does not apply) | Frictionless local console. **Do not re-add `:3000`** — that port belonged to deleted `apps/web`.                      |
| **`staging`**    | **Only** what you set in `EDGE_ALLOWED_ORIGINS`                                                         | Closed door. `/ready` and boot log say so. Same-origin `:8090` shell and non-browser clients are unaffected.           |
| **`prod`**       | **Only** what you set in `EDGE_ALLOWED_ORIGINS`                                                         | Same closed door. A public browser SPA that is not same-origin with the edge **will look down** until this is set.     |

`CORS_ENFORCED_ENVS` in `cors.ts` is exactly `staging` and `prod`. That is the production-like pair on purpose: staging is where a forgotten localhost grant would otherwise get normalised.

### Forbidden pair (staging/prod edge)

- Do **not** put `*` in `EDGE_ALLOWED_ORIGINS`. The process refuses to start.
- Do **not** emit `Access-Control-Allow-Credentials` on the edge. The module never does. A credentialed response plus a wildcard is the CORS spec’s forbidden pair; we make **neither**.
- Do **not** list `:8090` “just in case.” The vendored product shell is same-origin through nginx; listing it would grant a **cross-origin** capability the shell does not use.
- `/admin/*` is **not** a CORS surface. Do not add operator-console origins to make the control plane browser-reachable.

When (if) the §13 refresh-token httpOnly cookie lands, this decision is **re-taken in `cors.ts`**, not inherited by accident. That re-take is not this mountain.

### Deploy checklist (the decision)

1. Choose the **real HTTPS origins** of the hosted product UI that will call the edge **cross-origin** (if any). The `:8090` shell behind nginx typically needs **none**.
2. Set `APP_ENV=staging` or `prod` on the edge process.
3. Set `EDGE_ALLOWED_ORIGINS` to those exact origins, or leave it empty **on purpose** if no browser is supposed to call the edge cross-origin (closed door).
4. Confirm boot log / `/ready` `summary` matches the list you meant. A mis-typed origin is a **boot failure**, not a silent skip.
5. If the Java shell is also hosted and browsers talk to Java HTTP **directly** (not via nginx same-origin), set `CORS_ALLOWED_ORIGINS` to the same class of exact HTTPS origins. Do not copy `*` from upstream muscle memory.

---

## 2 · What the edge already enforces (facts from `cors.ts`)

Read, not restated as a new design:

- Echo the caller’s origin when it is on the allowlist. Never `*`.
- Never `Access-Control-Allow-Credentials`.
- `OPTIONS` terminated at the edge, never proxied; answer depends on `Origin` alone (not a route oracle).
- Methods advertised to browsers: `GET, POST, OPTIONS` only. Browser order cancel is tRPC POST; DELETE cancel is for non-browser clients that send no `Origin`.
- Surface: `/api`, `/api/*`, `/health`, `/ready`. Not `/admin/*`.
- `Vary: Origin` on every CORS-surface answer so a shared cache cannot turn an allowlist into a wildcard.

MEGA-AUDIT (`docs/MEGA-AUDIT-2026-08-07-FINDINGS.md`) noted CORS DELETE vs kill-switch cancel paths: that is **browser preflight vs bot DELETE**, already documented in `cors.ts`. Not a reason to wildcard.

---

## 3 · Java residual (named; not mass-edited here)

Historical STATUS (`docs/STATUS-2026-07-29-EVENING.md`): **wildcard-with-credentials in all seven Java web modules** — under Spring 4.3, `*` plus credentials **reflects the request Origin**, so any site can drive a logged-in session. That is why it was not guessed-fixed with a fake production domain list.

**HTTP path since `CorsAllowlist`:** the seven modules call `CorsAllowlist.apply` (admin, chat, exchange, exchange-api, market, otc-api, ucenter-api). HTTP `addAllowedOrigin("*")` is gone. Bare `*` in `CORS_ALLOWED_ORIGINS` is skipped. **`setAllowCredentials(true)` remains** because the shell still uses a session cookie. Empty env still falls back to **localhost ports**, including `:3000` / `:5173` / `:8080` / `:8090` — **not** the edge’s staging/prod closed door.

**Still live wildcard (the residual this mountain names, does not patch):**

| Where                                                                                          | What it does                                      | Why it is the leftover “wildcard + session” hole |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------ |
| `vendor/.../chat/.../WebSocketConfig.java` — `/chat-webSocket` `.setAllowedOrigins("*")`       | SockJS/STOMP accepts any Origin                   | MEGA-AUDIT: `vendor-shell-scan` only matches `addAllowedOrigin("*")`, so this prints clean |
| `vendor/.../market/.../WebSocketConfig.java` — `/market-ws` `.setAllowedOrigins("*")`          | Same                                              | Same scan miss                                   |

Do **not** mass-edit those Java files on this PR. Origin list for SockJS is a deploy + product-UI decision (same class as `CORS_ALLOWED_ORIGINS`), and it collides with whoever owns Java/CORS code next. HTTP credentials-true + localhost fallback on hosted Java is the second residual: **set `CORS_ALLOWED_ORIGINS` at deploy** if Java HTTP is browser-reachable; do not treat unset as “production closed.”

**Not the same residual:** `services/svc-ws` snapshot GET uses `Access-Control-Allow-Origin: *` **without** credentials, on an unauthenticated public book. That is an honest public read, not the Java session hole.

---

## 4 · Pointers (siblings stay in their files)

| Topic                         | File                                                                 |
| ----------------------------- | -------------------------------------------------------------------- |
| Staging deploy workflow threats | [`THREAT-MODEL-STAGING-DEPLOY.md`](THREAT-MODEL-STAGING-DEPLOY.md) (D26-P3-01/02 slice) |
| Closed CORS domain decision   | [`OWNER-DECISIONS-OPEN.md`](OWNER-DECISIONS-OPEN.md) §4               |
| Edge operator notes           | `services/svc-edge/README.md` (Browser origins)                      |
| Env comments                  | `.env.example` (`EDGE_ALLOWED_ORIGINS` vs `CORS_ALLOWED_ORIGINS`)    |

---

## 5 · What “done” is for D26-P3-07

- Operators have a contract: **which env, which variable, closed vs default, forbidden pair.**
- Production hostnames are **still a deploy input**, not a code constant.
- Java wildcard-with-credentials is **named** (HTTP allowlist+credentials leftover; WS `*` leftover). Fixing it is a later, scoped Java change — not this doc mountain.
