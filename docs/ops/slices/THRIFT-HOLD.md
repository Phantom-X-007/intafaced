# Thrift hold — L3 free-TRK factory

**Updated:** 2026-08-07  
**Tip base:** #917 / d3f2a399  
**Open partner:** #904 only (babysit — never dual-edit / never agent-merge)

## Rule

- Tip thrift is warn-only (never exit 1 on volume). Prefer one fat push per unit.
- Soft ≥120 / total_ref ≥220: ship **one fat** Class N PR only.
- Never `THRIFT_ALLOW` unless Nitro emergency.
- Keep-alive loops may report stale tip — re-derive from `origin/main` every cycle.

## Wave 188–190 fat PR

One PR on `feat/l3-free-trk-wave188`:

- wave188 market-status-honesty (svc-trade)
- wave189 order-status-honesty (svc-trade)
- wave190 reconcile-action-honesty (svc-trade)

Class N pure catalogs + packs. No partner path intersect.
