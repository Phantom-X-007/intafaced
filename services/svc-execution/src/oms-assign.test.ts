import { describe, expect, it } from 'vitest';
import { parseAmount, ZERO } from '@intafaced/ledger-client';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import type { VenueExecution } from '@intafaced/venue-adapter';
import { InMemoryEmsOrderStore, type EmsOrderStore } from './oms-ems-store.js';
import { confirmChildFill, InMemoryFillConfirmStore } from './oms-fill-confirm.js';
import { InMemoryManualFillStore, recordManualChildFill } from './oms-manual-fill.js';
import { InMemoryApprovedAlgoParentStore, type ApprovedAlgoParent, type RetainedAlgoSchedule } from './oms-start.js';
import { listUnconfirmedChildFills } from './oms-unconfirmed.js';
import { assignOrphanedChildFill, listOrphanedChildFills } from './oms-assign.js';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-oms-assign-test-edge-secret';
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
    executionOwner: OP,
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

function seedFill(
  store: InMemoryEmsOrderStore,
  over: {
    clientOrderId?: string;
    parentClientOrderId?: string;
    state?: 'ACKNOWLEDGED' | 'REJECTED' | 'UNWIRED' | 'SUBMIT_UNKNOWN' | 'OUTCOME_UNKNOWN';
    execution?: VenueExecution | null;
  } = {},
) {
  store.record({
    clientOrderId: over.clientOrderId ?? 'child-1',
    ...(over.parentClientOrderId !== undefined ? { parentClientOrderId: over.parentClientOrderId } : {}),
    executionGroupId: 'group-1',
    childOrderId: over.clientOrderId ?? 'child-1',
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

describe('listOrphanedChildFills', () => {
  it('lists EMS filled|partial children with missing parent or parent not in the approved store', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    const emsStore = new InMemoryEmsOrderStore();
    seedFill(emsStore, { clientOrderId: 'orphan-missing' });
    seedFill(emsStore, { clientOrderId: 'orphan-ghost', parentClientOrderId: 'ghost-parent' });
    seedFill(emsStore, { clientOrderId: 'owned-live', parentClientOrderId: 'parent-twap' });
    seedFill(emsStore, {
      clientOrderId: 'orphan-partial',
      execution: execution({ status: 'partial', filledAmount: parseAmount('0.25'), venueOrderId: 'v-partial' }),
    });

    const out = listOrphanedChildFills({ parentStore, emsStore });
    expect(out).toMatchObject({ ok: true });
    if (!out.ok) return;
    expect(out.fills.map((row) => row.clientOrderId).sort()).toEqual(['orphan-ghost', 'orphan-missing', 'orphan-partial']);
    expect(out.fills.find((row) => row.clientOrderId === 'orphan-ghost')).toMatchObject({
      parentClientOrderId: 'ghost-parent',
      filledAmount: '0.5',
      status: 'filled',
    });
    expect(out.fills.find((row) => row.clientOrderId === 'orphan-missing')).toMatchObject({
      parentClientOrderId: null,
      filledAmount: '0.5',
    });
    expect(out.fills.find((row) => row.clientOrderId === 'orphan-partial')).toMatchObject({
      filledAmount: '0.25',
      status: 'partial',
      venueOrderId: 'v-partial',
    });
  });

  it('missing EMS fill / rejected / unknown / no execution are not listed — never invents a fill', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    const emsStore = new InMemoryEmsOrderStore();
    seedFill(emsStore, { clientOrderId: 'unknown-1', execution: null, state: 'SUBMIT_UNKNOWN' });
    seedFill(emsStore, {
      clientOrderId: 'rejected-1',
      execution: execution({ status: 'rejected' }),
      state: 'REJECTED',
    });
    seedFill(emsStore, { clientOrderId: 'real-1' });
    const out = listOrphanedChildFills({ parentStore, emsStore });
    expect(out).toMatchObject({ ok: true });
    if (!out.ok) return;
    expect(out.fills.map((row) => row.clientOrderId)).toEqual(['real-1']);
  });

  it('manual print without EMS evidence is not an orphaned EMS fill', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    const emsStore = new InMemoryEmsOrderStore();
    expect(
      recordManualChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'manual-1',
        amount: '0.5',
        price: '100',
        side: 'buy',
        parentCap: '100',
        confirmerId: OP,
        parentStore,
        manualFillStore: new InMemoryManualFillStore(),
      }),
    ).toMatchObject({ ok: true });
    expect(listOrphanedChildFills({ parentStore, emsStore })).toEqual({ ok: true, fills: [] });
  });

  it('child on a stopped parent still in the store is not an orphan', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-stop', kind: 'twap', status: 'stopped' }));
    const emsStore = new InMemoryEmsOrderStore();
    seedFill(emsStore, { clientOrderId: 'stop-child', parentClientOrderId: 'parent-stop' });
    expect(listOrphanedChildFills({ parentStore, emsStore })).toEqual({ ok: true, fills: [] });
  });

  it('empty journal is an empty list — never invents a fill', () => {
    expect(
      listOrphanedChildFills({
        parentStore: new InMemoryApprovedAlgoParentStore(),
        emsStore: new InMemoryEmsOrderStore(),
      }),
    ).toEqual({ ok: true, fills: [] });
  });

  it('unwired stores refuse-closed', () => {
    expect(listOrphanedChildFills({})).toMatchObject({ ok: false, reason: 'parent_store_unwired' });
    expect(listOrphanedChildFills({ parentStore: new InMemoryApprovedAlgoParentStore() })).toMatchObject({
      ok: false,
      reason: 'ems_store_unwired',
    });
    expect(
      listOrphanedChildFills({
        parentStore: new InMemoryApprovedAlgoParentStore(),
        emsStore: stubEmsWithoutList(),
      }),
    ).toMatchObject({ ok: false, reason: 'ems_store_unwired' });
  });
});

