import { describe, expect, it } from 'vitest';
import { consumeCubePoints, consumeCubePointsForMetrics } from './ops-analytics-consume.js';

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

  it('L3 filter by metric ids — empty filter or no hits is empty not invent', () => {
    const points = [
      { metricId: 'trade.fills.count', value: '3', dim: null },
      { metricId: 'ledger.volume.notional', value: '10.5', dim: null },
    ];
    expect(consumeCubePointsForMetrics(points, [])).toEqual({ status: 'empty' });
    const r = consumeCubePointsForMetrics(points, ['trade.fills.count']);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.points).toHaveLength(1);
    expect(r.points[0]!.metricId).toBe('trade.fills.count');
  });
});
