# TRK-dex.quote-router

**Title:** Live cross-venue quote — real prices or a typed refusal  
**Tracker:** `dex.quote-router` · phase 5 · plane P · status `ready` · owner none  
**Depends on:** `indexer.readmodels` · requires `services/svc-dex`

## DoD (plain language)

A public (jurisdiction-gated) caller gets either a **live** best-execution style
quote assembled from real venue books, or a **typed refusal** naming why no
venue could price — never a cached last-known or invented mid. Response flags
`degraded` / `singleVenue` / `unavailable` so clients cannot present one survivor
as multi-venue best execution. No third-party CCXT lib in the money path (§27).

## Path on tip

| Area           | Location                                                         |
| -------------- | ---------------------------------------------------------------- |
| Service        | `services/svc-dex/`                                              |
| Quote assembly | `src/quote/` + venues adapters                                   |
| Config         | `DEX_EXTERNAL_VENUES`, indexer/matching URLs, `QUOTE_MAX_AGE_MS` |
| Related        | `packages/venue-adapter`, `services/svc-indexer`, `svc-matching` |

**Tip residual (tracker note + live probe):** **code finished**; default config
returns **503** `dex.quote.no_venue_available` (venues unreachable / unset).
With one reachable external venue configured, probe returned real 200 + route.
Honesty flags already in response.

## Blocked by

| Blocker        | Notes                                                                            |
| -------------- | -------------------------------------------------------------------------------- |
| Ops config     | Wire live venues / internal-book / indexer in the target env                     |
| Protocol depth | intachain-clob depends on real venue contracts (Shehzad / protocol) for that leg |
| Not code       | Router itself is not the blocker for “one live venue”                            |

Cross-venue “best of many” needs multiple live venues; single-venue degraded is
already honest.

## First PR size (if free)

**XS ops/docs:** document compose/env matrix for one external venue + prove
quote 200 in non-prod (script or README probe). **S craft (optional):** tighten
client contract tests for refusal codes only. Do **not** invent mid when venues
down. Tracker stays `ready` until a real deployment has at least one non-degraded
path accepted by product — or product accepts degraded-single as done (explicit).
