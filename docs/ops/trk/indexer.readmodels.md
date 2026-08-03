# TRK-indexer.readmodels

**Title:** Chain → Postgres read models  
**Tracker:** `indexer.readmodels` · phase 3P · plane P · status `ready` · owner none  
**Depends on:** `protocol.smart-accounts` · **requires:** `services/svc-indexer`

## DoD (plain language)

On-chain venue state is projected into **permissionless** Postgres read models
(books, fills, positions) with reorg safety, honest staleness, and decimal-string
money. Clients can trust `behindBy` / halt behaviour. Projection does not hold
custody or invent marks.

## Path on tip

| Area                         | Location                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------- |
| Service (largely done)       | `services/svc-indexer` — schema-per-service projections, tRPC, edge           |
| EVM RPC socket               | **Closed** — real `eth_getLogs` / reorg live tests on anvil                   |
| Residual                     | **`socket.clob-contracts`** — ABI events only on `contracts/dev/DevVenue.sol` |
| Deploy                       | `INDEXER_VENUE_ADDRESS` zero refuses construct; compose default no chain      |
| Not residual of this service | Audited venue + matching on chain = contracts / protocol ownership            |

Tracker note (long) matches tip: indexer craft is deep; **done** blocked on real
venue contracts, not more projection code.

## Blocked by

| Blocker              | Notes                                                          |
| -------------------- | -------------------------------------------------------------- |
| Protocol / contracts | Audited CLOB venue events — Shehzad / Denon protocol direction |
| Ops                  | Honest default venue address + RPC in non-dev envs             |
| Product              | Whether Protocol Plane is day-one for a given region           |

Do **not** mark `done` because tests pass against DevVenue alone.

## First PR size (if free)

**None for indexer craft** until `socket.clob-contracts` has an owner path —
or **S docs/ops:** residual register honesty if note drifts. If protocol ships
venue ABI: **S** swap ABI + fixture address + reorg tests against that bytecode.
Agents babysit protocol lanes; do not invent chain product law here.
