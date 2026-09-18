# P0 Sepolia STATUS (compact ledger)

**Plan:** [`P0-SEPOLIA-PLAN.md`](P0-SEPOLIA-PLAN.md)  
**Spec:** [`docs/PROTOCOL-P0-FULL-SPEC-2026-09-18.md`](../../PROTOCOL-P0-FULL-SPEC-2026-09-18.md)  
**Tip at open:** `640f3cf9f` (#4289 T1 on main)  
**Do not** recover from chat memory. Tick after squash-merge.

| Task                         | PR                                                            | State                                                                                           |
| ---------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| T1 venue 6-dec scale         | [#4289](https://github.com/Phantom-X-007/intafaced/pull/4289) | merged                                                                                          |
| T2 deploy-sepolia + registry | this PR                                                       | script + refuse tests; **no broadcast** — deployer key / Sepolia ETH / RPC unset in this runner |
| T3 explorer verify + labels  |                                                               | open                                                                                            |
| T4 indexer honesty           | this PR                                                       | code: DevVenue=fixture; operator-set non-dev=`sovereign-venue` live. Point env after broadcast. |
| T5 sepolia-journey           |                                                               | blocked on T2 + USDC faucet                                                                     |
| T6 lending refuse-closed     |                                                               | open (with T2)                                                                                  |
| T7 skip-honest named         |                                                               | open                                                                                            |

**Published addresses:** none yet.

**Skip-honest:** none recorded yet (fill from plan T7).

**Human blocker (one):** set `PROTOCOL_DEPLOYER_KEY` (32-byte hex, not in git) with Sepolia ETH, plus `PROTOCOL_RPC_URL`, then `pnpm --filter @intafaced/svc-protocol chain:deploy-sepolia`. This runner had those unset — live 84532 broadcast did not run.

**Ops leftovers (not code):** Circle USDC faucet · optional Pimlico key · WS RPC for indexer.

**Never:** Arc 5042 · INTACHAIN stamp · `audited:true` · IFC token · two writers in `svc-protocol`.
