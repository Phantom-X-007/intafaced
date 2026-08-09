# Lane stop — L06 BANK wave 6 · 2026-08-09

**Tip at writing:** re-derive (`git fetch && git log -1 --oneline origin/main`).

---

## Operator block

```
LANE: L06 BANK wave 6
shipped: #1439 loan id same opening collateral + pending reconcile filter + independent reserve funding table (B-02) · #1442 blank ramp asset refuse before credit
in flight: #1439 · #1442 (CI runner queue at stop write — re-derive before close)
parked: earn day-boundary product law (Nitro) · fiat partner Class X · card issuer Class X · auto-invest/business rates §8 · commercial crypto ramp allowlist (product law; shape refuse only) · monorepo Tests may still red on sibling walls — bank does not dual-write
Nitro must decide: earn day-boundary (proration vs min full day) · fiat · issuer · ramp pair allowlist · or none
SAFE TO CLOSE: no until #1439 + #1442 green and merged (or parked with pick-up if CI blocked by non-bank monorepo red)
tip: re-derive
```

---

## Unit cards (this wave)

| Unit                            | Promise                      | Done bar                                              | Class | Result                                                             |
| ------------------------------- | ---------------------------- | ----------------------------------------------------- | ----- | ------------------------------------------------------------------ |
| A0 open bank PR babysit         | Wall clear                   | No open `svc-bank/**` path-intersect at start         | N     | **Done** — wall empty on orient                                    |
| A2 loan collateral term-compare | W5 residual / #1194 family   | Hostile coll swap refused; same terms idempotent      | M     | **#1439** `bank.loan_collateral_mismatch` + `opening_collateral`   |
| A1 reserve reconcile residual   | #1372 class + B-02           | Independent funded sum or honest refuse; RED on drift | M     | **#1439** `loan_reserve_fundings` + `independent:true` + drift RED |
| A1 pending outstanding filter   | Reconcile honesty            | Undrawn pending does not inflate outstanding          | N/P   | **#1439** `drawn_at IS NOT NULL`                                   |
| A1 crypto ramp residual         | Wrong/blank asset refuse     | Blank/whitespace refuse, zero row/credit              | M     | **#1442** `bank.ramp_invalid_asset`                                |
| A1 fiat ramp residual           | Fail-closed without partner  | Typed refuse, zero fake credit                        | M/X   | **Sealed re-verify** `bank.fiat_ramp_socket` (partner still **X**) |
| A2 spaces = ledger proofs       | No local balance truth       | Balance reads ledger-derived                          | M     | **Sealed re-verify** on tip                                        |
| A2 standing orders              | Lock + no double-fire        | Locked space cannot drain; pause present              | M     | **Sealed re-verify** `#1229` class + pause/resume on tip           |
| A2 cards residual               | Ledger half or honest socket | No invent issuer; session resume FORBIDDEN            | M/X   | **Sealed re-verify** (issuer still **X**)                          |
| A2 earn pool residual           | Recipes only                 | Day-boundary **park**                                 | M     | **Park** day-boundary for Nitro                                    |
| A3 auto-invest / business       | No invent §8                 | Park law-thin                                         | X/N   | **Parked**                                                         |
| A3 bank↔token earn              | No dual-write                | Purpose pots + native refuse on tip                   | M     | **Sealed re-verify**                                               |
| A3 Engine B chapter pass        | README vs code               | Chapters listed below                                 | N     | **This note**                                                      |

---

## Engine B — chapter pass (tip + PR intent)

| Chapter                     | Verdict                                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Where balance lives         | **HONEST** — ledger-only; schema guard                                                                               |
| Spaces                      | **HONEST** — labels + ledger balance                                                                                 |
| Transfers / standing orders | **HONEST** — lock gate on fire; pause/resume; kill-switch on ops + HTTP                                              |
| Earn                        | **HONEST** recipes; day-boundary still product-open (park)                                                           |
| Loans                       | **HONEST** full stack; term-compare now includes opening collateral (#1439); reconcile independent via funding table |
| Cards                       | **HONEST** ledger half + no-issuer refuse; live rail socket                                                          |
| Ramps                       | **HONEST** crypto ledger half + fiat socket; blank asset refuse (#1442); no commercial allowlist                     |
| Kill-switches               | Env job flags wired; FLAG_REGISTRY bank flags still NOT_ENFORCED (doc/ops note only)                                 |
| Token coordination          | Purpose-keyed pots; native refuse                                                                                    |

---

## Engine C attack surface (residual status)

| Attack                             | Status                                                            |
| ---------------------------------- | ----------------------------------------------------------------- |
| Local balance                      | Guarded                                                           |
| Hold leak (cards)                  | Prior seals; not regressed                                        |
| Ramp invent credit                 | Fiat refuse + blank asset refuse; session credit FORBIDDEN sealed |
| Double standing order              | Unique + ledger key                                               |
| Loan under-collateral via id reuse | **Fixed #1439**                                                   |
| Card without issuer                | Named refuse                                                      |
| Reconcile lie                      | **Fixed #1439** independent + drift                               |
| S2S replay                         | Body-bind client on tip                                           |
| Earn day double-pay                | Unique day key                                                    |
| Cross-user space/loan read         | Prior + borrower mismatch                                         |

---

## Sealed — do not re-ship (re-verified)

W5 SAFE parks: earn day-boundary law · fiat/issuer Class X · auto-invest law-only.  
Holds / pause / JIT / ramp session FORBIDDEN / locked standing order — still on tip.

---

## Next for a fresh agent

1. Merge #1439 and #1442 when Class matrix + CI allow (re-derive Tests job vs sibling monorepo red).
2. Earn day-boundary **only after Nitro product pick**.
3. Commercial ramp asset allowlist only with product law.
4. Do not invent fiat partner or card issuer.

**SAFE TO CLOSE:** **no** while #1439/#1442 unmerged — flip to **yes** after both land or are explicitly parked with pick-up links.
