# P0 Sepolia STATUS (compact ledger)

**Plan:** [`P0-SEPOLIA-PLAN.md`](P0-SEPOLIA-PLAN.md)  
**Spec:** [`docs/PROTOCOL-P0-FULL-SPEC-2026-09-18.md`](../../PROTOCOL-P0-FULL-SPEC-2026-09-18.md)  
**Tip at open:** `9aabf7c5f`  
**Do not** recover from chat memory. Tick after squash-merge.

| Task                         | PR  | State                       |
| ---------------------------- | --- | --------------------------- |
| T1 venue 6-dec scale         |     | open                        |
| T2 deploy-sepolia + registry |     | open                        |
| T3 explorer verify + labels  |     | open                        |
| T4 indexer honesty           |     | blocked on T2 address       |
| T5 sepolia-journey           |     | blocked on T2 + USDC faucet |
| T6 lending refuse-closed     |     | open (with T2)              |
| T7 skip-honest named         |     | open                        |

**Published addresses:** none yet.

**Skip-honest:** none recorded yet (fill from plan T7).

**Ops leftovers (not code):** Sepolia ETH on deployer · Circle USDC faucet · optional Pimlico key · WS RPC for indexer.

**Never:** Arc 5042 · INTACHAIN stamp · `audited:true` · IFC token · two writers in `svc-protocol`.
