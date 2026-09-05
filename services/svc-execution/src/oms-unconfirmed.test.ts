import { describe, expect, it } from 'vitest';
import { parseAmount, ZERO } from '@intafaced/ledger-client';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import type { VenueExecution } from '@intafaced/venue-adapter';
import { InMemoryEmsOrderStore, type EmsOrderStore } from './oms-ems-store.js';
import { confirmChildFill, InMemoryFillConfirmStore, type FillConfirmStore } from './oms-fill-confirm.js';
import { InMemoryManualFillStore, recordManualChildFill } from './oms-manual-fill.js';
import { InMemoryApprovedAlgoParentStore, type ApprovedAlgoParent, type RetainedAlgoSchedule } from './oms-start.js';
import { listUnconfirmedChildFills } from './oms-unconfirmed.js';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-oms-unconfirmed-test-edge-secret';
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
    parentClientOrderId: over.parentClientOrderId ?? 'parent-twap',
    executionGroupId: 'parent-twap',
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

function stubFillWithoutGet(): FillConfirmStore {
  return {
    confirm: () => null,
  } as unknown as FillConfirmStore;
}

describe('listUnconfirmedChildFills', () => {
  it('lists EMS filled|partial children on a live parent that have no confirm row', () => {
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
    seedFill(emsStore, { clientOrderId: 'child-filled' });
    seedFill(emsStore, {
      clientOrderId: 'child-partial',
      execution: execution({ status: 'partial', filledAmount: parseAmount('0.25'), venueOrderId: 'v-partial' }),
    });
    seedFill(emsStore, { clientOrderId: 'child-confirmed' });
    seedFill(emsStore, { clientOrderId: 'child-other', parentClientOrderId: 'parent-vwap' });
    const fillConfirmStore = new InMemoryFillConfirmStore();
    expect(
      confirmChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'child-confirmed',
        confirmerId: OP,
        parentStore,
        emsStore,
        fillConfirmStore,
        now: new Date('2026-08-25T12:00:00.000Z'),
      }),
    ).toMatchObject({ ok: true, confirmed: true });

    const out = listUnconfirmedChildFills({
      parentClientOrderId: 'parent-twap',
      parentStore,
      emsStore,
      fillConfirmStore,
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
    expect(out.fills.map((row) => row.clientOrderId).sort()).toEqual(['child-filled', 'child-partial']);
    for (const row of out.fills) {
      expect(row.confirmed).toBe(false);
      expect(row.clientAccepted).toBe(false);
      expect(row.confirmerId).toBeNull();
      expect(row.confirmedAt).toBeNull();
    }
    expect(out.fills.find((row) => row.clientOrderId === 'child-partial')).toMatchObject({
      filledAmount: '0.25',
      averagePrice: '100',
      status: 'partial',
      venueOrderId: 'v-partial',
    });
    expect(out.fills.find((row) => row.clientOrderId === 'child-filled')).toMatchObject({
      filledAmount: '0.5',
      status: 'filled',
    });
  });

  it('missing EMS fill / rejected / unknown / no execution are not listed — never invents a fill', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    const emsStore = new InMemoryEmsOrderStore();
    seedFill(emsStore, { clientOrderId: 'unknown-1', execution: null, state: 'SUBMIT_UNKNOWN' });
    seedFill(emsStore, {
      clientOrderId: 'rejected-1',
      execution: execution({ status: 'rejected' }),
      state: 'REJECTED',
    });
    seedFill(emsStore, { clientOrderId: 'real-1' });
    const fillConfirmStore = new InMemoryFillConfirmStore();
    const out = listUnconfirmedChildFills({
      parentClientOrderId: 'parent-twap',
      parentStore,
      emsStore,
      fillConfirmStore,
    });
    expect(out).toMatchObject({ ok: true });
    if (!out.ok) return;
    expect(out.fills.map((row) => row.clientOrderId)).toEqual(['real-1']);
  });

  it('manual print without EMS evidence is not an unconfirmed EMS fill', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    const emsStore = new InMemoryEmsOrderStore();
    const fillConfirmStore = new InMemoryFillConfirmStore();
    const manualFillStore = new InMemoryManualFillStore();
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
        manualFillStore,
      }),
    ).toMatchObject({ ok: true, confirmed: true });
    const out = listUnconfirmedChildFills({
      parentClientOrderId: 'parent-twap',
      parentStore,
      emsStore,
      fillConfirmStore,
    });
    expect(out).toEqual({
      ok: true,
      parent: {
        parentClientOrderId: 'parent-twap',
        kind: 'twap',
        status: 'approved',
        executionOwner: null,
        originator: ORIGINATOR,
      },
      fills: [],
    });
  });

  it('missing originator/owner stay null — never filled from the desk operator', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap', originator: null, executionOwner: null }));
    const emsStore = new InMemoryEmsOrderStore();
    seedFill(emsStore);
    const out = listUnconfirmedChildFills({
      parentClientOrderId: 'parent-twap',
      parentStore,
      emsStore,
      fillConfirmStore: new InMemoryFillConfirmStore(),
    });
    expect(out).toMatchObject({
      ok: true,
      parent: { parentClientOrderId: 'parent-twap', executionOwner: null, originator: null },
    });
  });

  it('empty children is an empty list — never invents a fill from residual or schedule', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    expect(
      listUnconfirmedChildFills({
        parentClientOrderId: 'parent-twap',
        parentStore,
        emsStore: new InMemoryEmsOrderStore(),
        fillConfirmStore: new InMemoryFillConfirmStore(),
      }),
    ).toMatchObject({ ok: true, fills: [] });
  });

  it('paper / not-live / missing parent refuse', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-paper', kind: 'twap', status: 'paper' }));
    parentStore.seed(live({ parentClientOrderId: 'parent-stop', kind: 'twap', status: 'stopped' }));
    const emsStore = new InMemoryEmsOrderStore();
    seedFill(emsStore, { parentClientOrderId: 'parent-paper', clientOrderId: 'paper-child' });
    seedFill(emsStore, { parentClientOrderId: 'parent-stop', clientOrderId: 'stop-child' });
    const fillConfirmStore = new InMemoryFillConfirmStore();
    expect(
      listUnconfirmedChildFills({
        parentClientOrderId: 'parent-paper',
        parentStore,
        emsStore,
        fillConfirmStore,
      }),
    ).toMatchObject({ ok: false, reason: 'paper' });
    expect(
      listUnconfirmedChildFills({
        parentClientOrderId: 'parent-stop',
        parentStore,
        emsStore,
        fillConfirmStore,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(listUnconfirmedChildFills({ parentStore, emsStore, fillConfirmStore })).toMatchObject({
      ok: false,
      reason: 'missing_parent',
    });
    expect(
      listUnconfirmedChildFills({
        parentClientOrderId: 'missing',
        parentStore,
        emsStore,
        fillConfirmStore,
      }),
    ).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('unwired stores refuse-closed', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    const emsStore = new InMemoryEmsOrderStore();
    seedFill(emsStore);
    expect(listUnconfirmedChildFills({ parentClientOrderId: 'parent-twap' })).toMatchObject({
      ok: false,
      reason: 'parent_store_unwired',
    });
    expect(listUnconfirmedChildFills({ parentClientOrderId: 'parent-twap', parentStore })).toMatchObject({
      ok: false,
      reason: 'ems_store_unwired',
    });
    expect(
      listUnconfirmedChildFills({
        parentClientOrderId: 'parent-twap',
        parentStore,
        emsStore: stubEmsWithoutList(),
      }),
    ).toMatchObject({ ok: false, reason: 'ems_store_unwired' });
    expect(
      listUnconfirmedChildFills({
        parentClientOrderId: 'parent-twap',
        parentStore,
        emsStore,
      }),
    ).toMatchObject({ ok: false, reason: 'fill_store_unwired' });
    expect(
      listUnconfirmedChildFills({
        parentClientOrderId: 'parent-twap',
        parentStore,
        emsStore,
        fillConfirmStore: stubFillWithoutGet(),
      }),
    ).toMatchObject({ ok: false, reason: 'fill_store_unwired' });
  });
});

describe('execution.oms.unconfirmed tRPC', () => {
  it('door exists (admin:read) and refuses anonymous list', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const caller = router.createCaller(hmacSigned());
    expect(typeof caller.execution.oms.unconfirmed).toBe('function');
    const out = await caller.execution.oms.unconfirmed({ parentClientOrderId: 'parent-1' });
    expect(out).toMatchObject({ ok: false, reason: 'not_found' });
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(router.createCaller(anon).execution.oms.unconfirmed({ parentClientOrderId: 'parent-1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('lists seeded unconfirmed EMS fills through the injected stores; confirm removes the child from the pile', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-1', kind: 'twap', executionOwner: OTHER }));
    const emsStore = new InMemoryEmsOrderStore();
    seedFill(emsStore, { parentClientOrderId: 'parent-1', clientOrderId: 'child-1' });
    seedFill(emsStore, { parentClientOrderId: 'parent-1', clientOrderId: 'child-2' });
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

    const before = await caller.execution.oms.unconfirmed({ parentClientOrderId: 'parent-1' });
    expect(before).toMatchObject({
      ok: true,
      parent: {
        parentClientOrderId: 'parent-1',
        kind: 'twap',
        executionOwner: OTHER,
        originator: ORIGINATOR,
      },
    });
    if (!before.ok) return;
    expect(before.fills.map((row) => row.clientOrderId).sort()).toEqual(['child-1', 'child-2']);
    expect(before.fills.every((row) => row.clientAccepted === false)).toBe(true);

    expect(await caller.execution.oms.confirmFill({ parentClientOrderId: 'parent-1', clientOrderId: 'child-1' })).toMatchObject({
      ok: true,
      confirmed: true,
      confirmerId: OP,
    });

    const after = await caller.execution.oms.unconfirmed({ parentClientOrderId: 'parent-1' });
    expect(after).toMatchObject({ ok: true });
    if (!after.ok) return;
    expect(after.fills.map((row) => row.clientOrderId)).toEqual(['child-2']);
    expect(after.fills[0]).toMatchObject({ confirmed: false, clientAccepted: false, filledAmount: '0.5' });
  });
});
