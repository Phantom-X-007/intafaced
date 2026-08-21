import { describe, expect, it } from 'vitest';
import { createHttpPayMetricsPort } from './pay-metrics-http-port.js';

describe('createHttpPayMetricsPort', () => {
  it('returns points when pay responds ok', async () => {
    const sample = {
      railId: 'card',
      approvalRate: '0.91',
      attempts: 100,
      asOf: '2026-01-01T00:00:00.000Z',
      maxAgeMs: 60_000,
    };
    const fetchImpl = async () =>
      new Response(JSON.stringify({ ok: true, points: [sample] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

    const port = createHttpPayMetricsPort({
      payUrl: 'http://pay.test',
      internalSecret: 'a-pay-metrics-http-port-internal-secret-long',
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(await port.sample()).toEqual([sample]);
  });

  it('returns empty on refuse body', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ ok: false, reason: 'no_live_metrics' }), { status: 503 });

    const port = createHttpPayMetricsPort({
      payUrl: 'http://pay.test',
      internalSecret: 'a-pay-metrics-http-port-internal-secret-long',
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(await port.sample()).toEqual([]);
  });
});
