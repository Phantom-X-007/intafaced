import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { serviceAuthHeaders } from '@intafaced/contracts';
import { formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client';
import { registerInternalStake } from './internal-stake.js';
import { accessTierFor, feeDiscountBps, DEFAULT_FEE_DISCOUNT_SCHEDULE } from './economics/staking.js';

/**
 * The S2S stake gate every other service reads.
 *
 * This shipped returning HTTP 500 on every call: the handler put `access.tier`
 * straight into the response and `AccessTier.minStake` is a bigint, which
 * `JSON.stringify` refuses. svc-academy staked lobbies and the svc-trade OTC
 * gate both fail closed, so a total outage read as "nobody qualifies".
 *
 * The tier is built by the REAL `accessTierFor` rather than a hand-written
 * literal. A stub with `minStake: '10000'` would pass while production 500s —
 * the whole bug was that the real object carries a bigint.
 */

const SECRET = 'test-internal-secret-for-token-stake-gate';
const USER = '11111111-1111-4111-8111-111111111111';

async function build(staked: Amount) {
  const app = Fastify();
  registerInternalStake(app, {
    internalSecret: SECRET,
    accessOf: vi.fn(async () => ({
      staked,
      tier: accessTierFor(staked),
      feeDiscountBps: feeDiscountBps(staked, DEFAULT_FEE_DISCOUNT_SCHEDULE),
    })),
  });
  await app.ready();
  return app;
}

const get = (app: Awaited<ReturnType<typeof build>>, headers?: Record<string, string>) =>
  app.inject({ method: 'GET', url: `/internal/stake/${USER}`, headers });

describe('GET /internal/stake/:userId', () => {
  it('401 without service auth', async () => {
    const app = await build(parseAmount('10000'));
    const res = await get(app);
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('token.unauthenticated');
    await app.close();
  });

  // The regression. Every tier, including Base — its minStake is 0n, still a bigint.
  it.each([
    ['0', 'Base', 0],
    ['1000', 'Initiate', 1],
    ['10000', 'Operator', 3],
    ['100000', 'Architect', 10],
    ['1000000', 'Sovereign', 50],
  ])('200 with a serialisable body for a %s stake (%s, %i vendor slots)', async (amount, tierName, vendorSlots) => {
    const app = await build(parseAmount(amount));
    const res = await get(app, serviceAuthHeaders('svc-academy', SECRET));

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tier.name).toBe(tierName);
    // What a stake-gated vendor-slot feature reads.
    expect(body.tier.vendorSlots).toBe(vendorSlots);
    // minStake is the field that threw. It must be a decimal string, not a bigint.
    expect(body.tier.minStake).toBe(amount);
    await app.close();
  });

  /**
   * `staked` must be a DECIMAL string, not `Amount.toString()`.
   *
   * Both consumers do `parseAmount(body.staked)`, which scales by 10^18. Sending
   * the raw scaled integer would round-trip to a stake 10^18 times too large and
   * open every gate to everyone — a fail-OPEN bug the 500 was masking.
   */
  it('round-trips `staked` through parseAmount to the original amount', async () => {
    const staked = parseAmount('12345.678');
    const app = await build(staked);
    const res = await get(app, serviceAuthHeaders('svc-trade', SECRET));

    expect(res.statusCode).toBe(200);
    expect(res.json().staked).toBe('12345.678');
    expect(parseAmount(res.json().staked)).toBe(staked);
    expect(res.json().staked).not.toBe(staked.toString());
    await app.close();
  });

  it('carries the fee discount for the stake', async () => {
    const staked = parseAmount('100000');
    const app = await build(staked);
    const res = await get(app, serviceAuthHeaders('svc-trade', SECRET));
    expect(res.json().feeDiscountBps).toBe(feeDiscountBps(staked, DEFAULT_FEE_DISCOUNT_SCHEDULE));
    await app.close();
  });

  // Nothing anywhere in the body may be a bigint — that is the whole failure class.
  it('emits no bigint anywhere in the body', async () => {
    const app = await build(parseAmount('10000'));
    const res = await get(app, serviceAuthHeaders('svc-academy', SECRET));
    expect(() => JSON.stringify(res.json())).not.toThrow();
    expect(res.body).toBe(JSON.stringify(res.json()));
    expect(formatAmount(parseAmount(res.json().tier.minStake))).toBe('10000');
    await app.close();
  });
});
