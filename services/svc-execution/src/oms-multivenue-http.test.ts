import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { parseAmount } from '@intafaced/ledger-client';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader, serviceAuthHeaders } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import { executeOmsRoute, type OmsSubmitFn } from './oms-execute.js';
import { InMemoryEmsOrderStore } from './oms-ems-store.js';
import { latencyGradeWire, type OmsPlanVenue } from './oms-plan.js';
import { createExecutionRouter } from './router.js';
import { handleOmsBestExClaimDoor, handleOmsDexRouteDoor, registerOmsMultivenueDoor } from './oms-multivenue-http.js';
import { refuseDexRouting, refuseInventedVenue, refuseOutageInventedFill, refuseUnsetBestExClaim } from './oms-multivenue-refuse.js';

const SECRET = 'a-execution-oms-multivenue-http-test-edge-secret';
const OP = '33333333-3333-4333-8333-333333333333';
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-execution' });
const MILL = ['oms-plan.ts', 'venue-adapters.ts', 'oms-multivenue-refuse.ts'] as const;

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

const SERVICE_SECRET = 'a'.repeat(32);

function hmacHeaders() {
  return {
    'content-type': 'application/json',
    ...serviceAuthHeaders('svc-execution', SERVICE_SECRET),
  };
}
function signed(p: Principal = principal()) {
  return edgeContext({ headers: signedHeaders(p), id: 'req-signed' });
}

function hmacSigned(p: Principal = principal()) {
  return { ...signed(p), service: 'svc-execution' as const };
}
function completeVenue(over: Partial<OmsPlanVenue> & Pick<OmsPlanVenue, 'id' | 'price'>): OmsPlanVenue {
  return {
    kind: 'external-cex',
    amount: '10',
    feeBps: 10,
    costTerms: { feeBps: 10, expectedImpactBps: 5, transferCostBps: 2, latencyGrade: latencyGradeWire(over.id) },
    ...over,
  };
}
class FakeSource {
  readonly calls: unknown[] = [];
  readonly id: string;
  constructor(id: string) {
    this.id = id;
  }
  submit: OmsSubmitFn = async (req) => {
    this.calls.push(req);
    return {
      venueId: this.id,
      venueOrderId: `v-${this.id}`,
      filledAmount: req.amount,
      averagePrice: req.limitPrice,
      feeAmount: parseAmount('0'),
      feeAsset: 'USDT',
      status: 'filled',
      executedAt: new Date('2026-08-17T00:00:00.000Z'),
    };
  };
}
async function runExecute(over: Record<string, unknown> = {}) {
  const street = new FakeSource('street');
  const emsStore = new InMemoryEmsOrderStore();
  const result = await executeOmsRoute({
    symbol: 'BTC/USDT',
    side: 'buy',
    amount: '10',
    parentClientOrderId: 'parent-multivenue',
    venues: [completeVenue({ id: 'street', price: '100' })],
    submitByVenue: { street: street.submit },
    emsStore,
    ...over,
  });
  return { result, street, emsStore };
}

describe('refuseUnsetBestExClaim', () => {
  it('refuses a best-ex claim without owner law', () => {
    expect(refuseUnsetBestExClaim({ bestEx: true })).toMatchObject({ ok: false, reason: 'best_ex_unset' });
    expect(refuseUnsetBestExClaim({ kind: 'best-execution', ownerBestExLaw: '  ' })).toMatchObject({
      ok: false,
      reason: 'best_ex_unset',
    });
  });
  it('accepts owner law and leaves plain execute alone', () => {
    expect(refuseUnsetBestExClaim({ bestEx: true, ownerBestExLaw: 'EXECUTION_SOR_LETTER_BPS_SCHEDULE' })).toBeNull();
    expect(refuseUnsetBestExClaim({})).toBeNull();
  });
});

describe('refuseOutageInventedFill', () => {
  it('refuses an invented fill during outage', () => {
    expect(refuseOutageInventedFill({ outage: true })).toMatchObject({ ok: false, reason: 'outage_invented_fill' });
    expect(refuseOutageInventedFill({ inventedFill: true })).toMatchObject({ ok: false, reason: 'outage_invented_fill' });
    expect(refuseOutageInventedFill({})).toBeNull();
  });
});

