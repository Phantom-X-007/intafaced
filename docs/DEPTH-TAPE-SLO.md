# Depth / tape product SLO — honest empty, gap, feed dark

**Board:** D26-P4-06 · [`DENON-HARD-PARALLEL-BOARD-2026-08-09.md`](DENON-HARD-PARALLEL-BOARD-2026-08-09.md) §8  
**Lane:** `denon-d26-p4-06-depth-slo`  
**Date:** 2026-08-15  
**This file is the product SLO.** Shell Vue stays HUMAN (`nitro-frontend-all`). Agents implement **no** vendor Vue, **no** `svc-edge`, **no** invented mids or ladder rungs.

**Leverage (Phase A IN):** vendor shell depth client `#748` (`ix-depth-feed.js`) + `packages/market-data` `diffDepth` / `applyDelta` + `services/svc-ws` depth hub / HTTP source. Do not rebuild a terminal or a second book.

---

## 0 · What this SLO is

Not a latency budget. Not a p99 to invent. The product failure this seals is **a desk that looks liquid when it is not**, or **looks empty when it is actually dark**.

Three states the shell client must keep distinct. Mixing any two is a product defect.

| State | Meaning | User-visible claim |
| ----- | ------- | ------------------ |
| **Empty book** | The venue answered. There is no resting liquidity. | Honest empty ladder. Feed may be **live**. |
| **Gap** | The client cannot apply the next delta safely. The last book is **untrusted**. | Repair (resnapshot). Do not keep serving the stale ladder as current. |
| **Feed dark** | No valid snapshot for this market yet, or the transport/source is down. | Not live. Not “no bids yet.” |

Tape (public prints) uses the same three *names* with different mechanics — see §3.

---

## 1 · Pointers (already on tip — wire these, do not fork)

| Layer | Path | Job |
| ----- | ---- | --- |
| Wire types + sequence law | `packages/market-data/src/depth.ts` | `DepthSnapshot` / `DepthDelta`; `applyDelta` refuses gap/stale/wrong-market; `diffDepth` is the hub inverse; `emptyBook()` is **local** (`sequence: -1`) — not a venue empty. |
| Fan-out | `services/svc-ws/src/depth/hub.ts` | One snapshot then `diffDepth` deltas. Drop-on-backpressure is safe **only** because the client gap-checks. Lag repair is a **snapshot**, not replayed deltas. |
| Engine read | `services/svc-ws/src/depth/source.ts` | Listed market with no engine book → **empty snapshot `sequence: 0`, empty sides** — not an error. Matching unreachable → `DepthSourceError` (dark), not a fabricated book. |
| Market list | `services/svc-ws/src/depth/registry.ts` | Unknown id is policy-close (`1008` `unknown market`), not an empty ladder. |
| Shell client | `vendor/upstream-exchange/05_Web_Front/src/assets/js/ix-depth-feed.js` | Gap → REST resnapshot **without** tearing the socket. `onLive(true)` **only** after a valid snapshot for this `marketId`. |
| Empty copy (pure) | `vendor/upstream-exchange/05_Web_Front/src/assets/js/book-honesty.js` | `bookSideEmptyLabel` / `tradesEmptyLabel`: loading vs unreachable vs honest empty. `normalizePlateLevels` does **not** pad to a fixed height. |
| Order ticket | `vendor/upstream-exchange/05_Web_Front/src/assets/js/ix-order-block.js` | `feedLive === false` → `feed_down`. Empty live book is **not** feed down. |
| Trade tape hub | `services/svc-ws/src/trade/hub.ts` | Prints are not a sequenced book. A missed print is not a depth-gap. Do not invent fills to look busy. |
| Golden | `ix-depth-feed.golden.js` · `book-honesty.golden.js` | Live-after-snapshot; empty vs unreachable copy. |

Vue (`Exchange.vue`, `DepthGraph.vue`) already comments the empty-snapshot path. **Do not edit those files on this mountain.** This spec is what remaining shell work must obey.

---

## 2 · Depth matrix (client must)

Detect from **protocol + flags**, not from “the ladder looks thin.”

| | **Empty** | **Gap** | **Dark** |
| --- | --- | --- | --- |
| **How you know** | Applied snapshot (WS or REST) for this `marketId`. Sides have no positive-qty levels. Typical listed-untraded: `sequence === 0`, `bids=[]`, `asks=[]`. A later live book can also be empty after real cancels. | `applyDelta` returns `reason: 'gap'` (or `wrong-market`). `fromSequence !== book.sequence`. | No snapshot applied yet (`emptyBook` local `sequence: -1`); socket `no-ws` / construct-fail / `closed` / error; TCP `open` with no snapshot; REST resnapshot failed; matching/ws unreachable; unknown market closed. |
| **`feedLive` / `onLive`** | **true** once that snapshot is applied — empty is success. | **false** until a successful resnapshot. Do not leave Live on an untrusted book. | **false**. TCP open is not live (`ix-depth-feed` `onopen` must not call `onLive(true)`). |
| **Ladder / depth graph** | Real zero rungs. Copy: **No bids** / **No asks** (or `depthEmptyBook`). Graph draws empty series. | Do not paint the stale ladder as current. Prefer last-known **dimmed** + resnapshot status, or clear to loading — never invent rungs to “hold the shape.” | **Book unavailable** / feed-down copy (`book-honesty` `reachable: false`). Not “No bids yet.” |
| **Last / 24h ticker** | May show REST last if the listing payload has it. Must not imply the **book** has size. | Do not derive a mid from the broken book. | Header: not-live (`feedDown`). Do not treat zeros as a live last. |
| **Order ticket** | Live empty book: ticket may stay enabled if other gates pass. Crossing an empty book is a liquidity miss, not a feed lie. | Treat as not-live until repaired (`feed_down` or equivalent). | `feed_down`: “Market data is not live…” |
| **Repair** | None. First engine order arrives as a **delta** off sequence 0 (source contract). | `GET /ws/markets/<uuid>/depth` via `resnapshotUrl`. Socket stays up. Status `resnapshot` → `live` or `resnapshot-failed`. | Reconnect (existing delayed reconnect). Do not REST-invent a book. |
| **Forbidden** | Pad N dummy levels; synthetic mid/spread; seed rungs; treat empty as error/dark. | Apply the gapped delta anyway; keep Live; fabricate catch-up rungs. | Show Live; show “No bids yet”; fill the ladder from last trade / mark / seed. |

