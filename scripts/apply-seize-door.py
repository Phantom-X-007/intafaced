"""Insert LoanService.seize and ops.seizeLoan. Self-deleting one-shot."""
from pathlib import Path

LOAN = Path('services/svc-bank/src/loans/loan-service.ts')
ROUTER = Path('services/svc-bank/src/router.ts')

SEIZE = r'''  /**
   * SEIZE one underwater loan through ledger-client.
   *
   * Marks first. A missing mark refuses `bank.mark_missing` before any post —
   * a zero default would read as no collateral and liquidate. The split is
   * computed from outstanding and the mark; the caller cannot nominate a rate.
   *
   * Not a user door. Operator surface (`ops.seizeLoan`) so the borrower cannot
   * choose the instant their own collateral is marked.
   */
  async seize(input: { loanId: string; now?: Date }): Promise<{
    ledgerTxId: string;
    collateralSold: Amount;
    proceeds: Amount;
    principalRepaid: Amount;
    interestRepaid: Amount;
    closed: boolean;
  }> {
    if (this.options.moduleEnabled === false) {
      throw new BankError('Loans module is disabled (BANK_LOANS_ENABLED / bank.loans)', 'bank.loans_disabled');
    }
    const now = input.now ?? new Date();
    const loan = await this.loan(input.loanId);

    if (loan.status === 'repaid' || loan.status === 'liquidated') {
      throw new BankError(`Loan ${loan.id} is ${loan.status}`, 'bank.loan_closed');
    }
    if (loan.status === 'pending') {
      throw new BankError(`Loan ${loan.id} has no drawn principal to seize`, 'bank.loan_not_drawable');
    }

    const product = await this.product(loan.productId);
    const marks = await this.marksFor(loan.collateralAssetId, loan.debtAssetId, loan.quoteAssetId, now);
    const collateralMark = marks.get(loan.collateralAssetId)!;
    const debtMark = marks.get(loan.debtAssetId)!;

    const debt = await this.outstanding(loan.id);
    const collateral = await this.collateralOf(loan);

    if (debt.total <= 0n) {
      throw new BankError(`Loan ${loan.id} has nothing outstanding — release its collateral instead`, 'bank.loan_closed');
    }

    const rung = planLiquidation({
      debt: debt.total,
      debtMark,
      collateral,
      collateralMark,
      policy: product.policy,
      marginCalledAt: loan.marginCalledAt,
      now,
    });

    if (rung.action !== 'liquidate') {
      throw new BankError(
        `Loan ${loan.id} is not seizable at this mark (LTV ${rung.ltvBps} bps)`,
        'bank.margin_call_required',
      );
    }

    assertAcceptableForLiquidation(collateralMark, loan.lastMarkPrice, now, this.markPolicy);

    await this.liquidateTranche({
      loan,
      product,
      ltv: rung.ltvBps,
      graceWaived: rung.graceWaived,
      collateralToSell: rung.collateralToSell,
      closesPosition: rung.closesPosition,
      collateralMark,
      debt,
      now,
    });

    const rows = await this.sql<
      Array<{
        ledger_tx_id: string | null;
        collateral_sold: string;
        proceeds: string;
        principal_repaid: string;
        interest_repaid: string;
      }>
    >`
      SELECT ledger_tx_id, collateral_sold, proceeds, principal_repaid, interest_repaid
        FROM bank.loan_liquidations
       WHERE loan_id = ${loan.id} AND status = 'settled'
       ORDER BY tranche DESC
       LIMIT 1
    `;
    const row = rows[0];
    if (!row?.ledger_tx_id) {
      throw new BankError(`Loan ${loan.id} seize posted no liquidation`, 'bank.no_liquidation_counterparty');
    }
    const closed = (await this.loan(loan.id)).status === 'liquidated';
    return {
      ledgerTxId: row.ledger_tx_id,
      collateralSold: parseAmount(row.collateral_sold),
      proceeds: parseAmount(row.proceeds),
      principalRepaid: parseAmount(row.principal_repaid),
      interestRepaid: parseAmount(row.interest_repaid),
      closed,
    };
  }

'''

DOOR = r'''    /**
     * Seize one underwater loan through ledger-client. Marks first — a missing
     * mark refuses `bank.mark_missing` before any post. Same kill as the sweep.
     */
    seizeLoan: scopedProcedure('admin:treasury')
      .input(z.object({ loanId: z.string().uuid() }))
      .output(
        z.object({
          ledgerTxId: z.string(),
          collateralSold: amountString,
          proceeds: amountString,
          principalRepaid: amountString,
          interestRepaid: amountString,
          closed: z.boolean(),
        }),
      )
      .mutation(async ({ input }) =>
        guard(async () => {
          if (!loanRiskSweepEnabled) {
            throw new BankError('loan risk sweep is disabled', 'bank.loan_risk_sweep_disabled');
          }
          const result = await bank.loans.seize({ loanId: input.loanId });
          return {
            ledgerTxId: result.ledgerTxId,
            collateralSold: formatAmount(result.collateralSold),
            proceeds: formatAmount(result.proceeds),
            principalRepaid: formatAmount(result.principalRepaid),
            interestRepaid: formatAmount(result.interestRepaid),
            closed: result.closed,
          };
        }),
      ),

'''

LOAN_ANCHOR = """  /**
   * Release collateral on a loan that owes nothing.
   *
   * Separate from `repay` because a loan can reach zero debt by liquidation too,
"""

ROUTER_ANCHOR = """    /** Re-drive loans stuck between the collateral lock and the draw. */
    resumePendingLoans: scopedProcedure('admin:treasury')
"""

loan = LOAN.read_text()
if 'async seize(input:' not in loan:
    if LOAN_ANCHOR not in loan:
        raise SystemExit('loan-service anchor missing')
    LOAN.write_text(loan.replace(LOAN_ANCHOR, SEIZE + LOAN_ANCHOR, 1))
    print('patched loan-service')
else:
    print('loan-service already has seize')

router = ROUTER.read_text()
if 'seizeLoan: scopedProcedure' not in router:
    if ROUTER_ANCHOR not in router:
        raise SystemExit('router anchor missing')
    ROUTER.write_text(router.replace(ROUTER_ANCHOR, DOOR + ROUTER_ANCHOR, 1))
    print('patched router')
else:
    print('router already has seizeLoan')
