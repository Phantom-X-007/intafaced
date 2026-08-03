# TRK-ops.affiliates

**Title:** Multi-tier affiliate / IB trees, payout automation  
**Tracker:** `ops.affiliates` · phase 5 · plane F · status `ready` · owner none  
**Depends on:** `ledger.double-entry` (done)

## DoD (plain language)

An IB/affiliate tree can be configured multi-tier; referred volume accrues
**commission liability** honestly; payouts run as **ledger recipes** (house fee
share → affiliate available), never as balances inside an ops table. Trees and
rates are auditable. User-facing copy never names a third-party promo SaaS.

## Path on tip

| Area          | Location                                                                    |
| ------------- | --------------------------------------------------------------------------- |
| Doctrine      | §8.8 affiliate/IB trees + payout automation via ledger; home `svc-core-ops` |
| Service       | **None** — no affiliate schema or tRPC on tip                               |
| Vendor legacy | Invite/promotion controllers in vendored admin/ucenter — **not** monorepo   |
| Related law   | Volume fee rebate / copy leader pay = revenue share of **house fees**       |
| Money path    | Must use `packages/ledger-client` recipes; no ops-local balance             |

Vendored promotion UI is inventory only (`docs/VENDORED-OVERLAP-AUDIT.md`).
Port is a product decision, not a silent SQL lift.

## Blocked by

| Blocker           | Notes                                                                       |
| ----------------- | --------------------------------------------------------------------------- |
| Money Class M     | Payout automation is real value movement — recipes + failure tests required |
| Product law       | Tier graph, clawbacks, KYC gates for payout — Denon / counsel               |
| Greenfield        | No monorepo service yet                                                     |
| Shehzad collision | Do **not** invent under pay/bank; commission is house-fee share             |

## First PR size (if free)

**M — tree + accrual without auto-payout:** schema for affiliate nodes +
referral attribution + accrued commission **as decimal strings / ledger
intent**, admin read APIs, tests that forbid storing balances. Second PR:
`feeShare`/`affiliatePayout` recipe + idempotent settlement job. No “instant
withdraw” without bank/pay rails law. Class M self-audit before merge.

**Solid spec:** [TRK-ops.affiliates.md](./TRK-ops.affiliates.md)
