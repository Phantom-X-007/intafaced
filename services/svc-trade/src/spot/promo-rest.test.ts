/**
 * CARD R-promo — create-promo HTTP door.
 */
import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import type { Principal } from '@intafaced/auth';
import { encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { PROMO_BUDGET_UNSET, PROMO_END_UNSET } from './promo.js';
import { CREATE_PROMO_PATH, registerPromoRest } from './promo-rest.js';

const EDGE_SECRET = 'promo-create-edge-secret-long-enough-32b';
const USER = '11111111-1111-4111-8111-111111111111';

function headers(scopes: string[] = ['trade:write']): Record<string, string> {
  const principal = {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes,
    tier: 'basic',
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
  } as Principal;
  const raw = encodePrincipal(principal);
  return {
    'x-intafaced-principal': raw,
    'x-intafaced-principal-sig': signPrincipalHeader(raw, EDGE_SECRET, 'DE'),
    'x-intafaced-region': 'DE',
  };
}

describe('POST /api/v1/promotions', () => {
  it('without budget refuses 400 with named code and no invented rebate', async () => {
    const app = Fastify();
    registerPromoRest(app, { edgeSecret: EDGE_SECRET, serviceName: 'svc-trade' });
    const response = await app.inject({
      method: 'POST',
      url: CREATE_PROMO_PATH,
      headers: headers(),
      payload: { end: '2026-12-31T00:00:00.000Z', rebateBps: '10' },
    });
    expect(response.statusCode, response.body).toBe(400);
    const body = response.json() as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.error).toBe(PROMO_BUDGET_UNSET);
    expect(body.created).toBe(false);
    expect(body.posted).toBe(false);
    expect(body.rebateBps).toBeNull();
    expect(body).not.toHaveProperty('budget');
    await app.close();
  });

  it('budget without end refuses 400 — no invented sunset', async () => {
    const app = Fastify();
    registerPromoRest(app, { edgeSecret: EDGE_SECRET, serviceName: 'svc-trade' });
    const response = await app.inject({
      method: 'POST',
      url: CREATE_PROMO_PATH,
      headers: headers(),
      payload: { budget: '1000.00' },
    });
    expect(response.statusCode, response.body).toBe(400);
    const body = response.json() as Record<string, unknown>;
    expect(body.error).toBe(PROMO_END_UNSET);
    expect(body.rebateBps).toBeNull();
    await app.close();
  });

  it('zero budget previews with no rebate — absent funding is not 10 bps', async () => {
    const app = Fastify();
    registerPromoRest(app, { edgeSecret: EDGE_SECRET, serviceName: 'svc-trade' });
    const response = await app.inject({
      method: 'POST',
      url: CREATE_PROMO_PATH,
      headers: headers(),
      payload: { budget: '0', end: '2026-12-31T00:00:00.000Z', rebateBps: '10' },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      preview: true,
      created: false,
      posted: false,
      funded: false,
      budget: '0',
      end: '2026-12-31T00:00:00.000Z',
      rebateBps: null,
    });
    await app.close();
  });

  it('funded budget+end preview decimal budget and do not create', async () => {
    const app = Fastify();
    registerPromoRest(app, {
      edgeSecret: EDGE_SECRET,
      serviceName: 'svc-trade',
      budget: '1000.00',
      end: '2026-12-31T00:00:00.000Z',
    });
    const response = await app.inject({
      method: 'POST',
      url: CREATE_PROMO_PATH,
      headers: headers(),
      payload: {},
    });
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body).toEqual({
      ok: true,
      preview: true,
      created: false,
      posted: false,
      funded: true,
      budget: '1000',
      end: '2026-12-31T00:00:00.000Z',
      rebateBps: null,
    });
    expect(typeof body.budget).toBe('string');
    await app.close();
  });

  it('unsigned request is 401', async () => {
    const app = Fastify();
    registerPromoRest(app, { edgeSecret: EDGE_SECRET, serviceName: 'svc-trade' });
    const response = await app.inject({ method: 'POST', url: CREATE_PROMO_PATH, payload: {} });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
