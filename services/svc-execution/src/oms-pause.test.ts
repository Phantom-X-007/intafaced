import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import type { SubmitRequest } from '@intafaced/venue-adapter';
import { InMemoryEmsOrderStore } from './oms-ems-store.js';
import { executeOmsRoute, type OmsSubmitFn } from './oms-execute.js';
import { InMemoryAlgoPauseStore, pauseInFlightAlgo } from './oms-pause.js';
import { createExecutionRouter } from './router.js';
import { latencyGradeWire, type OmsPlanVenue } from './oms-plan.js';

const SECRET = 'a-execution-oms-pause-test-edge-secret';
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

function hmacSigned(p: Principal = principal()) {
  return { ...signed(p), service: 'svc-execution' as const };
}

function completeVenue(over: Partial<OmsPlanVenue> & Pick<OmsPlanVenue, 'id' | 'price'>): OmsPlanVenue {
  return {
    kind: 'external-cex',
    amount: '1',
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
      status: 'partial',
      executedAt: new Date('2026-08-25T00:00:00.000Z'),
    };
  };
}

function seedAck(
  store: InMemoryEmsOrderStore,
  over: {
    clientOrderId?: string;
    parentClientOrderId?: string;
    executionGroupId?: string;
    venueId?: string;
    state?: 'ACKNOWLEDGED' | 'REJECTED' | 'UNWIRED' | 'SUBMIT_UNKNOWN' | 'OUTCOME_UNKNOWN';
  } = {},
) {
  store.record({
    clientOrderId: over.clientOrderId ?? 'child-1',
    parentClientOrderId: over.parentClientOrderId ?? 'parent-1',
    executionGroupId: over.executionGroupId ?? 'algo-1',
    childOrderId: over.clientOrderId ?? 'child-1',
    legIndex: 0,
    venueId: over.venueId ?? 'street',
    symbol: 'BTC/USDT',
    side: 'buy',
    execution: null,
    state: over.state ?? 'ACKNOWLEDGED',
    reconciliationKey: null,
  });
}

