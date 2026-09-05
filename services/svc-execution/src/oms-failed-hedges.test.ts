import { describe, expect, it } from 'vitest';
import { parseAmount, ZERO } from '@intafaced/ledger-client';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import type { VenueExecution } from '@intafaced/venue-adapter';
import { InMemoryEmsOrderStore, type EmsOrderStore } from './oms-ems-store.js';
import { commandOutcome } from './oms-execute.js';
import { listFailedHedgeChildren } from './oms-failed-hedges.js';
import { repairFailedHedgeChild } from './oms-repair-hedge.js';
import { InMemoryApprovedAlgoParentStore, type ApprovedAlgoParent, type RetainedAlgoSchedule } from './oms-start.js';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-oms-failed-hedges-test-edge-secret';
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

function live(over: Partial<ApprovedAlgoParent> & Pick<ApprovedAlgoParent, 'parentClientOrderId' | 'kind'>): ApprovedAlgoParent {
  return {
    status: 'approved',
    startedAt: null,
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
    status: 'filled',
    executedAt: new Date('2026-08-25T00:00:00.000Z'),
    ...over,
  };
}

function seedChild(
  store: InMemoryEmsOrderStore,
  over: {
    clientOrderId?: string;
    parentClientOrderId?: string;
    state?: 'ACKNOWLEDGED' | 'REJECTED' | 'UNWIRED' | 'SUBMIT_UNKNOWN' | 'OUTCOME_UNKNOWN';
    execution?: VenueExecution | null;
    commandOutcome?: ReturnType<typeof commandOutcome>;
  } = {},
) {
  const clientOrderId = over.clientOrderId ?? 'hedge-1';
  store.record({
    clientOrderId,
    parentClientOrderId: over.parentClientOrderId ?? 'parent-twap',
    executionGroupId: 'parent-twap',
    childOrderId: clientOrderId,
    legIndex: 0,
    venueId: 'street',
    symbol: 'BTC/USDT',
    side: 'sell',
    execution: over.execution === undefined ? execution() : over.execution,
    state: over.state ?? 'ACKNOWLEDGED',
    commandOutcome: over.commandOutcome,
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

describe('listFailedHedgeChildren', () => {
  it('lists EMS children whose stored state or commandOutcome is failed/rejected/unwired on a live parent', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap', executionOwner: OP }));
    parentStore.seed(
      live({
        parentClientOrderId: 'parent-vwap',
        kind: 'vwap',
        status: 'running',
        startedAt: '2026-08-25T00:00:00.000Z',
      }),
    );
    const emsStore = new InMemoryEmsOrderStore();
    seedChild(emsStore, { clientOrderId: 'hedge-rejected', state: 'REJECTED', execution: null });
    seedChild(emsStore, { clientOrderId: 'hedge-unwired', state: 'UNWIRED', execution: null });
    seedChild(emsStore, {
      clientOrderId: 'hedge-exec-rejected',
      state: 'ACKNOWLEDGED',
      execution: execution({ status: 'rejected', filledAmount: ZERO, venueOrderId: 'v-rej' }),
    });
    seedChild(emsStore, {
      clientOrderId: 'hedge-refused',
      state: 'ACKNOWLEDGED',
      execution: null,
      commandOutcome: commandOutcome('hedge-refused', 'REFUSED', 'venue.rejected', null),
    });
    seedChild(emsStore, { clientOrderId: 'child-live' });
    seedChild(emsStore, { clientOrderId: 'hedge-other', parentClientOrderId: 'parent-vwap', state: 'REJECTED', execution: null });

    const out = listFailedHedgeChildren({
      parentClientOrderId: 'parent-twap',
      parentStore,
      emsStore,
    });
    expect(out).toMatchObject({
      ok: true,
      parent: {
        parentClientOrderId: 'parent-twap',
        kind: 'twap',
        status: 'approved',
        executionOwner: OP,
        originator: ORIGINATOR,
      },
    });
    if (!out.ok) return;
    expect(out.children.map((row) => row.clientOrderId)).toEqual([
      'hedge-exec-rejected',
      'hedge-refused',
      'hedge-rejected',
      'hedge-unwired',
    ]);
    expect(out.children.find((row) => row.clientOrderId === 'hedge-rejected')).toMatchObject({
      venueId: 'street',
      state: 'REJECTED',
      commandOutcome: null,
      executionStatus: null,
    });
    expect(out.children.find((row) => row.clientOrderId === 'hedge-unwired')).toMatchObject({
      state: 'UNWIRED',
      executionStatus: null,
    });
    expect(out.children.find((row) => row.clientOrderId === 'hedge-exec-rejected')).toMatchObject({
      state: 'ACKNOWLEDGED',
      executionStatus: 'rejected',
    });
    expect(out.children.find((row) => row.clientOrderId === 'hedge-refused')).toMatchObject({
      commandOutcome: { outcome: 'REFUSED', state: 'ENGINE_REJECTED' },
      executionStatus: null,
    });
    expect(out.children.every((row) => !('filledAmount' in row) && !('averagePrice' in row))).toBe(true);
  });

  it('unknown / filled / other-parent children stay off the list — never invents a hedge or fill', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    const emsStore = new InMemoryEmsOrderStore();
    seedChild(emsStore, { clientOrderId: 'unknown-1', execution: null, state: 'SUBMIT_UNKNOWN' });
    seedChild(emsStore, { clientOrderId: 'unknown-2', execution: null, state: 'OUTCOME_UNKNOWN' });
    seedChild(emsStore, {
      clientOrderId: 'unknown-cmd',
      execution: null,
      state: 'OUTCOME_UNKNOWN',
      commandOutcome: commandOutcome('unknown-cmd', 'OUTCOME_UNKNOWN', 'venue.timeout_after_dispatch', 'lookup:unknown-cmd'),
    });
    seedChild(emsStore, { clientOrderId: 'filled-1' });
    seedChild(emsStore, { clientOrderId: 'other-fail', parentClientOrderId: 'parent-other', state: 'REJECTED', execution: null });
    seedChild(emsStore, { clientOrderId: 'hedge-fail', state: 'REJECTED', execution: null });
    const out = listFailedHedgeChildren({
      parentClientOrderId: 'parent-twap',
      parentStore,
      emsStore,
    });
    expect(out).toMatchObject({ ok: true });
    if (!out.ok) return;
    expect(out.children.map((row) => row.clientOrderId)).toEqual(['hedge-fail']);
  });

  it('empty children is an empty list — never invents a hedge from residual or schedule', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    expect(
      listFailedHedgeChildren({
        parentClientOrderId: 'parent-twap',
        parentStore,
        emsStore: new InMemoryEmsOrderStore(),
      }),
    ).toMatchObject({ ok: true, children: [] });
  });

  it('listing does not repair, submit, or drop the failed child from EMS', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    const emsStore = new InMemoryEmsOrderStore();
    seedChild(emsStore, { clientOrderId: 'hedge-fail', state: 'REJECTED', execution: null });
    expect(listFailedHedgeChildren({ parentClientOrderId: 'parent-twap', parentStore, emsStore })).toMatchObject({
      ok: true,
    });
    expect(emsStore.get('hedge-fail')).toMatchObject({ state: 'REJECTED', execution: null });
    expect(
      repairFailedHedgeChild({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'hedge-fail',
        emsStore,
      }),
    ).toMatchObject({ ok: true, repaired: true });
    const after = listFailedHedgeChildren({ parentClientOrderId: 'parent-twap', parentStore, emsStore });
    expect(after).toMatchObject({ ok: true });
    if (!after.ok) return;
    expect(after.children.map((row) => row.clientOrderId)).toEqual(['hedge-fail']);
  });

  it('missing originator/owner stay null — never filled from the desk operator', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap', originator: null, executionOwner: null }));
    const emsStore = new InMemoryEmsOrderStore();
    seedChild(emsStore, { clientOrderId: 'hedge-fail', state: 'REJECTED', execution: null });
    const out = listFailedHedgeChildren({ parentClientOrderId: 'parent-twap', parentStore, emsStore });
    expect(out).toMatchObject({
      ok: true,
      parent: { parentClientOrderId: 'parent-twap', executionOwner: null, originator: null },
    });
  });

  it('paper / not-live / missing parent refuse', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-paper', kind: 'twap', status: 'paper' }));
    parentStore.seed(live({ parentClientOrderId: 'parent-stop', kind: 'twap', status: 'stopped' }));
    const emsStore = new InMemoryEmsOrderStore();
    seedChild(emsStore, { parentClientOrderId: 'parent-paper', clientOrderId: 'paper-child', state: 'REJECTED', execution: null });
    seedChild(emsStore, { parentClientOrderId: 'parent-stop', clientOrderId: 'stop-child', state: 'REJECTED', execution: null });
    expect(
      listFailedHedgeChildren({
        parentClientOrderId: 'parent-paper',
        parentStore,
        emsStore,
      }),
    ).toMatchObject({ ok: false, reason: 'paper' });
    expect(
      listFailedHedgeChildren({
        parentClientOrderId: 'parent-stop',
        parentStore,
        emsStore,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(listFailedHedgeChildren({ parentStore, emsStore })).toMatchObject({
      ok: false,
      reason: 'missing_parent',
    });
    expect(
      listFailedHedgeChildren({
        parentClientOrderId: 'missing',
        parentStore,
        emsStore,
      }),
    ).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('unwired stores refuse-closed', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    const emsStore = new InMemoryEmsOrderStore();
    seedChild(emsStore, { clientOrderId: 'hedge-fail', state: 'REJECTED', execution: null });
    expect(listFailedHedgeChildren({ parentClientOrderId: 'parent-twap' })).toMatchObject({
      ok: false,
      reason: 'parent_store_unwired',
    });
    expect(listFailedHedgeChildren({ parentClientOrderId: 'parent-twap', parentStore })).toMatchObject({
      ok: false,
      reason: 'ems_store_unwired',
    });
    expect(
      listFailedHedgeChildren({
        parentClientOrderId: 'parent-twap',
        parentStore,
        emsStore: stubEmsWithoutList(),
      }),
    ).toMatchObject({ ok: false, reason: 'ems_store_unwired' });
  });
});

describe('execution.oms.failedHedges tRPC', () => {
  it('door exists (admin:read) and refuses anonymous list', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const caller = router.createCaller(hmacSigned());
    expect(typeof caller.execution.oms.failedHedges).toBe('function');
    const out = await caller.execution.oms.failedHedges({ parentClientOrderId: 'parent-1' });
    expect(out).toMatchObject({ ok: false, reason: 'not_found' });
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(router.createCaller(anon).execution.oms.failedHedges({ parentClientOrderId: 'parent-1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('lists seeded failed EMS children through the injected stores; never auto-repairs', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-1', kind: 'twap', executionOwner: OTHER }));
    const emsStore = new InMemoryEmsOrderStore();
    seedChild(emsStore, {
      parentClientOrderId: 'parent-1',
      clientOrderId: 'hedge-1',
      state: 'REJECTED',
      execution: null,
    });
    seedChild(emsStore, {
      parentClientOrderId: 'parent-1',
      clientOrderId: 'hedge-2',
      state: 'UNWIRED',
      execution: null,
    });
    seedChild(emsStore, { parentClientOrderId: 'parent-1', clientOrderId: 'child-ok' });
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

    const out = await caller.execution.oms.failedHedges({ parentClientOrderId: 'parent-1' });
    expect(out).toMatchObject({
      ok: true,
      parent: {
        parentClientOrderId: 'parent-1',
        kind: 'twap',
        executionOwner: OTHER,
        originator: ORIGINATOR,
      },
    });
    if (!out.ok) return;
    expect(out.children.map((row) => row.clientOrderId)).toEqual(['hedge-1', 'hedge-2']);
    expect(emsStore.get('hedge-1')).toMatchObject({ state: 'REJECTED' });
    expect(emsStore.get('hedge-2')).toMatchObject({ state: 'UNWIRED' });
  });
});
