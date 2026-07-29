# Split board — two streams, no collisions

> ## ⚠️ 29 July, owner offline 1–2h: **Nitro has full access to the whole app.**
>
> The territory rule below is **suspended** while Denon is away. Debug, wire and
> build anywhere — front end, services, Java, infrastructure. Everything below is
> now advice about where the sharp edges are, not permission you have to ask for.
>
> One thing still holds, because it is not about territory: **do not merge
> `feat/multi-asset-instruments`.** It changes the ledger's asset enum, and the
> owner merges money personally. Everything else is yours.

---

## WHERE THE APP ACTUALLY IS — read this before you open an editor

**We are building on top of the vendored exchange, and it lives in
`vendor/exchange/`.** That tree IS the product. It is not a reference copy,
not a sample to crib from, and not something to port screens out of.

| what                    | where                                                                         |
| ----------------------- | ----------------------------------------------------------------------------- |
| **the app you open**    | `vendor/exchange/05_Web_Front/` → http://localhost:8090                       |
| the Java backend        | `vendor/exchange/00_framework/` (14 Maven modules)                            |
| the admin console       | `vendor/exchange/04_Web_Admin/`                                               |
| the wallet RPC          | `vendor/exchange/01_wallet_rpc/`                                              |
| our TypeScript platform | `services/`, `packages/` — reached from the app through `svc-edge` on `:4000` |

Provenance, so nobody wastes time wondering: the tree is a fork of an
open-source exchange under Apache-2.0. The upstream project, its author and the
retrieval date are recorded in `vendor/exchange/NOTICE` and in
`docs/adr/2026-07-28-vendored-exchange-integration.md`. **Those two files name
the upstream deliberately and must keep doing so** — an attribution that omits
what it attributes is a false legal statement, so they are exempt from
`brand-scan` for that reason and no other. Nowhere else in the repo may name it.

The Java package root is `com.intafaced` and the Maven groupId matches it
(§5 item 7 — done). What still carries upstream spelling, on purpose, is the
**MySQL schema name and the Mongo database name**. Those are live datastore
identifiers rather than branding: renaming them is a data migration with nothing
behind it, and a careless find-and-replace over them points every service at a
schema that does not exist.

`apps/web` (Next.js) is NOT the product. It is a small static shell that predates
the fork. Do not build features there.

---

## 1. The rule (suspended — see the banner)

**You may edit anything inside your own territory without asking. You may not
edit anything in the other stream's territory, ever — you open a request
instead.** One-line changes included. The cost of a two-minute wait is far
smaller than the cost of a conflicted `App.vue` at 2am.

|                   | **Stream A — Nitro**                                                                                                        | **Stream B — Denon**                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Owns**          | `vendor/*/05_Web_Front/src/pages/`<br>`vendor/*/05_Web_Front/src/components/`<br>`vendor/*/05_Web_Front/src/assets/images/` | `services/`<br>`packages/`<br>`tooling/`<br>`vendor/*/00_framework/` (Java)<br>`docker-compose*.yml`, `Dockerfile` |
| **Branch prefix** | `feat/app-*`                                                                                                                | `feat/spine-*`                                                                                                     |
| **Dev server**    | `:8090` (container `intafaced-shell-web`)                                                                                   | `:8091` (own container — see §3)                                                                                   |
| **Verifies with** | browser + `docker logs …` compile check                                                                                     | `pnpm verify` + `custody-scan`                                                                                     |

---

## 2. The shared spine — seven files, one owner each

These are the files two people always end up in at once. Every one of them
collided during today's agent run. Each now has exactly one owner.

| file                                        | owner                   | how the other stream changes it |
| ------------------------------------------- | ----------------------- | ------------------------------- |
| `05_Web_Front/src/App.vue`                  | **A**                   | B posts the nav item wanted     |
| `05_Web_Front/src/config/routes.js`         | **A**                   | B posts the route wanted        |
| `05_Web_Front/config/index.js` (dev proxy)  | **B**                   | A posts prefix → target         |
| `05_Web_Front/src/main.js`                  | **B**                   | A posts what's needed           |
| `05_Web_Front/src/assets/lang/en.js`        | **shared, append-only** | see below                       |
| `05_Web_Front/src/assets/css/intafaced.css` | **shared, append-only** | see below                       |
| `services/svc-edge/src/routes.ts`           | **B**                   | A posts prefix + port           |
| `docker-compose.apps.yml`                   | **B**                   | A never edits                   |

**Append-only convention** for the two shared files. Each stream writes only
inside its own marked region, so git merges them cleanly instead of conflicting:

```
/* ── stream A ─────────────────────────────────────────────── */
   …Nitro's additions…
/* ── stream B ─────────────────────────────────────────────── */
   …Denon's additions…
```

Never reorder, reformat or prettier-sweep the whole file. That turns a clean
merge into a 400-line conflict.

---

## 3. Infrastructure — the actual speed unlock

