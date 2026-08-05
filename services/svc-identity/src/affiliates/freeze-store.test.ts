import { describe, expect, it } from 'vitest';
import { FreezeError, MemoryFreezeStore } from './freeze-store.js';

describe('affiliates L3 freeze store (non-pay)', () => {
  it('freeze / unfreeze with audit reason; refuse double freeze', () => {
    const store = new MemoryFreezeStore();
    const rec = store.freeze({
      beneficiaryId: 'u-ref',
      frozenBy: 'op-1',
      reason: 'Chargeback investigation',
      now: new Date('2026-08-05T00:00:00.000Z'),
    });
    expect(rec.reason).toContain('Chargeback');
    expect(store.isFrozen('u-ref')).toBe(true);
    expect(() => store.freeze({ beneficiaryId: 'u-ref', frozenBy: 'op-1', reason: 'again' })).toThrow(FreezeError);
    store.unfreeze('u-ref');
    expect(store.isFrozen('u-ref')).toBe(false);
    expect(() => store.unfreeze('u-ref')).toThrow(FreezeError);
  });

  it('accrue skips frozen beneficiaries', () => {
    const store = new MemoryFreezeStore();
    const parent = new Map([['payer', 'u-ref']]);
    store.freeze({ beneficiaryId: 'u-ref', frozenBy: 'op', reason: 'Policy hold' });
    const rows = store.accrue({
      fee: {
        feeEventId: 'f1',
        userId: 'payer',
        feeAmount: '10',
        asset: 'USDT',
        at: new Date('2026-08-05T00:00:00.000Z'),
      },
      parent,
    });
    expect(rows.every((r) => r.beneficiaryId !== 'u-ref')).toBe(true);
  });

  it('refuses short freeze reason', () => {
    const store = new MemoryFreezeStore();
    expect(() => store.freeze({ beneficiaryId: 'a', frozenBy: 'op', reason: 'no' })).toThrow(FreezeError);
  });

  it('L3 freezeCount is zero without invent', () => {
    const store = new MemoryFreezeStore();
    expect(store.freezeCount()).toBe(0);
    store.freeze({ beneficiaryId: 'u-ref', frozenBy: 'op', reason: 'policy hold' });
    expect(store.freezeCount()).toBe(1);
  });
});
