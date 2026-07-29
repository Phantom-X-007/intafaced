# Owner decisions — closed (2026-07-29)

Decisions taken to finish the Denon handover without inventing legal content.

## 1. Charting — Path A (closed)

**Decision:** Keep `docs/TERMINAL.md` — charts on **lightweight-charts** (Apache-2.0).

**Done in-tree:**

- Unlicensed Charting Library directory **removed** from the product shell
- Exchange chart mounts `lightweight-charts` against the same `/market/history` + STOMP feed
- Remote OSS chart loads were already cut (#104)

**Not done (history):** deleting the library from git history is a separate counsel/ops call if required for rediscovery risk.

## 2. Sanctions blocklist — counsel only (closed for engineering)

**Decision:** Engineers do **not** draft jurisdiction lists.

- Mechanism on main after #101: staging/prod refuse to boot without a configured list
- Contents: counsel supplies `INTAFACED_SANCTIONS_REGIONS` + `INTAFACED_SANCTIONS_LIST_SOURCE`
- Until counsel answers, **do not** deploy a public staging/prod posture with money paths live

This is finished as engineering; the deploy env remains an external gate.

## 3. MySQL JDBC driver — MariaDB Connector/J (closed)

**Decision:** Swap GPL `mysql-connector-java:8.0.11` → **MariaDB Connector/J 2.7.12** (LGPL-2.1, Java 8 compatible).

- All framework POMs + `driver-class-name` / `JDBCUtils` updated
- JDBC URLs stay `jdbc:mysql://…` (MariaDB client accepts them)

## 4. CORS origins (closed)

**Decision:**

- **Local defaults** stay in `CorsAllowlist` (shell :8090, apps :3000/:5173, etc.)
- **Production/staging** set `CORS_ALLOWED_ORIGINS` at deploy time (comma-separated full origins)
- Bare `*` is ignored (fail closed)

No invented production domain list in code.

---

## Still never merge cold

WIP crash branches — see `docs/HANDOVER-NITRO-BRANCHES.md`. Especially `feat/spine-java-rename`.
