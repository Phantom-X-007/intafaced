# Thrift hold — L3 free-TRK factory

**Updated:** 2026-08-07  
**Tip base:** #924 / 26f04441  
**Open partner:** #904 only (babysit — never dual-edit / never agent-merge)

## Rule

- Tip thrift is warn-only (never exit 1 on volume). Prefer one fat push per unit.
- **No workflow_dispatch** on branches that already have PR checks.
- Soft ≥120 / total_ref ≥220: ship **one fat** Class N PR only.
- Never `THRIFT_ALLOW` unless Nitro emergency.

## Wave 206–208 fat PR

One PR on `feat/l3-free-trk-wave206`:

- wave206 public-order-side-honesty (exchange-contract)
- wave207 public-liquidity-role-honesty (exchange-contract)
- wave208 rest-route-honesty (exchange-contract)

Class N pure catalogs + packs. No partner path intersect.
