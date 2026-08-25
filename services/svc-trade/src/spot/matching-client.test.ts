import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { SERVICE_BODY_DIGEST_HEADER, SERVICE_SIGNATURE_HEADER } from '@intafaced/contracts';
import { createMatchingClient, MatchingUnavailableError } from './matching-client.js';
import { decideMarketAction } from '../market-lifecycle.js';
import { createLifecycleAdmissionProof } from '../lifecycle-proof.js';
import type { MarketStateSnapshot } from '@intafaced/exchange-contract';

/**
 * THE DIFFERENCE BETWEEN "NO ORDERS YET" AND "THE ENGINE IS DOWN".
 *
 * svc-matching answers 404 for a market it holds no book for. That is the
 * correct answer and an entirely normal state — a listed market that has never
 * traded has no book, and every market on this platform is in that state until
 * someone trades it.
 *
 * The shared `call` helper treated every non-OK response as
 * `MatchingUnavailableError`, so that 404 was reported as an unavailable engine
 * and surfaced as **502 on the public CCXT contract**:
 * `/api/v1/ticker/:symbol` and `/api/v1/orderbook/:symbol` returned 502 for
 * every untraded market. `/api/v1/trades` and `/api/v1/tickers` were unaffected
 * only because they never read depth.
 *
 * A caller can act on "no orders yet" and must retry "the engine is down", so
 * the two cannot share a response.
 */

const SECRET = 'matching-client-test-secret-at-least-32-chars';
const MARKET = '00000000-0000-4000-8000-000000000001';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Stub `fetch` with a fixed response, and capture what was requested. */
function stubFetch(response: Response | (() => never)) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      if (typeof response === 'function') response();
      return response;
    }),
  );
  return calls;
}

describe('depth — an empty book is not an unavailable engine', () => {
  it('returns an empty book on 404 rather than throwing', async () => {
    stubFetch(new Response('not found', { status: 404 }));
    const client = createMatchingClient('http://matching:4005', SECRET);

    const depth = await client.depth(MARKET, 1);

    expect(depth).toEqual({ bids: [], asks: [], sequence: 0 });
  });

  it('the empty book is well-formed, so a caller can read it without a null check', async () => {
    stubFetch(new Response('not found', { status: 404 }));
    const client = createMatchingClient('http://matching:4005', SECRET);

    const depth = await client.depth(MARKET, 50);

    // A ticker handler takes the top of book off these arrays. Returning null
    // or a partial object would move the failure into the caller.
    expect(Array.isArray(depth.bids)).toBe(true);
    expect(Array.isArray(depth.asks)).toBe(true);
    expect(depth.bids).toHaveLength(0);
    expect(depth.asks).toHaveLength(0);
    expect(depth.sequence).toBe(0);
  });

  it('still throws when the engine genuinely fails — 500 is not an empty book', async () => {
    stubFetch(new Response('boom', { status: 500 }));
    const client = createMatchingClient('http://matching:4005', SECRET);

    await expect(client.depth(MARKET, 1)).rejects.toBeInstanceOf(MatchingUnavailableError);
  });

  it('still throws when the engine is unreachable', async () => {
    stubFetch(() => {
      throw new TypeError('fetch failed');
    });
    const client = createMatchingClient('http://matching:4005', SECRET);

    await expect(client.depth(MARKET, 1)).rejects.toBeInstanceOf(MatchingUnavailableError);
  });

  it('a 401 is NOT an empty book — a rejected signature must stay loud', async () => {
    // The engine's order routes are service-only. If our credentials stop
    // verifying, an empty book would present as a quiet, permanent outage.
    stubFetch(new Response('unauthenticated', { status: 401 }));
    const client = createMatchingClient('http://matching:4005', SECRET);

    await expect(client.depth(MARKET, 1)).rejects.toBeInstanceOf(MatchingUnavailableError);
  });

  it('returns the real book unchanged when the engine has one', async () => {
    const book = { bids: [['100.00', '2']], asks: [['101.00', '3']], sequence: 42 };
    stubFetch(new Response(JSON.stringify(book), { status: 200, headers: { 'content-type': 'application/json' } }));
    const client = createMatchingClient('http://matching:4005', SECRET);

    await expect(client.depth(MARKET, 1)).resolves.toEqual(book);
  });

  it('still authenticates the read — the 404 path must not skip the service headers', async () => {
    const calls = stubFetch(new Response('not found', { status: 404 }));
    const client = createMatchingClient('http://matching:4005', SECRET);

    await client.depth(MARKET, 1);

    expect(calls[0]).toContain(`/markets/${MARKET}/depth`);
    expect(calls[0]).toContain('limit=1');
  });
});

