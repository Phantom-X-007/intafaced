import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { serviceAuthHeaders } from '@intafaced/contracts';
import { registerInternalFundingRate } from './internal-funding-rate.js';
import type { FundingRateEntry } from './funding-rate-source.js';

const SECRET = 'test-internal-secret-for-trade-funding-rate';

/** Test-only magnitude bound — NOT product law (D2). Allows 0.0001; refuses 1000000. */
const FIXTURE_FUNDING_MAX_ABS = '1';

async function build(publish: (e: FundingRateEntry) => void, maxAbsRate: string | null = FIXTURE_FUNDING_MAX_ABS) {
  const app = Fastify();
  registerInternalFundingRate(app, {
    internalSecret: SECRET,
    publishFundingRate: publish,
    maxAbsRate,
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

  it('the same instant in three ISO spellings is ONE period', async () => {
    const published: FundingRateEntry[] = [];
    const app = await build((e) => published.push(e));
    const headers = serviceAuthHeaders('svc-oracle', SECRET);
    const base = { marketId: 'm1', rate: '0.0001' };

    // Same moment, three encodings. Concatenated raw these were three distinct
    // ids and three full charges — an oracle changing its date library, or a
    // second publisher with a different one, double-charged with nobody
    // changing a period.
    for (const iso of ['2026-08-08T00:00:00.000Z', '2026-08-08T00:00:00Z', '2026-08-08T02:00:00+02:00']) {
      const res = await app.inject({
        method: 'POST',
        url: '/internal/futures/funding-rate',
        headers,
        payload: { ...base, periodStartIso: iso },
      });
      expect(res.statusCode).toBe(200);
    }

    expect(published).toHaveLength(3);
    expect(new Set(published.map((p) => p.periodId)).size).toBe(1);
    expect(published[0]!.periodId).toBe('m1:2026-08-08T00:00:00.000Z');
    await app.close();
  });

  it('a periodId belonging to another market is refused', async () => {
    const published: FundingRateEntry[] = [];
    const app = await build((e) => published.push(e));
    const headers = serviceAuthHeaders('svc-oracle', SECRET);

    // `funding_periods` is keyed on period_id ALONE, so one id copy-pasted
    // across two markets makes the second read as already settled and its
    // traders never exchange collateral — silently.
    const res = await app.inject({
      method: 'POST',
      url: '/internal/futures/funding-rate',
      headers,
      payload: { marketId: 'm2', rate: '0.0001', periodId: 'm1:2026-08-08T00:00:00.000Z' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/scoped to its market/);
    expect(published).toEqual([]);
    await app.close();
  });

  it('an unparseable periodStartIso is refused, not concatenated', async () => {
    const published: FundingRateEntry[] = [];
    const app = await build((e) => published.push(e));
    const headers = serviceAuthHeaders('svc-oracle', SECRET);
    const res = await app.inject({
      method: 'POST',
      url: '/internal/futures/funding-rate',
      headers,
      payload: { marketId: 'm1', rate: '0.0001', periodStartIso: 'last tuesday' },
    });
    expect(res.statusCode).toBe(400);
    expect(published).toEqual([]);
    await app.close();
  });

  /**
   * A future `asOfMs` stops funding for the market, permanently and silently.
   *
   * `isRateFresh` requires `now >= asOf`, so one publish stamped past the
   * horizon makes `quote()` return null forever — the tick only writes skip
   * rows. The same value also makes `new Date(asOfMs).toISOString()` throw in
   * the public funding-rate route, which does not catch it, so that symbol
   * 500s permanently too.
   */
  it('an asOfMs in the future is refused', async () => {
    const published: FundingRateEntry[] = [];
    const app = await build((e) => published.push(e));
    const headers = serviceAuthHeaders('svc-oracle', SECRET);
    const res = await app.inject({
      method: 'POST',
      url: '/internal/futures/funding-rate',
      headers,
      payload: { marketId: 'm1', rate: '0.0001', periodId: 'm1:p0', asOfMs: 1e16 },
    });
    expect(res.statusCode).toBe(400);
    expect(published).toEqual([]);

    // A minute of clock skew is still accepted — publishers are not atomic.
    const ok = await app.inject({
      method: 'POST',
      url: '/internal/futures/funding-rate',
      headers,
      payload: { marketId: 'm1', rate: '0.0001', periodId: 'm1:p0', asOfMs: 1_700_000_000_000 + 30_000 },
    });
    expect(ok.statusCode).toBe(200);
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

  /**
   * C12 / BUILD-STOP D2: absurd rate never enters the rate book.
   * Fixture max is test-only — not the product ceiling Denon still owns.
   */
  it('refuses rate 1000000 with trade.funding_rate_exceeds_max — nothing published', async () => {
    const published: FundingRateEntry[] = [];
    const app = await build((e) => published.push(e));
    const headers = serviceAuthHeaders('svc-oracle', SECRET);
    const res = await app.inject({
      method: 'POST',
      url: '/internal/futures/funding-rate',
      headers,
      payload: { marketId: 'm1', rate: '1000000', periodId: 'm1:p-absurd' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('trade.funding_rate_exceeds_max');
    expect(published).toEqual([]);
    await app.close();
  });

  it('refuses publish when max abs rate is unset (fail-closed)', async () => {
    const published: FundingRateEntry[] = [];
    const app = await build((e) => published.push(e), null);
    const headers = serviceAuthHeaders('svc-oracle', SECRET);
    const res = await app.inject({
      method: 'POST',
      url: '/internal/futures/funding-rate',
      headers,
      payload: { marketId: 'm1', rate: '0.0001', periodId: 'm1:p0' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('trade.funding_rate_bound_unconfigured');
    expect(published).toEqual([]);
    await app.close();
  });
});
