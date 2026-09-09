import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BASE_PERKS, SERVICE_BODY_DIGEST_HEADER, SERVICE_SIGNATURE_HEADER } from '@intafaced/contracts';
import { createRankPerksClient } from './rank-perks.js';
import { TradeError } from './types.js';

const SECRET = 'rank-perks-test-internal-secret-32ch';
const USER = '11111111-1111-4111-8111-111111111111';
const EMPTY_DIGEST = createHash('sha256').update('', 'utf8').digest('hex');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createRankPerksClient — body-bound GET', () => {
  it('signs the empty body and does not send one', async () => {
    let method = '';
    let requestBody: unknown;
    let requestHeaders: HeadersInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        method = String(init?.method);
        requestBody = init?.body;
        requestHeaders = init?.headers;
        return new Response(JSON.stringify(BASE_PERKS), { status: 200, headers: { 'content-type': 'application/json' } });
      }),
    );

    await expect(createRankPerksClient('http://identity.example', SECRET).perksOf(USER)).resolves.toEqual(BASE_PERKS);

    expect(method).toBe('GET');
    expect(requestBody).toBeUndefined();
    const headers = new Headers(requestHeaders);
    expect(headers.get(SERVICE_BODY_DIGEST_HEADER)).toBe(EMPTY_DIGEST);
    expect(headers.get(SERVICE_SIGNATURE_HEADER)).toBeTruthy();
  });

  it('fails closed on 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unauthenticated', { status: 401 })),
    );
    await expect(createRankPerksClient('http://identity.example', SECRET).perksOf(USER)).rejects.toMatchObject({
      code: 'trade.perks_unavailable',
    });
  });

  it('fails closed on an unparseable perk table', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ feeDiscountBps: 'nope' }), { status: 200 })),
    );
    await expect(createRankPerksClient('http://identity.example', SECRET).perksOf(USER)).rejects.toBeInstanceOf(TradeError);
  });
});
