import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { serviceAuthHeaders } from '@intafaced/contracts';
import { MERCHANT_WATCH_METRICS_PATH, registerMerchantWatchMetricsRoutes } from './merchant-watch-metrics-routes.js';

const SECRET = 'a-merchant-watch-metrics-internal-secret-long-enough';

function serviceHeaders(): Record<string, string> {
  return serviceAuthHeaders('svc-agents', SECRET);
}

describe('merchant watch metrics internal route', () => {
  it('refuses no_live_metrics with service auth', async () => {
    const app = Fastify();
    registerMerchantWatchMetricsRoutes(app, { internalSecret: SECRET });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: MERCHANT_WATCH_METRICS_PATH,
      headers: serviceHeaders(),
    });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ ok: false, reason: 'no_live_metrics' });
    await app.close();
  });

  it('401s without service credentials', async () => {
    const app = Fastify();
    registerMerchantWatchMetricsRoutes(app, { internalSecret: SECRET });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: MERCHANT_WATCH_METRICS_PATH });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
