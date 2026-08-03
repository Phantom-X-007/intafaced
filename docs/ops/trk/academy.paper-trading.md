# TRK-academy.paper-trading

**Title:** Paper-trading market flag for workbooks  
**Tracker:** `academy.paper-trading` · phase 5 · plane F · status `ready` · owner none  
**Depends on:** `trade.spot` (done)  
**Tip freeze:** `origin/main` @ `b3d08931` (re-derive before implement)

## DoD (plain language)

Workbooks (and any sim UI) can route orders to markets marked **paper /
simulated** so learners practice without touching real balances. Paper fills
never post real ledger money; UI always shows a clear paper badge. Flipping a
market to paper is an operator/config decision, not a silent client flag.

## Path on tip

| Area     | Location                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------- |
| Doctrine | §8.3: workbooks run against a **paper-trading market flag in svc-trade**                       |
| Trade    | `services/svc-trade` — `markets` lifecycle `pending/active/halted/delisted`; **no paper flag** |
| Academy  | `services/svc-academy` curriculum kinds include `workbook`; no trade link                      |
| Ledger   | Real spot path uses hold→fill; paper must **not** reuse real holds                             |

**Tip residual:** flag + enforcement + workbook binding. Spot engine is real;
paper is a product mode on top (or beside) it.

## Blocked by

| Blocker       | Notes                                                                             |
| ------------- | --------------------------------------------------------------------------------- |
| Product law   | Paper = separate venues/accounts vs same book with `paper=true` — **must decide** |
| Money honesty | Wrong design invents fake balances that look real — Class M review if any ledger  |
| Soft          | Full curriculum workbooks content (`academy.curriculum`) optional for flag itself |
| Not blocked   | Trade spot service exists; academy workbook kind exists in catalog enum           |

**Safe default if unstated:** paper markets use a **non-ledger sim book** (or
dedicated paper ledger space with zero withdrawal) — never mix with real
available balance without dual-book proof.

## First PR size (if free)

**S:** add explicit `paper` (or `mode`) on `trade.markets` + list/filter +
order path **refuses real ledger** when paper (or routes to sim matcher), tests
that paper order cannot debit real available. **XS follow-up:** academy workbook
metadata points at paper market ids. Do not claim done until a workbook path
cannot touch real money under test.
