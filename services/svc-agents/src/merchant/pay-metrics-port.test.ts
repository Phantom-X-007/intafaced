import { describe, expect, it } from 'vitest';
import { readLivePayMetrics, type PayMetricsPort } from './pay-metrics-port.js';
import type { ApprovalRatePoint } from './watch.js';

const sample: ApprovalRatePoint = {
  railId: 'card-visa',
  approvalRate: '0.91',
  attempts: 40,
  asOf: '2026-08-16T12:00:00.000Z',
  maxAgeMs: 120_000,
};

describe('readLivePayMetrics', () => {
  it('unset port is no_live_metrics — not a fake 0.00 board', async () => {
    const r = await readLivePayMetrics(undefined);
    expect(r).toEqual({ ok: false, reason: 'no_live_metrics' });
  });

  it('empty sample is no_live_metrics — silence is not 0.00', async () => {
    const port: PayMetricsPort = { sample: async () => [] };
    expect(await readLivePayMetrics(port)).toEqual({ ok: false, reason: 'no_live_metrics' });
  });

  it('throwing sample is no_live_metrics', async () => {
    const port: PayMetricsPort = {
      sample: async () => {
        throw new Error('metrics plane down');
      },
    };
    expect(await readLivePayMetrics(port)).toEqual({ ok: false, reason: 'no_live_metrics' });
  });

  it('returns port samples when present', async () => {
    const port: PayMetricsPort = { sample: async () => [sample] };
    expect(await readLivePayMetrics(port)).toEqual({ ok: true, points: [sample] });
  });
});
