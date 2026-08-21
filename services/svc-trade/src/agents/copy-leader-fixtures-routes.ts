/**
 * S2S copy-leader performance fixtures for svc-agents copy-intel live plane.
 *
 * Empty store = honest `no_live_leaders`. Operator publishes audited rows via
 * POST publish — never seeded with invented PnL or win rates.
 */

import type { FastifyInstance } from 'fastify';
import { verifyServiceHeaders } from '@intafaced/contracts';
import type { CopyLeaderFixture, CopyLeaderFixturesStore } from './copy-leader-fixtures-store.js';

export const COPY_LEADER_FIXTURES_PATH = '/internal/agents/copy-leader-fixtures' as const;
export const COPY_LEADER_FIXTURES_PUBLISH_PATH = '/internal/agents/copy-leader-fixtures/publish' as const;

export type CopyLeaderFixturesRefuse = {
  readonly ok: false;
  readonly reason: 'no_live_leaders';
};

export type CopyLeaderFixturesPublishRefuse = {
  readonly ok: false;
  readonly reason: 'no_fixtures_store' | 'invalid_publish_body';
};

export type CopyLeaderFixturesPublishOk = {
  readonly ok: true;
};

export type CopyLeaderFixturesOk = {
  readonly ok: true;
  readonly fixtures: readonly CopyLeaderFixture[];
};

export type CopyLeaderFixturesRouteDeps = {
  readonly internalSecret: string;
  readonly store?: CopyLeaderFixturesStore;
};

function parsePublishBody(raw: unknown): CopyLeaderFixture | null {
  if (raw === null || typeof raw !== 'object') return null;
  const body = raw as Record<string, unknown>;
  if (typeof body.leaderId !== 'string' || !body.leaderId.trim()) return null;
  if (body.realisedPnl !== null && typeof body.realisedPnl !== 'string') return null;
  if (body.closedTrades !== null && typeof body.closedTrades !== 'number') return null;
  if (body.winningTrades !== null && typeof body.winningTrades !== 'number') return null;
  if (typeof body.windowStart !== 'string' || !body.windowStart.trim()) return null;
  if (typeof body.windowEnd !== 'string' || !body.windowEnd.trim()) return null;
  if (typeof body.source !== 'string' || !body.source.trim()) return null;
  return {
    leaderId: body.leaderId.trim(),
    realisedPnl: body.realisedPnl,
    closedTrades: body.closedTrades,
    winningTrades: body.winningTrades,
    windowStart: body.windowStart,
    windowEnd: body.windowEnd,
    source: body.source.trim(),
  };
}

export function registerCopyLeaderFixturesRoutes(app: FastifyInstance, deps: CopyLeaderFixturesRouteDeps): void {
  const authorised = (headers: Record<string, string | string[] | undefined>): boolean =>
    verifyServiceHeaders(headers, deps.internalSecret).service !== null;

  app.get(COPY_LEADER_FIXTURES_PATH, async (req, reply) => {
    if (!authorised(req.headers)) {
      return reply.code(401).send({ error: 'trade.unauthenticated', message: 'service credentials required' });
    }
    if (!deps.store) {
      const body: CopyLeaderFixturesRefuse = { ok: false, reason: 'no_live_leaders' };
      return reply.code(503).send(body);
    }
    const fixtures = await deps.store.listFixtures();
    if (fixtures.length === 0) {
      const body: CopyLeaderFixturesRefuse = { ok: false, reason: 'no_live_leaders' };
      return reply.code(503).send(body);
    }
    const body: CopyLeaderFixturesOk = { ok: true, fixtures };
    return reply.send(body);
  });

  app.post(COPY_LEADER_FIXTURES_PUBLISH_PATH, async (req, reply) => {
    if (!authorised(req.headers)) {
      return reply.code(401).send({ error: 'trade.unauthenticated', message: 'service credentials required' });
    }
    if (!deps.store) {
      const body: CopyLeaderFixturesPublishRefuse = { ok: false, reason: 'no_fixtures_store' };
      return reply.code(503).send(body);
    }
    const fixture = parsePublishBody(req.body);
    if (!fixture) {
      const body: CopyLeaderFixturesPublishRefuse = { ok: false, reason: 'invalid_publish_body' };
      return reply.code(400).send(body);
    }
    await deps.store.publishFixture(fixture);
    const body: CopyLeaderFixturesPublishOk = { ok: true };
    return reply.send(body);
  });
}