describe('assignOrphanedChildFill', () => {
  it('attaches an orphaned EMS child to a live parent without confirming', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    const emsStore = new InMemoryEmsOrderStore();
    seedFill(emsStore, { clientOrderId: 'orphan-1' });
    const fillConfirmStore = new InMemoryFillConfirmStore();

    const out = assignOrphanedChildFill({
      parentClientOrderId: 'parent-twap',
      clientOrderId: 'orphan-1',
      operatorId: OP,
      parentStore,
      emsStore,
    });
    expect(out).toMatchObject({
      ok: true,
      assigned: true,
      confirmed: false,
      clientAccepted: false,
      parent: { parentClientOrderId: 'parent-twap', kind: 'twap', status: 'approved' },
      child: { clientOrderId: 'orphan-1' },
      fill: { filledAmount: '0.5', averagePrice: '100', status: 'filled', venueOrderId: 'v-1' },
      operatorId: OP,
      residual: { remaining: '9.5' },
    });
    expect(emsStore.get('orphan-1')?.parentClientOrderId).toBe('parent-twap');
    expect(parentStore.get('parent-twap')?.residual?.remaining).toBe('9.5');
    expect(fillConfirmStore.get('orphan-1')).toBeNull();

    const unconfirmed = listUnconfirmedChildFills({
      parentClientOrderId: 'parent-twap',
      parentStore,
      emsStore,
      fillConfirmStore,
    });
    expect(unconfirmed).toMatchObject({ ok: true });
    if (!unconfirmed.ok) return;
    expect(unconfirmed.fills.map((row) => row.clientOrderId)).toEqual(['orphan-1']);
    expect(unconfirmed.fills[0]?.confirmed).toBe(false);

    expect(listOrphanedChildFills({ parentStore, emsStore })).toEqual({ ok: true, fills: [] });
  });

  it('rewrites a ghost parent id onto a live parent — still one-shot after that', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-vwap', kind: 'vwap', status: 'running', startedAt: '2026-08-25T00:00:00.000Z' }));
    const emsStore = new InMemoryEmsOrderStore();
    seedFill(emsStore, { clientOrderId: 'ghost-child', parentClientOrderId: 'dead-parent' });

    const first = assignOrphanedChildFill({
      parentClientOrderId: 'parent-vwap',
      clientOrderId: 'ghost-child',
      operatorId: OTHER,
      parentStore,
      emsStore,
    });
    expect(first).toMatchObject({
      ok: true,
      assigned: true,
      parent: { parentClientOrderId: 'parent-vwap', kind: 'vwap', status: 'running' },
      operatorId: OTHER,
    });
    expect(
      assignOrphanedChildFill({
        parentClientOrderId: 'parent-vwap',
        clientOrderId: 'ghost-child',
        operatorId: OTHER,
        parentStore,
        emsStore,
      }),
    ).toMatchObject({ ok: false, reason: 'already_assigned' });
  });

  it('already-parented child on a store parent refuses already_assigned and does not rewrite residual', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    parentStore.seed(live({ parentClientOrderId: 'parent-other', kind: 'twap' }));
    const emsStore = new InMemoryEmsOrderStore();
    seedFill(emsStore, { clientOrderId: 'owned', parentClientOrderId: 'parent-twap' });

    expect(
      assignOrphanedChildFill({
        parentClientOrderId: 'parent-other',
        clientOrderId: 'owned',
        operatorId: OP,
        parentStore,
        emsStore,
      }),
    ).toMatchObject({ ok: false, reason: 'already_assigned' });
    expect(emsStore.get('owned')?.parentClientOrderId).toBe('parent-twap');
    expect(parentStore.get('parent-other')?.residual?.remaining).toBe('10');
  });

  it('qty must not exceed retained residual — leftover stays, child stays orphaned', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap', residual: { remaining: '0.25' } }));
    const emsStore = new InMemoryEmsOrderStore();
    seedFill(emsStore, { clientOrderId: 'big-fill' });

    expect(
      assignOrphanedChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'big-fill',
        operatorId: OP,
        parentStore,
        emsStore,
      }),
    ).toMatchObject({ ok: false, reason: 'exceeds_remaining' });
    expect(emsStore.get('big-fill')?.parentClientOrderId).toBeUndefined();
    expect(parentStore.get('parent-twap')?.residual?.remaining).toBe('0.25');
  });

  it('missing remaining refuses — never invents a cap, child stays orphaned', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap', residual: null }));
    parentStore.seed(live({ parentClientOrderId: 'parent-empty', kind: 'twap', residual: { remaining: '   ' } }));
    parentStore.seed(live({ parentClientOrderId: 'parent-released', kind: 'twap', residual: { remaining: '10', released: true } }));
    const emsStore = new InMemoryEmsOrderStore();
    seedFill(emsStore, { clientOrderId: 'orphan-1' });
    seedFill(emsStore, { clientOrderId: 'orphan-2' });
    seedFill(emsStore, { clientOrderId: 'orphan-3' });

    expect(
      assignOrphanedChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'orphan-1',
        operatorId: OP,
        parentStore,
        emsStore,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_residual' });
    expect(
      assignOrphanedChildFill({
        parentClientOrderId: 'parent-empty',
        clientOrderId: 'orphan-2',
        operatorId: OP,
        parentStore,
        emsStore,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_residual' });
    expect(
      assignOrphanedChildFill({
        parentClientOrderId: 'parent-released',
        clientOrderId: 'orphan-3',
        operatorId: OP,
        parentStore,
        emsStore,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_residual' });
    expect(emsStore.get('orphan-1')?.parentClientOrderId).toBeUndefined();
    expect(parentStore.get('parent-twap')?.residual ?? null).toBeNull();
  });

  it('does not auto-confirm and does not rewrite EMS fill facts', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    const emsStore = new InMemoryEmsOrderStore();
    seedFill(emsStore, { clientOrderId: 'orphan-1' });
    const fillConfirmStore = new InMemoryFillConfirmStore();

    expect(
      assignOrphanedChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'orphan-1',
        operatorId: OP,
        parentStore,
        emsStore,
      }),
    ).toMatchObject({ ok: true, confirmed: false, clientAccepted: false });

    expect(
      confirmChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'orphan-1',
        confirmerId: OP,
        parentStore,
        emsStore,
        fillConfirmStore,
      }),
    ).toMatchObject({ ok: true, confirmed: true });
    expect(emsStore.get('orphan-1')?.execution?.venueOrderId).toBe('v-1');
    expect(emsStore.get('orphan-1')?.execution?.status).toBe('filled');
  });

  it('missing operator / parent / fill refuse-closed', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    parentStore.seed(live({ parentClientOrderId: 'parent-paper', kind: 'twap', status: 'paper' }));
    parentStore.seed(live({ parentClientOrderId: 'parent-stop', kind: 'twap', status: 'stopped' }));
    const emsStore = new InMemoryEmsOrderStore();
    seedFill(emsStore, { clientOrderId: 'orphan-1' });
    seedFill(emsStore, { clientOrderId: 'unknown-1', execution: null, state: 'SUBMIT_UNKNOWN' });

    expect(
      assignOrphanedChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'orphan-1',
        parentStore,
        emsStore,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_operator' });
    expect(
      assignOrphanedChildFill({
        clientOrderId: 'orphan-1',
        operatorId: OP,
        parentStore,
        emsStore,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      assignOrphanedChildFill({
        parentClientOrderId: 'parent-twap',
        operatorId: OP,
        parentStore,
        emsStore,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_child' });
    expect(
      assignOrphanedChildFill({
        parentClientOrderId: 'missing',
        clientOrderId: 'orphan-1',
        operatorId: OP,
        parentStore,
        emsStore,
      }),
    ).toMatchObject({ ok: false, reason: 'not_found' });
    expect(
      assignOrphanedChildFill({
        parentClientOrderId: 'parent-paper',
        clientOrderId: 'orphan-1',
        operatorId: OP,
        parentStore,
        emsStore,
      }),
    ).toMatchObject({ ok: false, reason: 'paper' });
    expect(
      assignOrphanedChildFill({
        parentClientOrderId: 'parent-stop',
        clientOrderId: 'orphan-1',
        operatorId: OP,
        parentStore,
        emsStore,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      assignOrphanedChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'ghost',
        operatorId: OP,
        parentStore,
        emsStore,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_fill' });
    expect(
      assignOrphanedChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'unknown-1',
        operatorId: OP,
        parentStore,
        emsStore,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_fill' });
  });

  it('unwired stores refuse-closed', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    const emsStore = new InMemoryEmsOrderStore();
    seedFill(emsStore, { clientOrderId: 'orphan-1' });

    expect(
      assignOrphanedChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'orphan-1',
        operatorId: OP,
      }),
    ).toMatchObject({ ok: false, reason: 'parent_store_unwired' });
    expect(
      assignOrphanedChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'orphan-1',
        operatorId: OP,
        parentStore,
      }),
    ).toMatchObject({ ok: false, reason: 'ems_store_unwired' });
  });
});

describe('execution.oms.orphaned / assignFill tRPC', () => {
  it('doors exist and refuse anonymous list/assign', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const caller = router.createCaller(hmacSigned());
    expect(typeof caller.execution.oms.orphaned).toBe('function');
    expect(typeof caller.execution.oms.assignFill).toBe('function');
    expect(await caller.execution.oms.orphaned()).toMatchObject({ ok: false, reason: 'ems_store_unwired' });
    expect(await caller.execution.oms.assignFill({ parentClientOrderId: 'parent-1', clientOrderId: 'child-1' })).toMatchObject({
      ok: false,
      reason: 'not_found',
    });
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(router.createCaller(anon).execution.oms.orphaned()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(
      router.createCaller(anon).execution.oms.assignFill({ parentClientOrderId: 'parent-1', clientOrderId: 'child-1' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('lists a seeded orphan and assigns it through the injected stores', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-1', kind: 'twap', executionOwner: OTHER }));
    const emsStore = new InMemoryEmsOrderStore();
    seedFill(emsStore, { clientOrderId: 'orphan-1' });
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

    const before = await caller.execution.oms.orphaned();
    expect(before).toMatchObject({ ok: true });
    if (!before.ok) return;
    expect(before.fills.map((row) => row.clientOrderId)).toEqual(['orphan-1']);

    const assigned = await caller.execution.oms.assignFill({
      parentClientOrderId: 'parent-1',
      clientOrderId: 'orphan-1',
    });
    expect(assigned).toMatchObject({
      ok: true,
      assigned: true,
      confirmed: false,
      operatorId: OP,
      parent: { parentClientOrderId: 'parent-1', kind: 'twap' },
      residual: { remaining: '9.5' },
    });

    const after = await caller.execution.oms.orphaned();
    expect(after).toEqual({ ok: true, fills: [] });

    const unconfirmed = await caller.execution.oms.unconfirmed({ parentClientOrderId: 'parent-1' });
    expect(unconfirmed).toMatchObject({ ok: true });
    if (!unconfirmed.ok) return;
    expect(unconfirmed.fills.map((row) => row.clientOrderId)).toEqual(['orphan-1']);
    expect(unconfirmed.fills[0]).toMatchObject({ confirmed: false, clientAccepted: false });

    expect(await caller.execution.oms.assignFill({ parentClientOrderId: 'parent-1', clientOrderId: 'orphan-1' })).toMatchObject({
      ok: false,
      reason: 'already_assigned',
    });
  });

  it('body operatorId is ignored — signed principal is the operator', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    const emsStore = new InMemoryEmsOrderStore();
    seedFill(emsStore, { clientOrderId: 'orphan-1' });
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

    const assigned = await caller.execution.oms.assignFill({
      parentClientOrderId: 'parent-1',
      clientOrderId: 'orphan-1',
      operatorId: OTHER,
    } as { parentClientOrderId: string; clientOrderId: string });
    expect(assigned).toMatchObject({ ok: true, operatorId: OP });
  });
});
