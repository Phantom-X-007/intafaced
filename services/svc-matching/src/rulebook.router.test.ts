/**
 * Unit card — public GET /rulebook hitch
 *
 * 1. Promise: registerRoutes serves the versioned rulebook without recutting
 *    the trading router. Blank refuses; set returns the version string only.
 * 2. Break: missing door; unpublished would look published; published would
 *    invent fees/haircuts.
 * 3. Done bar: GET /rulebook 200 unpublished + matching.rulebook_unpublished;
 *    set version → { published:true, version }; no auth required.
 * 4. Class N
 * 5. Paths: services/svc-matching/src/router.ts hitch + rulebook.ts
 */
import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { MemoryEventBus } from '@intafaced/events';
import { MatchingEngine } from './engine/engine.js';
import { MemoryJournal } from './engine/journal.js';
import { RULEBOOK_UNPUBLISHED } from './rulebook.js';
import { registerRoutes } from './router.js';

const SECRET = 'matching-rulebook-router-secret-32ch!!';

async function mount(rulebookVersion?: string): Promise<FastifyInstance> {
  const engine = new MatchingEngine({
    journal: new MemoryJournal(),
    bus: new MemoryEventBus('svc-matching'),
    snapshotEvery: 0,
  });
  const app = Fastify({ logger: false });
  registerRoutes(app, engine, SECRET, { bodyBind: 'require', rulebookVersion });
  await app.ready();
  return app;
}

describe('GET /rulebook', () => {
  it('blank version is unpublished with matching.rulebook_unpublished', async () => {
    const app = await mount('');
    const res = await app.inject({ method: 'GET', url: '/rulebook' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      published: false,
      version: null,
      rejected: { code: RULEBOOK_UNPUBLISHED, message: RULEBOOK_UNPUBLISHED },
    });
    await app.close();
  });

  it('missing option with blank process env is unpublished', async () => {
    const prev = process.env.MATCHING_RULEBOOK_VERSION;
    delete process.env.MATCHING_RULEBOOK_VERSION;
    try {
      const app = await mount();
      const res = await app.inject({ method: 'GET', url: '/rulebook' });
      expect(res.statusCode).toBe(200);
      expect(res.json().rejected.code).toBe(RULEBOOK_UNPUBLISHED);
      await app.close();
    } finally {
      if (prev === undefined) delete process.env.MATCHING_RULEBOOK_VERSION;
      else process.env.MATCHING_RULEBOOK_VERSION = prev;
    }
  });

  it('set version returns the version string only', async () => {
    const app = await mount('ptx-m00.v1');
    const res = await app.inject({ method: 'GET', url: '/rulebook' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body).toEqual({ published: true, version: 'ptx-m00.v1' });
    expect(Object.keys(body).sort()).toEqual(['published', 'version']);
    expect(JSON.stringify(body)).not.toMatch(/fee|haircut|spread|bps|best execution|certified/i);
    await app.close();
  });

  it('does not require service auth', async () => {
    const app = await mount('ptx-m00.v1');
    const res = await app.inject({ method: 'GET', url: '/rulebook' });
    expect(res.statusCode).toBe(200);
    expect(res.json().published).toBe(true);
    await app.close();
  });
});
