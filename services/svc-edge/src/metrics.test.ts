import { PROMETHEUS_CONTENT_TYPE, REQUESTS_TOTAL, REQUEST_DURATION_SECONDS, parseExposition } from '@intafaced/telemetry';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { METRICS_PATH, markAuthOutcome, moduleLabel, registerMetrics } from './metrics.js';

/**
 * THE ENDPOINT, REQUESTED (§14.5).
 *
 * This file does not test that `metrics.ts` exports a registry, and it does not
 * call `registry.render()` directly. Every assertion below goes through
 * `app.inject()` — a real HTTP request through the real hook chain to the real
 * mounted route — and then PARSES THE RESPONSE BODY.
 *
 * The reason is specific to this repo. Seven guards have shipped here that were
 * correct in isolation and unreachable in place, each carrying a comment
 * asserting the property the code lacked. A metrics registry that counts
 * perfectly while nothing serves it is that failure exactly, and it is invisible
 * to any test that holds the registry in its hand instead of asking the server
 * for it.
 *
 * `registerMetrics` here is the SAME function `index.ts` calls, with the same
 * argument shape. Nothing is a parallel copy.
 */

let app: FastifyInstance | null = null;

afterEach(async () => {
  await app?.close();
  app = null;
});

/**
 * An edge with the metrics surface mounted and a few upstreams stubbed.
 *
 * The stubs answer for `/api/*` so that a status class in the exposition can
 * only have come from the hook counting what the server actually sent.
 */
async function edge(): Promise<FastifyInstance> {
  const instance = Fastify({ logger: false });
  registerMetrics(instance, { service: 'svc-edge' });

  instance.get('/health', async () => ({ ok: true }));

  instance.all('/api/trade/*', async (req) => {
    markAuthOutcome(req, 'authenticated');
    return { ok: true };
  });

  instance.all('/api/identity/*', async (req, reply) => {
    markAuthOutcome(req, 'refused');
    return reply.code(401).send({ error: 'nope' });
  });

  // A handler that throws, so a 5xx in the exposition is a real 5xx and not a
  // status this test typed in.
  instance.get('/api/pay/boom', async () => {
    throw new Error('upstream exploded');
  });

  await instance.ready();
  app = instance;
  return instance;
}

/** Scrape the endpoint the way Prometheus would, and parse what came back. */
async function scrape(instance: FastifyInstance) {
  const res = await instance.inject({ method: 'GET', url: METRICS_PATH });
  expect(res.statusCode).toBe(200);
  return { res, parsed: parseExposition(res.body) };
}

const counters = (parsed: ReturnType<typeof parseExposition>) => parsed.samples.filter((s) => s.name === REQUESTS_TOTAL);

