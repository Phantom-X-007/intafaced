import { afterEach, describe, expect, it, vi } from 'vitest';
import { BASE_PERKS, verifyServiceHeaders } from '@intafaced/contracts';
import { createRankPerksClient } from './rank-perks.js';
import { TradeError } from './types.js';

/**
 * THE REGRESSION THIS FILE EXISTS FOR.
 *
 * `svc-identity`'s `/internal/rank/:userId/perks` was unauthenticated until the
 * full audit (L2-3) closed it with `verifyServiceHeaders`. This client was not
 * updated, so it sent no service credentials, got 401, and — because it fails
 * closed on purpose — turned **every `orders.create` on the running fleet into
 * a 500**. No unit test saw it: `trade-service.test.ts` injects `BasePerks`, so
 * nothing exercised the HTTP client at all.
 *
 * The e2e suite found it. This test makes sure a fleet is never again the only
 * thing that can: it asserts the request svc-identity actually receives would
 * pass svc-identity's own guard, using that guard rather than a copy of it.
 */

const SECRET = 'internal-service-secret-at-least-32-characters-long';
const USER = 'a3d1f0c2-1111-4222-8333-444455556666';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Capture what the client puts on the wire, and answer as svc-identity would. */
function stubIdentity(respond: (headers: Record<string, string>) => Response): {
  calls: Array<{ url: string; headers: Record<string, string> }>;
} {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];

  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const headers = Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]),
    );
    calls.push({ url: String(input), headers });
    return respond(headers);
  });

  return { calls };
}

describe('rank perks client — service-to-service credentials', () => {
  it('signs the call so svc-identity accepts it', async () => {
    // svc-identity's REAL guard, not a stand-in. A test that re-implemented the
    // check would have passed on the day the two drifted, which is the day the
    // check matters.
    const { calls } = stubIdentity((headers) =>
      verifyServiceHeaders(headers, SECRET).service === null
        ? new Response(JSON.stringify({ error: 'service credentials required' }), { status: 401 })
        : new Response(JSON.stringify(BASE_PERKS), { status: 200, headers: { 'content-type': 'application/json' } }),
    );

    const client = createRankPerksClient('http://svc-identity:4002', SECRET);
    await expect(client.perksOf(USER)).resolves.toEqual(BASE_PERKS);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`http://svc-identity:4002/internal/rank/${USER}/perks`);
    // And it names ITSELF — the audit line on the other side has to say who called.
    expect(verifyServiceHeaders(calls[0]?.headers ?? {}, SECRET).service).toBe('svc-trade');
  });

  it('is refused when it presents the wrong secret', async () => {
    stubIdentity((headers) =>
      verifyServiceHeaders(headers, SECRET).service === null
        ? new Response('{}', { status: 401 })
        : new Response(JSON.stringify(BASE_PERKS), { status: 200 }),
    );

    const client = createRankPerksClient('http://svc-identity:4002', 'a-different-secret-that-is-also-32-chars');
    await expect(client.perksOf(USER)).rejects.toThrow(TradeError);
  });

  it('fails closed rather than defaulting to base perks', async () => {
    // The distinction that costs money: a discounted trader charged full rate
    // because a service they cannot see was down. Refuse before anything is
    // held instead.
    stubIdentity(() => new Response('{}', { status: 503 }));

    const client = createRankPerksClient('http://svc-identity:4002', SECRET);
    await expect(client.perksOf(USER)).rejects.toMatchObject({ code: 'trade.perks_unavailable' });
  });

  it('refuses a payload that does not match the published contract', async () => {
    stubIdentity(() => new Response(JSON.stringify({ feeDiscountBps: 'lots' }), { status: 200 }));

    const client = createRankPerksClient('http://svc-identity:4002', SECRET);
    await expect(client.perksOf(USER)).rejects.toMatchObject({ code: 'trade.perks_unavailable' });
  });
});
