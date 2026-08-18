# Claim connect.latency-grading (health consumer)

**status:** LIVE this session
**tracker:** `connect.latency-grading` (stays **ready** — SOR still the ranking consumer; thresholds unruled)
**branch:** `feat/connect-latency-health-surface`
**class:** N

svc-trade `GET /health` reads `latencyGrade()` on the configured public venue adapter. Ungraded stays `null`. Does not 503. No letter→bps invent.

## Leverage

Existing `MarketDataAdapter.latencyGrade` + `isGraded`. No second grader.

## Non-goals

- Dual-edit #1827 public-rest / exchange-contract
- `services/svc-execution` scaffold
- Retuning DEFAULT_THRESHOLDS
