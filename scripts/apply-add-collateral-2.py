"""Patch addCollateral only. Do not match seize's marksFor."""
from pathlib import Path

LOAN = Path('services/svc-bank/src/loans/loan-service.ts')

OLD = '''  async addCollateral(input: { loanId: string; amount: Amount }): Promise<{ ledgerTxId: string; sequence: number }> {
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

NEW = '''  async addCollateral(input: { loanId: string; amount: Amount; now?: Date }): Promise<{ ledgerTxId: string; sequence: number }> {
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
if 'async addCollateral(input: { loanId: string; amount: Amount; now?: Date })' in src:
    print('already patched')
elif OLD not in src:
    raise SystemExit('addCollateral method anchor missing')
else:
    LOAN.write_text(src.replace(OLD, NEW, 1))
    print('patched addCollateral')
