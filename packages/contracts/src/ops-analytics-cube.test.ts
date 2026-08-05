import { describe, expect, it } from 'vitest';
import { CUBE_VIEWS_V0, evaluateCubeFixtures, filterCubeFactsByDim, sumCountFixtures } from './ops-analytics-cube.js';
import { ANALYTICS_METRICS_V0 } from './ops-analytics.js';

describe('analytics Slice B — cube views + fixtures', () => {
  it('maps every v0 metric to a SQL view definition', () => {
    expect(CUBE_VIEWS_V0).toHaveLength(ANALYTICS_METRICS_V0.length);
    for (const m of ANALYTICS_METRICS_V0) {
      const v = CUBE_VIEWS_V0.find((x) => x.metricId === m.id);
      expect(v, m.id).toBeDefined();
      expect(v!.sqlView.length).toBeGreaterThan(20);
      expect(v!.sqlView).toMatch(/VIEW|view|--/);
    }
  });

  it('fixture ledger counts → expected cube points (no invent)', () => {
    const r = evaluateCubeFixtures([
      { metricId: 'ledger.postings.count', value: '3' },
      { metricId: 'ledger.volume.notional', value: '150.500000000000000000' },
      { metricId: 'trade.fills.count', value: '2' },
    ]);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.points).toHaveLength(3);
    expect(r.points.find((p) => p.metricId === 'ledger.volume.notional')!.value).toBe('150.500000000000000000');
  });

  it('refuses money as JS number in fixtures', () => {
    const r = evaluateCubeFixtures([{ metricId: 'ledger.volume.notional', value: 99 as unknown as string }]);
    expect(r.status).toBe('refuse');
  });

  it('empty count fixtures sum to zero — not a fabricated walk', () => {
    const r = sumCountFixtures([], 'trade.fills.count');
    expect(r).toEqual({
      status: 'ok',
      points: [{ metricId: 'trade.fills.count', value: '0', dim: null }],
    });
  });

  it('sums count fixtures as integers', () => {
    const r = sumCountFixtures(
      [
        { metricId: 'trade.fills.count', value: '2' },
        { metricId: 'trade.fills.count', value: '5' },
        { metricId: 'ledger.postings.count', value: '9' },
      ],
      'trade.fills.count',
    );
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.points[0]!.value).toBe('7');
  });

  it('refuses sumCountFixtures on money metrics', () => {
    const r = sumCountFixtures([{ metricId: 'ledger.volume.notional', value: '1' }], 'ledger.volume.notional');
    expect(r.status).toBe('refuse');
  });

  it('L3 filterCubeFactsByDim scopes facts without invent', () => {
    const facts = [
      { metricId: 'trade.fills.count', value: '2', dim: 'BTC' },
      { metricId: 'trade.fills.count', value: '3', dim: 'ETH' },
    ];
    expect(filterCubeFactsByDim(facts, ['BTC'])).toHaveLength(1);
    expect(filterCubeFactsByDim(facts, ['SOL'])).toEqual([]);
  });
});
