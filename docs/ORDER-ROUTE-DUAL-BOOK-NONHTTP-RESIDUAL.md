# Dual-book residual — non-HTTP setBalance (P2-4 residual)

**Brand-safe paths.** Controllers covered by DualBookMoneyDoorInterceptor are excluded.

| File                                                                                                                | Line | Snippet                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------- | ---: | -------------------------------------------------------------------------------------------------------------------- |
| \`vendor/<exchange>/00_framework/admin/src/main/java/com/<vendor>/<module>/event/OrderEvent.java\`                  |   49 | \`memberWallet1.setBalance(add(memberWallet1.getBalance(), amount1));\`                                              |
| \`vendor/<exchange>/00_framework/admin/src/main/java/com/<vendor>/<module>/event/OrderEvent.java\`                  |   62 | \`memberWallet2.setBalance(add(memberWallet2.getBalance(), amount2));\`                                              |
| \`vendor/<exchange>/00_framework/core/src/main/java/com/<vendor>/<module>/service/LegalWalletRechargeService.java\` |   71 | \`wallet.setBalance(BigDecimalUtils.add(wallet.getBalance(), legalWalletRecharge.getAmount()));//充值到账\`          |
| \`vendor/<exchange>/00_framework/core/src/main/java/com/<vendor>/<module>/service/LegalWalletWithdrawService.java\` |   50 | \`wallet.setBalance(BigDecimalUtils.sub(wallet.getBalance(), legalWalletWithdraw.getAmount()));\`                    |
| \`vendor/<exchange>/00_framework/core/src/main/java/com/<vendor>/<module>/service/LegalWalletWithdrawService.java\` |   51 | \`wallet.setFrozenBalance(BigDecimalUtils.add(wallet.getFrozenBalance(), legalWalletWithdraw.getAmount()));\`        |
| \`vendor/<exchange>/00_framework/core/src/main/java/com/<vendor>/<module>/service/LegalWalletWithdrawService.java\` |   58 | \`wallet.setFrozenBalance(BigDecimalUtils.sub(wallet.getFrozenBalance(), withdraw.getAmount()));//冻结金额减少\`     |
| \`vendor/<exchange>/00_framework/core/src/main/java/com/<vendor>/<module>/service/LegalWalletWithdrawService.java\` |   59 | \`wallet.setBalance(BigDecimalUtils.add(wallet.getBalance(), withdraw.getAmount()));//本金增加\`                     |
| \`vendor/<exchange>/00_framework/core/src/main/java/com/<vendor>/<module>/service/LegalWalletWithdrawService.java\` |   70 | \`wallet.setFrozenBalance(BigDecimalUtils.sub(wallet.getFrozenBalance(), withdraw.getAmount()));//钱包冻结金额减少\` |
| \`vendor/<exchange>/00_framework/core/src/main/java/com/<vendor>/<module>/service/MemberApplicationService.java\`   |  150 | \`memberWallet.setBalance(BigDecimalUtils.add(memberWallet.getBalance(), amount1));\`                                |
| \`vendor/<exchange>/00_framework/core/src/main/java/com/<vendor>/<module>/service/MemberApplicationService.java\`   |  193 | \`memberWallet1.setBalance(BigDecimalUtils.add(memberWallet1.getBalance(), amount1));\`                              |
| \`vendor/<exchange>/00_framework/core/src/main/java/com/<vendor>/<module>/service/MemberApplicationService.java\`   |  242 | \`memberWallet2.setBalance(BigDecimalUtils.add(memberWallet2.getBalance(), amount2));\`                              |
| \`vendor/<exchange>/00_framework/core/src/main/java/com/<vendor>/<module>/service/MemberService.java\`              |  192 | \`memberWallet.setBalance(BigDecimalUtils.add(memberWallet.getBalance(), sign.getAmount()));//签到收益\`             |
| \`vendor/<exchange>/00_framework/core/src/main/java/com/<vendor>/<module>/service/MemberTransactionService.java\`   |  198 | \`gccWallet.setBalance(gccWallet.getBalance().subtract(deltaAmount));\`                                              |
| \`vendor/<exchange>/00_framework/core/src/main/java/com/<vendor>/<module>/service/MemberTransactionService.java\`   |  199 | \`gcxWallet.setBalance(gcxWallet.getBalance().add(deltaAmount));\`                                                   |
| \`vendor/<exchange>/00_framework/core/src/main/java/com/<vendor>/<module>/service/MemberTransactionService.java\`   |  211 | \`gccWallet.setBalance(BigDecimal.ZERO);\`                                                                           |
| \`vendor/<exchange>/00_framework/core/src/main/java/com/<vendor>/<module>/service/WithdrawRecordService.java\`      |  137 | \`wallet.setBalance(wallet.getBalance().add(withdrawRecord.getTotalAmount()));\`                                     |
| \`vendor/<exchange>/00_framework/core/src/main/java/com/<vendor>/<module>/service/WithdrawRecordService.java\`      |  138 | \`wallet.setFrozenBalance(wallet.getFrozenBalance().subtract(withdrawRecord.getTotalAmount()));\`                    |
| \`vendor/<exchange>/00_framework/core/src/main/java/com/<vendor>/<module>/service/WithdrawRecordService.java\`      |  161 | \`wallet.setFrozenBalance(wallet.getFrozenBalance().subtract(record.getTotalAmount()));\`                            |
| \`vendor/<exchange>/00_framework/core/src/main/java/com/<vendor>/<module>/service/WithdrawRecordService.java\`      |  191 | \`wallet.setBalance(wallet.getBalance().add(record.getTotalAmount()));\`                                             |
| \`vendor/<exchange>/00_framework/core/src/main/java/com/<vendor>/<module>/service/WithdrawRecordService.java\`      |  192 | \`wallet.setFrozenBalance(wallet.getFrozenBalance().subtract(record.getTotalAmount()));\`                            |
| \`vendor/<exchange>/00_framework/otc-api/src/main/java/com/<vendor>/<module>/event/OrderEvent.java\`                |   56 | \`memberWallet1.setBalance(add(memberWallet1.getBalance(), amount1));\`                                              |
| \`vendor/<exchange>/00_framework/otc-api/src/main/java/com/<vendor>/<module>/event/OrderEvent.java\`                |   69 | \`memberWallet2.setBalance(add(memberWallet2.getBalance(), amount2));\`                                              |
| \`vendor/<exchange>/00_framework/wallet/src/main/java/com/<vendor>/<module>/consumer/MemberConsumer.java\`          |  149 | \`memberWallet.setBalance(BigDecimalUtils.add(memberWallet.getBalance(),amount3));\`                                 |

**Count:** 23 non-controller live setBalance/setFrozenBalance call sites.

**Next:** disable service callers / job entry points (same PEACE throw pattern) or scan-ban entity mutators after service throws.

Generated for order-route harden. Not go-live.
