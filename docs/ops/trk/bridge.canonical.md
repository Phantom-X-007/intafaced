# TRK-bridge.canonical

**Title:** Canonical IFC bridge + attestations  
**Tracker:** `bridge.canonical` · module `bridge` · phase 4P · status `ready` · owner none  
**Depends on:** `chain.mainnet` · `token.emissions`  
**Tip freeze:** `origin/main` @ `04f9b1f2` (re-derive before implement)  
**Pack type:** thorough research upgrade (`docs/trk-research-pack-drain`) — no implement swarm; no money invention; no dual-edit Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

Canonical IFC bridge + attestations. Extreme risk — audits + counsel + Class X.

## 2 · Current code state (tip `04f9b1f2`)

| Area           | Reality                                                       |
| -------------- | ------------------------------------------------------------- |
| Bridge product | **Not** a shipped production bridge in monorepo               |
| Ownership      | Blockchain hard mountains — **Shehzad babysit** for implement |
| Related        | Protocol/token/chain sequencing                               |

## 3 · Doctrine constraints

| Law            | Implication                           |
| -------------- | ------------------------------------- |
| Chain decision | Not agent Class N “bridge live” merge |
| Bridge risk    | Attestations/custody extreme          |
| Dependencies   | Honest sequencing only                |

## 4 · DoD sketch (checkable — staged)

### DoD checks

- [ ] Cite Denon/Shehzad chain law docs
- [ ] Milestone plan after mainnet decision
- [ ] No fake mainnet/bridge claims

### Tracker `done` bar

Flip only when the title’s product promise is true in a real env — not when a stub route or empty skeleton merges.

## 5 · Open questions

1. Timeline vs EVM-only interim.
2. Who operates attestations.

## 6 · Estimated size

| Slice               | Size          |
| ------------------- | ------------- |
| This research       | **S**         |
| Full bridge program | multi-quarter |

## 7 · Related docs / code

- `docs/SHEHZAD-BLOCKCHAIN-TASK-BOARD-2026-08-03.md`
- token.emissions
- chain.mainnet

## 8 · Explicit non-goals for this pack

- No Shehzad implement.
- No invented bridge params.
