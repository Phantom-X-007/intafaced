import { describe, expect, it, vi } from 'vitest';
import { HttpMarketRegistry, MarketRegistryError, UnionMarketRegistry, type MarketRegistry } from './registry.js';

/**
 * WHICH MARKETS EXIST.
 *
 * The bug these tests pin down is not a parsing bug. svc-ws asked svc-matching
 * "what are the markets?", svc-matching answered with the books it holds, and
 * on the running fleet those ten journal-replayed ids and the sixteen ids the
 * browser can actually discover had an EMPTY intersection. Every one of the
 * shapes below is a real shape one of those two services returns.
 */

const LISTED = ['fbbe6534-e7af-49a8-a782-bbdd1e1894ba', '17097ffd-04f6-4505-b3a8-1e8ef790cdbc'];
const ENGINE = ['2a70a839-aeb6-4c04-a067-2b000f392bdb'];

function respondWith(body: unknown, status = 200): typeof globalThis.fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as typeof globalThis.fetch;
}

const silent = { info: () => undefined, warn: () => undefined };

function fixedRegistry(ids: readonly string[]): MarketRegistry {
  return { markets: async () => ids };
}

function failingRegistry(message: string): MarketRegistry {
  return {
    markets: async () => {
      throw new MarketRegistryError(message, null);
    },
  };
}

describe('HttpMarketRegistry', () => {
  it('reads ids out of the exchange-contract market array svc-trade serves', async () => {
    // The real shape: a bare array of full ccxt-style markets. Only `id` is read.
    const registry = new HttpMarketRegistry({
      baseUrl: 'http://trade.test',
      fetch: respondWith([
        { id: LISTED[0], symbol: 'AUD/USD', base: 'AUD', quote: 'USD', active: true },
        { id: LISTED[1], symbol: 'BRENT/USD', base: 'BRENT', quote: 'USD', active: true },
      ]),
    });

    await expect(registry.markets()).resolves.toEqual(LISTED);
  });

  it('also reads the {markets: [...]} shape, so re-pointing it is a URL change', async () => {
    const registry = new HttpMarketRegistry({ baseUrl: 'http://matching.test', path: '/markets', fetch: respondWith({ markets: ENGINE }) });
    await expect(registry.markets()).resolves.toEqual(ENGINE);
  });

  it('defaults to /api/v1/markets and strips a trailing slash off the base', async () => {
    const seen: string[] = [];
    const registry = new HttpMarketRegistry({
      baseUrl: 'http://trade.test/',
      fetch: (async (url: unknown) => {
        seen.push(String(url));
        return new Response(JSON.stringify([]), { status: 200 });
      }) as typeof globalThis.fetch,
    });

    await registry.markets();
    expect(seen).toEqual(['http://trade.test/api/v1/markets']);
  });

  it('sends no credential of any kind', async () => {
    // The whole argument for svc-ws being its own process is that it holds
    // nothing. A registry that needed a token would spend that argument.
    const seen: RequestInit[] = [];
    const registry = new HttpMarketRegistry({
      baseUrl: 'http://trade.test',
      fetch: (async (_url: unknown, init?: RequestInit) => {
        seen.push(init ?? {});
        return new Response(JSON.stringify([]), { status: 200 });
      }) as typeof globalThis.fetch,
    });

    await registry.markets();
    expect(seen[0]?.headers).toBeUndefined();
    expect(JSON.stringify(seen[0])).not.toMatch(/authorization|signature|secret/i);
  });

  it('skips one malformed row rather than delisting the rest', async () => {
    const registry = new HttpMarketRegistry({
      baseUrl: 'http://trade.test',
      fetch: respondWith([{ id: LISTED[0] }, { symbol: 'NO/ID' }, { id: 42 }, { id: '' }, { id: LISTED[1] }]),
    });

    await expect(registry.markets()).resolves.toEqual(LISTED);
  });

  it('carries the upstream status so a caller can tell a 404 from a 500', async () => {
    const registry = new HttpMarketRegistry({ baseUrl: 'http://trade.test', fetch: respondWith({}, 503) });
    await expect(registry.markets()).rejects.toMatchObject({ name: 'MarketRegistryError', status: 503 });
  });

  it('reports an unreachable upstream as unreachable, not as a bad response', async () => {
    const registry = new HttpMarketRegistry({
      baseUrl: 'http://trade.test',
      fetch: (async () => {
        throw new TypeError('fetch failed');
      }) as typeof globalThis.fetch,
    });

    await expect(registry.markets()).rejects.toThrow(/market registry unreachable/);
  });

  it('refuses a body that is not a market list at all', async () => {
    const registry = new HttpMarketRegistry({ baseUrl: 'http://trade.test', fetch: respondWith({ ok: true }) });
    await expect(registry.markets()).rejects.toThrow(/no market list/);
  });

  it('refuses rows that carry no ids rather than reporting zero markets', async () => {
    // Zero markets and "the shape changed under us" must not look the same. The
    // first is a quiet exchange; the second delists everything.
    const registry = new HttpMarketRegistry({ baseUrl: 'http://trade.test', fetch: respondWith([{ symbol: 'AUD/USD' }]) });
    await expect(registry.markets()).rejects.toThrow(/rows with no ids/);
  });

  it('accepts a genuinely empty list', async () => {
    const registry = new HttpMarketRegistry({ baseUrl: 'http://trade.test', fetch: respondWith([]) });
    await expect(registry.markets()).resolves.toEqual([]);
  });
});

