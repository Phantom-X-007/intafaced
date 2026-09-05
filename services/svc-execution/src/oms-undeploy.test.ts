import { describe, expect, it } from 'vitest';
import { parseAmount, ZERO } from '@intafaced/ledger-client';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import type { VenueExecution } from '@intafaced/venue-adapter';
import type { VenueOrder } from '@intafaced/venue-contracts';
import type { OmsCancelFn } from './oms-cancel.js';
import { cancelRemainingParentChildren } from './oms-cancel-remaining.js';
import { InMemoryEmsOrderStore } from './oms-ems-store.js';
import {
  InMemoryApprovedAlgoParentStore,
  startApprovedAlgoParent,
  type ApprovedAlgoParent,
  type RetainedAlgoSchedule,
} from './oms-start.js';
import { undeployStoppedAlgoParent } from './oms-undeploy.js';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-oms-undeploy-test-edge-secret';
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

function retainedTwap(): RetainedAlgoSchedule {
  return { durationMs: 60_000, sliceIntervalMs: 10_000, slicesPlanned: 6, participationBps: null };
}

function retainedVwap(): RetainedAlgoSchedule {
  return { durationMs: 120_000, sliceIntervalMs: 15_000, slicesPlanned: 8, participationBps: null };
}

function retainedPov(): RetainedAlgoSchedule {
  return { durationMs: 90_000, sliceIntervalMs: 5_000, slicesPlanned: 18, participationBps: 150 };
}

function stopped(
  over: Partial<ApprovedAlgoParent> &
    Pick<ApprovedAlgoParent, 'parentClientOrderId' | 'kind'> & {
      schedule?: RetainedAlgoSchedule;
    },
): ApprovedAlgoParent {
  const schedule = over.schedule ?? (over.kind === 'pov' ? retainedPov() : over.kind === 'vwap' ? retainedVwap() : retainedTwap());
  return {
    status: 'stopped',
    startedAt: '2026-08-25T12:00:00.000Z',
    ...over,
    schedule,
  };
}

const now = new Date('2026-08-25T00:00:00.000Z');

function execution(over: Partial<VenueExecution> = {}): VenueExecution {
  return {
    venueId: 'street',
    venueOrderId: 'v-1',
    filledAmount: parseAmount('1'),
    averagePrice: parseAmount('100'),
    feeAmount: ZERO,
    feeAsset: 'USDT',
    status: 'partial',
    executedAt: now,
    ...over,
  };
}