Today's real bottleneck was not merge conflicts. It was **one dev server**.
Hot reload does not work over the Windows bind mount (`poll: false` in
`config/index.js`), so every edit needs `docker restart` — and a restart by one
person blows away the other person's in-progress state for ~90 seconds.

**Fix it first, before any feature work. Two independent servers:**

```bash
# Stream A keeps :8090 as-is.

# Stream B gets its own worktree and its own container:
pnpm wt feat/spine-work
docker run -d --name intafaced-shell-b \
  -v "C:/Users/User/plug-x-inta-worktrees/feat-spine-work/vendor/exchange/05_Web_Front:/app" \
  -v "<vendor-integration-worktree>/vendor/exchange/05_Web_Front/node_modules:/app/node_modules" \
  -w /app -p 127.0.0.1:8091:8080 -e HOST=0.0.0.0 node:16 sh -c "npm run dev"
```

`node_modules` is bind-mounted from the same place for both — it is read-only in
practice and installing twice wastes fifteen minutes.

**Also set `poll: 1000`** in `config/index.js` (owner: B). It makes the watcher
actually fire on Windows and removes the restart cycle entirely. This is the
single highest-leverage change on this page.

**Do not both run `pnpm db:migrate` against `intafaced` on :5433.** Stream B
owns that database. Stream A uses the Java MySQL on :5506, which B does not
touch.

---

## 4. Stream A — Nitro (app surface)

Ordered. Top of the list is the highest visible value.

1. **Look at the terminal in a browser.** Nothing this session was visually
   verified — all checks were compile- and endpoint-level. The layout, the
   chart skin and the depth graph have never been seen by a human. Expect to
   find things.
2. **Every price is `0`.** The pairs are seeded and `/market/symbol-thumb`
   answers, but nothing has ever matched, so the chart has a working datafeed
   and no bars. Either seed candle history into the Java `market` service or
   point the datafeed at an external venue for history. **This is the difference
   between a demo that lands and one that doesn't.**
3. **Zero-KYC DEX path in the shell.** The plane switch already exists and is
   correct in the services (`checkAccess` short-circuits protocol +
   non-custodial to `allowed.permissionless` _after_ region screening). What's
   missing is the UI: a DEX/CEX toggle that actually selects the plane, with the
   member/KYC gates stripped on the protocol side and kept on the CEX side.
4. Order-entry polish: validation, precision, fee preview, confirmation states.
5. Wire the account panes — Balances / Positions / Open Orders / History — to
   real endpoints and prove each one with data.
6. Mobile. The shell has a drawer; nobody has checked it since the retheme.
7. Empty and error states across every screen. The backend will be down
   sometimes; it must never blank-screen.

**Blocked on B — post the request and move on:** any new `/api/*` proxy prefix,
any new edge route, anything in `main.js`.

---

## 5. Stream B — Denon (spine)

1. **Redeploy the fleet** with the three fixes already committed but not yet
   running: `svc-protocol`'s router mount, `svc-token`'s tier, `svc-indexer`'s
   edge route + the `4012→4013` port correction. Until this ships, the protocol
   and chain screens 404 no matter what Stream A does.
2. **Scope issuance for `bank` and `blueprint`.** `AuthService.defaultScopes()`
   issues neither `bank:read` nor `blueprint:read` **to anybody**, so no user in
   the platform can open a bank space. Decide what gets issued to whom — this is
   a policy call, not a patch. Two screens are dark until it's made.
3. **P2P offers are 403 for a different reason** — the scope _is_ held; the
   jurisdiction matrix wants verification tier `basic`. Decide whether that's
   correct and make the UI say which of the two refusals it hit.
4. **`svc-trade` never checks trading hours.** `isInstrumentOpen` exists and is
   tested but the order-create path doesn't call it, so a weekend EUR/USD order
   is accepted today. Ships with the multi-asset branch.
5. **Close the `workspace-sync` gap.** Check 5 catches a wrong upstream port —
   but only in the edge's own environment block. `svc-dex` called the indexer on
   the wrong port and the gate stayed green. Widen it to every service-to-service
   `*_URL`.
6. ~~**Decide `svc-matching` and `svc-ws`.**~~ **Resolved — both are correct.**
   Neither exposes a tRPC router because neither should. `svc-matching` serves
   plain HTTP behind `verifyServiceHeaders` with `INTERNAL_SERVICE_SECRET` —
   service-to-service only, and it answers 401 rather than 403 to a caller that
   has not said who it is. `svc-ws` serves websockets, which the edge cannot
   proxy because it buffers, so the browser reaches it directly; its snapshot
   carries no cookie, no token and no per-caller content. Not the
   unmounted-router bug. Written down here so it does not get re-raised.
