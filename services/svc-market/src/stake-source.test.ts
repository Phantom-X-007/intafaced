import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createStakeSource } from './stake-source.js';

/**
 * THE STAKE GATE FAILS CLOSED ON EVERY PATH.
 *
 * No database and no svc-token: a real `node:http` server stands in for the
 * endpoint so the fetch, the status code and the JSON body are all genuine. A
 * mocked `fetch` would prove the branches and nothing about whether a real
 * non-2xx actually reaches them.
 *
 * The first case is not hypothetical. `GET /internal/stake/:userId` returns HTTP
 * 500 to every caller on `main` today — `AccessTier.minStake` is a bigint and
 * Fastify's `JSON.stringify` fallback throws on one — and the fix (PR #1100) is
 * green but unmerged. Until it lands, that first test is a description of
 * production.
 */

const SECRET = 'a-market-stake-source-test-secret-long-enough';

let server: Server | undefined;

afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
});

/** Serve one fixed response, and hand back the base URL to point the source at. */
async function serve(status: number, body: unknown): Promise<string> {
  server = createServer((_req, res) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (typeof address === 'string' || address === null) throw new Error('no port');
  return `http://127.0.0.1:${address.port}`;
}

const USER = '11111111-1111-4111-8111-111111111111';

describe('createStakeSource — refuses rather than guessing', () => {
  it('refuses when the endpoint 500s, which is what it does on main today', async () => {
    const url = await serve(500, { statusCode: 500, message: 'Do not know how to serialize a BigInt' });
    await expect(createStakeSource(url, SECRET).entitlementOf(USER)).rejects.toMatchObject({ code: 'market.stake_unavailable' });
  });

  it('refuses when svc-token is not listening at all', async () => {
    // Port 1 is never a service. This is the network-throw path.
    await expect(createStakeSource('http://127.0.0.1:1', SECRET).entitlementOf(USER)).rejects.toMatchObject({
      code: 'market.stake_unavailable',
    });
  });

  it('refuses a 401 rather than treating an auth failure as no stake', async () => {
    const url = await serve(401, { error: 'service credentials required' });
    await expect(createStakeSource(url, SECRET).entitlementOf(USER)).rejects.toMatchObject({ code: 'market.stake_unavailable' });
  });

  it('refuses a body that is not JSON', async () => {
    const url = await serve(200, 'not json at all');
    await expect(createStakeSource(url, SECRET).entitlementOf(USER)).rejects.toMatchObject({ code: 'market.stake_unavailable' });
  });

  /**
   * The one a coercion would get wrong. `Number(undefined)` is `NaN`, and
   * `NaN >= capacity` is false — so coercing here would turn a payload with no
   * tier into a silent "no slots", a refusal that looks like a stake decision
   * and is actually an outage.
   */
  it('refuses a 200 whose payload has no vendorSlots', async () => {
    const url = await serve(200, { staked: '10000', tier: { name: 'Operator' }, feeDiscountBps: 2000 });
    await expect(createStakeSource(url, SECRET).entitlementOf(USER)).rejects.toMatchObject({ code: 'market.stake_unavailable' });
  });

  it('refuses a vendorSlots that is not a non-negative integer', async () => {
    for (const vendorSlots of ['3', 1.5, -1, null]) {
      const url = await serve(200, { staked: '10000', tier: { name: 'Operator', minStake: '10000', vendorSlots } });
      await expect(createStakeSource(url, SECRET).entitlementOf(USER)).rejects.toMatchObject({ code: 'market.stake_unavailable' });
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  /**
   * The happy path, against the body shape PR #1100 makes the endpoint return:
   * `staked` and `minStake` as DECIMAL STRINGS, `vendorSlots` as a number.
   *
   * The assertion at the end is the important half. This service reads the slot
   * count and nothing else — it never parses `staked`, so it can never re-scale
   * a value that was already scaled, which is the fail-OPEN bug #1100 fixed.
   */
  it('reads the slot count off the tier, and reads no amount at all', async () => {
    const url = await serve(200, {
      staked: '10000',
      tier: { name: 'Operator', minStake: '10000', launchpadAllocationTier: 2, otcAccess: true, premiumLobbies: true, vendorSlots: 3 },
      feeDiscountBps: 2000,
    });
    const entitlement = await createStakeSource(url, SECRET).entitlementOf(USER);
    expect(entitlement).toEqual({ tierName: 'Operator', vendorSlots: 3 });
    expect(Object.keys(entitlement)).not.toContain('staked');
  });

  it('accepts a genuine zero — Base tier is a real answer, not a failure', async () => {
    const url = await serve(200, { staked: '0', tier: { name: 'Base', minStake: '0', vendorSlots: 0 }, feeDiscountBps: 0 });
    await expect(createStakeSource(url, SECRET).entitlementOf(USER)).resolves.toEqual({ tierName: 'Base', vendorSlots: 0 });
  });

  it('sends service credentials — the endpoint 401s without them', async () => {
    let headers: Record<string, unknown> = {};
    server = createServer((req, res) => {
      headers = req.headers;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ tier: { name: 'Base', vendorSlots: 0 } }));
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (typeof address === 'string' || address === null) throw new Error('no port');

    await createStakeSource(`http://127.0.0.1:${address.port}`, SECRET).entitlementOf(USER);
    expect(headers['x-intafaced-service']).toBe('svc-market');
    expect(headers['x-intafaced-service-sig']).toEqual(expect.any(String));
    expect(headers['x-intafaced-service-ts']).toEqual(expect.any(String));
  });
});
