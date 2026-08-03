# TRK-academy.ambassadors

**Title:** Residencies, IFC pay, revenue share  
**Tracker:** `academy.ambassadors` · phase 5 · plane F · status `ready` · owner none  
**Depends on:** `academy.lobbies` (done), `token.staking` (done)  
**Tip freeze:** `origin/main` @ `b3d08931` (re-derive before implement)

## DoD (plain language)

Named **residencies** (ambassador programs) can host lobbies under clear terms;
**per-session IFC pay** and **sub revenue share** settle through **ledger
recipes** (not academy-held balances). Displayed ambassador rank/status is
honest. Until recipes exist, no green “paid” UI. Non-pay residency roster
alone is not the full title — product may split rows later.

## Path on tip

| Area          | Location                                                                         |
| ------------- | -------------------------------------------------------------------------------- |
| Service       | `services/svc-academy/` — **custodial: false**, no `LEDGER_URL`                  |
| Hosting today | Rank perk `lobbyHostRights` via svc-identity — operators/ambassadors host        |
| Stake gate    | Staked rooms use `min_stake` threshold vs svc-token `stakeOf`                    |
| Explicit gap  | README: ambassador residencies + per-session IFC pay = **money**; recipes absent |
| Doctrine §8.3 | “per-session IFC pay + sub revenue share (ledger recipes)”                       |

**Tip residual:** lobby hosting + stake gates ship; **pay and revenue share do
not**. Any stub that credits IFC inside academy would violate §0.6.

## Blocked by

| Blocker         | Notes                                                                 |
| --------------- | --------------------------------------------------------------------- |
| **Money spine** | Ledger recipes for session pay + sub share — Class M when implemented |
| Product law     | Residency contract shape, rates, who funds house vs sub — Denon/Nitro |
| Class X         | Production payout eligibility, tax/jurisdiction if real compensation  |
| Not blocked     | Hosting perk, rooms, sessions for non-pay residency **ops** slice     |

**Do not invent money.** Research only until recipe + LEDGER_URL PR is explicit.

## First PR size (if free)

**XS–S (non-money):** residency / ambassador **roster + room linkage** (metadata
only, no pay) if product wants that split. **M+ Class M (money):**
`packages/ledger-client` recipes first, then academy job that **commands**
settle (never holds balance), dual-book tests, freeze-safe. Prefer two PRs:
recipes/contracts → academy caller. Skip green “paid” badges until ledger posts
succeed.