7. ~~**The Java rebrand — 666 files.**~~ **Done — `feat/spine-java-rename`.**
   The package root is `com.intafaced`, the groupId matches, `*-parent` and
   `*-job` are renamed, the module directory is renamed, and the vendor
   directory is `vendor/exchange/`. Build after: 14/14 `BUILD SUCCESS`, the same
   14 modules as the baseline. Kept here because the three findings that shaped
   it are worth not re-deriving:

   **MongoDB, not Hibernate, was the thing to be careful about.** Spring Data
   stamps a `_class` discriminator into every document. At migration time the
   live database held **261,240 documents across 110 collections** — far more
   than the 1,420/60 first counted, because the market service kept writing —
   every one naming the old package. The migration shipped with the rename as
   `vendor/exchange/00_framework/sql/mongo/2026-07-29-class-discriminator-rename.js`:
   idempotent, `DRY_RUN=1`-able, and it asserts its own residual count rather
   than trusting the operator. It rewrote all 261,240 and verified 0 left.

   **But the orphaning fear was wrong, and that is worth knowing.** Spring Data
   does *not* break on a `_class` it cannot load: `SimpleTypeInformationMapper`
   catches the `ClassNotFoundException` and falls back to the target type. This
   was confirmed both ways — old jars read migrated documents fine, and the
   market service was fully restarted afterwards so `initializeThumb()` re-read
   Mongo from scratch, returning real prices (BTC/USDT 118,450). So the rename
   and the migration do **not** have to ship in the same deploy. Ship the
   migration anyway — `_class` should name the class that actually ships — but
   it is a tidiness fix, not a lockstep requirement.

   **The vendor names are also live datastore names**, and those were excluded
   explicitly. MySQL schema (8 JDBC URLs plus compose `MYSQL_DATABASE`), the
   Mongo database name, a Mongo credential, an Aliyun OSS bucket, the Eureka
   registration `*-market` and its 5 lookups, and the protobuf wire descriptors
   in `QuoteMessage.java`. A blanket sweep would have pointed every app at a
   schema that does not exist, with `ddl-auto=update` then building 64 empty
   tables next to the real ones.

   **No `@Table` pinning, and that was right.** JPA implicit naming derives from
   the _entity name_, never the package. Re-verified before the move: the tree
   contains **zero** `@ComponentScan` / `@EntityScan` / `@EnableJpaRepositories`
   / `@MapperScan` annotations, so a consistent move of every package needed no
   annotation edits at all. Renaming packages without renaming classes cannot
   change a table or a column name.

   **Still open, deliberately left:**

   - `01_wallet_rpc` keeps its own upstream package root. It does not build even
     at baseline — its `pom.xml` lists an `xrp` module that is not in the tree —
     so renaming it would be an unverifiable change. Fix the build first.
   - `sql/db_patch.sql` still carries Chinese in ~256 of 667 lines. It is *data*
     (coin display names, country names, ~150 admin permission labels), not
     comments, so it is a translation job rather than a rename. The file is also
     destructive (`DROP TABLE`) and is not applied to the live database.
   - The coinex Redis password in config does not match the running container.
   - **`main` cannot boot the Java market service against MongoDB 6 at all.**
     Driver 3.4.3, which `spring-boot-starter-parent` 1.5.9 pins, speaks only
     the legacy `OP_QUERY` opcode that MongoDB removed in 5.1, so every read
     fails with error 352. The one-line fix (`<mongodb.version>3.12.14</...>`)
     exists on the unmerged vendor-integration branch — find it with
     `git branch -a --list '*integration*'` — and that branch is what the
     currently-running containers are built from. This predates the rename
     and is unrelated to it — it was confirmed by reproducing the identical
     failure with the pre-rename baseline jars.

8. **Java custody hardening** — unauthenticated withdrawal `GET`s, empty-string
   ETH keystore passwords, and a hardcoded `987654321asdf` trading backdoor.
   These are line items in the fork, not blockers, but they must not reach
   production.
9. `svc-academy` and `svc-launch` do not exist. Two screens say so honestly.

---

## 6. Owner-only — nobody else can do these

- **Merge the money branches.** `feat/multi-asset-instruments` touches the
  ledger's asset enum. Standing rule: _auto-open a PR, never auto-merge._
- **The sanctions blocklist is empty.** Screening works and screens nothing.
  This needs counsel before a public DEX. It is a compliance decision, not an
  engineering one, and it is the one item that can stop a launch.
- **Visual sign-off** on the rebrand.

---

## 7. Merge protocol

- **Rebase, never merge, onto `main`.** Two long-lived branches plus merge
  commits will produce exactly the conflict this document exists to prevent.
- **Push at least once a day, even mid-task.** A three-day branch in this repo
  is a guaranteed conflict.
- **`pnpm verify` before every push** (Stream B). Report what it actually
  printed, including failures. The DoD gate reports failure on four manual
  sign-off items that are not automatable — that is expected and is not a
  regression.
- **Ordering:** land `feat/rebrand-english-black-orange` first. Everything else
  is built on it, and it is already green.

---

## 8. Requesting a change in the other stream's territory

Open an issue titled `[cross-stream] <file> — <what>`, with the exact diff you
want. Owner applies it in their next push. Do not "just quickly" edit it — that
is precisely how today's proxy-prefix collision happened, where `/exchange` was
registered as an API prefix while also being the SPA route, and a hard refresh
on the trading page started returning the exchange service instead of the app.
