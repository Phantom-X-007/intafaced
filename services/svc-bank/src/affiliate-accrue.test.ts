import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import {
  AFFILIATE_PRODUCER_PATH,
  affiliateLegAfterLoanLiquidate,
  affiliateLegAfterLoanRepay,
  createAffiliateAccrueClient,
  fireAffiliateAccrue,
  NoopAffiliateAccrue,
  type AffiliateBankFeeLeg,
} from './affiliate-accrue.js';

const BORROWER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SECRET = 'test-internal-service-secret-32ch!!';
const LOAN = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const REPAY_FEE = `bank.repay:${LOAN}:3`;
const LIQ_FEE = `bank.liquidate:${LOAN}:2`;

describe('bank affiliate accrue legs', () => {
  it('emits one repay fee-event keyed by loanId:sequence; userId is borrower', () => {
    expect(
      affiliateLegAfterLoanRepay({
        loanId: LOAN,
        borrowerId: BORROWER,
        sequence: 3,
        interest: parseAmount('2.50'),
        debtAssetId: 'USDT',
      }),
    ).toEqual([
      {
        userId: BORROWER,
        feeAmount: parseAmount('2.50'),
        feeAsset: 'USDT',
        feeEventId: REPAY_FEE,
      },
    ]);
  });

  it('skips zero interest on repay', () => {
    expect(
      affiliateLegAfterLoanRepay({
        loanId: LOAN,
        borrowerId: BORROWER,
        sequence: 3,
        interest: 0n,
        debtAssetId: 'USDT',
      }),
    ).toEqual([]);
  });

  it('emits liquidate house cut (interest + penalty) keyed by loanId:tranche', () => {
    expect(
      affiliateLegAfterLoanLiquidate({
        loanId: LOAN,
        borrowerId: BORROWER,
        tranche: 2,
        interestRepaid: parseAmount('1'),
        penalty: parseAmount('0.50'),
        debtAssetId: 'USDT',
      }),
    ).toEqual([
      {
        userId: BORROWER,
        feeAmount: parseAmount('1.50'),
        feeAsset: 'USDT',
        feeEventId: LIQ_FEE,
      },
    ]);
  });

  it('skips zero house cut on liquidate', () => {
    expect(
      affiliateLegAfterLoanLiquidate({
        loanId: LOAN,
        borrowerId: BORROWER,
        tranche: 2,
        interestRepaid: 0n,
        penalty: 0n,
        debtAssetId: 'USDT',
      }),
    ).toEqual([]);
  });
});

describe('fireAffiliateAccrue', () => {
  it('swallows a throw so the loan post stays posted', async () => {
    const port = {
      accrueBankFee: async () => {
        throw new Error('identity down');
      },
    };
    await expect(
      fireAffiliateAccrue(port, [
        {
          userId: BORROWER,
          feeAmount: parseAmount('1'),
          feeAsset: 'USDT',
          feeEventId: REPAY_FEE,
        },
      ]),
    ).resolves.toBeUndefined();
  });

  it('Noop never throws', async () => {
    await expect(fireAffiliateAccrue(new NoopAffiliateAccrue(), [])).resolves.toBeUndefined();
  });
});

describe('createAffiliateAccrueClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs JSON with sourceModule bank; 412 is success', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const body = String(init.body);
      calls.push(body);
      expect(init.method).toBe('POST');
      expect(JSON.parse(body)).toEqual({
        feeEventId: REPAY_FEE,
        userId: BORROWER,
        feeAmount: '1',
        asset: 'USDT',
        sourceModule: 'bank',
      });
      expect(Object.keys(JSON.parse(body)).sort()).toEqual(['asset', 'feeAmount', 'feeEventId', 'sourceModule', 'userId']);
      expect(String(url)).toBe(`http://identity.example${AFFILIATE_PRODUCER_PATH}`);
      return new Response('{"code":"affiliate.accrual.rates_unset"}', { status: 412 });
    });
    const client = createAffiliateAccrueClient('http://identity.example', SECRET);
    await expect(
      client.accrueBankFee({
        userId: BORROWER,
        feeAmount: parseAmount('1'),
        feeAsset: 'USDT',
        feeEventId: REPAY_FEE,
      }),
    ).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  it('throws on 500 so fireAffiliateAccrue can swallow without unwinding', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 500 }));
    const client = createAffiliateAccrueClient('http://identity.example', SECRET);
    await expect(
      client.accrueBankFee({
        userId: BORROWER,
        feeAmount: parseAmount('1'),
        feeAsset: 'USDT',
        feeEventId: REPAY_FEE,
      } satisfies AffiliateBankFeeLeg),
    ).rejects.toThrow(/500/);
  });
});

describe('LoanService wires accrue after ledger post', () => {
  it('fires accrue after loanRepay and loanLiquidate, not before', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, 'loans/loan-service.ts'), 'utf8');
    expect(src).toMatch(/notifyBankAffiliateAccrue/);
    expect(src).toMatch(/recipes\.loanRepay/);
    expect(src).toMatch(/recipes\.loanLiquidate/);
    expect(src.indexOf('recipes.loanRepay')).toBeLessThan(src.indexOf('notifyBankAffiliateAccrue'));
    expect(src.indexOf('recipes.loanLiquidate')).toBeLessThan(src.lastIndexOf('notifyBankAffiliateAccrue'));
    const idx = readFileSync(join(here, 'index.ts'), 'utf8');
    expect(idx).toMatch(/createAffiliateAccrueClient/);
  });
});
