# Claim ops.portfolio

**status:** claimed
**owner:** ZenYoda3
**started:** 2026-08-16
**branch:** feat/ops-portfolio-ledger-view
**title:** Portfolio Stage-1 — custodial ledger view, indexer named-absent
**slice:** Stage-1

Custodial holdings as a read view of existing `ledger.balances`. Indexer half is `{ status: 'absent', reason: 'indexer.readmodels_unbuilt' }`. No second money book. No post. No compose restamp. No promise-falsify door hunt.

Consumer: `services/svc-ledger` (`createLedgerRouter` `portfolio` procedure + `POST /trpc/portfolio` S2S). View lives in `packages/portfolio-view`.
