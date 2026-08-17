from pathlib import Path

p = Path('services/svc-bank/src/loans/loan-service.ts')
s = p.read_text()
old = """      throw new BankError(
        `Loan ${loan.id} is not seizable at this mark (LTV ${rung.ltvBps} bps)`,
        'bank.margin_call_required',
      );
"""
new = """      throw new BankError(`Loan ${loan.id} is not seizable at this mark (LTV ${rung.ltvBps} bps)`, 'bank.margin_call_required');
"""
if old not in s:
    raise SystemExit('prettier anchor missing')
p.write_text(s.replace(old, new, 1))
print('prettied seize throw')
