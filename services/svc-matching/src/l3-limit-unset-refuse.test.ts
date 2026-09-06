/**
 * Unit card — public L3 depth limit unset refuse (no invented 50)
 *
 * 1. Promise: blank GET /depth/l3 does not dump the native queue. Owner/query
 *    may pass 2 or 50 explicitly (same 1..500 as public L2). Missing / blank /
 *    non-integer / out of 1..500 refuses matching.l3_depth_limit_unset.
 * 2. Break: GET /depth/l3 called nativeL3FromEngine with no window and returned
 *    the whole book.
 * 3. Done bar: omit → named code; published 2 slices; empty book 200 { bids:[], asks:[] }.
 * 4. Class N
 * 5. Paths: router.ts GET /markets/:marketId/depth/l3, l2-limit.ts
 * 6. RED: blank GET /depth/l3 returns 200 with the full native queue
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerRoutes } from './router.js';
import { MATCHING_L3_DEPTH_LIMIT_UNSET, parsePublicL2QueryLimit } from './l2-limit.js';
import { userCopy } from './user-copy.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SECRET = 'matching-internal-service-secret-32c';
const MARKET = 'BTC-USDT';

const ASKS = [
  { price: '100', orders: [{ orderId: 'a', remaining: '1', sequence: 1 }] },
  { price: '101', orders: [{ orderId: 'b', remaining: '1', sequence: 2 }] },
  { price: '102', orders: [{ orderId: 'c', remaining: '1', sequence: 3 }] },
];

describe('GET /depth/l3 refuses unpublished limit', () => {
  async function mount(over: Record<string, unknown> = {}) {
    const seen: string[] = [];
    const app = Fastify({ logger: false });
    registerRoutes(
      app,
      {
        markets: [MARKET],
        hasMarket: (m: string) => m === MARKET,
        l3Queue: (marketId: string) => {
          seen.push(marketId);
          return { level: 'L3', marketId, bids: [], asks: ASKS };
        },
        ...over,
      } as never,
      SECRET,
      {},
    );
    await app.ready();
    return { app, seen };
  }

  it('router.ts does not invent 50 on the L3 door', () => {
    const src = readFileSync(join(HERE, 'router.ts'), 'utf8');
    expect(src).not.toMatch(/limit \?\? ['"]50['"]/);
    expect(src).toMatch(/MATCHING_L3_DEPTH_LIMIT_UNSET/);
    expect(src).toMatch(/parsePublicL2QueryLimit/);
  });

  it('reuse L2 1..500 window — never invent a third cap', () => {
    expect(parsePublicL2QueryLimit(undefined)).toBeUndefined();
    expect(parsePublicL2QueryLimit('2')).toBe(2);
    expect(parsePublicL2QueryLimit('50')).toBe(50);
    expect(parsePublicL2QueryLimit('501')).toBeUndefined();
  });

  it('omit limit refuses named code and does not call the engine', async () => {
    const { app, seen } = await mount();
    const res = await app.inject({ method: 'GET', url: `/markets/${MARKET}/depth/l3` });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      code: MATCHING_L3_DEPTH_LIMIT_UNSET,
      message: userCopy(MATCHING_L3_DEPTH_LIMIT_UNSET),
    });
    expect(seen).toEqual([]);
    await app.close();
  });

  it('empty / zero / 501 query refuse (no invent 50)', async () => {
    const { app, seen } = await mount();
    for (const q of ['?limit=', '?limit=0', '?limit=501', '?limit=nope']) {
      const res = await app.inject({ method: 'GET', url: `/markets/${MARKET}/depth/l3${q}` });
      expect(res.statusCode, q).toBe(400);
      expect(res.json().code, q).toBe(MATCHING_L3_DEPTH_LIMIT_UNSET);
    }
    expect(seen).toEqual([]);
    await app.close();
  });

  it('published 2 slices the native L3 queue', async () => {
    const { app, seen } = await mount();
    const res = await app.inject({ method: 'GET', url: `/markets/${MARKET}/depth/l3?limit=2` });
    expect(res.statusCode).toBe(200);
    expect(res.json().level).toBe('L3');
    expect(res.json().asks).toEqual(ASKS.slice(0, 2));
    expect(res.json().asks).toHaveLength(2);
    expect(res.json().bids).toEqual([]);
    expect(seen).toEqual([MARKET]);
    await app.close();
  });

  it('empty book with published limit is 200 empty arrays not 404', async () => {
    const { app } = await mount({
      l3Queue: (marketId: string) => ({ level: 'L3', marketId, bids: [], asks: [] }),
    });
    const res = await app.inject({ method: 'GET', url: `/markets/${MARKET}/depth/l3?limit=2` });
    expect(res.statusCode).toBe(200);
    expect(res.json().level).toBe('L3');
    expect(res.json().bids).toEqual([]);
    expect(res.json().asks).toEqual([]);
    await app.close();
  });
});
