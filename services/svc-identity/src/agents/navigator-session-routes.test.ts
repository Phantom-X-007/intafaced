import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { serviceAuthHeaders } from '@intafaced/contracts';
import {
  NAVIGATOR_SESSION_PATH,
  NAVIGATOR_SESSION_PUBLISH_PATH,
  registerNavigatorSessionRoutes,
} from './navigator-session-routes.js';
import type { NavigatorSessionStore } from './navigator-session-store.js';

const SECRET = 'a-navigator-session-internal-secret-long-enough-for-hmac';

function serviceHeaders(): Record<string, string> {
  return serviceAuthHeaders('svc-agents', SECRET);
}

function memoryStore(): NavigatorSessionStore {
  const sessions = new Map<string, { sessionId: string; userId: string; status: 'open' | 'closed' }>();
  return {
    async readSession(sessionId) {
      return sessions.get(sessionId) ?? null;
    },
    async publishSession(session) {
      sessions.set(session.sessionId, session);
    },
  };
}

describe('navigator session internal route', () => {
  it('refuses no_live_session_store with service auth when store absent', async () => {
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

  it('refuses no_live_session_store when projection is missing', async () => {
    const app = Fastify();
    registerNavigatorSessionRoutes(app, { internalSecret: SECRET, store: memoryStore() });
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

  it('publish then GET returns operator-owned session projection', async () => {
    const app = Fastify();
    const store = memoryStore();
    registerNavigatorSessionRoutes(app, { internalSecret: SECRET, store });
    await app.ready();

    const publish = await app.inject({
      method: 'POST',
      url: NAVIGATOR_SESSION_PUBLISH_PATH,
      headers: serviceHeaders(),
      payload: { sessionId: 'sess-1', userId: 'user-1', status: 'open' },
    });
    expect(publish.statusCode).toBe(200);
    expect(publish.json()).toEqual({ ok: true });

    const res = await app.inject({
      method: 'GET',
      url: `${NAVIGATOR_SESSION_PATH}/sess-1`,
      headers: serviceHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, session: { sessionId: 'sess-1', userId: 'user-1', status: 'open' } });
    await app.close();
  });
});
