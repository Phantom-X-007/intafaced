import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { serviceAuthHeaders } from '@intafaced/contracts';
import { NAVIGATOR_SESSION_PATH, registerNavigatorSessionRoutes } from './navigator-session-routes.js';

const SECRET = 'a-navigator-session-internal-secret-long-enough-for-hmac';

function serviceHeaders(): Record<string, string> {
  return serviceAuthHeaders('svc-agents', SECRET);
}

describe('navigator session internal route', () => {
  it('refuses no_live_session_store with service auth', async () => {
    const app = Fastify();
    registerNavigatorSessionRoutes(app, { internalSecret: SECRET });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: `${NAVIGATOR_SESSION_PATH}/sess-1`,
      headers: serviceHeaders(),
    });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ ok: false, reason: 'no_live_session_store' });
    await app.close();
  });

  it('401s without service credentials', async () => {
    const app = Fastify();
    registerNavigatorSessionRoutes(app, { internalSecret: SECRET });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: `${NAVIGATOR_SESSION_PATH}/sess-1` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
