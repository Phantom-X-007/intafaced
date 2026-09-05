import { describe, expect, it } from 'vitest';
import { parseAmount, ZERO } from '@intafaced/ledger-client';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import type { SubmitRequest, VenueExecution } from '@intafaced/venue-adapter';
import type { VenueOrder } from '@intafaced/venue-contracts';
import type { OmsCancelFn } from './oms-cancel.js';
import { InMemoryEmsOrderStore } from './oms-ems-store.js';
import { InMemoryAlgoPauseStore } from './oms-pause.js';
import {
  InMemoryApprovedAlgoParentStore,
  type ApprovedAlgoParent,
  type ApprovedAlgoParentStore,
  type RetainedAlgoSchedule,
} from './oms-start.js';
import { sliceLiveAlgoParent } from './oms-slice.js';
import { listUnattendedLiveParents } from './oms-unattended.js';
import { killUnattendedLiveParent } from './oms-unattended-kill.js';
import type { OmsSubmitFn } from './oms-trade-submit.js';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-oms-unattended-kill-test-edge-secret';
const OP = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';
const ORIGINATOR = '55555555-5555-4555-8555-555555555555';
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-execution' });
const now = new Date('2026-08-25T00:00:00.000Z');

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

function retainedTwap(): RetainedAlgoSchedule {
  return { durationMs: 60_000, sliceIntervalMs: 10_000, slicesPlanned: 6, participationBps: null };
}

function live(
  over: Partial<ApprovedAlgoParent> &
    Pick<ApprovedAlgoParent, 'parentClientOrderId' | 'kind'> & {
      schedule?: RetainedAlgoSchedule;
    },
): ApprovedAlgoParent {
  return {
    status: 'approved',
    startedAt: null,
    residual: { remaining: '10' },
    originator: ORIGINATOR,
    ...over,
    schedule: over.schedule ?? retainedTwap(),
  };
}

function venueOrder(over: Partial<VenueOrder> = {}): VenueOrder {
  return {
    venueId: 'street',
    venueOrderId: 'v-1',
    clientOrderId: 'child-1',
    symbol: 'BTC/USDT',
    side: 'buy',
    type: 'limit',
    price: parseAmount('100'),
    amount: parseAmount('1'),
    filled: ZERO,
    remaining: parseAmount('1'),
    averagePrice: null,
    status: 'canceled',
    feePaid: ZERO,
    feeAsset: 'USDT',
    createdAt: now,
    observedAt: now,
    ...over,
  };
}

