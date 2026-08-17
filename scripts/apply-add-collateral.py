"""Require a mark before addCollateral posts. Self-deleting one-shot."""
from pathlib import Path

LOAN = Path('services/svc-bank/src/loans/loan-service.ts')
TEST = Path('services/svc-bank/src/loans/loans.test.ts')

OLD = '''  /**
   * Add collateral to a live loan.
   *
   * The best outcome available to everyone when a loan is in margin call, and the
   * reason `loan_collateral_events` is keyed on (loan, sequence) rather than the
   * loan alone. Clearing the call is left to the next mark rather than done here:
   * curing is a question about a price, and this method does not have one.
   */
  async addCollateral(input: { loanId: string; amount: Amount }): Promise<{ ledgerTxId: string; sequence: number }> {
    const loan = await this.loan(input.loanId);
    if (loan.status === 'repaid' || loan.status === 'liquidated') {
      throw new BankError(`Loan ${loan.id} is ${loan.status}`, 'bank.loan_closed');
    }
    if (input.amount <= 0n) throw new BankError('Collateral top-up must be positive', 'bank.below_minimum');

    const sequence = await this.nextCollateralSequence(loan.id);
    const txId = await this.lockCollateral(loan, input.amount, sequence);
    return { ledgerTxId: txId, sequence };
  }
'''

NEW = '''  /**
   * Add collateral to a live loan through ledger-client.
   *
   * Marks first. A missing mark refuses `bank.mark_missing` before any lock —
   * topping up a book nobody priced is the same lie as originating on a default.
   * Curing a margin call is still the next mark's job; this method does not
   * invent an LTV or a rate.
   */
  async addCollateral(input: { loanId: string; amount: Amount; now?: Date }): Promise<{ ledgerTxId: string; sequence: number }> {
    const now = input.now ?? new Date();
    const loan = await this.loan(input.loanId);
    if (loan.status === 'repaid' || loan.status === 'liquidated') {
      throw new BankError(`Loan ${loan.id} is ${loan.status}`, 'bank.loan_closed');
    }
    if (input.amount <= 0n) throw new BankError('Collateral top-up must be positive', 'bank.below_minimum');

    await this.marksFor(loan.collateralAssetId, loan.debtAssetId, loan.quoteAssetId, now);

    const sequence = await this.nextCollateralSequence(loan.id);
    const txId = await this.lockCollateral(loan, input.amount, sequence);
    return { ledgerTxId: txId, sequence };
  }
'''

src = LOAN.read_text()
if 'await this.marksFor(loan.collateralAssetId, loan.debtAssetId, loan.quoteAssetId, now)' in src and 'async addCollateral' in src:
    print('addCollateral already asks for marks')
else:
    if OLD not in src:
        raise SystemExit('loan-service addCollateral anchor missing')
    LOAN.write_text(src.replace(OLD, NEW, 1))
    print('patched addCollateral')

ts = TEST.read_text()
old_call = "        await loans.addCollateral({ loanId: opened.loan.id, amount: amt('1') });"
new_call = "        await loans.addCollateral({ loanId: opened.loan.id, amount: amt('1'), now });"
if old_call in ts:
    TEST.write_text(ts.replace(old_call, new_call, 1))
    print('patched loans.test.ts now')
elif new_call in ts:
    print('loans.test.ts already passes now')
else:
    raise SystemExit('loans.test.ts addCollateral call missing')