describe('listOrders — non-destructive liveness', () => {
  it('a 404 market is an empty list, not MatchingUnavailable', async () => {
    stubFetch(new Response('not found', { status: 404 }));
    const client = createMatchingClient('http://matching:4005', SECRET);

    await expect(client.listOrders(MARKET)).resolves.toEqual({ marketId: MARKET, orders: [] });
  });

  it('returns resting orders unchanged', async () => {
    const body = {
      marketId: MARKET,
      orders: [
        {
          marketId: MARKET,
          orderId: 'o1',
          accountId: 'a1',
          kind: 'book',
          side: 'buy',
          price: '100',
          remaining: '1',
          sequence: 7,
        },
      ],
    };
    const calls = stubFetch(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
    const client = createMatchingClient('http://matching:4005', SECRET);

    await expect(client.listOrders(MARKET)).resolves.toEqual(body);
    expect(calls[0]).toContain(`/markets/${MARKET}/orders`);
    expect(calls[0]).not.toContain('DELETE');
  });
});

describe('listMarkets — market-id drift port', () => {
  it('returns engine market ids unchanged (no invent)', async () => {
    const body = { markets: [MARKET, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] };
    const calls = stubFetch(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
    const client = createMatchingClient('http://matching:4005', SECRET);

    await expect(client.listMarkets()).resolves.toEqual(body);
    expect(calls[0]).toContain('/markets');
    expect(calls[0]).not.toContain('DELETE');
  });

  it('empty engine set is honest empty, not unavailable', async () => {
    stubFetch(new Response(JSON.stringify({ markets: [] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const client = createMatchingClient('http://matching:4005', SECRET);

    await expect(client.listMarkets()).resolves.toEqual({ markets: [] });
  });

  it('transport failure stays loud', async () => {
    stubFetch(new Response('boom', { status: 500 }));
    const client = createMatchingClient('http://matching:4005', SECRET);

    await expect(client.listMarkets()).rejects.toBeInstanceOf(MatchingUnavailableError);
  });
});

describe('submit — signed lifecycle proof body', () => {
  it('serializes the exact proof as an additive JSON field', async () => {
    const snapshot: MarketStateSnapshot = {
      marketId: MARKET,
      ruleVersion: 'rules-1',
      instrumentId: MARKET,
      instrumentVersion: 'instrument-1',
      state: 'OPEN',
      reasonCategory: 'NORMAL',
      reasonCode: 'trade.lifecycle.ready',
      effectiveAt: '2026-08-24T16:00:00.000Z',
      observedAt: '2026-08-24T16:00:00.000Z',
      lastGoodState: 'OPEN',
      allowedActions: ['PLACE'],
      transitionId: 'transition-1',
      evidenceRefs: ['evidence-1'],
    };
    const lifecycleProof = createLifecycleAdmissionProof(snapshot, decideMarketAction(snapshot, 'PLACE'), 'PLACE');
    let requestBody = '';
    let requestHeaders: HeadersInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestBody = String(init?.body);
        requestHeaders = init?.headers;
        return new Response(
          JSON.stringify({ accepted: true, sequence: 1, fills: [], resting: null, rejected: null, cancellations: [], triggered: [] }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      }),
    );
    const client = createMatchingClient('http://matching:4005', SECRET);

    await client.submit(MARKET, {
      orderId: 'order-1',
      accountId: 'account-1',
      type: 'limit',
      side: 'buy',
      qty: '1',
      price: '100',
      stopPrice: null,
      tif: 'GTC',
      lifecycleProof,
    });

    expect(JSON.parse(requestBody)).toMatchObject({ lifecycleProof });
    expect(JSON.stringify(JSON.parse(requestBody).lifecycleProof)).toBe(JSON.stringify(lifecycleProof));
    const headers = new Headers(requestHeaders);
    expect(headers.get(SERVICE_BODY_DIGEST_HEADER)).toBe(createHash('sha256').update(requestBody).digest('hex'));
    expect(headers.get(SERVICE_SIGNATURE_HEADER)).toBeTruthy();
  });
});


describe('submit — GTD expireAt', () => {
  it('forwards expireAt on a GTD submit — the client does not invent one', async () => {
    let requestBody = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestBody = String(init?.body);
        return new Response(
          JSON.stringify({ accepted: true, sequence: 1, fills: [], resting: null, rejected: null, cancellations: [], triggered: [] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );
    const client = createMatchingClient('http://matching:4005', SECRET);
    await client.submit(MARKET, {
      orderId: 'order-gtd',
      accountId: 'account-1',
      type: 'limit',
      side: 'buy',
      qty: '1',
      price: '100',
      stopPrice: null,
      tif: 'GTD',
      expireAt: '2026-08-25T18:00:00.000Z',
    });
    expect(JSON.parse(requestBody)).toMatchObject({ tif: 'GTD', expireAt: '2026-08-25T18:00:00.000Z' });
  });
});

describe('amend — PATCH with AMEND proof and expected version', () => {
  it('binds the AMEND lifecycle proof and expectedVersion on the signed body', async () => {
    const snapshot: MarketStateSnapshot = {
      marketId: MARKET,
      ruleVersion: 'rules-1',
      instrumentId: MARKET,
      instrumentVersion: 'instrument-1',
      state: 'OPEN',
      reasonCategory: 'NORMAL',
      reasonCode: 'trade.lifecycle.ready',
      effectiveAt: '2026-08-24T16:00:00.000Z',
      observedAt: '2026-08-24T16:00:00.000Z',
      lastGoodState: 'OPEN',
      allowedActions: ['AMEND'],
      transitionId: 'transition-1',
      evidenceRefs: ['evidence-1'],
    };
    const lifecycleProof = createLifecycleAdmissionProof(snapshot, decideMarketAction(snapshot, 'AMEND'), 'AMEND');
    let requestBody = '';
    let requestUrl = '';
    let requestMethod = '';
    let requestHeaders: HeadersInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requestUrl = String(input);
        requestMethod = String(init?.method);
        requestBody = String(init?.body);
        requestHeaders = init?.headers;
        return new Response(
          JSON.stringify({
            accepted: true,
            orderId: 'order-1',
            sequence: 1,
            version: 2,
            priority: 'retained',
            fills: [],
            resting: null,
            rejected: null,
            cancellations: [],
            triggered: [],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );
    const client = createMatchingClient('http://matching:4005', SECRET);

    const result = await client.amend(MARKET, 'order-1', {
      expectedVersion: 1,
      qty: '1',
      lifecycleProof,
    });

    expect(requestMethod).toBe('PATCH');
    expect(requestUrl).toContain(`/markets/${MARKET}/orders/order-1`);
    expect(JSON.parse(requestBody)).toMatchObject({ expectedVersion: 1, qty: '1', lifecycleProof });
    expect(JSON.parse(requestBody).lifecycleProof.action).toBe('AMEND');
    const headers = new Headers(requestHeaders);
    expect(headers.get(SERVICE_BODY_DIGEST_HEADER)).toBe(createHash('sha256').update(requestBody).digest('hex'));
    expect(result).toMatchObject({ accepted: true, priority: 'retained', version: 2 });
  });

  it('maps 404 to a refused amend, not MatchingUnavailable', async () => {
    stubFetch(new Response('not found', { status: 404 }));
    const snapshot: MarketStateSnapshot = {
      marketId: MARKET,
      ruleVersion: 'rules-1',
      instrumentId: MARKET,
      instrumentVersion: 'instrument-1',
      state: 'OPEN',
      reasonCategory: 'NORMAL',
      reasonCode: 'trade.lifecycle.ready',
      effectiveAt: '2026-08-24T16:00:00.000Z',
      observedAt: '2026-08-24T16:00:00.000Z',
      lastGoodState: 'OPEN',
      allowedActions: ['AMEND'],
      transitionId: 'transition-1',
      evidenceRefs: ['evidence-1'],
    };
    const lifecycleProof = createLifecycleAdmissionProof(snapshot, decideMarketAction(snapshot, 'AMEND'), 'AMEND');
    const client = createMatchingClient('http://matching:4005', SECRET);

    await expect(client.amend(MARKET, 'order-1', { expectedVersion: 1, qty: '1', lifecycleProof })).resolves.toMatchObject({
      accepted: false,
      rejected: { code: 'order_not_found' },
    });
  });
});

describe('submit — reduceOnly', () => {
  it('forwards reduceOnly on the signed body — the client does not invent a mark', async () => {
    let requestBody = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestBody = String(init?.body);
        return new Response(
          JSON.stringify({ accepted: true, sequence: 1, fills: [], resting: null, rejected: null, cancellations: [], triggered: [] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );
    const client = createMatchingClient('http://matching:4005', SECRET);
    await client.submit(MARKET, {
      orderId: 'order-ro',
      accountId: 'account-1',
      type: 'limit',
      side: 'sell',
      qty: '1',
      price: '100',
      stopPrice: null,
      tif: 'GTC',
      reduceOnly: true,
    });
    expect(JSON.parse(requestBody)).toMatchObject({ tif: 'GTC', reduceOnly: true });
    expect(JSON.parse(requestBody).price).toBe('100');
  });
});

describe('submit tif PO', () => {
  it('forwards tif PO and the caller price — the client does not invent a price', async () => {
    let requestBody = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestBody = String(init?.body);
        return new Response(
          JSON.stringify({ accepted: true, sequence: 1, fills: [], resting: null, rejected: null, cancellations: [], triggered: [] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );
    const client = createMatchingClient('http://matching:4005', SECRET);
    await client.submit(MARKET, {
      orderId: 'order-po',
      accountId: 'account-1',
      type: 'limit',
      side: 'buy',
      qty: '1',
      price: '100',
      stopPrice: null,
      tif: 'PO',
    });
    expect(JSON.parse(requestBody)).toMatchObject({ tif: 'PO', price: '100' });
    expect(JSON.parse(requestBody).price).toBe('100');
  });
});
