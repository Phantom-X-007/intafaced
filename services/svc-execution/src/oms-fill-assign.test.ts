import { describe, expect, it } from 'vitest';
import { parseAmount, ZERO } from '@intafaced/ledger-client';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import type { VenueExecution } from '@intafaced/venue-adapter';
import { InMemoryEmsOrderStore } from './oms-ems-store.js';
import { assignChildFill, correctChildFill, InMemoryFillAssignStore } from './oms-fill-assign.js';
import { InMemoryApprovedAlgoParentStore, type ApprovedAlgoParent, type RetainedAlgoSchedule } from './oms-start.js';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-oms-fill-assign-test-edge-secret';
const OP = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';
const TAG = 'client-alpha';
const TAG_B = 'account-beta';
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

describe('assignChildFill', () => {
  it('live parent + existing child fill + operator + tag → assigned trail, EMS qty copied', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    parentStore.seed(
      live({
        parentClientOrderId: 'parent-vwap',
        kind: 'vwap',
        status: 'running',
        startedAt: '2026-08-25T00:00:00.000Z',
      }),
    );
    const emsStore = new InMemoryEmsOrderStore();
    seedFill(emsStore);
    seedFill(emsStore, { clientOrderId: 'child-vwap', parentClientOrderId: 'parent-vwap' });
    const fillAssignStore = new InMemoryFillAssignStore();
    const now = new Date('2026-08-25T12:00:00.000Z');

    const twap = assignChildFill({
      parentClientOrderId: 'parent-twap',
      clientOrderId: 'child-1',
      accountTag: TAG,
      operatorId: OP,
      parentStore,
      emsStore,
      fillAssignStore,
      now,
    });
    expect(twap).toMatchObject({
      ok: true,
      assigned: true,
      parent: { parentClientOrderId: 'parent-twap', kind: 'twap' },
      child: { clientOrderId: 'child-1' },
      fill: { filledAmount: '0.5', averagePrice: '100', status: 'filled' },
      accountTag: TAG,
      operatorId: OP,
      assignedAt: '2026-08-25T12:00:00.000Z',
    });
    expect(fillAssignStore.get('child-1')).toMatchObject({
      kind: 'assign',
      accountTag: TAG,
      operatorId: OP,
      filledAmount: '0.5',
      averagePrice: '100',
    });
    expect(parentStore.get('parent-twap')?.residual).toMatchObject({ remaining: '10' });

    const vwap = assignChildFill({
      parentClientOrderId: 'parent-vwap',
      clientOrderId: 'child-vwap',
      accountTag: TAG_B,
      operatorId: OP,
      parentStore,
      emsStore,
      fillAssignStore,
      now,
    });
    expect(vwap).toMatchObject({
      ok: true,
      assigned: true,
      parent: { parentClientOrderId: 'parent-vwap', kind: 'vwap' },
      accountTag: TAG_B,
      operatorId: OP,
    });
  });

  it('missing operator / target refuse — never invent a user or client', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    const emsStore = new InMemoryEmsOrderStore();
    seedFill(emsStore);
    const fillAssignStore = new InMemoryFillAssignStore();
    expect(
      assignChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'child-1',
        accountTag: TAG,
        parentStore,
        emsStore,
        fillAssignStore,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_operator' });
    expect(
      assignChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'child-1',
        accountTag: TAG,
        operatorId: '   ',
        parentStore,
        emsStore,
        fillAssignStore,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_operator' });
    expect(
      assignChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'child-1',
        operatorId: OP,
        parentStore,
        emsStore,
        fillAssignStore,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_target' });
    expect(
      assignChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'child-1',
        accountTag: '   ',
        operatorId: OP,
        parentStore,
        emsStore,
        fillAssignStore,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_target' });
    expect(fillAssignStore.get('child-1')).toBeNull();
  });

  it('assigning a missing fill refuses — never invent leftover as a print', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    const emsStore = new InMemoryEmsOrderStore();
    const fillAssignStore = new InMemoryFillAssignStore();
    expect(
      assignChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'ghost',
        accountTag: TAG,
        operatorId: OP,
        parentStore,
        emsStore,
        fillAssignStore,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_fill' });

    seedFill(emsStore, { clientOrderId: 'unknown-1', execution: null, state: 'SUBMIT_UNKNOWN' });
    expect(
      assignChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'unknown-1',
        accountTag: TAG,
        operatorId: OP,
        parentStore,
        emsStore,
        fillAssignStore,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_fill' });
    expect(fillAssignStore.get('ghost')).toBeNull();
  });

  it('double-assign refuses — trail is irreversible unless explicit correct', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    const emsStore = new InMemoryEmsOrderStore();
    seedFill(emsStore);
    const fillAssignStore = new InMemoryFillAssignStore();
    const first = assignChildFill({
      parentClientOrderId: 'parent-twap',
      clientOrderId: 'child-1',
      accountTag: TAG,
      operatorId: OP,
      parentStore,
      emsStore,
      fillAssignStore,
      now: new Date('2026-08-25T12:00:00.000Z'),
    });
    expect(first).toMatchObject({ ok: true, accountTag: TAG, operatorId: OP });
    expect(
      assignChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'child-1',
        accountTag: TAG_B,
        operatorId: OTHER,
        parentStore,
        emsStore,
        fillAssignStore,
      }),
    ).toMatchObject({ ok: false, reason: 'already_assigned' });
    expect(fillAssignStore.get('child-1')).toMatchObject({ accountTag: TAG, operatorId: OP, kind: 'assign' });
    expect(fillAssignStore.trail('child-1')).toHaveLength(1);

    const corrected = correctChildFill({
      parentClientOrderId: 'parent-twap',
      clientOrderId: 'child-1',
      accountTag: TAG_B,
      amount: '0.40',
      price: '99.50',
      operatorId: OTHER,
      parentStore,
      emsStore,
      fillAssignStore,
      now: new Date('2026-08-25T13:00:00.000Z'),
    });
    expect(corrected).toMatchObject({
      ok: true,
      corrected: true,
      accountTag: TAG_B,
      operatorId: OTHER,
      fill: { filledAmount: '0.4', averagePrice: '99.5' },
      correctedAt: '2026-08-25T13:00:00.000Z',
    });
    expect(fillAssignStore.get('child-1')).toMatchObject({
      kind: 'correct',
      accountTag: TAG_B,
      operatorId: OTHER,
      filledAmount: '0.4',
    });
    expect(fillAssignStore.trail('child-1').map((row) => row.kind)).toEqual(['assign', 'correct']);
    expect(fillAssignStore.trail('child-1')[0]).toMatchObject({ accountTag: TAG, operatorId: OP, filledAmount: '0.5' });
  });

  it('paper / not-live / missing parent / missing child / parent mismatch refuse', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-paper', kind: 'twap', status: 'paper' }));
    parentStore.seed(live({ parentClientOrderId: 'parent-stop', kind: 'twap', status: 'stopped' }));
    const emsStore = new InMemoryEmsOrderStore();
    seedFill(emsStore, { parentClientOrderId: 'parent-paper', clientOrderId: 'paper-child' });
    seedFill(emsStore, { parentClientOrderId: 'parent-stop', clientOrderId: 'stop-child' });
    const fillAssignStore = new InMemoryFillAssignStore();
    expect(
      assignChildFill({
        parentClientOrderId: 'parent-paper',
        clientOrderId: 'paper-child',
        accountTag: TAG,
        operatorId: OP,
        parentStore,
        emsStore,
        fillAssignStore,
      }),
    ).toMatchObject({ ok: false, reason: 'paper' });
    expect(
      assignChildFill({
        parentClientOrderId: 'parent-stop',
        clientOrderId: 'stop-child',
        accountTag: TAG,
        operatorId: OP,
        parentStore,
        emsStore,
        fillAssignStore,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      assignChildFill({
        clientOrderId: 'child-1',
        accountTag: TAG,
        operatorId: OP,
        parentStore,
        emsStore,
        fillAssignStore,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      assignChildFill({
        parentClientOrderId: 'missing',
        clientOrderId: 'child-1',
        accountTag: TAG,
        operatorId: OP,
        parentStore,
        emsStore,
        fillAssignStore,
      }),
    ).toMatchObject({ ok: false, reason: 'not_found' });
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    parentStore.seed(live({ parentClientOrderId: 'parent-other', kind: 'twap' }));
    expect(
      assignChildFill({
        parentClientOrderId: 'parent-twap',
        accountTag: TAG,
        operatorId: OP,
        parentStore,
        emsStore,
        fillAssignStore,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_child' });
    seedFill(emsStore, { parentClientOrderId: 'parent-other' });
    expect(
      assignChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'child-1',
        accountTag: TAG,
        operatorId: OP,
        parentStore,
        emsStore,
        fillAssignStore,
      }),
    ).toMatchObject({ ok: false, reason: 'parent_mismatch' });
  });

  it('unwired stores refuse', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    const emsStore = new InMemoryEmsOrderStore();
    seedFill(emsStore);
    expect(
      assignChildFill({ parentClientOrderId: 'parent-twap', clientOrderId: 'child-1', accountTag: TAG, operatorId: OP }),
    ).toMatchObject({
      ok: false,
      reason: 'parent_store_unwired',
    });
    expect(
      assignChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'child-1',
        accountTag: TAG,
        operatorId: OP,
        parentStore,
      }),
    ).toMatchObject({ ok: false, reason: 'ems_store_unwired' });
    expect(
      assignChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'child-1',
        accountTag: TAG,
        operatorId: OP,
        parentStore,
        emsStore,
      }),
    ).toMatchObject({ ok: false, reason: 'fill_store_unwired' });
  });
});

