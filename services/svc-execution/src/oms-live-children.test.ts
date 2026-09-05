import { describe, expect, it } from 'vitest';
import { parseAmount, ZERO } from '@intafaced/ledger-client';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import type { VenueExecution } from '@intafaced/venue-adapter';
import { InMemoryEmsOrderStore, type EmsOrderStore } from './oms-ems-store.js';
import { listLiveEmsChildren } from './oms-live-children.js';
import { InMemoryApprovedAlgoParentStore, type ApprovedAlgoParent, type RetainedAlgoSchedule } from './oms-start.js';
import { undeployStoppedAlgoParent } from './oms-undeploy.js';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-oms-live-children-test-edge-secret';
const OP = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';
const ORIGINATOR = '55555555-5555-4555-8555-555555555555';
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

function parent(over: Partial<ApprovedAlgoParent> & Pick<ApprovedAlgoParent, 'parentClientOrderId' | 'kind'>): ApprovedAlgoParent {
  return {
    status: 'stopped',
    startedAt: '2026-08-25T00:00:00.000Z',
    residual: { remaining: '10' },
    originator: ORIGINATOR,
    ...over,
    schedule: over.schedule ?? retainedTwap(),
  };
}

function execution(over: Partial<VenueExecution> = {}): VenueExecution {
  return {
    venueId: 'street',
    venueOrderId: 'v-1',
    filledAmount: parseAmount('0.5'),
    averagePrice: parseAmount('100'),
    feeAmount: ZERO,
    feeAsset: 'USDT',
    status: 'partial',
    executedAt: new Date('2026-08-25T00:00:00.000Z'),
    ...over,
  };
}

function seedChild(
  store: InMemoryEmsOrderStore,
  over: {
    clientOrderId?: string;
    parentClientOrderId?: string;
    state?: 'ACKNOWLEDGED' | 'REJECTED' | 'UNWIRED' | 'SUBMIT_UNKNOWN' | 'OUTCOME_UNKNOWN' | 'CANCELED';
    execution?: VenueExecution | null;
  } = {},
) {
  const clientOrderId = over.clientOrderId ?? 'child-1';
  store.record({
    clientOrderId,
    parentClientOrderId: over.parentClientOrderId ?? 'parent-twap',
    executionGroupId: 'parent-twap',
    childOrderId: clientOrderId,
    legIndex: 0,
    venueId: 'street',
    symbol: 'BTC/USDT',
    side: 'buy',
    execution: over.execution === undefined ? execution() : over.execution,
    state: over.state ?? 'ACKNOWLEDGED',
    reconciliationKey: null,
  });
}

function stubEmsWithoutList(): EmsOrderStore {
  return {
    record: () => undefined,
    get: () => null,
    getByReconciliationKey: () => null,
  } as unknown as EmsOrderStore;
}

