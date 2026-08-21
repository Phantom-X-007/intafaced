# Claim connect.latency-grading-consumer-zero

**id:** connect.latency-grading-consumer-zero  
**tracker:** `connect.latency-grading` (stays **ready** — WS grading residual may remain)  
**branch:** `feat/connect-unscored-consumer-zero`  
**owner:** Phantom-X-007 (Denon)  
**status:** LIVE this session  
**class:** N

## Done bar

svc-trade `/health` venue marks treat missing live p95 as **weight 0 / absent**. An unmeasured adapter must not rank as scored. Follow #1843 fabric door; no second scorer.

## What this claim ships

- Consumer: `presentVenueLatencyHealth` uses `routingWeightFromGrade` (Phase A IN).
- Letter-without-measurement (`isGraded` + `p95Ms: null`) → `hasScore: false`, `routingWeight: 0`, letter not published as a score.
- Never-run factory adapter → weight 0.

## Out of scope

- No new venue. No invented latency. No second fabric.
- Dual-edit: #1841 svc-agents, #1848/#1851/#1853 svc-pay, #1854 svc-academy, #1855 svc-ws, ops.compliance.
- Tracker stays `ready`.