function seedChild(
  store: InMemoryEmsOrderStore,
  over: {
    clientOrderId?: string;
    parentClientOrderId?: string;
    venueId?: string;
    state?: 'ACKNOWLEDGED' | 'REJECTED' | 'UNWIRED' | 'SUBMIT_UNKNOWN' | 'OUTCOME_UNKNOWN';
    execution?: VenueExecution | null;
  } = {},
) {
  store.record({
    clientOrderId: over.clientOrderId ?? 'child-1',
    parentClientOrderId: over.parentClientOrderId ?? 'parent-1',
    executionGroupId: 'algo-1',
    childOrderId: over.clientOrderId ?? 'child-1',
    legIndex: 0,
    venueId: over.venueId ?? 'street',
    symbol: 'BTC/USDT',
    side: 'buy',
    execution: over.execution === undefined ? execution() : over.execution,
    state: over.state ?? 'ACKNOWLEDGED',
    reconciliationKey: null,
  });
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

describe('undeployStoppedAlgoParent', () => {
  it('missing parent id', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    expect(undeployStoppedAlgoParent({ parentStore })).toMatchObject({
      ok: false,
      reason: 'missing_parent',
    });
    expect(undeployStoppedAlgoParent({ parentClientOrderId: '   ', parentStore })).toMatchObject({
      ok: false,
      reason: 'missing_parent',
    });
  });

  it('parent_only when executionGroupId is supplied', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(stopped({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    expect(
      undeployStoppedAlgoParent({
        parentClientOrderId: 'parent-1',
        executionGroupId: 'algo-1',
        parentStore,
      }),
    ).toMatchObject({ ok: false, reason: 'parent_only' });
    expect(parentStore.get('parent-1')?.status).toBe('stopped');
  });

  it('not_found when the store has no row', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    expect(
      undeployStoppedAlgoParent({
        parentClientOrderId: 'missing',
        parentStore,
      }),
    ).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('not_stopped when status is approved', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed({
      ...stopped({ parentClientOrderId: 'parent-approved', kind: 'twap' }),
      status: 'approved',
      startedAt: null,
    });
    expect(
      undeployStoppedAlgoParent({
        parentClientOrderId: 'parent-approved',
        parentStore,
      }),
    ).toMatchObject({ ok: false, reason: 'not_stopped' });
    expect(parentStore.get('parent-approved')?.status).toBe('approved');
  });

  it('not_stopped when status is running', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed({
      ...stopped({ parentClientOrderId: 'parent-run', kind: 'twap' }),
      status: 'running',
    });
    expect(
      undeployStoppedAlgoParent({
        parentClientOrderId: 'parent-run',
        parentStore,
      }),
    ).toMatchObject({ ok: false, reason: 'not_stopped' });
    expect(parentStore.get('parent-run')?.status).toBe('running');
  });

  it('already_undeployed when status is undeployed', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed({
      ...stopped({ parentClientOrderId: 'parent-done', kind: 'twap' }),
      status: 'undeployed',
    });
    expect(
      undeployStoppedAlgoParent({
        parentClientOrderId: 'parent-done',
        parentStore,
      }),
    ).toMatchObject({ ok: false, reason: 'already_undeployed' });
  });

  it('store unwired', () => {
    expect(undeployStoppedAlgoParent({ parentClientOrderId: 'parent-1' })).toMatchObject({
      ok: false,
      reason: 'parent_store_unwired',
    });
  });

  it('paper parent refuses', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    const emsStore = new InMemoryEmsOrderStore();
    parentStore.seed({
      ...stopped({ parentClientOrderId: 'parent-paper', kind: 'twap' }),
      status: 'paper',
    });
    expect(
      undeployStoppedAlgoParent({
        parentClientOrderId: 'parent-paper',
        parentStore,
        emsStore,
      }),
    ).toMatchObject({ ok: false, reason: 'paper' });
    expect(parentStore.get('parent-paper')?.status).toBe('paper');
  });

  it('ems store unwired when the parent is stopped', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(stopped({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    expect(undeployStoppedAlgoParent({ parentClientOrderId: 'parent-1', parentStore })).toMatchObject({
      ok: false,
      reason: 'ems_store_unwired',
    });
    expect(parentStore.get('parent-1')?.status).toBe('stopped');
  });

  it('live/open/partial EMS child refuses — parent stays stopped', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    const emsStore = new InMemoryEmsOrderStore();
    parentStore.seed(stopped({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    seedChild(emsStore, { execution: execution({ status: 'partial' }) });
    const out = undeployStoppedAlgoParent({
      parentClientOrderId: 'parent-1',
      parentStore,
      emsStore,
    });
    expect(out).toMatchObject({
      ok: false,
      reason: 'live_children',
      children: [{ clientOrderId: 'child-1', venueId: 'street', status: 'partial' }],
    });
    expect(parentStore.get('parent-1')?.status).toBe('stopped');
  });

  it('unknown EMS child refuses — refuse-closed', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    const emsStore = new InMemoryEmsOrderStore();
    parentStore.seed(stopped({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    seedChild(emsStore, { state: 'SUBMIT_UNKNOWN', execution: null });
    expect(
      undeployStoppedAlgoParent({
        parentClientOrderId: 'parent-1',
        parentStore,
        emsStore,
      }),
    ).toMatchObject({ ok: false, reason: 'live_children' });
    expect(parentStore.get('parent-1')?.status).toBe('stopped');
  });

  it('another parent live child does not block', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    const emsStore = new InMemoryEmsOrderStore();
    parentStore.seed(stopped({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    seedChild(emsStore, { parentClientOrderId: 'parent-other', execution: execution({ status: 'partial' }) });
    const out = undeployStoppedAlgoParent({
      parentClientOrderId: 'parent-1',
      parentStore,
      emsStore,
    });
    expect(out).toMatchObject({ ok: true, undeployed: true, status: 'undeployed' });
    expect(parentStore.get('parent-1')?.status).toBe('undeployed');
  });

  it('filled / rejected / REJECTED / UNWIRED children do not block', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    const emsStore = new InMemoryEmsOrderStore();
    parentStore.seed(stopped({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    seedChild(emsStore, {
      clientOrderId: 'filled-1',
      execution: execution({ status: 'filled', venueOrderId: 'v-filled' }),
    });
    seedChild(emsStore, {
      clientOrderId: 'rejected-1',
      execution: execution({ status: 'rejected', venueOrderId: 'v-rej' }),
    });
    seedChild(emsStore, { clientOrderId: 'rej-state', state: 'REJECTED', execution: null });
    seedChild(emsStore, { clientOrderId: 'unwired-1', state: 'UNWIRED', execution: null });
    const out = undeployStoppedAlgoParent({
      parentClientOrderId: 'parent-1',
      parentStore,
      emsStore,
    });
    expect(out).toMatchObject({ ok: true, undeployed: true, status: 'undeployed' });
  });

  it('live child refuses; after cancelRemaining undeploy proceeds', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    const emsStore = new InMemoryEmsOrderStore();
    parentStore.seed(stopped({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    seedChild(emsStore, { execution: execution({ status: 'partial' }) });
    expect(
      undeployStoppedAlgoParent({
        parentClientOrderId: 'parent-1',
        parentStore,
        emsStore,
      }),
    ).toMatchObject({ ok: false, reason: 'live_children' });
    expect(parentStore.get('parent-1')?.status).toBe('stopped');

    const street = new FakeCancel(venueOrder());
    const cancelled = await cancelRemainingParentChildren({
      parentClientOrderId: 'parent-1',
      cancelByVenue: { street: street.fn },
      emsStore,
    });
    expect(cancelled).toMatchObject({ ok: true });
    if (!cancelled.ok) return;
    expect(cancelled.children[0]).toMatchObject({ outcome: 'stopped', status: 'canceled' });
    expect(street.calls).toEqual([{ symbol: 'BTC/USDT', clientOrderId: 'child-1' }]);
    expect(emsStore.get('child-1')?.state).toBe('CANCELED');

    const out = undeployStoppedAlgoParent({
      parentClientOrderId: 'parent-1',
      parentStore,
      emsStore,
    });
    expect(out).toMatchObject({ ok: true, undeployed: true, status: 'undeployed' });
    expect(parentStore.get('parent-1')?.status).toBe('undeployed');
  });

  it('cancelRemaining unknown leaves live children — undeploy still refuses', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    const emsStore = new InMemoryEmsOrderStore();
    parentStore.seed(stopped({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    seedChild(emsStore, { execution: execution({ status: 'partial' }) });
    const street = new FakeCancel(new Error('venue 503'));
    const cancelled = await cancelRemainingParentChildren({
      parentClientOrderId: 'parent-1',
      cancelByVenue: { street: street.fn },
      emsStore,
    });
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(cancelled.children[0]).toMatchObject({ outcome: 'unknown', reason: 'cancel_failed' });
    expect(
      undeployStoppedAlgoParent({
        parentClientOrderId: 'parent-1',
        parentStore,
        emsStore,
      }),
    ).toMatchObject({ ok: false, reason: 'live_children' });
    expect(parentStore.get('parent-1')?.status).toBe('stopped');
  });

  it('happy TWAP/VWAP/POV stopped → undeployed', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    const emsStore = new InMemoryEmsOrderStore();
    parentStore.seed(stopped({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    parentStore.seed(stopped({ parentClientOrderId: 'parent-vwap', kind: 'vwap' }));
    parentStore.seed(stopped({ parentClientOrderId: 'parent-pov', kind: 'pov' }));

    const twap = undeployStoppedAlgoParent({
      parentClientOrderId: 'parent-twap',
      parentStore,
      emsStore,
    });
    const vwap = undeployStoppedAlgoParent({
      parentClientOrderId: 'parent-vwap',
      parentStore,
      emsStore,
    });
    const pov = undeployStoppedAlgoParent({
      parentClientOrderId: 'parent-pov',
      parentStore,
      emsStore,
    });

    expect(twap).toEqual({
      ok: true,
      parent: { parentClientOrderId: 'parent-twap', kind: 'twap' },
      undeployed: true,
      status: 'undeployed',
      schedule: retainedTwap(),
    });
    expect(vwap).toEqual({
      ok: true,
      parent: { parentClientOrderId: 'parent-vwap', kind: 'vwap' },
      undeployed: true,
      status: 'undeployed',
      schedule: retainedVwap(),
    });
    expect(pov).toEqual({
      ok: true,
      parent: { parentClientOrderId: 'parent-pov', kind: 'pov' },
      undeployed: true,
      status: 'undeployed',
      schedule: retainedPov(),
    });
    expect(parentStore.get('parent-twap')?.status).toBe('undeployed');
    expect(parentStore.get('parent-vwap')?.status).toBe('undeployed');
    expect(parentStore.get('parent-pov')?.status).toBe('undeployed');
  });

  it('does not rewrite the retained schedule', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    const retained: RetainedAlgoSchedule = {
      durationMs: 12_345,
      sliceIntervalMs: 678,
      slicesPlanned: 3,
      participationBps: 42,
    };
    parentStore.seed(stopped({ parentClientOrderId: 'parent-odd', kind: 'pov', schedule: retained }));
    const result = undeployStoppedAlgoParent({
      parentClientOrderId: 'parent-odd',
      parentStore,
      emsStore: new InMemoryEmsOrderStore(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.schedule).toEqual(retained);
    expect(parentStore.get('parent-odd')?.schedule).toEqual(retained);
  });

  it('after undeploy startApprovedAlgoParent refuses not_approved even with jobs on', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(stopped({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    const undeployed = undeployStoppedAlgoParent({
      parentClientOrderId: 'parent-twap',
      parentStore,
      emsStore: new InMemoryEmsOrderStore(),
    });
    expect(undeployed).toMatchObject({ ok: true, undeployed: true, status: 'undeployed' });
    expect(
      startApprovedAlgoParent({
        parentClientOrderId: 'parent-twap',
        parentStore,
        jobs: { enabled: true },
      }),
    ).toMatchObject({ ok: false, reason: 'not_approved' });
    expect(parentStore.get('parent-twap')?.status).toBe('undeployed');
  });

  it('store.undeploy only flips stopped → undeployed; missing or not stopped returns null', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(stopped({ parentClientOrderId: 'parent-stopped', kind: 'twap' }));
    parentStore.seed({
      ...stopped({ parentClientOrderId: 'parent-approved', kind: 'twap' }),
      status: 'approved',
      startedAt: null,
    });
    parentStore.seed({
      ...stopped({ parentClientOrderId: 'parent-run', kind: 'twap' }),
      status: 'running',
    });
    expect(parentStore.undeploy('missing')).toBeNull();
    expect(parentStore.undeploy('parent-approved')).toBeNull();
    expect(parentStore.undeploy('parent-run')).toBeNull();
    expect(parentStore.get('parent-approved')?.status).toBe('approved');
    expect(parentStore.get('parent-run')?.status).toBe('running');
    const undeployed = parentStore.undeploy('parent-stopped');
    expect(undeployed?.status).toBe('undeployed');
    expect(undeployed?.schedule).toEqual(retainedTwap());
    expect(parentStore.undeploy('parent-stopped')).toBeNull();
  });
});

describe('execution.oms.undeploy tRPC', () => {
  it('door exists (admin:write) and refuses anonymous undeploy', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const caller = router.createCaller(hmacSigned());
    expect(typeof caller.execution.oms.undeploy).toBe('function');
    const out = await caller.execution.oms.undeploy({ parentClientOrderId: 'parent-1' });
    expect(out).toMatchObject({ ok: false, reason: 'not_found' });
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(router.createCaller(anon).execution.oms.undeploy({ parentClientOrderId: 'parent-1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('undeploys a stopped parent through the injected store; start then refuses not_approved', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    const emsStore = new InMemoryEmsOrderStore();
    parentStore.seed(stopped({ parentClientOrderId: 'parent-1', kind: 'twap' }));
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
      emsStore,
      undefined,
      undefined,
      parentStore,
      { enabled: true },
    ).createCaller(hmacSigned());
    const out = await caller.execution.oms.undeploy({ parentClientOrderId: 'parent-1' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.undeployed).toBe(true);
    expect(out.status).toBe('undeployed');
    expect(out.parent).toEqual({ parentClientOrderId: 'parent-1', kind: 'twap' });
    expect(out.schedule).toEqual(retainedTwap());
    expect(parentStore.get('parent-1')?.status).toBe('undeployed');
    const start = await caller.execution.oms.start({ parentClientOrderId: 'parent-1' });
    expect(start).toMatchObject({ ok: false, reason: 'not_approved' });
  });

  it('refuses live EMS children on the door; after cancelRemaining undeploy proceeds', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    const emsStore = new InMemoryEmsOrderStore();
    parentStore.seed(stopped({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    seedChild(emsStore, { execution: execution({ status: 'partial' }) });
    const street = new FakeCancel(venueOrder());
    const caller = createExecutionRouter(
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
      { enabled: true },
    ).createCaller(hmacSigned());
    const blocked = await caller.execution.oms.undeploy({ parentClientOrderId: 'parent-1' });
    expect(blocked).toMatchObject({ ok: false, reason: 'live_children' });
    expect(parentStore.get('parent-1')?.status).toBe('stopped');
    const cancelled = await caller.execution.oms.cancelRemaining({ parentClientOrderId: 'parent-1' });
    expect(cancelled).toMatchObject({ ok: true });
    const out = await caller.execution.oms.undeploy({ parentClientOrderId: 'parent-1' });
    expect(out).toMatchObject({ ok: true, undeployed: true, status: 'undeployed' });
    expect(parentStore.get('parent-1')?.status).toBe('undeployed');
  });
});