describe('listLiveEmsChildren', () => {
  it('lists open/partial/acked/unknown EMS children on a stopped parent — the set that blocks undeploy', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(parent({ parentClientOrderId: 'parent-twap', kind: 'twap', executionOwner: OP }));
    const emsStore = new InMemoryEmsOrderStore();
    seedChild(emsStore, { clientOrderId: 'child-partial', execution: execution({ status: 'partial' }) });
    seedChild(emsStore, { clientOrderId: 'child-acked', state: 'ACKNOWLEDGED', execution: null });
    seedChild(emsStore, { clientOrderId: 'child-unknown', state: 'SUBMIT_UNKNOWN', execution: null });
    seedChild(emsStore, { clientOrderId: 'child-outcome', state: 'OUTCOME_UNKNOWN', execution: null });
    seedChild(emsStore, {
      clientOrderId: 'child-filled',
      execution: execution({ status: 'filled', venueOrderId: 'v-filled' }),
    });
    seedChild(emsStore, {
      clientOrderId: 'child-rejected',
      execution: execution({ status: 'rejected', venueOrderId: 'v-rej' }),
    });
    seedChild(emsStore, { clientOrderId: 'child-rej-state', state: 'REJECTED', execution: null });
    seedChild(emsStore, { clientOrderId: 'child-unwired', state: 'UNWIRED', execution: null });
    seedChild(emsStore, { clientOrderId: 'child-canceled', state: 'CANCELED', execution: null });
    seedChild(emsStore, {
      clientOrderId: 'child-other',
      parentClientOrderId: 'parent-other',
      execution: execution({ status: 'partial' }),
    });

    const out = listLiveEmsChildren({
      parentClientOrderId: 'parent-twap',
      parentStore,
      emsStore,
    });
    expect(out).toMatchObject({
      ok: true,
      parent: {
        parentClientOrderId: 'parent-twap',
        kind: 'twap',
        status: 'stopped',
        executionOwner: OP,
        originator: ORIGINATOR,
      },
    });
    if (!out.ok) return;
    expect(out.children.map((row) => row.clientOrderId)).toEqual(['child-acked', 'child-outcome', 'child-partial', 'child-unknown']);
    expect(out.children.find((row) => row.clientOrderId === 'child-partial')).toMatchObject({
      venueId: 'street',
      symbol: 'BTC/USDT',
      side: 'buy',
      state: 'ACKNOWLEDGED',
      executionStatus: 'partial',
    });
    expect(out.children.find((row) => row.clientOrderId === 'child-acked')).toMatchObject({
      state: 'ACKNOWLEDGED',
      executionStatus: null,
      reason: 'ACKNOWLEDGED',
    });
    expect(out.children.find((row) => row.clientOrderId === 'child-unknown')).toMatchObject({
      state: 'SUBMIT_UNKNOWN',
      executionStatus: null,
      reason: 'SUBMIT_UNKNOWN',
    });
    expect(out.children.every((row) => !('filledAmount' in row) && !('averagePrice' in row))).toBe(true);

    const blocked = undeployStoppedAlgoParent({
      parentClientOrderId: 'parent-twap',
      parentStore,
      emsStore,
    });
    expect(blocked).toMatchObject({ ok: false, reason: 'live_children' });
    if (blocked.ok || blocked.reason !== 'live_children') return;
    expect(blocked.children.map((row) => row.clientOrderId).sort()).toEqual(out.children.map((row) => row.clientOrderId));
  });

  it('lists the same live set on an approved or running parent', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(parent({ parentClientOrderId: 'parent-approved', kind: 'vwap', status: 'approved', startedAt: null }));
    parentStore.seed(parent({ parentClientOrderId: 'parent-running', kind: 'pov', status: 'running' }));
    const emsStore = new InMemoryEmsOrderStore();
    seedChild(emsStore, {
      parentClientOrderId: 'parent-approved',
      clientOrderId: 'a-partial',
      execution: execution({ status: 'partial' }),
    });
    seedChild(emsStore, {
      parentClientOrderId: 'parent-running',
      clientOrderId: 'r-partial',
      execution: execution({ status: 'partial' }),
    });
    seedChild(emsStore, {
      parentClientOrderId: 'parent-approved',
      clientOrderId: 'a-filled',
      execution: execution({ status: 'filled', venueOrderId: 'v-a' }),
    });

    const approved = listLiveEmsChildren({
      parentClientOrderId: 'parent-approved',
      parentStore,
      emsStore,
    });
    expect(approved).toMatchObject({ ok: true, parent: { kind: 'vwap', status: 'approved' } });
    if (!approved.ok) return;
    expect(approved.children.map((row) => row.clientOrderId)).toEqual(['a-partial']);

    const running = listLiveEmsChildren({
      parentClientOrderId: 'parent-running',
      parentStore,
      emsStore,
    });
    expect(running).toMatchObject({ ok: true, parent: { kind: 'pov', status: 'running' } });
    if (!running.ok) return;
    expect(running.children.map((row) => row.clientOrderId)).toEqual(['r-partial']);
  });

  it('empty children is an empty list — never invents a child from residual or schedule', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(parent({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    expect(
      listLiveEmsChildren({
        parentClientOrderId: 'parent-twap',
        parentStore,
        emsStore: new InMemoryEmsOrderStore(),
      }),
    ).toMatchObject({ ok: true, children: [] });
  });

  it('listing does not cancel, undeploy, or drop the child from EMS', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(parent({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    const emsStore = new InMemoryEmsOrderStore();
    seedChild(emsStore, { clientOrderId: 'child-live', execution: execution({ status: 'partial' }) });
    expect(listLiveEmsChildren({ parentClientOrderId: 'parent-twap', parentStore, emsStore })).toMatchObject({
      ok: true,
    });
    expect(emsStore.get('child-live')).toMatchObject({ state: 'ACKNOWLEDGED', execution: { status: 'partial' } });
    expect(parentStore.get('parent-twap')?.status).toBe('stopped');
  });

  it('missing originator/owner stay null — never filled from the desk operator', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(parent({ parentClientOrderId: 'parent-twap', kind: 'twap', originator: null, executionOwner: null }));
    const emsStore = new InMemoryEmsOrderStore();
    seedChild(emsStore, { clientOrderId: 'child-live', execution: execution({ status: 'partial' }) });
    const out = listLiveEmsChildren({ parentClientOrderId: 'parent-twap', parentStore, emsStore });
    expect(out).toMatchObject({
      ok: true,
      parent: { parentClientOrderId: 'parent-twap', executionOwner: null, originator: null },
    });
  });

  it('paper / undeployed / expired / missing parent refuse', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(parent({ parentClientOrderId: 'parent-paper', kind: 'twap', status: 'paper' }));
    parentStore.seed(parent({ parentClientOrderId: 'parent-gone', kind: 'twap', status: 'undeployed' }));
    parentStore.seed(parent({ parentClientOrderId: 'parent-exp', kind: 'twap', status: 'expired' }));
    const emsStore = new InMemoryEmsOrderStore();
    seedChild(emsStore, {
      parentClientOrderId: 'parent-paper',
      clientOrderId: 'paper-child',
      execution: execution({ status: 'partial' }),
    });
    seedChild(emsStore, {
      parentClientOrderId: 'parent-gone',
      clientOrderId: 'gone-child',
      execution: execution({ status: 'partial' }),
    });
    seedChild(emsStore, {
      parentClientOrderId: 'parent-exp',
      clientOrderId: 'exp-child',
      execution: execution({ status: 'partial' }),
    });
    expect(listLiveEmsChildren({ parentClientOrderId: 'parent-paper', parentStore, emsStore })).toMatchObject({
      ok: false,
      reason: 'paper',
    });
    expect(listLiveEmsChildren({ parentClientOrderId: 'parent-gone', parentStore, emsStore })).toMatchObject({
      ok: false,
      reason: 'not_listable',
    });
    expect(listLiveEmsChildren({ parentClientOrderId: 'parent-exp', parentStore, emsStore })).toMatchObject({
      ok: false,
      reason: 'not_listable',
    });
    expect(listLiveEmsChildren({ parentStore, emsStore })).toMatchObject({
      ok: false,
      reason: 'missing_parent',
    });
    expect(listLiveEmsChildren({ parentClientOrderId: 'missing', parentStore, emsStore })).toMatchObject({
      ok: false,
      reason: 'not_found',
    });
  });

  it('unwired stores refuse-closed', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(parent({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    const emsStore = new InMemoryEmsOrderStore();
    seedChild(emsStore, { clientOrderId: 'child-live', execution: execution({ status: 'partial' }) });
    expect(listLiveEmsChildren({ parentClientOrderId: 'parent-twap' })).toMatchObject({
      ok: false,
      reason: 'parent_store_unwired',
    });
    expect(listLiveEmsChildren({ parentClientOrderId: 'parent-twap', parentStore })).toMatchObject({
      ok: false,
      reason: 'ems_store_unwired',
    });
    expect(
      listLiveEmsChildren({
        parentClientOrderId: 'parent-twap',
        parentStore,
        emsStore: stubEmsWithoutList(),
      }),
    ).toMatchObject({ ok: false, reason: 'ems_store_unwired' });
  });
});

describe('execution.oms.liveChildren tRPC', () => {
  it('door exists (admin:read) and refuses anonymous list', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const caller = router.createCaller(hmacSigned());
    expect(typeof caller.execution.oms.liveChildren).toBe('function');
    const out = await caller.execution.oms.liveChildren({ parentClientOrderId: 'parent-1' });
    expect(out).toMatchObject({ ok: false, reason: 'not_found' });
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(router.createCaller(anon).execution.oms.liveChildren({ parentClientOrderId: 'parent-1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('lists seeded live EMS children through the injected stores; never undeploys', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(parent({ parentClientOrderId: 'parent-1', kind: 'twap', executionOwner: OTHER }));
    const emsStore = new InMemoryEmsOrderStore();
    seedChild(emsStore, {
      parentClientOrderId: 'parent-1',
      clientOrderId: 'child-live',
      execution: execution({ status: 'partial' }),
    });
    seedChild(emsStore, {
      parentClientOrderId: 'parent-1',
      clientOrderId: 'child-filled',
      execution: execution({ status: 'filled', venueOrderId: 'v-ok' }),
    });
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
    ).createCaller(hmacSigned());

    const out = await caller.execution.oms.liveChildren({ parentClientOrderId: 'parent-1' });
    expect(out).toMatchObject({
      ok: true,
      parent: {
        parentClientOrderId: 'parent-1',
        kind: 'twap',
        status: 'stopped',
        executionOwner: OTHER,
        originator: ORIGINATOR,
      },
    });
    if (!out.ok) return;
    expect(out.children.map((row) => row.clientOrderId)).toEqual(['child-live']);
    expect(emsStore.get('child-live')).toMatchObject({ state: 'ACKNOWLEDGED', execution: { status: 'partial' } });
    expect(parentStore.get('parent-1')?.status).toBe('stopped');
  });
});
