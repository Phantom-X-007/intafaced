import { describe, expect, it } from 'vitest';
import { parseAmount as amt, formatAmount } from '@intafaced/ledger-client';
import { fundingAmount, notionalQuote, planFundingSettlement, summarizeFundingPlan } from './funding-settlement.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('funding-settlement planner', () => {
  it('notional and funding amount scale correctly', () => {
    // 1 BTC * 50k = 50k quote notional; 1bp of period = 5 quote
    expect(notionalQuote(amt('1'), amt('50000'))).toBe(amt('50000'));
    expect(fundingAmount(amt('50000'), amt('0.0001'))).toBe(amt('5'));
  });

  it('zero rate → no legs', () => {
    const legs = planFundingSettlement({
      periodId: 'm1:t0',
      marketId: 'm1',
      rate: '0',
      positions: [
        {
          positionId: 'p1',
          userId: A,
          side: 'long',
          size: amt('1'),
          entryPrice: amt('50000'),
          marginAsset: 'USDT',
        },
        {
          positionId: 'p2',
          userId: B,
          side: 'short',
          size: amt('1'),
          entryPrice: amt('50000'),
          marginAsset: 'USDT',
        },
      ],
    });
    expect(legs).toEqual([]);
  });

  it('positive rate: long pays short', () => {
    const legs = planFundingSettlement({
      periodId: 'm1:2026-07-31T00:00:00Z',
      marketId: 'm1',
      rate: '0.0001',
      positions: [
        {
          positionId: 'plong',
          userId: A,
          side: 'long',
          size: amt('1'),
          entryPrice: amt('50000'),
          marginAsset: 'USDT',
        },
        {
          positionId: 'pshort',
          userId: B,
          side: 'short',
          size: amt('1'),
          entryPrice: amt('50000'),
          marginAsset: 'USDT',
        },
      ],
    });
    expect(legs).toHaveLength(1);
    expect(legs[0]!.payerPositionId).toBe('plong');
    expect(legs[0]!.payeePositionId).toBe('pshort');
    expect(formatAmount(legs[0]!.amount)).toBe('5');
    expect(legs[0]!.recipe.reason).toBe('futures.funding.paid');
    expect(summarizeFundingPlan(legs)).toContain('1 leg');
  });

  it('negative rate: short pays long', () => {
    const legs = planFundingSettlement({
      periodId: 'm1:t1',
      marketId: 'm1',
      rate: '-0.0001',
      positions: [
        {
          positionId: 'plong',
          userId: A,
          side: 'long',
          size: amt('1'),
          entryPrice: amt('50000'),
          marginAsset: 'USDT',
        },
        {
          positionId: 'pshort',
          userId: B,
          side: 'short',
          size: amt('1'),
          entryPrice: amt('50000'),
          marginAsset: 'USDT',
        },
      ],
    });
    expect(legs[0]!.payerPositionId).toBe('pshort');
    expect(legs[0]!.payeePositionId).toBe('plong');
  });

  it('one-sided book → no legs', () => {
    const legs = planFundingSettlement({
      periodId: 'm1:t2',
      marketId: 'm1',
      rate: '0.0001',
      positions: [
        {
          positionId: 'plong',
          userId: A,
          side: 'long',
          size: amt('1'),
          entryPrice: amt('50000'),
          marginAsset: 'USDT',
        },
      ],
    });
    expect(legs).toEqual([]);
  });
});
