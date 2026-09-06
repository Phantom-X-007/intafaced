/**
 * Unit card — HMAC blotter list limit unset refuse (no invented 50/100)
 *
 * 1. Promise: GET resting orders / surveillance cases do not dump the whole
 *    book. Query may pass 2 or 50 explicitly (L2 1..500 window). Missing /
 *    blank / non-integer / out of 1..500 refuses named codes.
 * 2. Break: `engine.restingOrders(marketId)` and `openSurveillanceCases()`
 *    returned the full work set on the HTTP door.
 * 3. Done bar: omit → named code; published 2 slices; empty book 200 { orders: [] }.
 * 4. Class N
 * 5. Paths: router.ts GET /markets/:marketId/orders, GET /surveillance/cases, l2-limit.ts
 * 6. RED: signed GET without limit returns 200 with the whole array
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';
import { registerRoutes } from './router.js';
import { MATCHING_RESTING_ORDERS_LIMIT_UNSET, MATCHING_SURVEILLANCE_CASES_LIMIT_UNSET, parseMatchingListQueryLimit } from './l2-limit.js';
import { userCopy } from './user-copy.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SECRET = 'matching-internal-service-secret-32c';

const RESTING = [
  { orderId: 'o1', accountId: 'a', remaining: '1' },
  { orderId: 'o2', accountId: 'a', remaining: '1' },
  { orderId: 'o3', accountId: 'a', remaining: '1' },
];

const CASES = [
  { accountId: 'desk', marketId: 'BTC-USDT', reason: 'spoofing' },
  { accountId: 'desk', marketId: 'BTC-USDT', reason: 'layering' },
  { accountId: 'desk', marketId: 'BTC-USDT', reason: 'self_trade' },
];

describe('HMAC list query limit parse', () => {
  it('unset / blank / non-integer / 0 / 501 refuse — never invent 50 or 100', () => {
    expect(parseMatchingListQueryLimit(undefined)).toBeUndefined();
    expect(parseMatchingListQueryLimit('')).toBeUndefined();
    expect(parseMatchingListQueryLimit('  ')).toBeUndefined();
    expect(parseMatchingListQueryLimit('50.5')).toBeUndefined();
    expect(parseMatchingListQueryLimit('0')).toBeUndefined();
    expect(parseMatchingListQueryLimit('501')).toBeUndefined();
    expect(parseMatchingListQueryLimit('100')).toBe(100);
    expect(parseMatchingListQueryLimit('2')).toBe(2);
  });
});

describe('GET /markets/:marketId/orders refuses unpublished limit', () => {
  async function mount(over: Record<string, unknown> = {}) {
    const seen: unknown[] = [];
    const app = Fastify({ logger: false });
    registerRoutes(
      app,
      {
        markets: ['BTC-USDT'],
        hasMarket: (m: string) => m === 'BTC-USDT',
        restingOrders: (marketId?: string) => {
          seen.push(marketId);
          return RESTING;
        },
        ...over,
      } as never,
      SECRET,
      {},
    );
    await app.ready();
    return { app, seen };
  }

  function signed(url: string) {
    return { method: 'GET' as const, url, headers: serviceAuthHeadersForBody('svc-trade', SECRET, '') };
  }

  it('router.ts does not invent 50 or 100 on the blotter door', () => {
    const src = readFileSync(join(HERE, 'router.ts'), 'utf8');
    expect(src).not.toMatch(/limit \?\? ['"]50['"]/);
    expect(src).not.toMatch(/limit \?\? ['"]100['"]/);
    expect(src).toMatch(/MATCHING_RESTING_ORDERS_LIMIT_UNSET/);
    expect(src).toMatch(/MATCHING_SURVEILLANCE_CASES_LIMIT_UNSET/);
  });

  it('omit limit refuses named code and does not call the engine', async () => {
    const { app, seen } = await mount();
    const res = await app.inject(signed('/markets/BTC-USDT/orders'));
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      code: MATCHING_RESTING_ORDERS_LIMIT_UNSET,
      message: userCopy(MATCHING_RESTING_ORDERS_LIMIT_UNSET),
    });
    expect(seen).toEqual([]);
    await app.close();
  });

  it('empty / zero / 501 query refuse (no invent 50)', async () => {
    const { app, seen } = await mount();
    for (const q of ['?limit=', '?limit=0', '?limit=501', '?limit=nope']) {
      const res = await app.inject(signed(`/markets/BTC-USDT/orders${q}`));
      expect(res.statusCode, q).toBe(400);
      expect(res.json().code, q).toBe(MATCHING_RESTING_ORDERS_LIMIT_UNSET);
    }
    expect(seen).toEqual([]);
    await app.close();
  });

  it('published 2 slices the resting book', async () => {
    const { app, seen } = await mount();
    const res = await app.inject(signed('/markets/BTC-USDT/orders?limit=2'));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ marketId: 'BTC-USDT', orders: RESTING.slice(0, 2) });
    expect(seen).toEqual(['BTC-USDT']);
    await app.close();
  });

  it('empty book with published limit is 200 { orders: [] } not 404', async () => {
    const { app } = await mount({ restingOrders: () => [] });
    const res = await app.inject(signed('/markets/BTC-USDT/orders?limit=2'));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ marketId: 'BTC-USDT', orders: [] });
    await app.close();
  });
});

describe('GET /surveillance/cases refuses unpublished limit', () => {
  async function mount(over: Record<string, unknown> = {}) {
    const seen: number[] = [];
    const app = Fastify({ logger: false });
    registerRoutes(
      app,
      {
        markets: ['BTC-USDT'],
        hasMarket: (m: string) => m === 'BTC-USDT',
        openSurveillanceCases: () => {
          seen.push(1);
          return CASES;
        },
        ...over,
      } as never,
      SECRET,
      {},
    );
    await app.ready();
    return { app, seen };
  }

  function signed(url: string) {
    return { method: 'GET' as const, url, headers: serviceAuthHeadersForBody('svc-trade', SECRET, '') };
  }

  it('omit limit refuses named code and does not call the engine', async () => {
    const { app, seen } = await mount();
    const res = await app.inject(signed('/surveillance/cases'));
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      code: MATCHING_SURVEILLANCE_CASES_LIMIT_UNSET,
      message: userCopy(MATCHING_SURVEILLANCE_CASES_LIMIT_UNSET),
    });
    expect(seen).toEqual([]);
    await app.close();
  });

  it('published 2 slices open cases', async () => {
    const { app } = await mount();
    const res = await app.inject(signed('/surveillance/cases?limit=2'));
    expect(res.statusCode).toBe(200);
    expect(res.json().cases).toEqual([
      { accountId: 'desk', marketId: 'BTC-USDT', reason: 'spoofing', status: 'open' },
      { accountId: 'desk', marketId: 'BTC-USDT', reason: 'layering', status: 'open' },
    ]);
    await app.close();
  });

  it('empty cases with published limit is 200 { cases: [] } not 404', async () => {
    const { app } = await mount({ openSurveillanceCases: () => [] });
    const res = await app.inject(signed('/surveillance/cases?limit=2'));
    expect(res.statusCode).toBe(200);
    expect(res.json().cases).toEqual([]);
    await app.close();
  });
});