describe('pauseInFlightAlgo', () => {
  it('pauses by parent — child stays live, never canceled', () => {
    const store = new InMemoryEmsOrderStore();
    const pauseStore = new InMemoryAlgoPauseStore();
    seedAck(store);
    const result = pauseInFlightAlgo({
      parentClientOrderId: 'parent-1',
      emsStore: store,
      pauseStore,
    });
    expect(result).toMatchObject({
      ok: true,
      algo: { parentClientOrderId: 'parent-1' },
      paused: true,
      alreadyPaused: false,
    });
    if (!result.ok) return;
    expect(result.children).toEqual([{ clientOrderId: 'child-1', venueId: 'street', outcome: 'unknown', reason: 'ACKNOWLEDGED' }]);
    expect(result.children[0] && 'status' in result.children[0] && result.children[0].status === 'canceled').toBe(false);
    expect(pauseStore.isPaused({ parentClientOrderId: 'parent-1' })).toBe(true);
  });

  it('acknowledged child with venue execution is live — not canceled', () => {
    const store = new InMemoryEmsOrderStore();
    const pauseStore = new InMemoryAlgoPauseStore();
    store.record({
      clientOrderId: 'child-1',
      parentClientOrderId: 'parent-1',
      executionGroupId: 'algo-1',
      childOrderId: 'child-1',
      legIndex: 0,
      venueId: 'street',
      symbol: 'BTC/USDT',
      side: 'buy',
      execution: {
        venueId: 'street',
        venueOrderId: 'v-1',
        filledAmount: parseAmount('0'),
        averagePrice: parseAmount('100'),
        feeAmount: parseAmount('0'),
        feeAsset: 'USDT',
        status: 'partial',
        executedAt: new Date('2026-08-25T00:00:00.000Z'),
      },
      state: 'ACKNOWLEDGED',
      reconciliationKey: null,
    });
    const result = pauseInFlightAlgo({
      parentClientOrderId: 'parent-1',
      emsStore: store,
      pauseStore,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.children).toEqual([{ clientOrderId: 'child-1', venueId: 'street', outcome: 'live', status: 'partial' }]);
    expect(result.children.some((c) => c.status === 'canceled')).toBe(false);
  });

  it('pauses by execution group — does not pause another algo', () => {
    const store = new InMemoryEmsOrderStore();
    const pauseStore = new InMemoryAlgoPauseStore();
    seedAck(store, { executionGroupId: 'algo-1' });
    seedAck(store, { clientOrderId: 'child-other', parentClientOrderId: 'parent-2', executionGroupId: 'algo-2' });
    const result = pauseInFlightAlgo({
      executionGroupId: 'algo-1',
      emsStore: store,
      pauseStore,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.children.map((c) => c.clientOrderId)).toEqual(['child-1']);
    expect(pauseStore.isPaused({ executionGroupId: 'algo-1' })).toBe(true);
    expect(pauseStore.isPaused({ executionGroupId: 'algo-2' })).toBe(false);
  });

  it('refuses both or neither algo identity', () => {
    const store = new InMemoryEmsOrderStore();
    const pauseStore = new InMemoryAlgoPauseStore();
    expect(pauseInFlightAlgo({ emsStore: store, pauseStore })).toMatchObject({ ok: false, reason: 'missing_algo' });
    expect(pauseInFlightAlgo({ parentClientOrderId: 'p', executionGroupId: 'g', emsStore: store, pauseStore })).toMatchObject({
      ok: false,
      reason: 'ambiguous_algo',
    });
  });

  it('rejected child is already_stopped — never rewritten to canceled', () => {
    const store = new InMemoryEmsOrderStore();
    const pauseStore = new InMemoryAlgoPauseStore();
    seedAck(store, { state: 'REJECTED' });
    const result = pauseInFlightAlgo({
      parentClientOrderId: 'parent-1',
      emsStore: store,
      pauseStore,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.children[0]).toMatchObject({ outcome: 'already_stopped', reason: 'REJECTED' });
    expect(result.children[0]?.status).toBeUndefined();
  });

  it('unknown child stays unknown — never invents canceled', () => {
    const store = new InMemoryEmsOrderStore();
    const pauseStore = new InMemoryAlgoPauseStore();
    seedAck(store, { state: 'SUBMIT_UNKNOWN' });
    const result = pauseInFlightAlgo({
      parentClientOrderId: 'parent-1',
      emsStore: store,
      pauseStore,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.children[0]).toMatchObject({ outcome: 'unknown', reason: 'SUBMIT_UNKNOWN' });
    expect(result.children.some((c) => c.status === 'canceled')).toBe(false);
  });

  it('second pause is alreadyPaused — still no new, still no cancel', () => {
    const store = new InMemoryEmsOrderStore();
    const pauseStore = new InMemoryAlgoPauseStore();
    seedAck(store);
    const first = pauseInFlightAlgo({ parentClientOrderId: 'parent-1', emsStore: store, pauseStore });
    const second = pauseInFlightAlgo({ parentClientOrderId: 'parent-1', emsStore: store, pauseStore });
    expect(first).toMatchObject({ ok: true, alreadyPaused: false });
    expect(second).toMatchObject({ ok: true, alreadyPaused: true, paused: true });
  });

  it('empty algo still pauses so future children take no new', () => {
    const store = new InMemoryEmsOrderStore();
    const pauseStore = new InMemoryAlgoPauseStore();
    const result = pauseInFlightAlgo({
      parentClientOrderId: 'parent-none',
      emsStore: store,
      pauseStore,
    });
    expect(result).toEqual({
      ok: true,
      algo: { parentClientOrderId: 'parent-none' },
      paused: true,
      alreadyPaused: false,
      children: [],
    });
    expect(pauseStore.isPaused({ parentClientOrderId: 'parent-none' })).toBe(true);
  });

  it('missing EMS or pause store is refused', () => {
    const store = new InMemoryEmsOrderStore();
    const pauseStore = new InMemoryAlgoPauseStore();
    expect(pauseInFlightAlgo({ parentClientOrderId: 'parent-1', pauseStore })).toMatchObject({
      ok: false,
      reason: 'ems_store_unwired',
    });
    expect(pauseInFlightAlgo({ parentClientOrderId: 'parent-1', emsStore: store })).toMatchObject({
      ok: false,
      reason: 'pause_store_unwired',
    });
  });
});

describe('paused algo takes no new children', () => {
  it('execute refuses a new child after pause and does not submit', async () => {
    const store = new InMemoryEmsOrderStore();
    const pauseStore = new InMemoryAlgoPauseStore();
    const street = new FakeSource('street');
    const paused = pauseInFlightAlgo({
      parentClientOrderId: 'parent-paused',
      emsStore: store,
      pauseStore,
    });
    expect(paused.ok).toBe(true);
    const result = await executeOmsRoute({
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: '1',
      parentClientOrderId: 'parent-paused',
      venues: [completeVenue({ id: 'street', price: '100' })],
      submitByVenue: { street: street.submit },
      emsStore: store,
      pauseStore,
    });
    expect(result).toMatchObject({ ok: false, reason: 'algo_paused' });
    expect(street.calls).toHaveLength(0);
    expect(store.list({ parentClientOrderId: 'parent-paused' })).toHaveLength(0);
  });

  it('unpaused algo still takes a child', async () => {
    const store = new InMemoryEmsOrderStore();
    const pauseStore = new InMemoryAlgoPauseStore();
    const street = new FakeSource('street');
    const result = await executeOmsRoute({
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: '1',
      parentClientOrderId: 'parent-live',
      venues: [completeVenue({ id: 'street', price: '100' })],
      submitByVenue: { street: street.submit },
      emsStore: store,
      pauseStore,
    });
    expect(result.ok).toBe(true);
    expect(street.calls).toHaveLength(1);
  });
});

describe('execution.oms.pause tRPC', () => {
  it('refuses anonymous pause', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(router.createCaller(anon).execution.oms.pause({ parentClientOrderId: 'parent-1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('pauses through the injected stores and execute takes no new', async () => {
    const store = new InMemoryEmsOrderStore();
    const pauseStore = new InMemoryAlgoPauseStore();
    seedAck(store);
    const street = new FakeSource('street');
    const caller = createExecutionRouter(
      new SealedHouseTenantRegistry(),
      { street: street.submit },
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      store,
      undefined,
      pauseStore,
    ).createCaller(hmacSigned());
    const out = await caller.execution.oms.pause({ parentClientOrderId: 'parent-1' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.paused).toBe(true);
    expect(out.children[0]?.outcome).toBe('unknown');
    const slice = await caller.execution.oms.pause({ parentClientOrderId: 'parent-slice' });
    expect(slice).toMatchObject({ ok: true, paused: true });
    const exec = await caller.execution.oms.execute({
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: '1',
      parentClientOrderId: 'parent-slice',
      venues: [
        {
          id: 'street',
          kind: 'external-cex',
          price: '100',
          amount: '1',
          feeBps: 10,
          costTerms: {
            feeBps: 10,
            expectedImpactBps: 5,
            transferCostBps: 2,
            latencyGrade: latencyGradeWire('street'),
          },
        },
      ],
    });
    expect(exec).toMatchObject({ ok: false, reason: 'algo_paused' });
    expect(street.calls).toHaveLength(0);
  });
});
