# Claim connect-capture-lake-honesty

**owner:** Phantom-X-007 (Denon · Grok 4.5)  
**branch:** `feat/connect-capture-lake-honesty`  
**scope:** `packages/venue-adapter/src/fabric/capture-lake.ts` (+ test + fabric export)  
**tracker mountain:** `connect.data-lake`  
**status:** shipping  
**updated:** 2026-08-12

Ship §27:762 / D-S-18 capture honesty on tip after #1698: a hole in capture is a typed `hole` record; an empty book is only written when a connected `MarketDataAdapter` returned one. No CCXT, no invented mids, no TSDB choice.

Do not dual-edit open Denon venue paths beyond this residual surface; do not mark `connect.data-lake` / `venue.aggregation` done (store + trading half residuals remain).
