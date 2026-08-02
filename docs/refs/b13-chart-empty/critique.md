# Critique — `b13-chart-empty`

**Skill used:** impeccable (product register — empty state / hierarchy)  
**Surface:** `/exchange` chart body  
**Date:** 2026-08-02  

## Findings (ranked)

| Sev | Finding | Fix this PR? |
| --- | --- | --- |
| P0 | Chart empty copy unreadable over black kline host | **Y** — z-index + contrast panel + dim host |
| P1 | Dim6 density still weak (footer / panel waste) | **N** — residual B2 |
| P1 | Full B13 multi-surface anti-slop cert still open | **N** — this PR is chart P0 only |

## Anti-slop

- [x] Empty never looks rich  
- [x] No glass confetti  
- [x] Competitor not named from crop  

## Scorecard dims claimed

| Dim | Before (PROOF-1) | After | Evidence |
| --- | --- | --- | --- |
| G11 chart | pass* (flagged silent black) | **pass** readable status | Orca a11y + `docs/styleboard/shots/b13-chart-empty-2026-08-02/02-exchange.png` |
| Dim6 | 1 | 1 (unchanged) | density not this PR |

## Proof

Orca snapshot status text: `No market feed — chart has no live history to show`  
Shot: `docs/styleboard/shots/b13-chart-empty-2026-08-02/02-exchange.png`  
