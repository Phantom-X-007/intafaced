import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { serviceAuthHeaders } from '@intafaced/contracts';
import { registerInternalFundingRate } from './internal-funding-rate.js';
import type { FundingRateEntry } from './funding-rate-source.js';

const SECRET = 'test-internal-secret-for-trade-funding-rate';

async function build(publish: (e: FundingRateEntry) => void) {
  const app = Fastify();
  registerInternalFundingRate(app, {
    internalSecret: SECRET,
    publishFundingRate: publish,
    now: () => 1_700_000_000_000,
  });
  await app.ready();
  return app;
}

describe('POST /internal/futures/funding-rate', () => {
  it('401 without service auth', async () => {
    const app = await build(vi.fn());
    const res = await app.inject({
      method: 'POST',
      url: '/internal/futures/funding-rate',
      payload: { marketId: 'm1', rate: '0.0001' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('400 when marketId or rate missing (never invent)', async () => {
    const app = await build(vi.fn());
    const headers = serviceAuthHeaders('svc-oracle', SECRET);
    const res = await app.inject({
      method: 'POST',
      url: '/internal/futures/funding-rate',
      headers,
      payload: { marketId: 'm1' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('trade.funding_rate_publish_invalid');
    await app.close();
  });

  it('publishes rate when service-auth + body valid', async () => {
    const published: FundingRateEntry[] = [];
    const app = await build((e) => published.push(e));
    const headers = serviceAuthHeaders('svc-oracle', SECRET);
    const res = await app.inject({
      method: 'POST',
      url: '/internal/futures/funding-rate',
      headers,
      payload: { marketId: 'm1', rate: '0.0001', periodId: 'm1:t0' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, marketId: 'm1', rate: '0.0001', periodId: 'm1:t0' });
    expect(published).toHaveLength(1);
    expect(published[0]!.rate).toBe('0.0001');
    await app.close();
  });
});
