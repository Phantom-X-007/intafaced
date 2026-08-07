# Claim TRK-trade.futures

**status:** pr-open
**owner:** cursor-swarm-futures
**class:** M
**scope:** D-S-01 / D-S-07 decided halves — exit-when-dark `closing` state (ADR 2026-08-07); no invent of mark/funding/mid; no owner-gated profit-account choice
**branch:** feat/futures-denon-residual
**updated:** 2026-08-07

## Human blockers (blank L1 — do not invent)

- Dark-feed horizon / operator alert when `closing` never settles (`DIRECTION` §8).
- Which account funds realised profit / capitalisation (`DIRECTION` §8 item 6) — mechanism already refuses when unconfigured/underfunded.
- Operator adjudicated settlement of never-returning feeds — **no until decided**.

## Shipping

Exit-when-dark done bar: freeze on dark voluntary close, skip liq/funding, idempotent retry, settle at mark return through ordinary bound + armed breaker, honest `closing` render.