**Stale deltas** (`reason: 'stale'`) are **not** gaps. Ignore them. Do not resnapshot-loop.

**Local `emptyBook(marketId)` (`sequence: -1`)** is the dark/pre-snapshot holder. It is not the venue empty snapshot. Do not publish it as a live plate.

### 2.1 Sequence cheat-sheet

| `sequence` | Meaning |
| ---------- | ------- |
| `-1` (client local only) | No venue snapshot yet → **dark** |
| `0` + empty sides from hub/source | Engine never allocated / never traded → **empty**, live after apply |
| `> 0` + empty sides | Venue said the book is empty **now** → **empty**, live |
| `> 0` + levels | Live book. Levels are absolute totals; qty `'0'` removes. JSON **numbers** on price/qty are refused, not coerced. |

### 2.2 What the hub already guarantees (do not re-spec as new protocol)

- Wire is `DepthMessage` from `@intafaced/market-data` — not extended.
- Deltas from `diffDepth`; client `applyDelta` is the inverse.
- Snapshot-then-delta: connection registered before first frame; buffered deltas discarded by sequence.
- Backpressure: drop delta → client gaps → snapshot repair; still over water after `maxLagTicks` → disconnect. **Do not invent a client-side coalesced book.**
- Unlisted id: close `1008`, not empty snapshot.

---

## 3 · Tape matrix (public prints)

Tape is **not** a sequenced book. `sequence` on a print is a **dedupe** key. A missed print is still a valid tape; the next print is not a depth-gap (`trade/hub.ts`).

| | **Empty** | **Gap** (tape) | **Dark** |
| --- | --- | --- | --- |
| **How you know** | Socket/subscription up; market known; hub reachable; recent buffer + live stream have **zero** prints for this market. | Client dropped frames (backpressure) or joined mid-stream. Hub replays **recent ring while watched** — not a full history, not invented fills. | NATS/tape consumer down; ws closed; trades REST unreachable; unknown market. |
| **Copy** | **No trades yet** (`tradesEmptyLabel` reachable). | Show what was actually received. Optional “tape incomplete” if the client **knows** it dropped — never backfill. | **Trades unavailable — market did not respond** (or transport message). |
| **Forbidden** | Seed demo prints; copy another market’s tape. | Synthesize missed prints from depth or last REST trade. | Show “No trades yet” (that claims the venue is quiet). |

Depth **live** and tape **live** are independent: an untraded listed market is empty book **and** empty tape **and** can still be feed-live on depth after snapshot. A dark depth feed must not keep a busy tape as proof the book is live.

---

## 4 · Shell implementation contract (Nitro HUMAN)

When the frontend lane touches depth/tape, the client must:

1. Keep using `ix-depth-feed.js` + `book-honesty.js` + `ix-order-block.js` — no second apply path, no Vue-local ladder padding.
2. Drive `feedLive` only from `onLive` (snapshot-applied).
3. Map `onStatus`: `open` ≠ live; `resnapshot` ≠ empty; `resnapshot-failed` / `closed` / `no-ws` / `error` = dark.
4. Call `bookSideEmptyLabel({ loading, reachable, side })` and `tradesEmptyLabel` with **reachable false** on dark, **true** on empty.
5. Never invent mids, spreads, or rungs for graph/impact when the book is empty or untrusted (`impactNoDepth` / `impactBookUnknown` already exist in copy).
6. Leave `services/svc-ws` and `packages/market-data` as the protocol. This SLO does not change the wire.

---

## 5 · Out of scope (this PR / this mountain)

- Vendor Vue / i18n / graph pixels (`nitro-frontend-all`).
- `svc-edge` (X6).
- Inventing mark/mid/seed liquidity (`trade.mm-bot` is a different mountain).
- Private orders/positions streams (D26-P4-05).
- Latency/throughput SLOs (hub `maxLagTicks` / high-water stay as coded; this file does not pick new numbers).

---

## 6 · Done bar (D26-P4-06)

- [x] Tip spec: empty vs gap vs dark matrix for depth and tape.
- [x] No fabricated rungs; no invented mids.
- [x] Pointers to `ix-depth-feed` / `market-data` `diffDepth` / `svc-ws` depth.
- [x] No Vue edits.

Shell pixels that still diverge from this matrix are **frontend residual**, not an excuse to fake depth in another package.
