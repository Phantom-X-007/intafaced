# Claim quant.studio

**status:** claimed
**owner:** nitro-agent
**class:** N
**scope:** `packages/quant-studio-risk/**` + new `packages/contracts/src/quant-studio.ts` (mandatory §29 risk-block refusal). No studio SPA, no `svc-quant`, no `quant-honesty` dual-edit, no LIVE-LANES.
**branch:** feat/quant-studio-risk-blocks
**started:** 2026-08-16

## Done bar

- `assertRiskBlocks` refuses any missing `positionCap` / `stopPolicy` / `drawdownHalt` as `quant.risk_block_unset` (no invented default caps).
- `assembleStrategy` is pure: fails closed on that assert; envelope names `{ dataLake: 'absent' }`.
- Future-return keys are refused. No market data, no backtest numbers.
- Reachable via workspace export + `packages/contracts/src/quant-studio.ts`.

## Non-goals

- No-code builder UI (owner-gated).
- Whether Quant ships to users (owner-gated).
- Data lake, venues as empty books, `svc-quant`, dual-edit of `quant.backtest` honesty package.
