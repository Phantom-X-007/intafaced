# Ledger recipe matrix

**50 pure recipes.** Every value path in the OS is a function here. Services call `ledger.post(recipes.<name>(…))` — never assemble entries by hand.

Generated from `src/recipes/index.ts` registry. If this table and the registry disagree, the registry wins and this file is wrong.

| Recipe                         | Module     | Reason                                                           |
| ------------------------------ | ---------- | ---------------------------------------------------------------- |
| `deposit`                      | `ledger`   | `deposit.credited`                                               |
| `marketMakerSeedFund`          | `trade`    | `mm.seed.funded`                                                 |
| `withdrawHold`                 | `ledger`   | `withdraw.held`                                                  |
| `withdrawSettle`               | `ledger`   | `withdraw.settled`                                               |
| `withdrawReverse`              | `ledger`   | `withdraw.reversed`                                              |
| `tradeFill`                    | `trade`    | `trade.fill`                                                     |
| `orderHold`                    | `trade`    | `order.hold`                                                     |
| `orderHoldRelease`             | `trade`    | `order.hold.released`                                            |
| `marketMakerOrderHold`         | `trade`    | `order.hold.mm`                                                  |
| `marketMakerOrderHoldRelease`  | `trade`    | `order.hold.mm.released`                                         |
| `marketMakerMakerFill`         | `trade`    | `trade.fill.mm_maker`                                            |
| `futuresMarginLock`            | `trade`    | `futures.margin.lock`                                            |
| `futuresMarginAdd`             | `trade`    | `futures.margin.add`                                             |
| `futuresMarginRelease`         | `trade`    | `futures.margin.release`                                         |
| `futuresRealizeLoss`           | `trade`    | `futures.loss.realized`                                          |
| `futuresRealizeProfit`         | `trade`    | `futures.profit.realized`                                        |
| `futuresFundingPay`            | `trade`    | `futures.funding.paid`                                           |
| `futuresInsuranceTopup`        | `trade`    | `futures.insurance.topup`                                        |
| `escrowLock`                   | `p2p`      | `p2p.escrow.lock`                                                |
| `escrowRelease`                | `p2p`      | `p2p.escrow.release`                                             |
| `escrowRefund`                 | `p2p`      | `p2p.escrow.refund`                                              |
| `paymentCapture`               | `pay`      | `payment.captured`                                               |
| `merchantSettlement`           | `pay`      | `pay.settled`                                                    |
| `paymentRefund`                | `pay`      | `payment.refunded`                                               |
| `paymentRefundReverse`         | `pay`      | `payment.refund.reversed`                                        |
| `chargebackOpen`               | `pay`      | `pay.chargeback.opened`                                          |
| `chargebackShortfall`          | `pay`      | `pay.chargeback.shortfall.covered`                               |
| `chargebackWon`                | `pay`      | `pay.chargeback.won`                                             |
| `chargebackShortfallRecovered` | `pay`      | `pay.chargeback.shortfall.recovered`                             |
| `stake`                        | `token`    | `token.stake`                                                    |
| `unstake`                      | `token`    | `token.unstake`                                                  |
| `mintEmission`                 | `token`    | `token.emission`                                                 |
| `burn`                         | `token`    | `token.burn`                                                     |
| `feeCharge`                    | `token`    | `input.reason ?? 'fee.charged'`                                  |
| `sweepFeesToRewards`           | `token`    | `token.fee.swept`                                                |
| `rewardPay`                    | `token`    | `input.reason`                                                   |
| `loanCollateralLock`           | `bank`     | `loan.collateral.locked`                                         |
| `loanCollateralRelease`        | `bank`     | `loan.collateral.released`                                       |
| `loanDraw`                     | `bank`     | `loan.drawn`                                                     |
| `loanRepay`                    | `bank`     | `loan.repaid`                                                    |
| `loanLiquidate`                | `bank`     | `loan.liquidated`                                                |
| `loanBadDebt`                  | `bank`     | `loan.bad_debt.covered`                                          |
| `loanReserveFund`              | `bank`     | `loan.reserve.funded`                                            |
| `bankTransfer`                 | `bank`     | `scheduled → bank.transfer.scheduled; else bank.transfer.manual` |
| `earnDeposit`                  | `bank`     | `bank.earn.deposited`                                            |
| `earnWithdraw`                 | `bank`     | `bank.earn.withdrawn`                                            |
| `earnPoolFund`                 | `bank`     | `bank.earn.pool.funded`                                          |
| `earnInterest`                 | `bank`     | `bank.earn.interest`                                             |
| `subAccountTransfer`           | `identity` | `identity.sub_account.transfer`                                  |
| `marketPurchase`               | `market`   | `market.purchase`                                                |

## Source files

| File                          | Owns                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| `src/recipes/index.ts`        | core trade / pay / token / futures / escrow / stake + registry                              |
| `src/recipes/bank.ts`         | transfer + earn                                                                             |
| `src/recipes/loans.ts`        | collateral / draw / repay / liquidate / bad debt / reserve                                  |
| `src/recipes/chargeback.ts`   | chargeback open / shortfall / won / recovered (owner sign-off banner; not wired to svc-pay) |
| `src/recipes/sub-accounts.ts` | only legal cross-partition transfer                                                         |
| `src/recipes/market.ts`       | one-time listing purchase + house commission                                                |

## Sealed notes

- **Chargeback** recipes ship with an owner-sign-off banner and are deliberately unwired from svc-pay (L04 residual).
- **Market commerce** recipes (if any) are L07 wall — not dual-edited here.
- Conformance + MemoryLedger prove sum-to-zero; Postgres proves CHECK constraints.
