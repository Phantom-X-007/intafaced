import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { serviceAuthHeaders } from '@intafaced/contracts';
import { COPY_LEADER_FIXTURES_PATH, registerCopyLeaderFixturesRoutes } from './copy-leader-fixtures-routes.js';

const SECRET = 'a-copy-leader-fixtures-internal-secret-long-enough';

function serviceHeaders(): Record<string, string> {
  return serviceAuthHeaders('svc-agents', SECRET);
}

describe('copy leader fixtures internal route', () => {
  it('refuses no_live_leaders with service auth', async () => {
    const app = Fastify();
    registerCopyLeaderFixturesRoutes(app, { internalSecret: SECRET });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: COPY_LEADER_FIXTURES_PATH,
      headers: serviceHeaders(),
    });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ ok: false, reason: 'no_live_leaders' });
    await app.close();
  });

  it('401s without service credentials', async () => {
    const app = Fastify();
    registerCopyLeaderFixturesRoutes(app, { internalSecret: SECRET });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: COPY_LEADER_FIXTURES_PATH });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
