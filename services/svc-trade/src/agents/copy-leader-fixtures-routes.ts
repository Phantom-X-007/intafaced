/**
 * S2S copy-leader performance fixtures for svc-agents copy-intel live plane.
 *
 * Class X: until trade.copy publishes audited leader stats, every call refuses
 * `no_live_leaders` — never invented PnL or win rates.
 */

import type { FastifyInstance } from 'fastify';
import { verifyServiceHeaders } from '@intafaced/contracts';

export const COPY_LEADER_FIXTURES_PATH = '/internal/agents/copy-leader-fixtures' as const;

export type CopyLeaderFixturesRefuse = {
  readonly ok: false;
  readonly reason: 'no_live_leaders';
};

export type CopyLeaderFixturesRouteDeps = {
  readonly internalSecret: string;
};

export function registerCopyLeaderFixturesRoutes(app: FastifyInstance, deps: CopyLeaderFixturesRouteDeps): void {
  const authorised = (headers: Record<string, string | string[] | undefined>): boolean =>
    verifyServiceHeaders(headers, deps.internalSecret).service !== null;

  app.get(COPY_LEADER_FIXTURES_PATH, async (req, reply) => {
    if (!authorised(req.headers)) {
      return reply.code(401).send({ error: 'trade.unauthenticated', message: 'service credentials required' });
    }
    const body: CopyLeaderFixturesRefuse = { ok: false, reason: 'no_live_leaders' };
    return reply.code(503).send(body);
  });
}
