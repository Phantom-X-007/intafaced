# Claim trade.copy

- **Lane:** `trade.copy`
- **Tracker:** `trade.copy`
- **Branch:** `feat/trade-copy-place-mirror`
- **Scope:** `services/svc-trade/src/copy/**` + router `copy.placeMirror` only
- **Done bar:** `copy.placeMirror` places the planned mirror via spot `placeOrder` only when `TRADE_COPY_PLACE_MIRROR` is on; flag/blank §8 refuse by name; fillId idempotent; no live place from a paper leader fill; planned qty/price envelope (no invented mids)
- **Do not touch:** futures/otc/algo/mm/ccxt · invent profit-share · Denon open trade PR paths
- **Class:** M (spot place path)
- **status:** claimed
- **owner:** nitro-agent
- **updated:** 2026-08-16
