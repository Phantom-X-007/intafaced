# TRK-launch.token-factory — research / spec pack

**Tracker id:** `launch.token-factory`  
**Title:** ERC-20 deploy from audited templates  
**Module / phase:** `launch` · phase 5  
**Status on tip:** `ready` · **owner:** none  
**Depends on:** _(none)_  
**Tip freeze:** `origin/main` @ `c6d9e89e` (re-derive before implement)  
**Pack type:** research only — no implement swarm; no money invention; no dual-edit of Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

1. Creators deploy ERC-20 from **audited** templates (title requires audit).
2. Platform builds **unsigned calldata** only — no key; creator signs.
3. Dev-chain proof ≠ mainnet audit `done`.

## 2 · Current code state (tip `c6d9e89e`)

| Area      | Reality                                                   |
| --------- | --------------------------------------------------------- |
| Contracts | `contracts/launch/SovereignToken.sol`, `TokenFactory.sol` |
| TS        | `src/launch/*` params/address/build + on-chain tests      |
| Custody   | No key; custody-scan posture                              |
| Audit     | **Nothing audited** — correctly not tracker `done`        |
| Fees      | Not payable factory; fee = fiat recipe if any             |

## 3 · Doctrine constraints

| Law                  | Implication                                      |
| -------------------- | ------------------------------------------------ |
| Non-custodial launch | Unsigned call only                               |
| Audit honesty        | `audited:false` until real audit                 |
| Ownership            | Protocol lane may be Shehzad — babysit implement |

## 4 · DoD sketch

- [ ] External audit artifacts
- [ ] Deploy/chain decision
- [ ] Honest `launch.status` audited flag
- [ ] UX for build+sign

## 5 · Open questions

1. Audit firm/budget.
2. Template variants beyond fixed-supply.

## 6 · Estimated size

Code residual small; audit + chain decision dominate.

## 7 · Related

- `services/svc-protocol/src/launch/*`
- Tracker long note; Shehzad board

## 8 · Non-goals

- No claiming audited without report.
- No platform-originated mint.
