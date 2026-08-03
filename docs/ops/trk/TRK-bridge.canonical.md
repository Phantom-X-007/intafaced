# TRK-bridge.canonical — research / spec pack

**Tracker id:** `bridge.canonical`  
**Title:** Canonical IFC bridge + attestations  
**Module / phase:** `bridge` · phase 4P  
**Status on tip:** `ready` · **owner:** none  
**Depends on:** `chain.mainnet` · `token.emissions`  
**Tip freeze:** `origin/main` @ `c6d9e89e` (re-derive before implement)  
**Pack type:** research only — no implement swarm; no money invention; no dual-edit of Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

Canonical IFC bridge + attestations — Bridge is extreme risk — audits + counsel + Class X.

## 2 · Current code state (tip `c6d9e89e`)

| Area                     | Reality                                                       |
| ------------------------ | ------------------------------------------------------------- |
| INTACHAIN / CometBFT app | **Not** a shipped production L1 in this monorepo              |
| Related                  | Protocol/matching/indexer against EVM dev/external chains     |
| Ownership                | Blockchain hard mountains — **Shehzad babysit** for implement |

## 3 · Doctrine constraints

| Law            | Implication                          |
| -------------- | ------------------------------------ |
| Chain decision | Not agent Class N “chain live” merge |
| Bridge         | Attestations/custody extreme risk    |
| Dependencies   | Honest sequencing only               |

## 4 · DoD sketch

- [ ] Cite Denon/Shehzad chain law docs
- [ ] Milestone plan (testnet → validators → governance → bridge)
- [ ] No fake mainnet claims

## 5 · Open questions

1. Timeline vs EVM-only interim.
2. Who operates validators.

## 6 · Estimated size

**Multi-quarter program.** Agent first deliverable: this research.

## 7 · Related

- `docs/SHEHZAD-BLOCKCHAIN-TASK-BOARD-2026-08-03.md`
- protocol / matching / token trackers

## 8 · Non-goals

- No Shehzad implement.
- No invented chain params.
