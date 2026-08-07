# Claim TRK-trade.copy

**status:** claimed
**owner:** cursor-swarm-copy
**class:** M
**scope:** D-S-03 / SPEC-SOVEREIGN-ROUTING-AND-COPY Stage — follow/unfollow + envelope mirror; refuse blank DIRECTION §8 leader_share_bps + jurisdiction; ledger-client fee-share when published
**branch:** feat/trade-copy-stage
**updated:** 2026-08-07

## Non-goals

- Invent `leader_share_bps` / jurisdiction allowlist (DIRECTION §8)
- Touch `futures/**` · `otc/**` · `algo/**`
- P&L-linked fees · returns-ranked leaderboards · pooling
- On-chain session-key scope (SPEC §7.1 — residual)

## Shipping

Refuse-closed default in `services/svc-trade/src/copy/**`; tests prove blank-law refuse + envelope caps + ledger fee-share when published.
