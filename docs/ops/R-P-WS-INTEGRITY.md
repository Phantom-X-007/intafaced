# R-P-WS-INTEGRITY — WS market-ID + `/ws`→`/stream` blocker

| Field                | Value                                                                                                                                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claim**            | `P-WS-REPORT` (integrity report only)                                                                                                                                                                                                          |
| **Class**            | N (docs)                                                                                                                                                                                                                                       |
| **Proof mode**       | **NO-FLEET** — `docker` not available on this host; live counts not re-probed this session                                                                                                                                                     |
| **Tip when written** | re-derive: `git fetch && git log -1 --oneline origin/main`                                                                                                                                                                                     |
| **Sources**          | Code on tip + prior live probe in [`docs/REGROUP-2026-08-03.md`](../REGROUP-2026-08-03.md) §3 + Denon board [`docs/DENON-HARD-TASK-BOARD-FROM-NITRO-SWARM-2026-08-03.md`](../DENON-HARD-TASK-BOARD-FROM-NITRO-SWARM-2026-08-03.md) **D-P0-WS** |
| **Dual-edit**        | **None.** This PR is `docs/ops/` only. Did **not** edit `services/svc-matching` or `services/svc-edge` (open Denon paths: #433 matching, #432/#424 edge).                                                                                      |

**Purpose:** freeze the platform-integrity facts so depth/tape work is not started against a path that cannot work. **Does not** implement nginx, market authority, depth UI, or invent markets.

---

## 1 · nginx `/ws` vs svc-ws `/stream` — path fact

### What the shell proxies

`vendor/coinexchange/05_Web_Front/nginx.conf` (serving `:8090`):

| Location         | Behaviour                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------ |
| `location /`     | SPA `try_files $uri $uri/ /index.html`                                                     |
| `location /api/` | `proxy_pass http://svc-edge:4000`                                                          |
| `location /ws`   | `proxy_pass http://svc-ws:4014` **with no URI rewrite** + `Upgrade` / `Connection` headers |

### What svc-ws accepts

`services/svc-ws/src/ws/gateway.ts`:

- Public upgrade path constant: `STREAM_PATH = '/stream'`.
- Upgrade handler: if pathname is `/private/stream` → ignore (private gateway); if pathname is **not** `/stream` → **HTTP 404** and destroy socket.
- Required query: `?market=<id>` matching `^[A-Za-z0-9._:-]{1,64}$`; optional `channel=depth|trades`.

Documented surface (`services/svc-ws/README.md`):

- `GET /stream?market=<id>` (depth)
- `GET /stream?market=<id>&channel=trades` (tape)
- `GET /private/stream` (auth)
- REST: `GET /markets`, `GET /markets/:marketId/depth`

Retired `apps/web` clients already target **`/stream`**, not `/ws` (`apps/web/src/lib/market/ws-transport.ts`).

### The mismatch (code-level, independent of fleet)

1. Browser (or shell) that opens `ws://host:8090/ws?...` is proxied to svc-ws as path **`/ws`**.
2. svc-ws only upgrades **`/stream`**. Path `/ws` → **404 Not Found** (never a live book).
3. A client that instead opens `ws://host:8090/stream?...` never hits the `/ws` location: **`location /` wins** and `try_files` serves SPA HTML — not a WebSocket upgrade to svc-ws.
4. Therefore: **there is no URL on `:8090` that reaches the depth stream** (REGROUP §3). Upgrade headers on `/ws` are correct for _a_ WS proxy, but the path never matches the service contract.

### Fix shape (for Denon implementer — not done here)

Either:

- **Rewrite:** `location /ws/` (or `/ws`) with `proxy_pass http://svc-ws:4014/stream` (or equivalent strip/rewrite so upstream sees `/stream?…`), **or**
- **Expose the real path:** a higher-priority `location` for `/stream` (and likely `/private/stream`) that proxies to svc-ws **before** `location /` can catch it.

nginx half is short; it is not the whole blocker (see §2).

---

## 2 · Market-ID namespace — edge vs matching vs ws

### Data-plane ownership (from code)

| Plane                     | Source of market identity                                                                                       | Shape on the wire                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Browser REST via edge** | Edge routes `/api/v1/*` → **svc-trade** (`TRADE_URL`, `preservePath: true`) — `services/svc-edge/src/routes.ts` | Public list: `GET /api/v1/markets` on trade                                                                            |
| **Trade catalog**         | Postgres `trade.markets`                                                                                        | `Market.id` = **UUID string**; `Market.symbol` = human pair (e.g. `BTC/USDT`) — `services/svc-trade/src/spot/types.ts` |
| **Trade → matching**      | `matching.submit(market.id, …)`, `matching.depth(market.id, …)`                                                 | Engine key = **trade UUID**, not symbol — `trade-service.ts`                                                           |
| **Matching books**        | In-process map; `GET /markets` → `{ markets: engine.markets }`                                                  | IDs that have ever had a book / journal presence — **not** a copy of Postgres listings                                 |
| **svc-ws**                | `HttpDepthSource.markets()` = matching `GET /markets`; `ensureKnownMarket` before any depth poll or attach      | Subscribe with that same string or close **`unknown market "<id>"`**                                                   |

Critical safety note (svc-ws README / `depth/source.ts`): matching `engine.book(id)` historically auto-created empty books; ws **must** gate on matching’s market list so the public internet cannot grow engine memory with arbitrary IDs.

### Three namespaces, not two

1. **Edge-visible catalog** = trade Postgres rows (symbols + UUIDs) — what the shell/landing list.
2. **Matching journal keys** = whatever marketIds have books after orders/seeds (UUID if trade always submits UUID; unit tests often use symbolic `BTC-USDT`).
3. **svc-ws allow-list** = **exact copy of (2)** at refresh time — never trade Postgres, never edge.

Intersection that matters for depth:

```
edge_listable_ids ∩ ws_known_ids
  = trade.market.ids_shown_to_clients ∩ matching.engine.markets
```

If the shell (or any client) opens `/stream?market=<trade UUID>` but matching has never seen that UUID (empty journal / different seed IDs), ws closes: `unknown market "…"`.

### Prior live probe (REGROUP 2026-08-03) — **not re-run this session**

When the fleet was healthy, product-surfaces session recorded:

| Fact                                    | Value                                     | Status this session                                              |
| --------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| Edge / trade markets serving            | **16**                                    | **Unverified** (NO-FLEET)                                        |
| svc-ws / matching markets               | **10**                                    | **Unverified** (NO-FLEET)                                        |
| Set intersection                        | **0**                                     | **Unverified** (NO-FLEET); structural risk still holds from code |
| Direct upgrade to svc-ws with edge UUID | closes with `unknown market "a7cc445e-…"` | Anecdote from REGROUP; UUID shape matches trade `id`             |

### Structural risk that remains true without Docker

- Edge does **not** proxy market identity into matching or ws.
- Trade **does** use UUID as matching marketId on the money path.
- Matching only lists books it already has; listing a pair in Postgres does **not** create a matching book.
- Unit/fixtures use symbolic `BTC-USDT` / `btc-usdt` in places; production path uses UUID — easy to “green” tests while live namespaces diverge.
- Shell desk today uses **symbol** REST (`/orderbook/:symbol`, route `btc_usdt`) and has **no** live depth WebSocket port that reaches svc-ws (blocked by §1 even before ID alignment).

### What would prove ∩ ≠ 0 (when fleet returns)

1. `GET http://svc-trade:…/api/v1/markets` (or via edge `:8090/api/v1/markets`) → collect `id` (and symbols).
2. `GET http://svc-matching:…/markets` → collect engine market ids.
3. `GET http://svc-ws:…/markets` → must equal (2) (modulo refresh lag).
4. Assert non-empty intersection of trade `id` set with matching set.
5. `wscat`/`websocat` to `ws://svc-ws:4014/stream?market=<id_from_intersection>` → first frame `type: snapshot` (not close 1008 unknown market).
6. After nginx fix: same against `:8090` public path.

---

## 3 · Handoff Denon needs (D-P0-WS)

Platform-integrity lane. Agents **do not** invent the authority rule ([DENON hard board](../DENON-HARD-TASK-BOARD-FROM-NITRO-SWARM-2026-08-03.md)).

### Decide first (product law — write on tip)

- [ ] **Which string is the public depth market key?** Options to pick explicitly (not invent mid-stream):
  1. **Trade UUID** everywhere (matching books, ws query param, shell socket) — aligns with current money path `matching.submit(market.id)`.
  2. **Canonical symbol** (e.g. `BTC/USDT` or `BTC-USDT`) everywhere — would require trade→matching key migration.
  3. **Dual map** (ws accepts symbol, resolves to UUID) — new contract; only if (1)/(2) are rejected with reasons.
- [ ] Document the decision in a short tip note (ADR or `docs/` handoff) **before** large shell depth UI work.

### Then implement (order that unblocks depth)

- [ ] **Align namespaces** so `trade.markets.id` ∩ `matching.GET /markets` is non-empty for every market the shell may stream (seed/MM/journal so listed UUIDs actually have books — or refuse list rows that have no book, honestly).
- [ ] **nginx path:** make one same-origin URL on `:8090` upgrade to svc-ws **`/stream`** (and decide `/private/stream` proxy if private channels are in scope). Do not leave `/stream` under SPA `try_files`.
- [ ] **Client contract:** shell (when later ported) must pass the **decided** market key on `?market=`, not a free-form slug that only matches the Vue route (`btc_usdt`).
- [ ] **Proof on fleet:** intersection script + one live snapshot frame through `:8090` (acceptance from hard board: _“Live shell can open depth for a real market id”_).

### Explicit non-goals for this handoff

- No depth/tape **UI** polish in the same change unless path + namespace already green.
- No inventing mid/prices/candles to make books look full.
- No dual-edit of open money PR paths without path-intersect (`#433` matching reconcile, `#432` screening, `#424` edge CORS — different concerns; do not hitch-hike).

### Suggested acceptance checklist (Denon self-audit)

1. Decision note on tip names the authoritative market id.
2. `trade ids ∩ matching markets ≠ ∅` on running fleet.
3. `:8090` has a documented WS URL that returns snapshot (not 404 HTML, not unknown market).
4. Tracker / LIVE-LANES: depth UI residual only unblocked **after** 1–3.

---

## 4 · Explicitly NOT free

| Item                                                       | Why blocked / reserved                                                                                                                                |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Depth UI / live book port into shell**                   | Blocked on D-P0-WS (§1 + §2). REGROUP §3 + swarm orient: depth/tape **not** free product residual.                                                    |
| **Tape / public trades channel UI**                        | Same `/stream` path + same market key.                                                                                                                |
| **Inventing markets, mids, or seed depth for screenshots** | Honesty law; fabricated-money ratchet; NO-FLEET does not authorize fake books.                                                                        |
| **Implementing inside open Denon PRs**                     | `#433` `services/svc-matching/**` · `#432` edge env/index + screening · `#424` edge CORS — babysit / report only unless Denon handoff says otherwise. |
| **Treating nginx-only fix as “depth done”**                | Path fix alone leaves ∩ = 0 (or unknown market closes).                                                                                               |
| **apps/web as product surface**                            | Retired; port targets vendor shell. Depth state machine in apps/web is reference, not the live desk.                                                  |

**Free for Nitro residual (unchanged by this report):** shell money call sites (RP1), landing honesty (RP2), announce (RP3), wire adopt (RP4), AFK residuals — **not** depth.

---

## 5 · File / PR touch map (for implementers)

| Area                | Path                                                       | Role                           |
| ------------------- | ---------------------------------------------------------- | ------------------------------ |
| nginx               | `vendor/coinexchange/05_Web_Front/nginx.conf`              | `/ws` proxy vs SPA `/`         |
| ws gateway          | `services/svc-ws/src/ws/gateway.ts`                        | `/stream` only                 |
| ws market gate      | `services/svc-ws/src/depth/source.ts`, `hub.ts`            | matching list                  |
| edge route          | `services/svc-edge/src/routes.ts`                          | `/api/v1` → trade only (no ws) |
| trade id            | `services/svc-trade/src/spot/types.ts`, `trade-service.ts` | UUID to matching               |
| matching list       | `services/svc-matching` `GET /markets`                     | journal books                  |
| prior live write-up | `docs/REGROUP-2026-08-03.md` §3                            | 16 vs 10, ∩0                   |
| Denon queue id      | **D-P0-WS**                                                | authority + implement          |

---

## 6 · This report’s verification

| Check                               | Result                          |
| ----------------------------------- | ------------------------------- |
| nginx `/ws` + SPA `/` read from tip | Yes                             |
| svc-ws `/stream` only               | Yes                             |
| trade UUID → matching               | Yes (code)                      |
| Live 16/10/∩0 re-probe              | **No** — NO-FLEET; cite REGROUP |
| Code changes to matching/edge       | **None** (avoid dual-edit)      |
| Depth UI                            | **Not started** (not free)      |

**Stamp:** `proof_missing: fleet-blocked` for live market-set intersection. Structural path + ownership facts above are code-backed on tip.
