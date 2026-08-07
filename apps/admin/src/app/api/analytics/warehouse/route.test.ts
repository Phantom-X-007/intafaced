import { afterEach, describe, expect, it } from 'vitest';
import { GET, POST } from './route.js';

/**
 * Admin warehouse surface — honest empty/lag, no invent volume.
 */

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  delete process.env.ADMIN_BFF_SHARED_SECRET;
  delete process.env.ANALYTICS_REPLICA_CONFIGURED;
  delete process.env.ANALYTICS_REPLICA_LAG_SECONDS;
});

describe('GET /api/analytics/warehouse', () => {
  it('returns unavailable when replica is not configured — never invents volume', async () => {
    process.env.ANALYTICS_REPLICA_CONFIGURED = 'false';
    const res = await GET(new Request('http://admin.local/api/analytics/warehouse'));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('unavailable');
    expect(body.reason).toBe('replica_unconfigured');
    expect(body.mayLabelLive).toBe(false);
  });

  it('returns empty when replica configured and lag ok but no facts', async () => {
    process.env.ANALYTICS_REPLICA_CONFIGURED = 'true';
    process.env.ANALYTICS_REPLICA_LAG_SECONDS = '5';
    const res = await GET(new Request('http://admin.local/api/analytics/warehouse'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('empty');
    expect(body.mayLabelLive).toBe(false);
  });

  it('POST with cube fixtures returns ok points (counts as decimal strings)', async () => {
    process.env.ANALYTICS_REPLICA_CONFIGURED = 'true';
    process.env.ANALYTICS_REPLICA_LAG_SECONDS = '5';
    const res = await POST(
      new Request('http://admin.local/api/analytics/warehouse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          facts: [{ metricId: 'trade.fills.count', value: '3' }],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.points.some((p: { metricId: string; value: string }) => p.metricId === 'trade.fills.count' && p.value === '3')).toBe(true);
    expect(body.mayLabelLive).toBe(true);
  });
});