describe('correctChildFill', () => {
  it('live parent + existing child fill + operator + qty/price + tag → appended correction', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    const emsStore = new InMemoryEmsOrderStore();
    seedFill(emsStore);
    const fillAssignStore = new InMemoryFillAssignStore();
    const out = correctChildFill({
      parentClientOrderId: 'parent-twap',
      clientOrderId: 'child-1',
      accountTag: TAG,
      amount: '0.50',
      price: '100.00',
      operatorId: OP,
      parentStore,
      emsStore,
      fillAssignStore,
      now: new Date('2026-08-25T12:00:00.000Z'),
    });
    expect(out).toMatchObject({
      ok: true,
      corrected: true,
      parent: { parentClientOrderId: 'parent-twap', kind: 'twap' },
      child: { clientOrderId: 'child-1' },
      fill: { filledAmount: '0.5', averagePrice: '100' },
      accountTag: TAG,
      operatorId: OP,
      correctedAt: '2026-08-25T12:00:00.000Z',
    });
    expect(fillAssignStore.get('child-1')?.kind).toBe('correct');
    expect(emsStore.get('child-1')?.execution?.status).toBe('filled');
  });

  it('missing operator/qty/price refuse — never invent a print or user', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    const emsStore = new InMemoryEmsOrderStore();
    seedFill(emsStore);
    const fillAssignStore = new InMemoryFillAssignStore();
    expect(
      correctChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'child-1',
        accountTag: TAG,
        amount: '0.5',
        price: '100',
        parentStore,
        emsStore,
        fillAssignStore,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_operator' });
    expect(
      correctChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'child-1',
        accountTag: TAG,
        price: '100',
        operatorId: OP,
        parentStore,
        emsStore,
        fillAssignStore,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_qty' });
    expect(
      correctChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'child-1',
        accountTag: TAG,
        amount: '0',
        price: '100',
        operatorId: OP,
        parentStore,
        emsStore,
        fillAssignStore,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_qty' });
    expect(
      correctChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'child-1',
        accountTag: TAG,
        amount: 'not-a-qty',
        price: '100',
        operatorId: OP,
        parentStore,
        emsStore,
        fillAssignStore,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_qty' });
    expect(
      correctChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'child-1',
        accountTag: TAG,
        amount: '0.5',
        operatorId: OP,
        parentStore,
        emsStore,
        fillAssignStore,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_price' });
    expect(
      correctChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'child-1',
        accountTag: TAG,
        amount: '0.5',
        price: '0',
        operatorId: OP,
        parentStore,
        emsStore,
        fillAssignStore,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_price' });
    expect(fillAssignStore.get('child-1')).toBeNull();
  });

  it('correction without a tag refuses unless a prior assignment supplies it', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    const emsStore = new InMemoryEmsOrderStore();
    seedFill(emsStore);
    const fillAssignStore = new InMemoryFillAssignStore();
    expect(
      correctChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'child-1',
        amount: '0.4',
        price: '99',
        operatorId: OP,
        parentStore,
        emsStore,
        fillAssignStore,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_target' });
    expect(
      assignChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'child-1',
        accountTag: TAG,
        operatorId: OP,
        parentStore,
        emsStore,
        fillAssignStore,
      }),
    ).toMatchObject({ ok: true, accountTag: TAG });
    expect(
      correctChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'child-1',
        amount: '0.4',
        price: '99',
        operatorId: OTHER,
        parentStore,
        emsStore,
        fillAssignStore,
      }),
    ).toMatchObject({
      ok: true,
      corrected: true,
      accountTag: TAG,
      operatorId: OTHER,
      fill: { filledAmount: '0.4', averagePrice: '99' },
    });
  });

  it('correcting a missing fill refuses — never invent a print', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    const emsStore = new InMemoryEmsOrderStore();
    const fillAssignStore = new InMemoryFillAssignStore();
    expect(
      correctChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'ghost',
        accountTag: TAG,
        amount: '0.5',
        price: '100',
        operatorId: OP,
        parentStore,
        emsStore,
        fillAssignStore,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_fill' });
  });
});

