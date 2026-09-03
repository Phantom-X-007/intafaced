/**
 * CARD R-E6 — auto delta-hedge HTTP door.
 */
import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import type { Principal } from '@intafaced/auth';
import { encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { DELTA_HEDGE_TARGET_UNSET } from './delta-hedge.js';
import { DELTA_HEDGE_PATH, registerDeltaHedgeRest } from './delta-hedge-rest.js';

const EDGE_SECRET = 'delta-hedge-edge-secret-long-enough-32b';
const USER = '11111111-1111-4111-8111-111111111111';

function headers(scopes: string[] = ['trade:read']): Record<string, string> {
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

describe('POST /api/v1/greeks/delta-hedge', () => {
  it('unset owner sockets refuse 400 with named code and no orders', async () => {
    const app = Fastify();
    registerDeltaHedgeRest(app, { edgeSecret: EDGE_SECRET, serviceName: 'svc-trade' });
    const response = await app.inject({
      method: 'POST',
      url: DELTA_HEDGE_PATH,
      headers: headers(),
      payload: {},
    });
    expect(response.statusCode, response.body).toBe(400);
    const body = response.json() as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.error).toBe(DELTA_HEDGE_TARGET_UNSET);
    expect(body.executed).toBe(false);
    expect(body.orders).toEqual([]);
    expect(body).not.toHaveProperty('target');
    await app.close();
  });

  it('published sockets preview decimal strings and do not execute', async () => {
    const app = Fastify();
    registerDeltaHedgeRest(app, {
      edgeSecret: EDGE_SECRET,
      serviceName: 'svc-trade',
      target: '0.00',
      range: '0.10',
      instrument: 'BTC-PERP',
    });
    const response = await app.inject({
      method: 'POST',
      url: DELTA_HEDGE_PATH,
      headers: headers(),
      payload: { target: 0, range: 0.5 },
    });
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body).toEqual({
      ok: true,
      preview: true,
      executed: false,
      orders: [],
      target: '0',
      range: '0.1',
      instrument: 'BTC-PERP',
    });
    expect(typeof body.target).toBe('string');
    expect(typeof body.range).toBe('string');
    await app.close();
  });

  it('unsigned request is 401', async () => {
    const app = Fastify();
    registerDeltaHedgeRest(app, { edgeSecret: EDGE_SECRET, serviceName: 'svc-trade' });
    const response = await app.inject({ method: 'POST', url: DELTA_HEDGE_PATH, payload: {} });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
