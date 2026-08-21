# Claim trade.algo (create refuse copy covers VWAP/POV)

**status:** LIVE this session
**tracker:** `trade.algo` (stays **ready**)
**branch:** `feat/algo-create-refuse-kind-honest`
**class:** N

File-disjoint from `#1821` (place-grant). Shared `createTwap` door must not say “TWAP” when mark is missing or duration/slice bounds fail — those checks run before kind.

## Non-goals

- Icebergs
- Dual-edit `#1819` / `#1820` / `#1821` grant files
