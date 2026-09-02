import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { handleStartBasketDoor, registerStartBasketDoor } from './oms-basket-http.js';

const OP = '33333333-3333-4333-8333-333333333333';
const SECRET = 'a-execution-oms-basket-http-test-edge-secret';
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-execution' });
const MATCHING_OPEN = { venueHalted: false } as const;
const JOBS_ON = { enabled: true } as const;
const LEGS = [
  { name: 'BTC', qty: '0.5' },
  { name: 'ETH', qty: '2' },
] as const;
const BODY = {
  parentClientOrderId: 'p-basket',
  kind: 'basket' as const,
  approved: true,
  legs: [...LEGS],
  partialFailurePolicy: 'refuse_all',
  credit: '100',
  remaining: '1.25',
};

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: OP,
    userId: OP,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['admin:read', 'admin:write'],
    tier: 'none',
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  } as Principal;
}

function signedHeaders(p: Principal = principal()) {
  const raw = encodePrincipal(p);
  return {
    'x-intafaced-principal': raw,
    'x-intafaced-principal-sig': signPrincipalHeader(raw, SECRET, 'DE'),
    'x-intafaced-region': 'DE',
  };
}

describe('handleStartBasketDoor', () => {
  it('happy path: ledger qty strings, refuse_all, not paper, no matching, no fills', async () => {
    const out = await handleStartBasketDoor(BODY, OP, { jobs: JOBS_ON, matchingVenueHalt: MATCHING_OPEN });
    expect(out).toMatchObject({
      ok: true,
      started: true,
      parentClientOrderId: 'p-basket',
      kind: 'basket',
      status: 'running',
      partialFailurePolicy: 'refuse_all',
    });
    if (!out.ok) return;
    expect(out.legs).toEqual([
      { name: 'BTC', qty: formatAmount(parseAmount('0.5')) },
      { name: 'ETH', qty: formatAmount(parseAmount('2')) },
    ]);
    expect(out).not.toHaveProperty('paper');
    expect(out).not.toHaveProperty('matching');
    expect(out).not.toHaveProperty('fills');
  });

  it('blank qty / flatten_remaining refuse — no silent drop of legs', async () => {
    expect(
      await handleStartBasketDoor(
        { ...BODY, legs: [{ name: 'BTC', qty: '   ' }] },
        OP,
        { jobs: JOBS_ON, matchingVenueHalt: MATCHING_OPEN },
      ),
    ).toMatchObject({ ok: false, reason: 'missing_qty' });
    expect(
      await handleStartBasketDoor(
        { ...BODY, partialFailurePolicy: 'flatten_remaining' },
        OP,
        { jobs: JOBS_ON, matchingVenueHalt: MATCHING_OPEN },
      ),
    ).toMatchObject({ ok: false, reason: 'flatten_remaining_refused' });
  });

  it('twap is not_live — generic live slice stays the twap hitch, not a second basket slice', async () => {
    expect(
      await handleStartBasketDoor({ ...BODY, kind: 'twap', parentClientOrderId: 'p-twap' }, OP, {
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('body operatorId is ignored — caller operator is used', async () => {
    const out = await handleStartBasketDoor({ ...BODY, operatorId: '44444444-4444-4444-8444-444444444444' }, OP, {
      jobs: JOBS_ON,
      matchingVenueHalt: MATCHING_OPEN,
    });
    expect(out).toMatchObject({ ok: true, started: true });
  });
});

describe('POST /execution/oms/start-basket', () => {
  async function app() {
    const f = Fastify();
    registerStartBasketDoor(f, {
      edgeContext,
      jobs: JOBS_ON,
      matchingVenueHalt: MATCHING_OPEN,
    });
    await f.ready();
    return f;
  }

  it('refuses anonymous start', async () => {
    const f = await app();
    const res = await f.inject({ method: 'POST', url: '/execution/oms/start-basket', payload: BODY });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'UNAUTHORIZED' });
    await f.close();
  });

  it('signed admin:write starts a basket with ledger qty strings', async () => {
    const f = await app();
    const res = await f.inject({
      method: 'POST',
      url: '/execution/oms/start-basket',
      headers: signedHeaders(),
      payload: BODY,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, started: true, kind: 'basket', partialFailurePolicy: 'refuse_all' });
    await f.close();
  });
});
