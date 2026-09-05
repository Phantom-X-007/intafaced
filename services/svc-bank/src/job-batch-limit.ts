import { BankError, type BankErrorCode } from './errors.js';

const RESUME_MAX = 1_000;
const ACCRUE_MAX = 10_000;

function assertJobBatchLimit(limit: number | undefined, unsetCode: BankErrorCode, invented: number, max: number, name: string): number {
  if (limit === undefined || typeof limit !== 'number' || !Number.isFinite(limit)) {
    throw new BankError(
      `${name} batch size is unset. Blank refuses — never ${invented}. Pass a positive integer (${invented} is allowed if explicit).`,
      unsetCode,
    );
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > max) {
    throw new BankError(`limit must be an integer 1..${max}, got ${limit}`, 'bank.validation_failed');
  }
  return limit;
}

/** earn.resumePending worker batch. Omit used to invent 100. */
export function assertEarnResumePendingLimit(limit: number | undefined): number {
  return assertJobBatchLimit(limit, 'bank.earn_resume_pending_limit_unset', 100, RESUME_MAX, 'earn.resumePending');
}

/** loans.resumePending worker batch. Omit used to invent 100. */
export function assertLoanResumePendingLimit(limit: number | undefined): number {
  return assertJobBatchLimit(limit, 'bank.loan_resume_pending_limit_unset', 100, RESUME_MAX, 'loans.resumePending');
}

/** loans.accrueAll worker batch. Omit used to invent 1000. */
export function assertLoanAccrueBatchLimit(limit: number | undefined): number {
  return assertJobBatchLimit(limit, 'bank.loan_accrue_batch_limit_unset', 1_000, ACCRUE_MAX, 'loans.accrueAll');
}
