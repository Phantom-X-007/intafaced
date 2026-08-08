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

  /**
   * The publisher must name its period; the clock may not name it for them.
   *
   * `periodId` was derived from `asOfMs` via `toISOString()` — millisecond
   * resolution — so an oracle republishing the same rate every 60s minted a
   * fresh unsettled period each time. `runFundingTick` skips an already-settled
   * period BY ID, so every republish defeated that check and charged every
   * trader a full period again. Ordinary polling, no crash needed.
   */
  it('400 when the publisher names no period — the clock must not name it', async () => {
    const published: FundingRateEntry[] = [];
    const app = await build((e) => published.push(e));
    const headers = serviceAuthHeaders('svc-oracle', SECRET);
    const res = await app.inject({
      method: 'POST',
      url: '/internal/futures/funding-rate',
      headers,
      payload: { marketId: 'm1', rate: '0.0001' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('trade.funding_rate_publish_invalid');
    expect(res.json().message).toMatch(/periodId or periodStartIso/);
    // Nothing reached the rate book — a nameless period is not publishable.
    expect(published).toEqual([]);
    await app.close();
  });

  it('two publishes of one period are one period, however often the oracle polls', async () => {
    const published: FundingRateEntry[] = [];
    const app = await build((e) => published.push(e));
    const headers = serviceAuthHeaders('svc-oracle', SECRET);
    const payload = { marketId: 'm1', rate: '0.0001', periodStartIso: '2026-08-08T00:00:00.000Z' };

    // Same window, two polls a minute apart — the derived id must be identical,
    // or the second settles as a brand-new period and charges everyone again.
    await app.inject({ method: 'POST', url: '/internal/futures/funding-rate', headers, payload: { ...payload, asOfMs: 1 } });
    await app.inject({ method: 'POST', url: '/internal/futures/funding-rate', headers, payload: { ...payload, asOfMs: 60_001 } });

    expect(published).toHaveLength(2);
    expect(published[0]!.periodId).toBe(published[1]!.periodId);
    expect(published[0]!.periodId).toBe('m1:2026-08-08T00:00:00.000Z');
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
