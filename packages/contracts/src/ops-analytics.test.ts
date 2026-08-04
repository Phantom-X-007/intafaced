import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_METRICS_V0,
  ANALYTICS_SOURCE_DBS,
  assertMetricPoint,
  lagFreshness,
  mayLabelLive,
  metricById,
} from './ops-analytics.js';

describe('analytics Slice A — sources + lag fail-closed', () => {
  it('names the three source DBs', () => {
    expect(ANALYTICS_SOURCE_DBS).toEqual(['ledger', 'trade', 'identity']);
  });

  it('refuses live label when lag unknown or stale', () => {
    expect(lagFreshness(null)).toBe('unknown');
    expect(mayLabelLive(null)).toBe(false);
    expect(mayLabelLive(undefined)).toBe(false);
    expect(lagFreshness(10)).toBe('live');
    expect(mayLabelLive(10)).toBe(true);
    expect(lagFreshness(45)).toBe('delayed');
    expect(mayLabelLive(45)).toBe(false);
    expect(lagFreshness(120)).toBe('stale');
    expect(mayLabelLive(120)).toBe(false);
  });
});

describe('analytics metric catalogue v0', () => {
  it('ships at least one money metric that refuses JS number', () => {
    expect(ANALYTICS_METRICS_V0.some((m) => m.money)).toBe(true);
    const vol = metricById('ledger.volume.notional')!;
    expect(assertMetricPoint(vol.id, 12.5)).toEqual({
      ok: false,
      reason: 'money metrics refuse JS number — use decimal string',
    });
    expect(assertMetricPoint(vol.id, '12.50')).toEqual({ ok: true });
  });

  it('accepts integer counts', () => {
    expect(assertMetricPoint('trade.fills.count', 3)).toEqual({ ok: true });
    expect(assertMetricPoint('trade.fills.count', -1).ok).toBe(false);
  });
});
