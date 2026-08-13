# Ledger recipe matrix

**55 pure recipes.** Every value path in the OS is a function here. Services call `ledger.post(recipes.<name>(…))` — never assemble entries by hand.

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
| `businessApprovalHold`         | `bank`     | `bank.business.approval.held`                                    |
| `businessApprovalRelease`      | `bank`     | `bank.business.approval.released`                                |
| `businessApprovalSettle`       | `bank`     | `bank.business.approval.settled`                                 |
| `subAccountTransfer`           | `identity` | `identity.sub_account.transfer`                                  |
| `marketPurchase`               | `market`   | `market.purchase`                                                |
| `marketListingFee`             | `market`   | `market.listing_fee`                                             |
| `marketPremiumPlacement`       | `market`   | `market.premium_placement`                                       |

## Source files

| File                          | Owns                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| `src/recipes/index.ts`        | core trade / pay / token / futures / escrow / stake + registry                              |
| `src/recipes/bank.ts`         | transfer + earn + business dual-control holds                                               |
| `src/recipes/loans.ts`        | collateral / draw / repay / liquidate / bad debt / reserve                                  |
| `src/recipes/chargeback.ts`   | chargeback open / shortfall / won / recovered (owner sign-off banner; not wired to svc-pay) |
| `src/recipes/sub-accounts.ts` | only legal cross-partition transfer                                                         |
| `src/recipes/market.ts`       | purchase + house commission (live); listing fee + premium placement (§13 unwired)           |

## Sealed notes

- **Chargeback** recipes ship with an owner-sign-off banner and are deliberately unwired from svc-pay (L04 residual).
- **Market listing / premium fees** are §13 unwired (D26-P1-M2): recipes exist so the vendor lifecycle can book owner-published fees without inventing magnitudes; no svc-market writer yet (VendorService moves no value; commerce wire is M1).
- **Market purchase** (`marketPurchase`) is live via svc-market commerce — commission bps still owner-gated upstream.
- Conformance + MemoryLedger prove sum-to-zero; Postgres proves CHECK constraints.
- **D26-P2-11 live-path closure:** every registry key is `live` (production caller) or explicit §13 socket — machine inventory in `src/recipes/live-path-inventory.ts` (executed by `live-path-inventory.test.ts`). Do not invent recipes to close a path; socket it.
