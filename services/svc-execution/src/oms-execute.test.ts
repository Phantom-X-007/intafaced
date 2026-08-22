import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import type { SubmitRequest, VenueExecution } from '@intafaced/venue-adapter';
import { executeOmsRoute, type OmsSubmitFn } from './oms-execute.js';
import { InMemoryEmsOrderStore } from './oms-ems-store.js';
import { latencyGradeWire, planOmsRoute, type OmsPlanVenue } from './oms-plan.js';
import { createExecutionRouter } from './router.js';
import { InMemoryEmsOrderStore } from './oms-ems-store.js';

const SECRET = 'a-execution-oms-execute-test-edge-secret';
const OP = '33333333-3333-4333-8333-333333333333';
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-execution' });

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

function signed(p: Principal = principal()) {
  const raw = encodePrincipal(p);
  return edgeContext({
    headers: {
      'x-intafaced-principal': raw,
      'x-intafaced-principal-sig': signPrincipalHeader(raw, SECRET, 'DE'),
      'x-intafaced-region': 'DE',
    },
    id: 'req-signed',
  });
}

function completeVenue(over: Partial<OmsPlanVenue> & Pick<OmsPlanVenue, 'id' | 'price'>): OmsPlanVenue {
  return {
    kind: 'external-cex',
    amount: '10',
    feeBps: 10,
    costTerms: {
      feeBps: 10,
      expectedImpactBps: 5,
      transferCostBps: 2,
      latencyGrade: latencyGradeWire(over.id),
    },
    ...over,
  };
}

class FakeSource {
  readonly calls: SubmitRequest[] = [];
  readonly id: string;
  private readonly failWith?: Error;
  private readonly status: VenueExecution['status'];

  constructor(id: string, opts: { failWith?: Error; status?: VenueExecution['status'] } = {}) {
    this.id = id;
    this.failWith = opts.failWith;
    this.status = opts.status ?? 'filled';
  }

  submit: OmsSubmitFn = async (req) => {
    this.calls.push(req);
    if (this.failWith) throw this.failWith;
    return {
      venueId: this.id,
      venueOrderId: `v-${this.id}`,
      filledAmount: req.amount,
      averagePrice: req.limitPrice,
      feeAmount: parseAmount('0'),
      feeAsset: 'USDT',
      status: this.status,
      executedAt: new Date('2026-08-17T00:00:00.000Z'),
    };
  };
}

const venueBody = {
  id: 'street',
  kind: 'external-cex' as const,
  price: '100',
  amount: '10',
  feeBps: 10,
  costTerms: {
    feeBps: 10,
    expectedImpactBps: 5,
    transferCostBps: 2,
    latencyGrade: latencyGradeWire('street'),
  },
};

describe('executeOmsRoute', () => {
  it('calls submit on the chosen venue with decimal-string amounts from the plan', async () => {
    const cheap = new FakeSource('cheap');
    const dear = new FakeSource('dear');
    const result = await executeOmsRoute({
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: '1',
      venues: [completeVenue({ id: 'dear', price: '101' }), completeVenue({ id: 'cheap', price: '100' })],
      submitByVenue: { cheap: cheap.submit, dear: dear.submit },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.venues.map((v) => v.venueId)).toEqual(['cheap']);
    expect(cheap.calls).toHaveLength(1);
    expect(dear.calls).toHaveLength(0);
    expect(cheap.calls[0]).toMatchObject({
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: parseAmount('1'),
      limitPrice: parseAmount('100'),
    });
    expect(result.executions[0]?.venueId).toBe('cheap');
    expect(result.executions[0]?.status).toBe('filled');
  });

  it('records EMS acks when emsStore is wired', async () => {
    const cheap = new FakeSource('cheap');
    const store = new InMemoryEmsOrderStore();
    const result = await executeOmsRoute({
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: '1',
      venues: [completeVenue({ id: 'cheap', price: '100' })],
      submitByVenue: { cheap: cheap.submit },
      emsStore: store,
    });
    expect(result.ok).toBe(true);
    expect(store.get('oms-cheap')?.execution.venueOrderId).toBe('v-cheap');
  });

  it('refuses internal venues and does not submit', async () => {
    const book = new FakeSource('book');
    const result = await executeOmsRoute({
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: '1',
      venues: [completeVenue({ id: 'book', price: '90', kind: 'internal' })],
      submitByVenue: { book: book.submit },
    });
    expect(result).toMatchObject({ ok: false, reason: 'internal_venue' });
    expect(book.calls).toHaveLength(0);
  });

  it('refuses a killed house tenant and does not submit', async () => {
    const street = new FakeSource('street');
    const registry = new SealedHouseTenantRegistry();
    registry.register('house-1', 'seed');
    registry.kill('house-1', 'seed');
    const result = await executeOmsRoute(
      {
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: '1',
        tenantId: 'house-1',
        venues: [completeVenue({ id: 'street', price: '100' })],
        submitByVenue: { street: street.submit },
      },
      registry,
    );
    expect(result).toMatchObject({ ok: false, reason: 'kill_switch' });
    expect(street.calls).toHaveLength(0);
  });

  it('records venue acks in EMS store on successful execute', async () => {
    const emsStore = new InMemoryEmsOrderStore();
    const street = new FakeSource('street');
    const result = await executeOmsRoute({
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: '1',
      venues: [completeVenue({ id: 'street', price: '100' })],
      submitByVenue: { street: street.submit },
      emsStore,
    });
    expect(result.ok).toBe(true);
    const ack = emsStore.get('oms-street');
    expect(ack?.execution.venueOrderId).toBe('v-street');
  });

  it('surfaces submit throw as submit_failed, never a filled report', async () => {
    const street = new FakeSource('street', { failWith: new Error('venue 503') });
    const result = await executeOmsRoute({
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: '1',
      venues: [completeVenue({ id: 'street', price: '100' })],
      submitByVenue: { street: street.submit },
    });
    expect(result).toMatchObject({ ok: false, reason: 'submit_failed', detail: 'venue 503' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect('report' in result).toBe(false);
    expect(street.calls).toHaveLength(1);
  });
});

describe('plan door still does not submit', () => {
  it('planOmsRoute never calls an injected submit', async () => {
    const street = new FakeSource('street');
    const result = await planOmsRoute({
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: '1',
      venues: [completeVenue({ id: 'street', price: '100' })],
    });
    expect(result.ok).toBe(true);
    expect(street.calls).toHaveLength(0);
  });
});

describe('execution.oms.execute tRPC', () => {
  it('refuses anonymous execute', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(
      router.createCaller(anon).execution.oms.execute({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: '1',
        venues: [venueBody],
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('submits the planned venue through the injected map', async () => {
    const street = new FakeSource('street');
    const caller = createExecutionRouter(new SealedHouseTenantRegistry(), { street: street.submit }).createCaller(signed());
    const out = await caller.execution.oms.execute({
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: '1',
      venues: [venueBody],
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.executions[0]?.venueId).toBe('street');
    expect(street.calls).toHaveLength(1);
  });

  it('plan caller still does not submit', async () => {
    const street = new FakeSource('street');
    const caller = createExecutionRouter(new SealedHouseTenantRegistry(), { street: street.submit }).createCaller(signed());
    const out = await caller.execution.oms.plan({
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: '1',
      venues: [venueBody],
    });
    expect(out.ok).toBe(true);
    expect(street.calls).toHaveLength(0);
  });
});