describe('refuseDexRouting', () => {
  it('refuses DEX/AMM unless gas, MEV, and reorg are named', () => {
    expect(refuseDexRouting({ kind: 'external-dex' })).toMatchObject({ ok: false, reason: 'dex_risk_unset' });
    expect(refuseDexRouting({ kind: 'amm', gas: 'named', mev: 'named' })).toMatchObject({
      ok: false,
      reason: 'dex_risk_unset',
    });
    expect(refuseDexRouting({ kind: 'external-dex', gas: 'named', mev: 'named', reorg: 'named' })).toBeNull();
    expect(refuseDexRouting({ kind: 'external-cex' })).toBeNull();
  });
});

describe('refuseInventedVenue', () => {
  it('refuses a blank or unwired venue', () => {
    expect(refuseInventedVenue({})).toMatchObject({ ok: false, reason: 'invented_venue' });
    expect(refuseInventedVenue({ venueId: 'ghost', wiredVenueIds: ['street'] })).toMatchObject({
      ok: false,
      reason: 'invented_venue',
    });
    expect(refuseInventedVenue({ venueId: 'street', wiredVenueIds: ['street'] })).toBeNull();
  });
});

describe('executeOmsRoute multi-venue extras', () => {
  it('refuses best-ex claim without owner law before submit', async () => {
    const { result, street } = await runExecute({ kind: 'best-ex' });
    expect(result).toMatchObject({ ok: false, reason: 'best_ex_unset' });
    expect(street.calls).toHaveLength(0);
  });
  it('refuses outage invented fill before submit', async () => {
    const { result, street } = await runExecute({ outage: true, parentClientOrderId: 'parent-outage' });
    expect(result).toMatchObject({ ok: false, reason: 'outage_invented_fill' });
    expect(street.calls).toHaveLength(0);
  });
  it('refuses DEX without named gas/MEV/reorg', async () => {
    const { result, street } = await runExecute({
      kind: 'external-dex',
      parentClientOrderId: 'parent-dex',
    });
    expect(result).toMatchObject({ ok: false, reason: 'dex_risk_unset' });
    expect(street.calls).toHaveLength(0);
  });
  it('plain execute still submits', async () => {
    const { result, street } = await runExecute({ amount: '1', parentClientOrderId: 'parent-plain-multi' });
    expect(result.ok).toBe(true);
    expect(street.calls).toHaveLength(1);
  });
});

describe('POST /execution/oms/best-ex-claim and /dex-route', () => {
  async function app() {
    const f = Fastify();
    registerOmsMultivenueDoor(f, { edgeContext, internalSecret: SERVICE_SECRET });
    await f.ready();
    return f;
  }
  it('refuses anonymous best-ex claim', async () => {
    const f = await app();
    const res = await f.inject({ method: 'POST', url: '/execution/oms/best-ex-claim', payload: {} });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'UNAUTHORIZED' });
    await f.close();
  });
  it('signed admin:write unset best-ex claim refuses', async () => {
    const f = await app();
    const res = await f.inject({
      method: 'POST',
      url: '/execution/oms/best-ex-claim',
      headers: hmacHeaders(),
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: false, reason: 'best_ex_unset' });
    await f.close();
  });
  it('signed admin:write DEX without named risks refuses', async () => {
    const f = await app();
    const res = await f.inject({
      method: 'POST',
      url: '/execution/oms/dex-route',
      headers: hmacHeaders(),
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: false, reason: 'dex_risk_unset' });
    await f.close();
  });
  it('handle doors never invent a fill or a venue', () => {
    expect(handleOmsBestExClaimDoor({})).toMatchObject({ ok: false, reason: 'best_ex_unset' });
    expect(handleOmsDexRouteDoor({ gas: 'named', mev: 'named', reorg: 'named', venueId: '  ' })).toMatchObject({
      ok: false,
      reason: 'invented_venue',
    });
  });
});

describe('multi-venue mills stay mill', () => {
  it('plan/adapters/refuse never match withdrawHold', () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    for (const name of MILL) {
      expect(readFileSync(join(dir, name), 'utf8'), name).not.toMatch(/withdrawHold/);
    }
  });
});

describe('OMS plan stays the sold tRPC SOR product', () => {
  it('createExecutionRouter oms has plan and execute, no second SOR', () => {
    const procedures = createExecutionRouter(new SealedHouseTenantRegistry())._def.procedures;
    const symbols = Object.keys(procedures)
      .filter((key) => key.startsWith('execution.oms.'))
      .map((key) => key.slice('execution.oms.'.length).split('.')[0]);
    expect(symbols).toContain('execute');
    expect(symbols).toContain('plan');
    expect(symbols).not.toContain('best-ex');
    expect(symbols).not.toContain('best-execution');
    expect(symbols).not.toContain('dex-route');
  });
});
