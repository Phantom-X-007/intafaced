# TRK-dex.quote-router

**Title:** Live cross-venue quote — real prices or a typed refusal  
**Tracker:** `dex.quote-router` · phase 5 · plane P · status `ready` · owner none  
**Depends on:** `indexer.readmodels` · **requires:** `services/svc-dex` quote path  
**Related socket:** `socket.dex-venue-set` (decision blocker, not code)  
**Tip freeze:** `origin/main` @ `c773dafa` (re-derive before implement)  
**Pack type:** research only — no invent mid; no `features.mjs` edit.

## DoD (plain language)

A public (jurisdiction-gated) caller gets either a **live** best-execution style
quote assembled from real venue books, or a **typed refusal** naming why no
venue could price — never a cached last-known or invented mid. Response flags
`degraded` / `singleVenue` / `unavailable` so clients cannot present one survivor
as multi-venue best execution. No third-party CCXT lib in the money path (§27).

## Path on tip

| Area           | Location                                                                          |
| -------------- | --------------------------------------------------------------------------------- |
| Service        | `services/svc-dex/` (non-custodial protocol plane)                                |
| Quote assembly | `src/quote/` — adapters: intachain-clob, internal-book, external                  |
| Config         | `DEX_EXTERNAL_VENUES` (default **[]**), indexer/matching URLs, `QUOTE_MAX_AGE_MS` |
| Related        | `packages/venue-adapter`, `services/svc-indexer`, `svc-matching`                  |

**Tip residual:** **code finished**; default config live-probe **503**
`dex.quote.no_venue_available` (venues unreachable / unset). With one reachable
external venue configured, probe returned real 200 + route + honesty flags.
Done bar is ops/product venue decision (`socket.dex-venue-set`), not rewrite.

## Blocked by

| Blocker        | Notes                                                                        |
| -------------- | ---------------------------------------------------------------------------- |
| Product/ops    | **Which venue this platform quotes** — not decided in accepted ADRs          |
| Protocol depth | intachain-clob needs real CLOB contracts (`socket.clob-contracts` / Shehzad) |
| Internal book  | Matching empty until journal/MM seed — ops, not router rewrite               |
| Not code       | Router itself is not the blocker for “one live venue”                        |

## First PR size (if free)

**XS ops/docs:** document compose/env matrix for one external venue + prove
quote 200 in non-prod (script or README probe). **S craft (optional):** tighten
client contract tests for refusal codes only. Do **not** invent mid when venues
down. Tracker stays `ready` until a real deployment has at least one non-degraded
path accepted by product — or product accepts degraded-single as done (explicit).
