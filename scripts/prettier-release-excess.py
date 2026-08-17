"""Wrap the overlong releaseExcess BankError for prettier printWidth 140."""
from pathlib import Path

LOAN = Path('services/svc-bank/src/loans/loan-service.ts')
OLD = '''      throw new BankError(
        `Release would put loan ${loan.id} at LTV ${describeLtv(afterLtv)} above the ${describeLtv(product.maxLtvBps)} limit for "${product.name}"`,
        'bank.ltv_exceeded',
      );
'''
NEW = '''      throw new BankError(
        `Release would put loan ${loan.id} at LTV ${describeLtv(afterLtv)} ` +
          `above the ${describeLtv(product.maxLtvBps)} limit for "${product.name}"`,
        'bank.ltv_exceeded',
      );
'''
src = LOAN.read_text()
if NEW in src:
    print('already wrapped')
elif OLD not in src:
    raise SystemExit('ltv BankError anchor missing')
else:
    LOAN.write_text(src.replace(OLD, NEW, 1))
    print('wrapped ltv BankError')
