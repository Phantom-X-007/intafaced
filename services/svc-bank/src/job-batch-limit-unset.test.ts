import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BankError } from './errors.js';
import { assertEarnResumePendingLimit, assertLoanAccrueBatchLimit, assertLoanResumePendingLimit } from './job-batch-limit.js';

/**
 * Job batch size is refuse-closed when unset.
 *
 * Omit used to invent 100 (resumePending) / 1000 (loans.accrueAll).
 * Blank must refuse. Owner/cron may pass 100 / 1000 explicitly.
 *
 * Not milled: runRiskSweep ?? 500 (env LOAN_SWEEP_BATCH_SIZE), earn.accrueAll
 * (no invented row cap), Number() bps, card-sim.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function refuseBank(fn: (n: number | undefined) => number, code: string, invented: number) {
  expect(() => fn(undefined)).toThrow(BankError);
  expect(() => fn(Number.NaN)).toThrow(BankError);
  expect(() => fn(0)).toThrow(BankError);
  try {
    fn(undefined);
    throw new Error('expected refuse');
  } catch (e) {
    expect(e).toBeInstanceOf(BankError);
    expect((e as BankError).code).toBe(code);
    expect((e as BankError).message).not.toMatch(new RegExp(`default ${invented}|${invented}-row`, 'i'));
  }
}

describe('svc-bank resumePending/accrueAll limit unset refuse', () => {
  it('earn.resumePending refuses blank / NaN — never invent 100; owner may pass 100', () => {
    refuseBank(assertEarnResumePendingLimit, 'bank.earn_resume_pending_limit_unset', 100);
    expect(assertEarnResumePendingLimit(100)).toBe(100);
    expect(assertEarnResumePendingLimit(1)).toBe(1);
    expect(assertEarnResumePendingLimit(1_000)).toBe(1_000);
    expect(() => assertEarnResumePendingLimit(0)).toThrow(BankError);
    expect(() => assertEarnResumePendingLimit(1_001)).toThrow(BankError);
    try {
      assertEarnResumePendingLimit(1_001);
      throw new Error('expected refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(BankError);
      expect((e as BankError).code).toBe('bank.validation_failed');
    }
  });

  it('loans.resumePending refuses blank / NaN — never invent 100; owner may pass 100', () => {
    refuseBank(assertLoanResumePendingLimit, 'bank.loan_resume_pending_limit_unset', 100);
    expect(assertLoanResumePendingLimit(100)).toBe(100);
    expect(assertLoanResumePendingLimit(1)).toBe(1);
    expect(assertLoanResumePendingLimit(1_000)).toBe(1_000);
    try {
      assertLoanResumePendingLimit(10_000);
      throw new Error('expected refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(BankError);
      expect((e as BankError).code).toBe('bank.validation_failed');
    }
  });

  it('loans.accrueAll refuses blank / NaN — never invent 1000; owner may pass 1000', () => {
    refuseBank(assertLoanAccrueBatchLimit, 'bank.loan_accrue_batch_limit_unset', 1_000);
    expect(assertLoanAccrueBatchLimit(1_000)).toBe(1_000);
    expect(assertLoanAccrueBatchLimit(1)).toBe(1);
    expect(assertLoanAccrueBatchLimit(10_000)).toBe(10_000);
    expect(() => assertLoanAccrueBatchLimit(0)).toThrow(BankError);
    try {
      assertLoanAccrueBatchLimit(10_001);
      throw new Error('expected refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(BankError);
      expect((e as BankError).code).toBe('bank.validation_failed');
    }
  });

  it('services no longer default resumePending/accrueAll batch to 100/1000', () => {
    const earn = readFileSync(join(ROOT, 'services/svc-bank/src/earn/earn-service.ts'), 'utf8');
    const earnResume = earn.slice(earn.indexOf('async resumePending('), earn.indexOf('async position('));
    expect(earnResume).toContain('assertEarnResumePendingLimit');
    expect(earnResume).not.toMatch(/limit = 100/);
    expect(earnResume).not.toMatch(/\?\? 100/);

    const loans = readFileSync(join(ROOT, 'services/svc-bank/src/loans/loan-service.ts'), 'utf8');
    const loanResume = loans.slice(loans.indexOf('async resumePending('), loans.indexOf('async abandonPending('));
    expect(loanResume).toContain('assertLoanResumePendingLimit');
    expect(loanResume).not.toMatch(/limit = 100/);
    expect(loanResume).not.toMatch(/\?\? 100/);

    const loanAccrue = loans.slice(loans.indexOf('async accrueAll('), loans.indexOf('async repay('));
    expect(loanAccrue).toContain('assertLoanAccrueBatchLimit');
    expect(loanAccrue).not.toMatch(/limit = 1_000/);
    expect(loanAccrue).not.toMatch(/limit = 1000/);
    expect(loanAccrue).not.toMatch(/\?\? 1_000/);
    expect(loanAccrue).not.toMatch(/\?\? 1000/);
  });

  it('HTTP jobs require body.limit — omit does not invent 100/1000', () => {
    const index = readFileSync(join(ROOT, 'services/svc-bank/src/index.ts'), 'utf8');
    const resumeLoans = index.slice(
      index.indexOf("app.post('/internal/jobs/resume-pending-loans'"),
      index.indexOf("app.post('/internal/jobs/resume-pending-earn'"),
    );
    expect(resumeLoans).toContain('assertLoanResumePendingLimit');
    expect(resumeLoans).not.toMatch(/resumePending\(\s*\)/);

    const resumeEarn = index.slice(
      index.indexOf("app.post('/internal/jobs/resume-pending-earn'"),
      index.indexOf("app.post('/internal/jobs/run-auto-invest'"),
    );
    expect(resumeEarn).toContain('assertEarnResumePendingLimit');
    expect(resumeEarn).not.toMatch(/resumePending\(\s*\)/);

    const accrueLoan = index.slice(
      index.indexOf("app.post('/internal/jobs/accrue-loan-interest'"),
      index.indexOf("app.post('/internal/jobs/run-risk-sweep'"),
    );
    expect(accrueLoan).toContain('assertLoanAccrueBatchLimit');
    expect(accrueLoan).not.toMatch(/accrueAll\(\s*\)/);
  });

  it('tRPC all-book accrueLoanInterest passes input.limit — no invented 1000', () => {
    const router = readFileSync(join(ROOT, 'services/svc-bank/src/router.ts'), 'utf8');
    const accrue = router.slice(router.indexOf('accrueLoanInterest: jobProcedure'), router.indexOf('runRiskSweep: jobProcedure'));
    expect(accrue).toContain('bank.loans.accrueAll(at, input.limit)');
    expect(accrue).not.toMatch(/accrueAll\(at\)/);
  });
});
