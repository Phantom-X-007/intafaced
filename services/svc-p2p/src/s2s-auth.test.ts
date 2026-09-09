import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { serviceAuthHeaders, serviceAuthHeadersForBody } from '@intafaced/contracts';
import { installP2pS2sRawBody, p2pInternalServiceOf } from './s2s-auth.js';

const SECRET = 'p2p-s2s-auth-test-secret-32ch!!!!';

async function mount() {
  const app = Fastify({ logger: false });
  installP2pS2sRawBody(app);
  app.get('/internal/ping', async (req, reply) => {
    if (p2pInternalServiceOf(req, SECRET, 'require') === null) {
      return reply.code(401).send({ error: 'service credentials required', code: 'p2p.unauthenticated' });
    }
    return { ok: true };
  });
  await app.ready();
  return app;
}

describe('p2p inbound S2S rawBody', () => {
  it('GET empty body binds with ForBody and 401s a mismatched digest', async () => {
    const app = await mount();
    const ok = await app.inject({
      method: 'GET',
      url: '/internal/ping',
      headers: serviceAuthHeadersForBody('svc-ops', SECRET, ''),
    });
    expect(ok.statusCode).toBe(200);

    const mismatch = await app.inject({
      method: 'GET',
      url: '/internal/ping',
      headers: serviceAuthHeadersForBody('svc-ops', SECRET, '{"not":"empty"}'),
    });
    expect(mismatch.statusCode).toBe(401);

    const v1 = await app.inject({
      method: 'GET',
      url: '/internal/ping',
      headers: serviceAuthHeaders('svc-ops', SECRET),
    });
    expect(v1.statusCode).toBe(401);
    await app.close();
  });
});
