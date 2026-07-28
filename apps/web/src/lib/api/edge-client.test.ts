import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createEdgeClient } from './edge-client';
import { listMarkets, login, predictAccount } from './services';
import { marketSchema } from './wire';

/**
 * The client layer's three obligations, tested as three failures:
 *
 *   1. the bearer token reaches the edge — without it every `scopedProcedure`
 *      in the OS refuses the caller, which presents to a user as "logged in but
 *      nothing works";
 *   2. an unreachable service produces a STATE, never an exception — one dead
 *      service out of twelve must grey a panel, not white-screen a terminal;
 *   3. an answer in the wrong shape is refused — because the alternative is
 *      rendering `undefined` where a price goes.
 */

interface Captured {
  url: string;
  init: RequestInit | undefined;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** A tRPC v11 success envelope for a non-batched call. */
function trpcOk(data: unknown): Response {
  return jsonResponse({ result: { data } });
}

/** A tRPC v11 error envelope, as a mounted router would send it. */
function trpcError(code: string, httpStatus: number, message: string): Response {
  return jsonResponse({ error: { message, code: -32001, data: { code, httpStatus } } }, httpStatus);
}

function spyFetch(responder: (url: string, init: RequestInit | undefined) => Response | Promise<Response>) {
  const calls: Captured[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    return responder(url, init);
  }) as typeof globalThis.fetch;
  return { fetchImpl, calls };
}

const MARKET = {
  id: '11111111-1111-4111-8111-111111111111',
  symbol: 'BTC/USDT',
  base: 'BTC',
  quote: 'USDT',
  kind: 'spot',
  status: 'active',
  tickSize: '0.01',
  lotSize: '0.00001',
  minQty: '0.0001',
  maxQty: null,
  minNotional: '10',
  makerBps: 10,
  takerBps: 20,
  listedAt: null,
};

describe('the edge client attaches authority the way svc-edge expects', () => {
  it('sends Authorization: Bearer on every call once a session exists', async () => {
    const { fetchImpl, calls } = spyFetch(() => trpcOk([MARKET]));
    const edge = createEdgeClient({ baseUrl: 'http://edge.test', token: () => 'access-token-abc', fetch: fetchImpl });

    const result = await listMarkets(edge);

    expect(result.ok).toBe(true);
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get('authorization')).toBe('Bearer access-token-abc');
  });

  it('sends NO Authorization header when there is no session', async () => {
    const { fetchImpl, calls } = spyFetch(() => trpcOk([MARKET]));
    const edge = createEdgeClient({ baseUrl: 'http://edge.test', fetch: fetchImpl });

    await listMarkets(edge);

    const headers = new Headers(calls[0]?.init?.headers);
    // Absent, not empty: `Authorization: Bearer ` is a malformed header, and the
    // permissionless Protocol Plane calls must be genuinely anonymous.
    expect(headers.has('authorization')).toBe(false);
  });

  it('reads the token at call time, so a sign-out is immediate', async () => {
    const { fetchImpl, calls } = spyFetch(() => trpcOk([MARKET]));
    let token: string | null = 'first';
    const edge = createEdgeClient({ baseUrl: 'http://edge.test', token: () => token, fetch: fetchImpl });

    await listMarkets(edge);
    token = null;
    await listMarkets(edge);

    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe('Bearer first');
    expect(new Headers(calls[1]?.init?.headers).has('authorization')).toBe(false);
  });

  it('routes each service to its own edge prefix and never to the service directly', async () => {
    const { fetchImpl, calls } = spyFetch((url) =>
      url.includes('/api/trade/')
        ? trpcOk([MARKET])
        : trpcOk({ address: '0x0', chainId: 1, factory: '0x0', implementation: '0x0', deployed: false }),
    );
    const edge = createEdgeClient({ baseUrl: 'http://edge.test', fetch: fetchImpl });

    await listMarkets(edge);
    await predictAccount(edge, '0x1111111111111111111111111111111111111111');

    expect(calls[0]?.url).toContain('http://edge.test/api/trade/trpc/markets.list');
    expect(calls[1]?.url).toContain('http://edge.test/api/protocol/trpc/predictAddress');
  });
});

