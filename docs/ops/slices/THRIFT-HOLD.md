# Thrift hold — L3 free-TRK factory

**Updated:** 2026-08-07  
**Tip base:** #921 / dcee4ed4  
**Open partner:** #904 only (babysit — never dual-edit / never agent-merge)

## Rule

- Tip thrift is warn-only (never exit 1 on volume). Prefer one fat push per unit.
- Soft ≥120 / total_ref ≥220: ship **one fat** Class N PR only.
- Never `THRIFT_ALLOW` unless Nitro emergency.
- Night-engine / keep-alive often report **stale tip + false HARD thrift** — re-derive `origin/main` every cycle.
- Tests flake (postgres serialization) → re-run failed jobs; do not invent product code.

## Wave 200–202 fat PR

One PR on `feat/l3-free-trk-wave200`:

- wave200 public-order-status-honesty (exchange-contract)
- wave201 option-type-honesty (exchange-contract)
- wave202 ws-channel-honesty (exchange-contract)

Class N pure catalogs + packs. No partner path intersect.
