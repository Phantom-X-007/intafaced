import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { registerMatchingVenueHaltGuard } from './matching-venue-halt.js';

const apps: FastifyInstance[] = [];

afterEach(async () => {
  while (apps.length) {
    const a = apps.pop();
    if (a) await a.close();
  }
});

async function edge(opts: { matchingUrl?: string; fetch?: typeof fetch }) {
  const app = Fastify({ logger: false });
  registerMatchingVenueHaltGuard(app, {
    matchingUrl: opts.matchingUrl,
    fetch: opts.fetch,
  });
  app.all('/api/*', async () => ({ ok: true }));
  await app.ready();
  apps.push(app);
  return app;
}

function health(body: unknown, status = 200): typeof fetch {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
}

describe('matching halt-all at the HTTP session door', () => {
  it('open matching proceeds; halt-all cannot accept NEW order traffic as live', async () => {
    const live = await edge({ matchingUrl: 'http://matching.test', fetch: health({ halted: false }) });
    const place = await live.inject({ method: 'POST', url: '/api/v1/orders' });
    expect(place.statusCode).toBe(200);

    const halted = await edge({ matchingUrl: 'http://matching.test', fetch: health({ halted: true }) });
    const refused = await halted.inject({ method: 'POST', url: '/api/v1/orders' });
    expect(refused.statusCode).toBe(503);
    expect(refused.json()).toMatchObject({ code: 'edge.venue_halted' });
    const trpc = await halted.inject({ method: 'POST', url: '/api/trade/trpc/orders.create' });
    expect(trpc.statusCode).toBe(503);
    expect(trpc.json()).toMatchObject({ code: 'edge.venue_halted' });
  });

  it('still lets a cancel out while NEW orders refuse', async () => {
    const app = await edge({ matchingUrl: 'http://matching.test', fetch: health({ venueHalted: true }) });
    const cancel = await app.inject({ method: 'DELETE', url: '/api/v1/orders/8f3c1d2e-0000-4000-8000-000000000001' });
    expect(cancel.statusCode).toBe(200);
    const cancelAll = await app.inject({ method: 'DELETE', url: '/api/v1/orders' });
    expect(cancelAll.statusCode).toBe(200);
    const trpcCancel = await app.inject({ method: 'POST', url: '/api/trade/trpc/orders.cancel' });
    expect(trpcCancel.statusCode).toBe(200);
    const place = await app.inject({ method: 'POST', url: '/api/v1/orders' });
    expect(place.statusCode).toBe(503);
  });

  it('missing halt source cannot open NEW orders as live', async () => {
    const app = await edge({
      matchingUrl: 'http://matching.test',
      fetch: health({ ok: true, service: 'svc-matching' }),
    });
    const res = await app.inject({ method: 'POST', url: '/api/v1/orders' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: 'edge.venue_halt_unavailable' });
  });

  it('unset MATCHING_URL does not invent a matching door — NEW orders stay on the proxy', async () => {
    const app = await edge({});
    const res = await app.inject({ method: 'POST', url: '/api/v1/orders' });
    expect(res.statusCode).toBe(200);
  });

  it('does not POST /halt-all or invent an operator', async () => {
    const seen: string[] = [];
    const app = await edge({
      matchingUrl: 'http://matching.test',
      fetch: async (input, init) => {
        seen.push(`${init?.method ?? 'GET'} ${String(input)}`);
        return new Response(JSON.stringify({ halted: false }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    await app.inject({ method: 'POST', url: '/api/v1/orders' });
    expect(seen).toEqual(['GET http://matching.test/health']);
    expect(seen.join(' ')).not.toMatch(/halt-all|operator/i);
  });
});