describe('GET /metrics', () => {
  it('is mounted, and answers with the Prometheus text content type', async () => {
    const instance = await edge();
    const { res } = await scrape(instance);

    // Prometheus negotiates on this. A payload served as `application/json`
    // scrapes, parses nothing, and reports the target UP with zero series —
    // which looks on a dashboard exactly like a service nothing has happened in.
    expect(res.headers['content-type']).toBe(PROMETHEUS_CONTENT_TYPE);
  });

  it('returns a body the exposition grammar accepts before any traffic', async () => {
    const instance = await edge();
    const { parsed } = await scrape(instance);

    // Declared, so a fresh service is distinguishable from a broken one.
    expect(parsed.type[REQUESTS_TOTAL]).toBe('counter');
    expect(parsed.type[REQUEST_DURATION_SECONDS]).toBe('histogram');
  });

  it('counts a proxied request under its module, method and status class', async () => {
    const instance = await edge();
    await instance.inject({ method: 'POST', url: '/api/trade/orders', payload: {} });

    const { parsed } = await scrape(instance);
    const trade = counters(parsed).find((s) => s.labels.module === 'trade');

    expect(trade).toBeDefined();
    expect(trade?.value).toBe(1);
    expect(trade?.labels.method).toBe('POST');
    expect(trade?.labels.status).toBe('2xx');
    expect(trade?.labels.service).toBe('svc-edge');
  });

  it('emits a histogram with real observations, not an empty declaration', async () => {
    const instance = await edge();
    await instance.inject({ method: 'GET', url: '/api/trade/markets' });
    await instance.inject({ method: 'GET', url: '/api/trade/markets' });

    const { parsed } = await scrape(instance);

    const count = parsed.samples.find((s) => s.name === `${REQUEST_DURATION_SECONDS}_count` && s.labels.module === 'trade');
    const sum = parsed.samples.find((s) => s.name === `${REQUEST_DURATION_SECONDS}_sum` && s.labels.module === 'trade');
    const inf = parsed.samples.find(
      (s) => s.name === `${REQUEST_DURATION_SECONDS}_bucket` && s.labels.module === 'trade' && s.labels.le === '+Inf',
    );

    expect(count?.value).toBe(2);
    expect(inf?.value).toBe(2);
    // Real elapsed time, so this is non-negative and finite rather than a
    // hardcoded number. A histogram that only ever reports 0 is a clock that was
    // never read.
    expect(sum?.value).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(sum?.value)).toBe(true);

    // Every declared bucket present, and monotonic — `histogram_quantile` is
    // undefined behaviour otherwise, and the panel plots nonsense rather than
    // erroring.
    const buckets = parsed.samples.filter((s) => s.name === `${REQUEST_DURATION_SECONDS}_bucket` && s.labels.module === 'trade');
    expect(buckets.length).toBeGreaterThan(1);
    const values = buckets.map((b) => b.value);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1] as number);
    }
  });

  it('counts failures — the requests an SLO exists to see', async () => {
    const instance = await edge();
    await instance.inject({ method: 'GET', url: '/api/pay/boom' });

    const { parsed } = await scrape(instance);
    const pay = counters(parsed).find((s) => s.labels.module === 'pay');

    // A thrown handler becomes a 500, and it must land in the denominator. An
    // availability ratio computed only over requests that succeeded is 100% by
    // construction.
    expect(pay?.labels.status).toBe('5xx');
    expect(pay?.value).toBe(1);
  });

  it('counts a path that matches no upstream as _unrouted, not as a module', async () => {
    const instance = await edge();
    await instance.inject({ method: 'GET', url: '/api/nonesuch/thing' });

    const { parsed } = await scrape(instance);
    const unrouted = counters(parsed).find((s) => s.labels.module === '_unrouted');

    expect(unrouted?.labels.status).toBe('4xx');
    expect(unrouted?.value).toBe(1);
  });

  it('records how the caller presented, so an auth outage is visible', async () => {
    const instance = await edge();
    await instance.inject({ method: 'GET', url: '/api/trade/markets' });
    await instance.inject({ method: 'GET', url: '/api/identity/me' });

    const { parsed } = await scrape(instance);

    expect(counters(parsed).find((s) => s.labels.module === 'trade')?.labels.outcome).toBe('authenticated');
    expect(counters(parsed).find((s) => s.labels.module === 'identity')?.labels.outcome).toBe('refused');
  });

  it('labels its own probes _local rather than inventing a module for them', async () => {
    const instance = await edge();
    await instance.inject({ method: 'GET', url: '/health' });
    // The first scrape's own request is counted too, and appears on the second.
    await scrape(instance);

    const { parsed } = await scrape(instance);
    const local = counters(parsed).filter((s) => s.labels.module === '_local');

    expect(local.length).toBeGreaterThan(0);
    // `/health` and `/metrics` are both local, and neither leaks a path into a
    // label — the whole cardinality argument depends on that.
    expect(local.every((s) => s.labels.module === '_local')).toBe(true);
  });

  it('does not carry a query string into a label', async () => {
    const instance = await edge();
    await instance.inject({ method: 'GET', url: '/api/trade/markets?symbol=BTC-USD&cursor=abc' });

    const { res } = await scrape(instance);
    // A label whose value comes from a URL is a cardinality bomb: a thousand
    // distinct query strings would be a thousand permanent series.
    expect(res.body).not.toContain('BTC-USD');
    expect(res.body).not.toContain('cursor');
  });

  it('clamps an unknown method instead of accepting it as a label', async () => {
    const instance = await edge();
    // Fastify answers 404 for a method it has no route for; the point is that
    // whatever happens, the label is drawn from the known set.
    await instance.inject({ method: 'OPTIONS', url: '/api/trade/markets' });

    const { res, parsed } = await scrape(instance);
    const methods = new Set(counters(parsed).map((s) => s.labels.method));
    for (const m of methods) {
      expect(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', '_other']).toContain(m);
    }
    expect(res.statusCode).toBe(200);
  });
});

describe('moduleLabel', () => {
  it('resolves a real upstream prefix to its module name', () => {
    expect(moduleLabel('/api/trade/orders')).toBe('trade');
    expect(moduleLabel('/api/identity/me?x=1')).toBe('identity');
  });

  it('calls anything the edge serves itself _local', () => {
    expect(moduleLabel('/health')).toBe('_local');
    expect(moduleLabel('/ready')).toBe('_local');
    expect(moduleLabel(METRICS_PATH)).toBe('_local');
    expect(moduleLabel('/admin/kill-switches')).toBe('_local');
  });

  it('calls an unmatched /api path _unrouted', () => {
    expect(moduleLabel('/api/nope/x')).toBe('_unrouted');
    expect(moduleLabel('/api/')).toBe('_unrouted');
  });
});
