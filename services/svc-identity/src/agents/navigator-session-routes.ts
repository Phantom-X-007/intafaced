/**
 * S2S navigator session read for svc-agents identity.session.read live plane.
 *
 * Class X: until operator-owned session projection storage is wired, every call
 * refuses `no_live_session_store` — never an invented open session.
 */

import type { FastifyInstance } from 'fastify';
import { verifyServiceHeaders } from '@intafaced/contracts';

export const NAVIGATOR_SESSION_PATH = '/internal/agents/navigator-session' as const;

export type NavigatorSessionRefuse = {
  readonly ok: false;
  readonly reason: 'no_live_session_store';
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
};

export function registerNavigatorSessionRoutes(app: FastifyInstance, deps: NavigatorSessionRouteDeps): void {
  const authorised = (headers: Record<string, string | string[] | undefined>): boolean =>
    verifyServiceHeaders(headers, deps.internalSecret).service !== null;

  app.get<{ Params: { sessionId: string } }>(`${NAVIGATOR_SESSION_PATH}/:sessionId`, async (req, reply) => {
    if (!authorised(req.headers)) {
      return reply.code(401).send({ error: 'identity.unauthenticated', message: 'service credentials required' });
    }
    const body: NavigatorSessionRefuse = { ok: false, reason: 'no_live_session_store' };
    return reply.code(503).send(body);
  });
}
