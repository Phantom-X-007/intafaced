# svc-quant — sandboxed strategy runtime (§29)

Runs user TypeScript/JavaScript and Python against an internal paper book. It
is **not** a second money book: fills never post to the ledger.

User code never sees Node, `fetch`, or raw sockets. Market data and orders go
through the runtime API only. If the isolate cannot boot, the procedure refuses
`quant.sandbox_unwired` rather than inventing PnL.

## API

| Procedure              | Access                                        | Input                                              | Output                                            |
| ---------------------- | --------------------------------------------- | -------------------------------------------------- | ------------------------------------------------- |
| `health`               | public                                        | —                                                  | `{ ok, service }` — liveness, not a custody claim |
| `studio.save`          | `publicJurisdictionProcedure('quant','fiat')` | `{ name, blocks, risk, cash }` — risk is mandatory | saved strategy, compiled source (no return)       |
| `studio.list`          | `publicJurisdictionProcedure('quant','fiat')` | —                                                  | saved strategies                                  |
| `backtest.run`         | `publicJurisdictionProcedure('quant','fiat')` | walk-forward + OOS + cost model                    | fill metrics (no invented return)                 |
| `sandbox.capabilities` | `publicJurisdictionProcedure('quant','fiat')` | —                                                  | sandbox isolate + Venue Vault (not the lake)      |
| `sandbox.run`          | `publicJurisdictionProcedure('quant','fiat')` | `{ language, source, cash }`                       | fills, cash, pnl (strings)                        |

HTTP: `GET /health` (process liveness) · `GET /ready` — process `ready: true`; isolate is **not** sold as `wired` when the lake is `missingLake()` (`lake: missing`, `refuse: quant.backtest_lake_missing`). Sandbox capabilities still name the VM separately.

## Events

**None.** This service publishes and consumes nothing.

## Ledger

This service holds no balances and posts no ledger transactions. The internal
book is paper: starting cash is a caller-supplied decimal string, marks are
fixture prices, PnL is computed from fills in that run.

## Kill-switch

`module.quant` at the edge (`/api/quant`). Flag `quant.sandbox` is rollout plan
only; the live halt is the edge kill.

## Residual

Venue Vault is trade-only when `QUANT_VENUE_VAULT` is set. Unset →
`quant.venue_vault_unset` on venue OMS calls. Internal book still runs. The
boot lake is `missingLake()` until a real fills port is injected.
