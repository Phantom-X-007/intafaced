import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * EDGE_BODY_LIMIT_BYTES — the front door will not buffer an unbounded body.
 *
 * Until this, Fastify's library default (~1 MiB) applied with no env and no
 * test, so an operator could not tighten the budget and a suite could not see
 * a 413. The limit is set on the Fastify constructor the same way `index.ts`
 * does it; this file is the contract for that wiring shape.
 */

let app: FastifyInstance | null = null;

afterEach(async () => {
  await app?.close();
  app = null;
});

async function withBodyLimit(bytes: number): Promise<FastifyInstance> {
  const instance = Fastify({ logger: false, bodyLimit: bytes });
  instance.post('/api/echo', async (req) => ({ ok: true, body: req.body }));
  await instance.ready();
  app = instance;
  return instance;
}

describe('request body limit', () => {
  it('accepts a body under the budget', async () => {
    const edge = await withBodyLimit(256);
    const res = await edge.inject({
      method: 'POST',
      url: '/api/echo',
      headers: { 'content-type': 'application/json' },
      payload: { hello: 'world' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it('refuses an oversize body with 413 before the handler runs', async () => {
    const edge = await withBodyLimit(64);
    const fat = { pad: 'x'.repeat(200) };
    const res = await edge.inject({
      method: 'POST',
      url: '/api/echo',
      headers: { 'content-type': 'application/json' },
      payload: fat,
    });
    expect(res.statusCode).toBe(413);
  });
});
