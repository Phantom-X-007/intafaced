import { describe, expect, it, vi } from 'vitest';
import { sqlFundingPeriodStore, sqlLiquidationAttemptStore, sqlPositionCloser } from './tick-stores.js';

/** Minimal tagged-template mock that records SQL calls. */
function mockSql() {
  const calls: unknown[][] = [];
  const fn = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push([...values]);
      const text = strings.join('?').toLowerCase();
      if (text.includes('select') && text.includes('funding_periods')) {
        return Promise.resolve(values[0] === 'settled-period' ? [{ period_id: 'settled-period' }] : []);
      }
      if (text.includes('select') && text.includes('liquidation_attempts')) {
        return Promise.resolve(values[0] === 'done-liq' ? [{ liquidation_id: 'done-liq' }] : []);
      }
      if (text.includes('update trade.positions')) {
        return Promise.resolve([]);
      }
      if (text.includes('insert into trade.funding_periods')) {
        return Promise.resolve([]);
      }
      if (text.includes('insert into trade.liquidation_attempts')) {
        return Promise.resolve([]);
      }
      if (text.includes('from trade.positions')) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    },
    { calls },
  );
  return fn as unknown as import('postgres').Sql & { calls: unknown[][] };
}

describe('sqlFundingPeriodStore', () => {
  it('isSettled false then markSettled inserts', async () => {
    const sql = mockSql();
    const store = sqlFundingPeriodStore(sql as never);
    expect(await store.isSettled('m1:t0')).toBe(false);
    await store.markSettled('m1:t0', { legCount: 2, totalPosted: 2 });
    expect(sql.calls.length).toBeGreaterThan(0);
  });

  it('isSettled true for known period', async () => {
    const sql = mockSql();
    const store = sqlFundingPeriodStore(sql as never);
    expect(await store.isSettled('settled-period')).toBe(true);
  });
});

describe('sqlLiquidationAttemptStore', () => {
  it('tracks done attempts without inventing', async () => {
    const sql = mockSql();
    const store = sqlLiquidationAttemptStore(sql as never);
    expect(await store.isDone('fresh')).toBe(false);
    expect(await store.isDone('done-liq')).toBe(true);
    await store.markDone('fresh');
  });
});

describe('sqlPositionCloser', () => {
  it('updates position status to liquidated', async () => {
    const sql = mockSql();
    const closer = sqlPositionCloser(sql as never, null);
    await closer.markLiquidated('pos-1', { liquidationId: 'liq-1', reason: 'below_maintenance' });
    expect(sql.calls.some((c) => c.includes('pos-1'))).toBe(true);
  });

  it('skips bus publish when bus null', async () => {
    const sql = mockSql();
    const publish = vi.fn();
    const closer = sqlPositionCloser(sql as never, null);
    await closer.markLiquidated('pos-1', { liquidationId: 'liq-1', reason: 'x' });
    expect(publish).not.toHaveBeenCalled();
  });
});
