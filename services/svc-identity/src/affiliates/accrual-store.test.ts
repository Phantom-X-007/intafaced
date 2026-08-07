import { describe, expect, it } from 'vitest';
import { accrueCommission, type FeeEvent } from './commission.js';
import { MemoryAccrualStore } from './accrual-store.js';

const PAYER = '11111111-1111-4111-8111-111111111111';
const REF = '22222222-2222-4222-8222-222222222222';
const REF2 = '33333333-3333-4333-8333-333333333333';

describe('Slice B durable accrual store — no payout', () => {
  it('zero fee → zero rows stored (no invent)', async () => {
    const store = new MemoryAccrualStore();
    const fee: FeeEvent = {
      feeEventId: 'fee-zero',
      userId: PAYER,
      feeAmount: '0',
      asset: 'USDT',
      at: new Date('2026-08-07T12:00:00.000Z'),
    };
    const parent = new Map([[PAYER, REF]]);
    const rows = accrueCommission({
      fee,
      parent,
      tiers: [
        { hop: 0, rate: '0.10' },
        { hop: 1, rate: '0.05' },
      ],
    });
    expect(rows).toHaveLength(0);
    expect(await store.saveRows(rows)).toBe(0);
    expect(await store.listByFeeEvent('fee-zero')).toHaveLength(0);
  });

  it('fee event → decimal commission rows persist idempotently', async () => {
    const store = new MemoryAccrualStore();
    const fee: FeeEvent = {
      feeEventId: 'fee-1',
      userId: PAYER,
      feeAmount: '100',
      asset: 'USDT',
      at: new Date('2026-08-07T12:00:00.000Z'),
    };
    const parent = new Map([
      [PAYER, REF],
      [REF, REF2],
    ]);
    const rows = accrueCommission({
      fee,
      parent,
      tiers: [
        { hop: 0, rate: '0.10' },
        { hop: 1, rate: '0.05' },
      ],
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => typeof r.commissionAmount === 'string')).toBe(true);

    expect(await store.saveRows(rows)).toBe(rows.length);
    expect(await store.saveRows(rows)).toBe(0); // idempotent retry
    const listed = await store.listByFeeEvent('fee-1');
    expect(listed).toHaveLength(rows.length);
    expect(listed[0]!.commissionAmount).toBe('10');
  });
});