describe('an unreachable service is a state, not a crash', () => {
  it('returns unreachable when the connection fails outright', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof globalThis.fetch;
    const edge = createEdgeClient({ baseUrl: 'http://edge.test', fetch: fetchImpl });

    const result = await listMarkets(edge);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('unreachable');
    expect(result.service).toBe('trade');
    expect(result.path).toBe('markets.list');
  });

  it('does not throw when the edge itself is down', async () => {
    const fetchImpl = (async () => {
      throw new Error('ECONNREFUSED 127.0.0.1:4000');
    }) as typeof globalThis.fetch;
    const edge = createEdgeClient({ fetch: fetchImpl });

    await expect(edge.ready()).resolves.toMatchObject({ ok: false, reason: 'unreachable' });
  });

  it('distinguishes "not signed in" from "signed in and refused"', async () => {
    const unauthorized = createEdgeClient({ fetch: spyFetch(() => trpcError('UNAUTHORIZED', 401, 'no principal')).fetchImpl });
    const forbidden = createEdgeClient({
      fetch: spyFetch(() => trpcError('FORBIDDEN', 403, 'verification tier basic required')).fetchImpl,
    });

    const a = await listMarkets(unauthorized);
    const b = await listMarkets(forbidden);

    expect(a.ok === false && a.reason).toBe('unauthenticated');
    expect(b.ok === false && b.reason).toBe('forbidden');
  });

  it('reports a rejected order as rejected, carrying the service’s own message', async () => {
    const edge = createEdgeClient({ fetch: spyFetch(() => trpcError('BAD_REQUEST', 400, 'insufficient funds')).fetchImpl });

    const result = await login(edge, { identifier: 'a', password: 'b' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('rejected');
    expect(result.message).toContain('insufficient funds');
  });
});

describe('an answer in the wrong shape is refused, not rendered', () => {
  it('rejects a market whose price fields are JSON numbers', async () => {
    // The exact regression that matters: a service that stops sending decimal
    // strings and starts sending floats must not reach a price column.
    const edge = createEdgeClient({ fetch: spyFetch(() => trpcOk([{ ...MARKET, tickSize: 0.01 }])).fetchImpl });

    const result = await listMarkets(edge);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('invalid-response');
    expect(result.message).toContain('tickSize');
  });

  it('rejects a decimal string with more precision than the ledger carries', () => {
    const nineteen = { ...MARKET, tickSize: `0.${'1'.repeat(19)}` };
    expect(marketSchema.safeParse(nineteen).success).toBe(false);
  });

  it('rejects a session that arrives without an access token', async () => {
    const edge = createEdgeClient({
      fetch: spyFetch(() => trpcOk({ refreshToken: 'r', expiresAt: 'x', userId: '11111111-1111-4111-8111-111111111111' })).fetchImpl,
    });

    const result = await login(edge, { identifier: 'a', password: 'b' });

    expect(result.ok === false && result.reason).toBe('invalid-response');
  });

  it('refuses a Protocol Plane health answer that claims custody', async () => {
    const edge = createEdgeClient({
      fetch: spyFetch(() => trpcOk({ ok: true, service: 'svc-protocol', chainId: 1, custodial: true, relayEnabled: false })).fetchImpl,
    });

    const { protocolHealth } = await import('./services');
    const result = await protocolHealth(edge);

    // The plane's whole claim is `custodial: false`. A deployment that answered
    // otherwise must not get a sovereign badge drawn for it.
    expect(result.ok === false && result.reason).toBe('invalid-response');
  });
});

describe('the edge readiness probe', () => {
  it('returns the route table svc-edge publishes', async () => {
    const edge = createEdgeClient({
      fetch: spyFetch(() => jsonResponse({ ready: true, routes: ['/api/identity', '/api/trade'] })).fetchImpl,
    });

    const result = await edge.ready();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value).toEqual(['/api/identity', '/api/trade']);
  });

  it('refuses a readiness body with no route table', async () => {
    const edge = createEdgeClient({ fetch: spyFetch(() => jsonResponse({ ready: true })).fetchImpl });
    await expect(edge.ready()).resolves.toMatchObject({ ok: false, reason: 'invalid-response' });
  });
});

describe('nothing in the client parses money as a number', () => {
  it('keeps every amount a string all the way through the schema', async () => {
    const edge = createEdgeClient({ fetch: spyFetch(() => trpcOk([MARKET])).fetchImpl });
    const result = await listMarkets(edge);

    if (!result.ok) throw new Error('expected ok');
    const market = result.value[0];
    expect(typeof market?.tickSize).toBe('string');
    expect(typeof market?.minNotional).toBe('string');
    // bps is a count, not money — the one legitimate number on the record.
    expect(typeof market?.makerBps).toBe('number');
  });

  it('has no z.number() standing in for an amount anywhere in the market schema', () => {
    const shape = marketSchema.shape;
    for (const key of ['tickSize', 'lotSize', 'minQty', 'minNotional'] as const) {
      expect(shape[key] instanceof z.ZodString).toBe(true);
    }
  });
});

describe('one transport per service', () => {
  it('never batches two services into one request', async () => {
    const { fetchImpl, calls } = spyFetch(() => trpcOk([]));
    const edge = createEdgeClient({ baseUrl: 'http://edge.test', fetch: fetchImpl });

    await Promise.all([
      listMarkets(edge),
      edge.query('identity', 'health', z.object({ ok: z.boolean(), service: z.string() }).passthrough()),
    ]);

    expect(calls).toHaveLength(2);
    expect(new Set(calls.map((c) => new URL(c.url).pathname.split('/trpc')[0])).size).toBe(2);
  });
});

/** Guards the assumption the whole client rests on: vi is real, fetch is injectable. */
describe('test harness sanity', () => {
  it('injects fetch rather than patching the global', async () => {
    const globalSpy = vi.spyOn(globalThis, 'fetch');
    const edge = createEdgeClient({ fetch: spyFetch(() => trpcOk([])).fetchImpl });
    await listMarkets(edge);
    expect(globalSpy).not.toHaveBeenCalled();
    globalSpy.mockRestore();
  });
});