class FakeCancel {
  readonly calls: { symbol: string; clientOrderId: string }[] = [];
  constructor(
    private readonly next: VenueOrder | Error,
    readonly id = 'street',
  ) {}
  fn: OmsCancelFn = async (symbol, clientOrderId) => {
    this.calls.push({ symbol, clientOrderId });
    if (this.next instanceof Error) throw this.next;
    return this.next;
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
    parentClientOrderId: over.parentClientOrderId ?? 'parent-twap',
    executionGroupId: over.executionGroupId ?? 'parent-twap',
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

function ack(req: SubmitRequest): VenueExecution {
  return {
    venueId: 'street',
    venueOrderId: 'v-unattended-kill-1',
    filledAmount: req.amount,
    averagePrice: req.limitPrice,
    feeAmount: ZERO,
    feeAsset: 'USDT',
    status: 'filled',
    executedAt: new Date('2026-08-25T00:00:00.000Z'),
  };
}

function trackingSubmit(): { calls: SubmitRequest[]; submit: OmsSubmitFn } {
  const calls: SubmitRequest[] = [];
  return {
    calls,
    submit: async (req) => {
      calls.push(req);
      return ack(req);
    },
  };
}

function stubStore(over: Partial<ApprovedAlgoParentStore> = {}): ApprovedAlgoParentStore {
  return {
    get: () => null,
    approve: (parent) => parent,
    start: () => null,
    stop: () => null,
    undeploy: () => null,
    expire: () => null,
    ...over,
  };
}

describe('killUnattendedLiveParent', () => {
  it('unowned running parent + operator → children stop, parent stopped, list drops it', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(
      live({
        parentClientOrderId: 'parent-twap',
        kind: 'twap',
        status: 'running',
        startedAt: '2026-08-25T00:00:00.000Z',
      }),
    );
    const emsStore = new InMemoryEmsOrderStore();
    seedAck(emsStore);
    const street = new FakeCancel(venueOrder());
    const pauseStore = new InMemoryAlgoPauseStore();

    const listed = listUnattendedLiveParents({ parentStore });
    expect(listed).toMatchObject({ ok: true, parents: [{ parentClientOrderId: 'parent-twap', executionOwner: null }] });

    const out = await killUnattendedLiveParent({
      parentClientOrderId: 'parent-twap',
      operatorId: OP,
      parentStore,
      pauseStore,
      emsStore,
      cancelByVenue: { street: street.fn },
    });
    expect(out).toMatchObject({
      ok: true,
      killed: true,
      parent: { parentClientOrderId: 'parent-twap', kind: 'twap' },
    });
    if (!out.ok) return;
    expect(out.children).toEqual([{ clientOrderId: 'child-1', venueId: 'street', outcome: 'stopped', status: 'canceled' }]);
    expect(out.residual).toEqual({ filled: '0', remaining: '1' });
    expect(street.calls).toEqual([{ symbol: 'BTC/USDT', clientOrderId: 'child-1' }]);
    expect(parentStore.get('parent-twap')).toMatchObject({
      status: 'stopped',
      originator: ORIGINATOR,
    });
    expect(parentStore.get('parent-twap')?.executionOwner ?? null).toBeNull();
    expect(pauseStore.isPaused({ parentClientOrderId: 'parent-twap' })).toBe(true);
    expect(listUnattendedLiveParents({ parentStore })).toEqual({ ok: true, parents: [] });

    const streetSubmit = trackingSubmit();
    expect(
      await sliceLiveAlgoParent({
        parentClientOrderId: 'parent-twap',
        amount: '0.5',
        venueId: 'street',
        symbol: 'BTC/USDT',
        side: 'buy',
        limitPrice: '100',
        parentStore,
        submit: streetSubmit.submit,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(streetSubmit.calls).toEqual([]);
  });

  it('unowned approved parent with no children → parent stopped, owner never invented', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-vwap', kind: 'vwap' }));
    const emsStore = new InMemoryEmsOrderStore();
    const street = new FakeCancel(venueOrder());
    const out = await killUnattendedLiveParent({
      parentClientOrderId: 'parent-vwap',
      operatorId: OP,
      parentStore,
      pauseStore: new InMemoryAlgoPauseStore(),
      emsStore,
      cancelByVenue: { street: street.fn },
    });
    expect(out).toMatchObject({
      ok: true,
      killed: true,
      parent: { parentClientOrderId: 'parent-vwap', kind: 'vwap' },
      children: [],
    });
    expect(street.calls).toHaveLength(0);
    expect(parentStore.get('parent-vwap')?.status).toBe('stopped');
    expect(parentStore.get('parent-vwap')?.executionOwner ?? null).toBeNull();
    expect(parentStore.get('parent-vwap')?.originator).toBe(ORIGINATOR);
    expect(listUnattendedLiveParents({ parentStore })).toEqual({ ok: true, parents: [] });
  });

  it('missing operator refuses — no cancel, parent stays unattended', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(
      live({
        parentClientOrderId: 'parent-twap',
        kind: 'twap',
        status: 'running',
        startedAt: '2026-08-25T00:00:00.000Z',
      }),
    );
    const emsStore = new InMemoryEmsOrderStore();
    seedAck(emsStore);
    const street = new FakeCancel(venueOrder());
    expect(
      await killUnattendedLiveParent({
        parentClientOrderId: 'parent-twap',
        operatorId: '   ',
        parentStore,
        pauseStore: new InMemoryAlgoPauseStore(),
        emsStore,
        cancelByVenue: { street: street.fn },
      }),
    ).toMatchObject({ ok: false, reason: 'missing_operator' });
    expect(street.calls).toEqual([]);
    expect(parentStore.get('parent-twap')?.status).toBe('running');
    expect(listUnattendedLiveParents({ parentStore })).toMatchObject({
      ok: true,
      parents: [{ parentClientOrderId: 'parent-twap' }],
    });
  });

  it('already owned refuses — no silent steal, no cancel', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(
      live({
        parentClientOrderId: 'parent-twap',
        kind: 'twap',
        status: 'running',
        startedAt: '2026-08-25T00:00:00.000Z',
        executionOwner: OTHER,
      }),
    );
    const emsStore = new InMemoryEmsOrderStore();
    seedAck(emsStore);
    const street = new FakeCancel(venueOrder());
    expect(
      await killUnattendedLiveParent({
        parentClientOrderId: 'parent-twap',
        operatorId: OP,
        parentStore,
        pauseStore: new InMemoryAlgoPauseStore(),
        emsStore,
        cancelByVenue: { street: street.fn },
      }),
    ).toMatchObject({ ok: false, reason: 'already_claimed' });
    expect(street.calls).toEqual([]);
    expect(parentStore.get('parent-twap')).toMatchObject({
      status: 'running',
      executionOwner: OTHER,
    });
  });

  it('venue throw is unknown child — parent still stopped, never invents canceled', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(
      live({
        parentClientOrderId: 'parent-twap',
        kind: 'pov',
        status: 'running',
        startedAt: '2026-08-25T00:00:00.000Z',
      }),
    );
    const emsStore = new InMemoryEmsOrderStore();
    seedAck(emsStore);
    const street = new FakeCancel(new Error('venue 503'));
    const out = await killUnattendedLiveParent({
      parentClientOrderId: 'parent-twap',
      operatorId: OP,
      parentStore,
      pauseStore: new InMemoryAlgoPauseStore(),
      emsStore,
      cancelByVenue: { street: street.fn },
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.children[0]).toMatchObject({ outcome: 'unknown', reason: 'cancel_failed' });
    expect(out.residual).toEqual({ filled: '0', remaining: null });
    expect(out.children[0] && out.children[0].status === 'canceled').toBe(false);
    expect(parentStore.get('parent-twap')?.status).toBe('stopped');
    expect(listUnattendedLiveParents({ parentStore })).toEqual({ ok: true, parents: [] });
  });

  it('paper / not live / missing parent refuse-closed', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'paper-twap', kind: 'twap', status: 'paper' }));
    parentStore.seed(live({ parentClientOrderId: 'stopped-twap', kind: 'twap', status: 'stopped' }));
    const emsStore = new InMemoryEmsOrderStore();
    const pauseStore = new InMemoryAlgoPauseStore();
    expect(await killUnattendedLiveParent({ parentClientOrderId: '', operatorId: OP, parentStore, pauseStore, emsStore })).toMatchObject({
      ok: false,
      reason: 'missing_parent',
    });
    expect(
      await killUnattendedLiveParent({
        parentClientOrderId: 'missing',
        operatorId: OP,
        parentStore,
        pauseStore,
        emsStore,
      }),
    ).toMatchObject({ ok: false, reason: 'not_found' });
    expect(
      await killUnattendedLiveParent({
        parentClientOrderId: 'paper-twap',
        operatorId: OP,
        parentStore,
        pauseStore,
        emsStore,
      }),
    ).toMatchObject({ ok: false, reason: 'paper' });
    expect(
      await killUnattendedLiveParent({
        parentClientOrderId: 'stopped-twap',
        operatorId: OP,
        parentStore,
        pauseStore,
        emsStore,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('unwired stores refuse-closed before cancel', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    const street = new FakeCancel(venueOrder());
    expect(await killUnattendedLiveParent({ parentClientOrderId: 'parent-twap', operatorId: OP })).toMatchObject({
      ok: false,
      reason: 'parent_store_unwired',
    });
    expect(
      await killUnattendedLiveParent({
        parentClientOrderId: 'parent-twap',
        operatorId: OP,
        parentStore,
        emsStore: new InMemoryEmsOrderStore(),
      }),
    ).toMatchObject({ ok: false, reason: 'pause_store_unwired' });
    expect(
      await killUnattendedLiveParent({
        parentClientOrderId: 'parent-twap',
        operatorId: OP,
        parentStore,
        pauseStore: new InMemoryAlgoPauseStore(),
      }),
    ).toMatchObject({ ok: false, reason: 'ems_store_unwired' });
    expect(
      await killUnattendedLiveParent({
        parentClientOrderId: 'parent-twap',
        operatorId: OP,
        parentStore: stubStore({
          get: () => live({ parentClientOrderId: 'parent-twap', kind: 'twap' }),
        }),
        pauseStore: new InMemoryAlgoPauseStore(),
        emsStore: new InMemoryEmsOrderStore(),
        cancelByVenue: { street: street.fn },
      }),
    ).toMatchObject({ ok: false, reason: 'parent_store_unwired' });
    expect(street.calls).toEqual([]);
  });
});

describe('execution.oms.killUnattended tRPC', () => {
  it('door exists (admin:write) and refuses anonymous kill', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const caller = router.createCaller(hmacSigned());
    expect(typeof caller.execution.oms.killUnattended).toBe('function');
    const out = await caller.execution.oms.killUnattended({ parentClientOrderId: 'parent-1' });
    expect(out).toMatchObject({ ok: false, reason: 'ems_store_unwired' });
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(router.createCaller(anon).execution.oms.killUnattended({ parentClientOrderId: 'parent-1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('kills from signed principal and refuses a second operator on an owned parent', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(
      live({
        parentClientOrderId: 'parent-1',
        kind: 'twap',
        status: 'running',
        startedAt: '2026-08-25T00:00:00.000Z',
      }),
    );
    const emsStore = new InMemoryEmsOrderStore();
    seedAck(emsStore, { parentClientOrderId: 'parent-1' });
    const street = new FakeCancel(venueOrder());
    const router = createExecutionRouter(
      new SealedHouseTenantRegistry(),
      {},
      { street: street.fn },
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
      emsStore,
      undefined,
      undefined,
      parentStore,
    );
    const desk = router.createCaller(hmacSigned());
    const killed = await desk.execution.oms.killUnattended({ parentClientOrderId: 'parent-1' });
    expect(killed).toMatchObject({ ok: true, killed: true, parent: { parentClientOrderId: 'parent-1' } });
    expect(parentStore.get('parent-1')?.status).toBe('stopped');
    expect(await desk.execution.oms.unattended()).toMatchObject({ ok: true, parents: [] });

    const owned = new InMemoryApprovedAlgoParentStore();
    owned.seed(
      live({
        parentClientOrderId: 'owned-1',
        kind: 'twap',
        status: 'running',
        startedAt: '2026-08-25T00:00:00.000Z',
        executionOwner: OTHER,
      }),
    );
    const ownedEms = new InMemoryEmsOrderStore();
    seedAck(ownedEms, { parentClientOrderId: 'owned-1' });
    const otherStreet = new FakeCancel(venueOrder());
    const ownedRouter = createExecutionRouter(
      new SealedHouseTenantRegistry(),
      {},
      { street: otherStreet.fn },
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
      ownedEms,
      undefined,
      undefined,
      owned,
    );
    expect(await ownedRouter.createCaller(hmacSigned()).execution.oms.killUnattended({ parentClientOrderId: 'owned-1' })).toMatchObject({
      ok: false,
      reason: 'already_claimed',
    });
    expect(otherStreet.calls).toEqual([]);
  });

  it('body operatorId is ignored — signed principal is the operator', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    const caller = createExecutionRouter(
      new SealedHouseTenantRegistry(),
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
      {},
      new InMemoryEmsOrderStore(),
      undefined,
      undefined,
      parentStore,
    ).createCaller(hmacSigned());
    const out = await caller.execution.oms.killUnattended({
      parentClientOrderId: 'parent-1',
      operatorId: OTHER,
    } as { parentClientOrderId: string });
    expect(out).toMatchObject({ ok: true, killed: true });
    expect(parentStore.get('parent-1')?.executionOwner ?? null).toBeNull();
    expect(parentStore.get('parent-1')?.status).toBe('stopped');
  });
});
