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
import { handleOmsMmpHedgeDoor, handleOmsMmpPostDoor, registerOmsMmpDoor } from './oms-mmp-http.js';
import { refuseLiveOmsMmp } from './oms-mmp-refuse.js';

const SECRET = 'a-execution-oms-buying-power-test-edge-secret';
const OP = '33333333-3333-4333-8333-333333333333';
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-execution' });
const MILL = ['oms-mmp-post.ts', 'oms-mmp-hedge.ts', 'oms-mmp-mqq.ts'] as const;

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
    parentClientOrderId: 'parent-mmp',
    venues: [completeVenue({ id: 'street', price: '100' })],
    submitByVenue: { street: street.submit },
    emsStore,
    ...over,
  });
  return { result, street, emsStore };
}

const twoSidedPost = {
  parentClientOrderId: 'mmp-1',
  quoteId: 'q-1',
  symbol: 'BTC/USDT',
  bidQuoteId: 'bid-1',
  askQuoteId: 'ask-1',
  mqq: '1',
  bidSize: '5',
  askSize: '5',
};

describe('refuseLiveOmsMmp', () => {
  it('refuses kind mmp / mass-quote', () => {
    expect(refuseLiveOmsMmp({ kind: 'mmp' })).toMatchObject({ ok: false, reason: 'mmp_unsupported' });
    expect(refuseLiveOmsMmp({ kind: 'mass-quote' })).toMatchObject({ ok: false, reason: 'mmp_unsupported' });
    expect(refuseLiveOmsMmp({ kind: ' mass_quote ' })).toMatchObject({ ok: false, reason: 'mmp_unsupported' });
    expect(refuseLiveOmsMmp({ kind: 'mqq' })).toMatchObject({ ok: false, reason: 'mmp_unsupported' });
    expect(refuseLiveOmsMmp({ kind: 'market-maker' })).toMatchObject({ ok: false, reason: 'mmp_unsupported' });
    expect(refuseLiveOmsMmp({ kind: 'MARKET_MAKER' })).toMatchObject({ ok: false, reason: 'mmp_unsupported' });
  });
  it('refuses mmp/massQuote flags and delta/vega when present', () => {
    expect(refuseLiveOmsMmp({ mmp: true })).toMatchObject({ ok: false, reason: 'mmp_unsupported' });
    expect(refuseLiveOmsMmp({ massQuote: true })).toMatchObject({ ok: false, reason: 'mmp_unsupported' });
    expect(refuseLiveOmsMmp({ delta: '1' })).toMatchObject({ ok: false, reason: 'mmp_unsupported' });
    expect(refuseLiveOmsMmp({ vega: '1' })).toMatchObject({ ok: false, reason: 'mmp_unsupported' });
    expect(refuseLiveOmsMmp({ delta: '0' })).toMatchObject({ ok: false, reason: 'mmp_unsupported' });
  });
  it('plain limit with none of those fields returns null', () => {
    expect(refuseLiveOmsMmp({})).toBeNull();
    expect(refuseLiveOmsMmp({ kind: 'limit' })).toBeNull();
    expect(refuseLiveOmsMmp({ mmp: false, massQuote: false })).toBeNull();
    expect(refuseLiveOmsMmp({ delta: null, vega: null })).toBeNull();
  });
});

describe('executeOmsRoute MMP extras', () => {
  it('refuses kind mmp before submit — no matching dual-impl', async () => {
    const { result, street } = await runExecute({ kind: 'mmp' });
    expect(result).toMatchObject({ ok: false, reason: 'mmp_unsupported' });
    expect(street.calls).toHaveLength(0);
  });
  it('refuses delta before submit — does not invent greeks', async () => {
    const { result, street } = await runExecute({ delta: '1' });
    expect(result).toMatchObject({ ok: false, reason: 'mmp_unsupported' });
    expect(street.calls).toHaveLength(0);
  });
  it('plain execute still submits', async () => {
    const { result, street } = await runExecute({ amount: '1', parentClientOrderId: 'parent-plain-mmp' });
    expect(result.ok).toBe(true);
    expect(street.calls).toHaveLength(1);
  });
});

