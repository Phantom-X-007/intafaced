/**
 * CARD R-quant — live deploy HTTP door.
 */
import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import type { Principal } from '@intafaced/auth';
import { encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { QUANT_LIVE_DEPLOY_UNPINNED, QUANT_PAPER_CANNOT_LEDGER } from './live-deploy.js';
import { QUANT_LIVE_DEPLOY_PATH, registerQuantLiveDeployRest } from './live-deploy-rest.js';

const EDGE_SECRET = 'quant-live-deploy-edge-secret-long-enough-32b';
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

describe('POST /api/v1/quant/live-deploy', () => {
  it('unset pin refuses 400 with named code and no launch', async () => {
    const app = Fastify();
    registerQuantLiveDeployRest(app, { edgeSecret: EDGE_SECRET, serviceName: 'svc-trade' });
    const response = await app.inject({
      method: 'POST',
      url: QUANT_LIVE_DEPLOY_PATH,
      headers: headers(),
      payload: {},
    });
    expect(response.statusCode, response.body).toBe(400);
    const body = response.json() as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.error).toBe(QUANT_LIVE_DEPLOY_UNPINNED);
    expect(body.executed).toBe(false);
    expect(body.launched).toBe(false);
    expect(body.posted).toBe(false);
    expect(body.orders).toEqual([]);
    await app.close();
  });

  it('paper environment refuses ledger even when a pin is boot-set', async () => {
    const app = Fastify();
    registerQuantLiveDeployRest(app, {
      edgeSecret: EDGE_SECRET,
      serviceName: 'svc-trade',
      pin: 'owner-eligibility-pin',
    });
    const response = await app.inject({
      method: 'POST',
      url: QUANT_LIVE_DEPLOY_PATH,
      headers: headers(),
      payload: { environment: 'paper' },
    });
    expect(response.statusCode, response.body).toBe(400);
    const body = response.json() as Record<string, unknown>;
    expect(body.error).toBe(QUANT_PAPER_CANNOT_LEDGER);
    expect(body.posted).toBe(false);
    expect(body.launched).toBe(false);
    await app.close();
  });

  it('published pin previews and does not launch', async () => {
    const app = Fastify();
    registerQuantLiveDeployRest(app, {
      edgeSecret: EDGE_SECRET,
      serviceName: 'svc-trade',
      pin: 'owner-eligibility-pin',
    });
    const response = await app.inject({
      method: 'POST',
      url: QUANT_LIVE_DEPLOY_PATH,
      headers: headers(),
      payload: {},
    });
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body).toEqual({
      ok: true,
      preview: true,
      executed: false,
      launched: false,
      posted: false,
      orders: [],
      pinPresent: true,
    });
    await app.close();
  });

  it('unsigned request is 401', async () => {
    const app = Fastify();
    registerQuantLiveDeployRest(app, { edgeSecret: EDGE_SECRET, serviceName: 'svc-trade' });
    const response = await app.inject({ method: 'POST', url: QUANT_LIVE_DEPLOY_PATH, payload: {} });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('missing write scope is 403', async () => {
    const app = Fastify();
    registerQuantLiveDeployRest(app, { edgeSecret: EDGE_SECRET, serviceName: 'svc-trade' });
    const response = await app.inject({
      method: 'POST',
      url: QUANT_LIVE_DEPLOY_PATH,
      headers: headers(['trade:read']),
      payload: {},
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });
});
