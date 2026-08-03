# TRK-launch.meme-factory

**Title:** One-click meme launch + instant market + LP  
**Tracker:** `launch.meme-factory` · module `launch` · phase 5 · status `ready` · owner none  
**Depends on:** `launch.token-factory` · `protocol.amm`  
**Tip freeze:** `origin/main` @ `04f9b1f2` (re-derive before implement)  
**Pack type:** thorough research upgrade (`docs/trk-research-pack-drain`) — no implement swarm; no money invention; no dual-edit Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

One-click meme launch + instant market + LP. Depends token-factory + AMM. Protocol.amm may be hard lane.

## 2 · Current code state (tip `04f9b1f2`)

| Area               | Reality                                         |
| ------------------ | ----------------------------------------------- |
| Token factory base | Partial — see launch.token-factory tracker note |
| This surface       | **Not complete** as titled                      |
| Protocol deps      | AMM may be human hard lane                      |

## 3 · Doctrine constraints

| Law                   | Implication                                |
| --------------------- | ------------------------------------------ |
| No invent money/depth | Custody model must be explicit             |
| Audits                | Honest risk copy                           |
| Ownership             | Protocol implement often Shehzad — babysit |

## 4 · DoD sketch (checkable — staged)

### DoD checks

- [ ] ADR: custody, fee, LP ownership
- [ ] Contracts + tests on dev chain
- [ ] Audit if user funds at risk
- [ ] UI after refuse paths solid

### Tracker `done` bar

Flip only when the title’s product promise is true in a real env — not when a stub route or empty skeleton merges.

## 5 · Open questions

1. LP ownership / rug disclosure.
2. AMM readiness ownership.

## 6 · Estimated size

| Slice          | Size     |
| -------------- | -------- |
| ADR + refusals | **S–M**  |
| Full product   | **L–XL** |

## 7 · Related docs / code

- launch.token-factory
- protocol.amm
- Shehzad boards

## 8 · Explicit non-goals for this pack

- No Shehzad implement from this pack.
- No unaudited “safe” marketing.