describe('UnionMarketRegistry', () => {
  it('unions the listing with the engine — the case that was broken', async () => {
    // Disjoint on purpose: this is the exact fleet state. Neither list alone is
    // the answer, and picking either one refuses real subscriptions.
    const union = new UnionMarketRegistry(
      [
        { name: 'svc-trade', registry: fixedRegistry(LISTED) },
        { name: 'svc-matching', registry: fixedRegistry(ENGINE) },
      ],
      silent,
    );

    await expect(union.markets()).resolves.toEqual([...LISTED, ...ENGINE]);
  });

  it('deduplicates an id both sources vouch for', async () => {
    const union = new UnionMarketRegistry(
      [
        { name: 'svc-trade', registry: fixedRegistry(LISTED) },
        { name: 'svc-matching', registry: fixedRegistry([LISTED[0]!]) },
      ],
      silent,
    );

    await expect(union.markets()).resolves.toEqual(LISTED);
  });

  it('keeps serving traded markets when the listing service is down', async () => {
    // A public book feed that goes dark because an API container restarted is a
    // worse service than one that serves the books it can still prove.
    const warn = vi.fn();
    const union = new UnionMarketRegistry(
      [
        { name: 'svc-trade', registry: failingRegistry('connect ECONNREFUSED') },
        { name: 'svc-matching', registry: fixedRegistry(ENGINE) },
      ],
      { info: () => undefined, warn },
    );

    await expect(union.markets()).resolves.toEqual(ENGINE);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('keeps serving listed markets when the engine is down', async () => {
    const union = new UnionMarketRegistry(
      [
        { name: 'svc-trade', registry: fixedRegistry(LISTED) },
        { name: 'svc-matching', registry: failingRegistry('connect ECONNREFUSED') },
      ],
      silent,
    );

    await expect(union.markets()).resolves.toEqual(LISTED);
  });

  it('throws only when every source failed, naming each one', async () => {
    // The hub treats a throw as "keep the last known list", so throwing on a
    // partial failure would replace sixteen markets with ten for no reason.
    const union = new UnionMarketRegistry(
      [
        { name: 'svc-trade', registry: failingRegistry('trade is down') },
        { name: 'svc-matching', registry: failingRegistry('matching is down') },
      ],
      silent,
    );

    await expect(union.markets()).rejects.toThrow(/svc-trade: .*trade is down.*svc-matching: .*matching is down/s);
  });

  it('asks every source concurrently, so the slowest costs one round trip', async () => {
    let inFlight = 0;
    let peak = 0;
    const slow = (ids: readonly string[]): MarketRegistry => ({
      markets: async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return ids;
      },
    });

    const union = new UnionMarketRegistry(
      [
        { name: 'svc-trade', registry: slow(LISTED) },
        { name: 'svc-matching', registry: slow(ENGINE) },
      ],
      silent,
    );

    await union.markets();
    expect(peak).toBe(2);
  });
});
