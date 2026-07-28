import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';

/**
 * THE PARSER COLLISION.
 *
 * svc-pay needs two mutually exclusive body parsers on one port: the webhook
 * needs the raw string it verifies a signature over, and tRPC needs a parsed
 * object. Registering the raw parser on the root instance — which this service
 * did for as long as nothing was mounted — silently breaks every tRPC
 * procedure: the request arrives, the route matches, and zod reports a
 * malformed payload. It reads like a client bug.
 *
 * These tests pin the encapsulation rather than the mount, because the mount is
 * obvious when it breaks and this is not.
 */
describe('the webhook parser stays inside its own scope', () => {
  async function build() {
    const app = Fastify();

    await app.register(async (webhookScope) => {
      webhookScope.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
        done(null, body);
      });
      webhookScope.post('/webhooks/:railId', async (req) => ({ isString: typeof req.body === 'string', body: req.body }));
    });

    // Outside the scope: Fastify's default JSON parser, which is what tRPC needs.
    app.post('/trpc/echo', async (req) => ({ isObject: typeof req.body === 'object' && req.body !== null }));

    await app.ready();
    return app;
  }

  it('hands the webhook its raw bytes, unparsed', async () => {
    const app = await build();
    // Deliberately odd key order and whitespace — the exact thing a re-serialise
    // would normalise, which is how an honest delivery starts failing.
    const raw = '{"b":2,  "a":1}';

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/card-sandbox',
      headers: { 'content-type': 'application/json' },
      payload: raw,
    });

    expect(res.json().isString).toBe(true);
    expect(res.json().body).toBe(raw);
    await app.close();
  });

  it('hands everything else a parsed object, so tRPC can read its input', async () => {
    const app = await build();

    const res = await app.inject({
      method: 'POST',
      url: '/trpc/echo',
      headers: { 'content-type': 'application/json' },
      payload: { a: 1 },
    });

    expect(res.json().isObject).toBe(true);
    await app.close();
  });

  it('breaks tRPC if the raw parser is registered at the root — the regression this guards', async () => {
    const app = Fastify();
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
      done(null, body);
    });
    app.post('/trpc/echo', async (req) => ({ isObject: typeof req.body === 'object' && req.body !== null }));
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/trpc/echo',
      headers: { 'content-type': 'application/json' },
      payload: { a: 1 },
    });

    // A string, not an object. This is what the service would have done to
    // every procedure had the parser stayed on the root instance.
    expect(res.json().isObject).toBe(false);
    await app.close();
  });
});