describe('execution.oms.assignFill / correctFill tRPC', () => {
  it('doors exist (admin:write) and refuse anonymous', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const caller = router.createCaller(hmacSigned());
    expect(typeof caller.execution.oms.assignFill).toBe('function');
    expect(typeof caller.execution.oms.correctFill).toBe('function');
    expect(
      await caller.execution.oms.assignFill({ parentClientOrderId: 'parent-1', clientOrderId: 'child-1', accountTag: TAG }),
    ).toMatchObject({
      ok: false,
      reason: 'not_found',
    });
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(
      router.createCaller(anon).execution.oms.assignFill({ parentClientOrderId: 'parent-1', clientOrderId: 'child-1', accountTag: TAG }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(
      router.createCaller(anon).execution.oms.correctFill({
        parentClientOrderId: 'parent-1',
        clientOrderId: 'child-1',
        amount: '0.5',
        price: '100',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('assigns a seeded child fill; double-assign refuses; correctFill retags with qty/price', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    const emsStore = new InMemoryEmsOrderStore();
    seedFill(emsStore, { parentClientOrderId: 'parent-1' });
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
      clientOrderId: 'child-1',
      accountTag: TAG,
    });
    expect(assigned).toMatchObject({
      ok: true,
      assigned: true,
      accountTag: TAG,
      operatorId: OP,
      parent: { parentClientOrderId: 'parent-1', kind: 'twap' },
      fill: { filledAmount: '0.5', status: 'filled' },
    });

    expect(
      await caller.execution.oms.assignFill({
        parentClientOrderId: 'parent-1',
        clientOrderId: 'child-1',
        accountTag: TAG_B,
      }),
    ).toMatchObject({ ok: false, reason: 'already_assigned' });

    const corrected = await caller.execution.oms.correctFill({
      parentClientOrderId: 'parent-1',
      clientOrderId: 'child-1',
      accountTag: TAG_B,
      amount: '0.40',
      price: '99.50',
    });
    expect(corrected).toMatchObject({
      ok: true,
      corrected: true,
      accountTag: TAG_B,
      operatorId: OP,
      fill: { filledAmount: '0.4', averagePrice: '99.5' },
    });
  });

  it('body operatorId is ignored — signed principal is the operator', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    const emsStore = new InMemoryEmsOrderStore();
    seedFill(emsStore, { parentClientOrderId: 'parent-1' });
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
    const out = await caller.execution.oms.assignFill({
      parentClientOrderId: 'parent-1',
      clientOrderId: 'child-1',
      accountTag: TAG,
      operatorId: OTHER,
    } as { parentClientOrderId: string; clientOrderId: string; accountTag: string });
    expect(out).toMatchObject({ ok: true, assigned: true, operatorId: OP });
  });
});
