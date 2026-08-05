import { describe, expect, it } from 'vitest';
import { consumeCubePoints } from './ops-analytics-consume.js';

describe('analytics L3 consumeCubePoints', () => {
  it('empty series is empty — not invent zeros', () => {
    expect(consumeCubePoints([])).toEqual({ status: 'empty' });
  });

  it('accepts valid fixture points', () => {
    const r = consumeCubePoints([
      { metricId: 'trade.fills.count', value: '3', dim: null },
      { metricId: 'ledger.volume.notional', value: '10.5', dim: null },
    ]);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.points).toHaveLength(2);
  });

  it('refuses money as JS number', () => {
    const r = consumeCubePoints([{ metricId: 'ledger.volume.notional', value: 99 as unknown as string, dim: null }]);
    expect(r.status).toBe('refuse');
  });
});