describe('POST /execution/oms/mmp-post|hedge|mqq', () => {
  async function app() {
    const f = Fastify();
    registerOmsMmpDoor(f, { edgeContext, internalSecret: SERVICE_SECRET });
    await f.ready();
    return f;
  }
  it('refuses anonymous mmp-post', async () => {
    const f = await app();
    const res = await f.inject({ method: 'POST', url: '/execution/oms/mmp-post', payload: twoSidedPost });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'UNAUTHORIZED' });
    await f.close();
  });
  it('signed admin:write blank mqq — mill mqq_blank', async () => {
    const f = await app();
    const res = await f.inject({
      method: 'POST',
      url: '/execution/oms/mmp-post',
      headers: hmacHeaders(),
      payload: { ...twoSidedPost, mqq: '' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: false, reason: 'mqq_blank' });
    await f.close();
  });
  it('signed admin:write valid two-sided post — posted both sides', async () => {
    const f = await app();
    const res = await f.inject({
      method: 'POST',
      url: '/execution/oms/mmp-post',
      headers: hmacHeaders(),
      payload: twoSidedPost,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, posted: true, sides: ['bid', 'ask'] });
    await f.close();
  });
  it('signed hedge with delta in body — mmp_unsupported, does not call mill hedge', async () => {
    const f = await app();
    const res = await f.inject({
      method: 'POST',
      url: '/execution/oms/mmp-hedge',
      headers: hmacHeaders(),
      payload: { parentClientOrderId: 'parent-mmp', hedgeSize: '3', delta: '1' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: false, reason: 'mmp_unsupported' });
    expect(res.json()).not.toHaveProperty('hedged');
    expect(handleOmsMmpHedgeDoor({ parentClientOrderId: 'parent-mmp', hedgeSize: '3', delta: '1' })).toMatchObject({
      ok: false,
      reason: 'mmp_unsupported',
    });
    expect(handleOmsMmpHedgeDoor({ delta: '1' })).toMatchObject({ ok: false, reason: 'mmp_unsupported' });
    await f.close();
  });
  it('signed mqq blank — mill mqq_blank', async () => {
    const f = await app();
    const res = await f.inject({
      method: 'POST',
      url: '/execution/oms/mmp-mqq',
      headers: hmacHeaders(),
      payload: { mqq: null, quotes: [] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: false, reason: 'mqq_blank' });
    await f.close();
  });
  it('handleOmsMmpPostDoor never invents greeks or matching', () => {
    expect(handleOmsMmpPostDoor({ ...twoSidedPost, vega: 1 })).toMatchObject({ ok: false, reason: 'mmp_unsupported' });
    expect(handleOmsMmpPostDoor(twoSidedPost)).toMatchObject({ ok: true, posted: true, sides: ['bid', 'ask'] });
  });
});

describe('MMP mill stays mill', () => {
  it('mill sources never match withdrawHold', () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    for (const name of MILL) {
      expect(readFileSync(join(dir, name), 'utf8'), name).not.toMatch(/withdrawHold/);
    }
  });
});

describe('OMS MMP is not a sold matching product', () => {
  it('createExecutionRouter oms has execute, no mmp / mass-quote / mqq', () => {
    const procedures = createExecutionRouter(new SealedHouseTenantRegistry())._def.procedures;
    const symbols = Object.keys(procedures)
      .filter((key) => key.startsWith('execution.oms.'))
      .map((key) => key.slice('execution.oms.'.length).split('.')[0]);
    expect(symbols).not.toContain('mmp');
    expect(symbols).not.toContain('mass-quote');
    expect(symbols).not.toContain('mqq');
    expect(symbols).toContain('execute');
  });
});
