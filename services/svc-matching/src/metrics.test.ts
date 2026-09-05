import { MODULE_LOCAL, PROMETHEUS_CONTENT_TYPE, REQUESTS_TOTAL, REQUEST_DURATION_SECONDS, parseExposition } from '@intafaced/telemetry';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { METRICS_PATH, moduleLabel, registerMetrics } from './metrics.js';

/**
 * THE ENDPOINT, REQUESTED (§14.5).
 *
 * Every assertion below goes through `app.inject()` and then PARSES THE
 * RESPONSE BODY. A registry that counts perfectly while nothing serves it is
 * the failure this repo has shipped seven times.
 *
 * `registerMetrics` here is the SAME function `index.ts` calls, with the same
 * argument shape. Matching is not a proxy: there is no upstream table and no
 * `markAuthOutcome`. The module label is always `_local`.
 */

let app: FastifyInstance | null = null;

afterEach(async () => {
  await app?.close();
  app = null;
});

async function matching(): Promise<FastifyInstance> {
  const instance = Fastify({ logger: false });
  registerMetrics(instance, { service: 'svc-matching' });

  instance.get('/health', async () => ({ ok: true }));
  instance.get('/boom', async () => {
    throw new Error('handler exploded');
  });

  await instance.ready();
  app = instance;
  return instance;
}

async function scrape(instance: FastifyInstance) {
  const res = await instance.inject({ method: 'GET', url: METRICS_PATH });
  expect(res.statusCode).toBe(200);
  return { res, parsed: parseExposition(res.body) };
}

const counters = (parsed: ReturnType<typeof parseExposition>) => parsed.samples.filter((s) => s.name === REQUESTS_TOTAL);

describe('GET /metrics', () => {
  it('is mounted, and answers with the Prometheus text content type', async () => {
    const instance = await matching();
    const { res } = await scrape(instance);

    expect(res.headers['content-type']).toBe(PROMETHEUS_CONTENT_TYPE);
  });

  it('returns a body the exposition grammar accepts before any traffic', async () => {
    const instance = await matching();
    const { parsed } = await scrape(instance);

    expect(parsed.type[REQUESTS_TOTAL]).toBe('counter');
    expect(parsed.type[REQUEST_DURATION_SECONDS]).toBe('histogram');
  });

  it('emits the duration series a scrape of matching /metrics must contain', async () => {
    const instance = await matching();
    await instance.inject({ method: 'GET', url: '/health' });

    const { res, parsed } = await scrape(instance);

    expect(res.body).toContain(REQUEST_DURATION_SECONDS);
    expect(parsed.type[REQUEST_DURATION_SECONDS]).toBe('histogram');

    const count = parsed.samples.find((s) => s.name === `${REQUEST_DURATION_SECONDS}_count`);
    expect(count?.value).toBeGreaterThanOrEqual(1);
    expect(count?.labels.service).toBe('svc-matching');
    expect(count?.labels.module).toBe(MODULE_LOCAL);
  });

  it('counts a local request under _local, method and status class', async () => {
    const instance = await matching();
    await instance.inject({ method: 'GET', url: '/health' });

    const { parsed } = await scrape(instance);
    const health = counters(parsed).find((s) => s.labels.module === MODULE_LOCAL && s.labels.method === 'GET' && s.labels.status === '2xx');

    expect(health).toBeDefined();
    expect(health?.value).toBeGreaterThanOrEqual(1);
    expect(health?.labels.service).toBe('svc-matching');
    expect(health?.labels.outcome).toBe('none');
  });

  it('emits a histogram with real observations, not an empty declaration', async () => {
    const instance = await matching();
    await instance.inject({ method: 'GET', url: '/health' });
    await instance.inject({ method: 'GET', url: '/health' });

    const { parsed } = await scrape(instance);

    const count = parsed.samples.find(
      (s) =>
        s.name === `${REQUEST_DURATION_SECONDS}_count` &&
        s.labels.module === MODULE_LOCAL &&
        s.labels.method === 'GET' &&
        s.labels.status === '2xx',
    );
    const sum = parsed.samples.find(
      (s) =>
        s.name === `${REQUEST_DURATION_SECONDS}_sum` &&
        s.labels.module === MODULE_LOCAL &&
        s.labels.method === 'GET' &&
        s.labels.status === '2xx',
    );
    const inf = parsed.samples.find(
      (s) =>
        s.name === `${REQUEST_DURATION_SECONDS}_bucket` &&
        s.labels.module === MODULE_LOCAL &&
        s.labels.method === 'GET' &&
        s.labels.status === '2xx' &&
        s.labels.le === '+Inf',
    );

    expect(count?.value).toBe(2);
    expect(inf?.value).toBe(2);
    expect(sum?.value).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(sum?.value)).toBe(true);

    const buckets = parsed.samples.filter(
      (s) =>
        s.name === `${REQUEST_DURATION_SECONDS}_bucket` &&
        s.labels.module === MODULE_LOCAL &&
        s.labels.method === 'GET' &&
        s.labels.status === '2xx',
    );
    expect(buckets.length).toBeGreaterThan(1);
    const values = buckets.map((b) => b.value);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1] as number);
    }
  });

  it('counts failures — the requests an availability number exists to see', async () => {
    const instance = await matching();
    await instance.inject({ method: 'GET', url: '/boom' });

    const { parsed } = await scrape(instance);
    const boom = counters(parsed).find((s) => s.labels.status === '5xx');

    expect(boom?.labels.module).toBe(MODULE_LOCAL);
    expect(boom?.value).toBe(1);
  });

  it('labels every path _local rather than inventing a module from the URL', async () => {
    const instance = await matching();
    await instance.inject({ method: 'GET', url: '/health' });
    await instance.inject({ method: 'GET', url: '/markets/BTC-USDT/depth?limit=50' });
    await scrape(instance);

    const { parsed } = await scrape(instance);
    const modules = new Set(counters(parsed).map((s) => s.labels.module));

    expect(modules.size).toBeGreaterThan(0);
    for (const m of modules) {
      expect(m).toBe(MODULE_LOCAL);
    }
  });

  it('does not carry a query string into a label', async () => {
    const instance = await matching();
    await instance.inject({ method: 'GET', url: '/health?symbol=BTC-USD&cursor=abc' });

    const { res } = await scrape(instance);
    expect(res.body).not.toContain('BTC-USD');
    expect(res.body).not.toContain('cursor');
  });
});

describe('moduleLabel', () => {
  it('is always _local — matching is not a proxy', () => {
    expect(moduleLabel('/health')).toBe(MODULE_LOCAL);
    expect(moduleLabel('/ready')).toBe(MODULE_LOCAL);
    expect(moduleLabel(METRICS_PATH)).toBe(MODULE_LOCAL);
    expect(moduleLabel('/markets/BTC-USDT/orders')).toBe(MODULE_LOCAL);
    expect(moduleLabel('/api/trade/orders')).toBe(MODULE_LOCAL);
  });
});
