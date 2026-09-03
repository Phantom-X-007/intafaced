/**
 * CARD H7 — what-if/greeks HTTP door.
 */
import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import type { Principal } from '@intafaced/auth';
import { encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createGreeksAdapter, ieeeFloat64ToDecimalString, type NativeQuantLib } from '@intafaced/greeks-adapter';
import { GREEK_KEYS, GREEKS_NATIVE_UNLINKED } from './what-if.js';
import { GREEKS_WHAT_IF_PATH, registerGreeksWhatIfRest } from './what-if-rest.js';

const EDGE_SECRET = 'greeks-what-if-edge-secret-long-enough';
const USER = '11111111-1111-4111-8111-111111111111';

const payload = {
  right: 'call',
  strike: '100',
  spot: '100',
  volatility: '0.2',
  timeToExpiry: '1',
  riskFreeRate: '0.01',
  dividendYield: '0',
};

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

function stubNative(): NativeQuantLib {
  return {
    vanillaEuropean: () => ({ npv: 0.1 + 0.2, delta: 0.5, gamma: 0.02, vega: 0.4, theta: -0.03 }),
    yearFraction: () => 0.5,
  };
}

describe('POST /api/v1/greeks/what-if', () => {
  it('unlinked adapter refuses numbers (no npv/delta on the wire)', async () => {
    const app = Fastify();
    registerGreeksWhatIfRest(app, {
      edgeSecret: EDGE_SECRET,
      serviceName: 'svc-trade',
      adapter: createGreeksAdapter({ native: null }),
    });
    const response = await app.inject({
      method: 'POST',
      url: GREEKS_WHAT_IF_PATH,
      headers: headers(),
      payload,
    });
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.code).toBe(GREEKS_NATIVE_UNLINKED);
    expect(body.linked).toBe(false);
    for (const key of GREEK_KEYS) {
      expect(key in body, `refuse must omit ${key}`).toBe(false);
    }
    await app.close();
  });

  it('linked adapter returns decimal strings, never IEEE numbers', async () => {
    const app = Fastify();
    registerGreeksWhatIfRest(app, {
      edgeSecret: EDGE_SECRET,
      serviceName: 'svc-trade',
      adapter: createGreeksAdapter({ native: stubNative() }),
    });
    const response = await app.inject({
      method: 'POST',
      url: GREEKS_WHAT_IF_PATH,
      headers: headers(),
      payload,
    });
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.npv).toBe(ieeeFloat64ToDecimalString(0.1 + 0.2));
    for (const key of GREEK_KEYS) {
      expect(typeof body[key]).toBe('string');
    }
    await app.close();
  });

  it('unsigned request is 401', async () => {
    const app = Fastify();
    registerGreeksWhatIfRest(app, { edgeSecret: EDGE_SECRET, serviceName: 'svc-trade' });
    const response = await app.inject({ method: 'POST', url: GREEKS_WHAT_IF_PATH, payload });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
