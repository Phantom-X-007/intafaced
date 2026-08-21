/**
 * S2S navigator session read for svc-agents identity.session.read live plane.
 *
 * Missing projection = honest `no_live_session_store`. Operator publishes rows
 * via POST publish — never seeded with invented open sessions.
 */

import type { FastifyInstance } from 'fastify';
import { verifyServiceHeaders } from '@intafaced/contracts';
import type { NavigatorSessionStore } from './navigator-session-store.js';

export const NAVIGATOR_SESSION_PATH = '/internal/agents/navigator-session' as const;
export const NAVIGATOR_SESSION_PUBLISH_PATH = '/internal/agents/navigator-session/publish' as const;

export type NavigatorSessionRefuse = {
  readonly ok: false;
  readonly reason: 'no_live_session_store';
};

export type NavigatorSessionPublishRefuse = {
  readonly ok: false;
  readonly reason: 'no_session_store' | 'invalid_publish_body';
};

export type NavigatorSessionPublishOk = {
  readonly ok: true;
};

export type NavigatorSessionOk = {
  readonly ok: true;
  readonly session: {
    readonly sessionId: string;
    readonly userId: string;
    readonly status: 'open' | 'closed';
  };
};

export type NavigatorSessionBody = NavigatorSessionRefuse | NavigatorSessionOk;

export type NavigatorSessionRouteDeps = {
  readonly internalSecret: string;
  readonly store?: NavigatorSessionStore;
};

function parsePublishBody(raw: unknown): NavigatorSessionOk['session'] | null {
  if (raw === null || typeof raw !== 'object') return null;
  const body = raw as Record<string, unknown>;
  if (typeof body.sessionId !== 'string' || !body.sessionId.trim()) return null;
  if (typeof body.userId !== 'string' || !body.userId.trim()) return null;
  if (body.status !== 'open' && body.status !== 'closed') return null;
  return {
    sessionId: body.sessionId.trim(),
    userId: body.userId.trim(),
    status: body.status,
  };
}

export function registerNavigatorSessionRoutes(app: FastifyInstance, deps: NavigatorSessionRouteDeps): void {
  const authorised = (headers: Record<string, string | string[] | undefined>): boolean =>
    verifyServiceHeaders(headers, deps.internalSecret).service !== null;

  app.get<{ Params: { sessionId: string } }>(`${NAVIGATOR_SESSION_PATH}/:sessionId`, async (req, reply) => {
    if (!authorised(req.headers)) {
      return reply.code(401).send({ error: 'identity.unauthenticated', message: 'service credentials required' });
    }
    if (!deps.store) {
      const body: NavigatorSessionRefuse = { ok: false, reason: 'no_live_session_store' };
      return reply.code(503).send(body);
    }
    const session = await deps.store.readSession(req.params.sessionId);
    if (!session) {
      const body: NavigatorSessionRefuse = { ok: false, reason: 'no_live_session_store' };
      return reply.code(503).send(body);
    }
    const body: NavigatorSessionOk = { ok: true, session };
    return reply.send(body);
  });

  app.post(NAVIGATOR_SESSION_PUBLISH_PATH, async (req, reply) => {
    if (!authorised(req.headers)) {
      return reply.code(401).send({ error: 'identity.unauthenticated', message: 'service credentials required' });
    }
    if (!deps.store) {
      const body: NavigatorSessionPublishRefuse = { ok: false, reason: 'no_session_store' };
      return reply.code(503).send(body);
    }
    const session = parsePublishBody(req.body);
    if (!session) {
      const body: NavigatorSessionPublishRefuse = { ok: false, reason: 'invalid_publish_body' };
      return reply.code(400).send(body);
    }
    await deps.store.publishSession(session);
    const body: NavigatorSessionPublishOk = { ok: true };
    return reply.send(body);
  });
}
