import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { serviceAuthHeaders } from '@intafaced/contracts';
import {
  COPY_LEADER_FIXTURES_PATH,
  COPY_LEADER_FIXTURES_PUBLISH_PATH,
  COPY_LEADER_FIXTURES_REFRESH_PATH,
  registerCopyLeaderFixturesRoutes,
} from './copy-leader-fixtures-routes.js';
import type { CopyLeaderFixture, CopyLeaderFixturesStore } from './copy-leader-fixtures-store.js';

const SECRET = 'a-copy-leader-fixtures-internal-secret-long-enough';

function serviceHeaders(): Record<string, string> {
  return serviceAuthHeaders('svc-agents', SECRET);
}

function memoryStore(projected: CopyLeaderFixture[] = []): CopyLeaderFixturesStore {
  const fixtures: CopyLeaderFixture[] = [];
  return {
    async listFixtures() {
      return fixtures;
    },
    async publishFixture(fixture) {
      const idx = fixtures.findIndex((f) => f.leaderId === fixture.leaderId);
      if (idx >= 0) fixtures[idx] = fixture;
      else fixtures.push(fixture);
    },
    async materializeProjectedFixtures() {
      for (const fixture of projected) {
        await this.publishFixture(fixture);
      }
      return projected.length;
    },
  };
}

describe('copy leader fixtures internal route', () => {
  it('refuses no_live_leaders with service auth when store absent', async () => {
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

  it('refuses no_live_leaders when store is empty', async () => {
    const app = Fastify();
    registerCopyLeaderFixturesRoutes(app, { internalSecret: SECRET, store: memoryStore() });
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

  it('publish then GET returns operator-owned fixtures', async () => {
    const app = Fastify();
    const store = memoryStore();
    registerCopyLeaderFixturesRoutes(app, { internalSecret: SECRET, store });
    await app.ready();

    const fixture = {
      leaderId: 'leader-1',
      realisedPnl: '12.50',
      closedTrades: 4,
      winningTrades: 3,
      windowStart: '2026-01-01T00:00:00.000Z',
      windowEnd: '2026-01-31T23:59:59.000Z',
      source: 'trade.copy',
    };

    const publish = await app.inject({
      method: 'POST',
      url: COPY_LEADER_FIXTURES_PUBLISH_PATH,
      headers: serviceHeaders(),
      payload: fixture,
    });
    expect(publish.statusCode).toBe(200);
    expect(publish.json()).toEqual({ ok: true });

    const res = await app.inject({
      method: 'GET',
      url: COPY_LEADER_FIXTURES_PATH,
      headers: serviceHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, fixtures: [fixture] });
    await app.close();
  });

  it('refresh materializes projected fixtures then GET succeeds', async () => {
    const projected = [
      {
        leaderId: 'leader-2',
        realisedPnl: null,
        closedTrades: 2,
        winningTrades: null,
        windowStart: '2026-01-01T00:00:00.000Z',
        windowEnd: '2026-01-31T23:59:59.000Z',
        source: 'trade.copy.mirrored_fills',
      },
    ];
    const app = Fastify();
    const store = memoryStore(projected);
    registerCopyLeaderFixturesRoutes(app, { internalSecret: SECRET, store });
    await app.ready();

    const refresh = await app.inject({
      method: 'POST',
      url: COPY_LEADER_FIXTURES_REFRESH_PATH,
      headers: serviceHeaders(),
    });
    expect(refresh.statusCode).toBe(200);
    expect(refresh.json()).toEqual({ ok: true, materialized: 1 });

    const res = await app.inject({
      method: 'GET',
      url: COPY_LEADER_FIXTURES_PATH,
      headers: serviceHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, fixtures: projected });
    await app.close();
  });
});
