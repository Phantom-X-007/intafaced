import Fastify from 'fastify';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';
import { describe, expect, it, vi } from 'vitest';
import { registerMarketLifecycleRoutes } from './market-lifecycle-routes.js';

const SECRET = 'lifecycle-route-secret-32-characters';

describe('svc-trade lifecycle publication auth', () => {
  it('requires body-bound service auth and refuses a tampered payload', async () => {
    const app = Fastify();
    registerMarketLifecycleRoutes(app, {
      internalSecret: SECRET,
      store: { publish: vi.fn(), readLatest: vi.fn(), appendCorrection: vi.fn() } as never,
    });
    const signed = JSON.stringify({ signed: true });
    const response = await app.inject({
      method: 'POST',
      url: '/internal/market-lifecycle',
      headers: { 'content-type': 'application/json', ...serviceAuthHeadersForBody('svc-authority', SECRET, signed) },
      payload: JSON.stringify({ signed: false }),
    });
    expect(response.statusCode).toBe(401);
  });
});
