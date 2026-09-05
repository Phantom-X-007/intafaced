/**
 * Unit card — public L2 depth limit unset refuse (no invented 50)
 *
 * 1. Promise: blank GET /depth does not publish a 50-level book. Owner/query
 *    may pass 50 explicitly. Missing / blank / non-integer / out of 1..500
 *    refuses matching.l2_limit_unset.
 * 2. Break: `query.limit ?? '50'` plus `depth(..., limit = 50)` made a blank
 *    query look like a chosen top-N window (same class as DEX_QUOTE_DEPTH /
 *    WS_DEPTH_LIMIT).
 * 3. Done bar: no `?? '50'` / `: 50` fallback in router readPublicL2; no
 *    `limit = 50` on MatchingEngine.depth; blank query 400; explicit 50 200.
 * 4. Class N
 * 5. Paths: router.ts readPublicL2, l2-limit.ts, engine.ts depth()
 * 6. RED: blank GET /depth returns 200 with a 50-level window
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerRoutes } from './router.js';
import { MATCHING_L2_LIMIT_UNSET, isPublishedL2Limit, parsePublicL2QueryLimit } from './l2-limit.js';
import { userCopy } from './user-copy.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SECRET = 'matching-internal-service-secret-32c';

describe('public L2 query limit parse', () => {
  it('unset / blank / non-integer / 0 / 501 refuse — never invent 50', () => {
    expect(parsePublicL2QueryLimit(undefined)).toBeUndefined();
    expect(parsePublicL2QueryLimit('')).toBeUndefined();
    expect(parsePublicL2QueryLimit('  ')).toBeUndefined();
    expect(parsePublicL2QueryLimit('50.5')).toBeUndefined();
    expect(parsePublicL2QueryLimit('0')).toBeUndefined();
    expect(parsePublicL2QueryLimit('501')).toBeUndefined();
    expect(isPublishedL2Limit(undefined)).toBe(false);
    expect(isPublishedL2Limit(50)).toBe(true);
  });

  it('owner-explicit 50 is a published window', () => {
    expect(parsePublicL2QueryLimit('50')).toBe(50);
  });
});

describe('GET /depth refuses unpublished limit', () => {
  async function mount() {
    const seen: number[] = [];
    const app = Fastify({ logger: false });
    registerRoutes(
      app,
      {
        depth: (_marketId: string, limit: number) => {
          seen.push(limit);
          return { bids: [], asks: [], sequence: 0 };
        },
        markets: [],
      } as never,
      SECRET,
      {},
    );
    await app.ready();
    return { app, seen };
  }

  it('router.ts does not invent 50', () => {
    const src = readFileSync(join(HERE, 'router.ts'), 'utf8');
    expect(src).not.toMatch(/limit \?\? ['"]50['"]/);
    expect(src).not.toMatch(/: 50\)/);
    expect(src).toMatch(/MATCHING_L2_LIMIT_UNSET/);
  });

  it('blank query refuses and does not call the engine', async () => {
    const { app, seen } = await mount();
    const res = await app.inject({ method: 'GET', url: '/markets/m/depth' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      code: MATCHING_L2_LIMIT_UNSET,
      message: userCopy(MATCHING_L2_LIMIT_UNSET),
    });
    expect(seen).toEqual([]);
    await app.close();
  });

  it('empty / zero / 501 query refuse (no invent 50)', async () => {
    const { app, seen } = await mount();
    for (const q of ['?limit=', '?limit=0', '?limit=501', '?limit=nope']) {
      const res = await app.inject({ method: 'GET', url: `/markets/m/depth${q}` });
      expect(res.statusCode, q).toBe(400);
      expect(res.json().code, q).toBe(MATCHING_L2_LIMIT_UNSET);
    }
    expect(seen).toEqual([]);
    await app.close();
  });

  it('owner-explicit 50 is published (not invented)', async () => {
    const { app, seen } = await mount();
    const res = await app.inject({ method: 'GET', url: '/markets/m/depth?limit=50' });
    expect(res.statusCode).toBe(200);
    expect(seen).toEqual([50]);
    await app.close();
  });
});
