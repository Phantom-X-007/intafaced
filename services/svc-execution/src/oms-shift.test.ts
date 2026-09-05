import { describe, expect, it } from 'vitest';
import { parseAmount, ZERO } from '@intafaced/ledger-client';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import type { VenueExecution } from '@intafaced/venue-adapter';
import { InMemoryEmsOrderStore, type EmsOrderStore } from './oms-ems-store.js';
import { confirmChildFill, InMemoryFillConfirmStore, type FillConfirmStore } from './oms-fill-confirm.js';
import {
  InMemoryApprovedAlgoParentStore,
  type ApprovedAlgoParent,
  type ApprovedAlgoParentStore,
  type RetainedAlgoSchedule,
} from './oms-start.js';
import { claimLiveAlgoParent, readLiveAlgoParentOwnership, unclaimLiveAlgoParent } from './oms-claim.js';
import { passLiveAlgoParent } from './oms-pass.js';
import { shiftLiveAlgoParent } from './oms-shift.js';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-oms-shift-test-edge-secret';
const OP = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';
const THIRD = '55555555-5555-4555-8555-555555555555';
const EXPIRE_AT = '2026-08-25T18:00:00.000Z';
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

function live(
  over: Partial<ApprovedAlgoParent> &
    Pick<ApprovedAlgoParent, 'parentClientOrderId' | 'kind'> & {
      schedule?: RetainedAlgoSchedule;
    },
): ApprovedAlgoParent {
  return {
    status: 'approved',
    startedAt: null,
    ...over,
    schedule: over.schedule ?? retainedTwap(),
  };
}

function claimedStore(id = 'parent-twap'): InMemoryApprovedAlgoParentStore {
  const parentStore = new InMemoryApprovedAlgoParentStore();
  parentStore.seed(live({ parentClientOrderId: id, kind: 'twap' }));
  claimLiveAlgoParent({ parentClientOrderId: id, operatorId: OP, parentStore });
  return parentStore;
}

function books() {
  return {
    emsStore: new InMemoryEmsOrderStore(),
    fillConfirmStore: new InMemoryFillConfirmStore(),
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
    state: 'ACKNOWLEDGED',
    reconciliationKey: null,
  });
}

describe('shiftLiveAlgoParent', () => {
  it('owner shift to incoming keeps originator; execution owner becomes incoming; never unowned', () => {
    const parentStore = claimedStore();
    expect(parentStore.get('parent-twap')).toMatchObject({
      originator: OP,
      executionOwner: OP,
    });
    expect(
      shiftLiveAlgoParent({
        parentClientOrderId: 'parent-twap',
        operatorId: OP,
        incomingOperatorId: OTHER,
        parentStore,
        ...books(),
      }),
    ).toMatchObject({
      ok: true,
      shifted: true,
      parent: { parentClientOrderId: 'parent-twap', kind: 'twap' },
      originator: OP,
      executionOwner: OTHER,
    });
    expect(parentStore.get('parent-twap')).toMatchObject({
      originator: OP,
      executionOwner: OTHER,
    });
    expect(parentStore.get('parent-twap')?.executionOwner).not.toBeNull();
    expect(readLiveAlgoParentOwnership({ parentClientOrderId: 'parent-twap', parentStore })).toMatchObject({
      ok: true,
      claimed: true,
      originator: OP,
      executionOwner: OTHER,
    });
    expect(claimLiveAlgoParent({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore })).toMatchObject({
      ok: false,
      reason: 'already_claimed',
    });
    expect(unclaimLiveAlgoParent({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore })).toMatchObject({
      ok: false,
      reason: 'not_owner',
    });
  });

  it('second shift keeps the first claimer as originator', () => {
    const parentStore = claimedStore();
    shiftLiveAlgoParent({
      parentClientOrderId: 'parent-twap',
      operatorId: OP,
      incomingOperatorId: OTHER,
      parentStore,
      ...books(),
    });
    expect(
      shiftLiveAlgoParent({
        parentClientOrderId: 'parent-twap',
        operatorId: OTHER,
        incomingOperatorId: THIRD,
        parentStore,
        ...books(),
      }),
    ).toMatchObject({
      ok: true,
      originator: OP,
      executionOwner: THIRD,
    });
    expect(parentStore.get('parent-twap')).toMatchObject({
      originator: OP,
      executionOwner: THIRD,
    });
  });

  it('legacy claimed parent without originator stamps current owner once at shift', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-legacy', kind: 'twap', executionOwner: OP }));
    expect(parentStore.get('parent-legacy')?.originator).toBeUndefined();
    expect(
      shiftLiveAlgoParent({
        parentClientOrderId: 'parent-legacy',
        operatorId: OP,
        incomingOperatorId: OTHER,
        parentStore,
        ...books(),
      }),
    ).toMatchObject({ ok: true, originator: OP, executionOwner: OTHER });
    expect(parentStore.get('parent-legacy')).toMatchObject({
      originator: OP,
      executionOwner: OTHER,
    });
  });

  it('missing incoming / operator refuse — never invents a user', () => {
    const parentStore = claimedStore();
    expect(shiftLiveAlgoParent({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore })).toMatchObject({
      ok: false,
      reason: 'missing_incoming',
    });
    expect(
      shiftLiveAlgoParent({
        parentClientOrderId: 'parent-twap',
        operatorId: OP,
        incomingOperatorId: '   ',
        parentStore,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_incoming' });
    expect(shiftLiveAlgoParent({ parentClientOrderId: 'parent-twap', incomingOperatorId: OTHER, parentStore })).toMatchObject({
      ok: false,
      reason: 'missing_operator',
    });
    expect(parentStore.get('parent-twap')).toMatchObject({
      originator: OP,
      executionOwner: OP,
    });
  });

  it('non-owner shift refuses — no steal', () => {
    const parentStore = claimedStore();
    expect(
      shiftLiveAlgoParent({
        parentClientOrderId: 'parent-twap',
        operatorId: OTHER,
        incomingOperatorId: THIRD,
        parentStore,
        ...books(),
      }),
    ).toMatchObject({ ok: false, reason: 'not_owner' });
    expect(parentStore.get('parent-twap')).toMatchObject({
      originator: OP,
      executionOwner: OP,
    });
  });

  it('unowned / self / pass-pending refuse', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    expect(
      shiftLiveAlgoParent({
        parentClientOrderId: 'parent-twap',
        operatorId: OP,
        incomingOperatorId: OTHER,
        parentStore,
        ...books(),
      }),
    ).toMatchObject({ ok: false, reason: 'unowned' });

    claimLiveAlgoParent({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore });
    expect(
      shiftLiveAlgoParent({
        parentClientOrderId: 'parent-twap',
        operatorId: OP,
        incomingOperatorId: OP,
        parentStore,
      }),
    ).toMatchObject({ ok: false, reason: 'self_shift' });

    passLiveAlgoParent({
      parentClientOrderId: 'parent-twap',
      operatorId: OP,
      targetOperatorId: OTHER,
      expireAt: EXPIRE_AT,
      parentStore,
      ...books(),
    });
    expect(
      shiftLiveAlgoParent({
        parentClientOrderId: 'parent-twap',
        operatorId: OP,
        incomingOperatorId: THIRD,
        parentStore,
        ...books(),
      }),
    ).toMatchObject({ ok: false, reason: 'pass_pending' });
    expect(parentStore.get('parent-twap')).toMatchObject({
      originator: OP,
      executionOwner: OP,
      pendingPassTo: OTHER,
    });
  });

  it('paper / not-live / missing parent refuse', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-paper', kind: 'twap', status: 'paper', executionOwner: OP }));
    parentStore.seed(live({ parentClientOrderId: 'parent-stop', kind: 'twap', status: 'stopped', executionOwner: OP }));
    expect(
      shiftLiveAlgoParent({
        parentClientOrderId: 'parent-paper',
        operatorId: OP,
        incomingOperatorId: OTHER,
        parentStore,
        ...books(),
      }),
    ).toMatchObject({ ok: false, reason: 'paper' });
    expect(
      shiftLiveAlgoParent({
        parentClientOrderId: 'parent-stop',
        operatorId: OP,
        incomingOperatorId: OTHER,
        parentStore,
        ...books(),
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(shiftLiveAlgoParent({ operatorId: OP, incomingOperatorId: OTHER, parentStore })).toMatchObject({
      ok: false,
      reason: 'missing_parent',
    });
    expect(
      shiftLiveAlgoParent({
        parentClientOrderId: 'missing',
        operatorId: OP,
        incomingOperatorId: OTHER,
        parentStore,
        ...books(),
      }),
    ).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('unwired store / missing shift method', () => {
    expect(
      shiftLiveAlgoParent({
        parentClientOrderId: 'parent-twap',
        operatorId: OP,
        incomingOperatorId: OTHER,
      }),
    ).toMatchObject({ ok: false, reason: 'parent_store_unwired' });
    const unwired: ApprovedAlgoParentStore = {
      get: () => live({ parentClientOrderId: 'parent-twap', kind: 'twap', executionOwner: OP, originator: OP }),
      approve: (parent) => parent,
      start: () => null,
      stop: () => null,
      undeploy: () => null,
      expire: () => null,
    };
    expect(
      shiftLiveAlgoParent({
        parentClientOrderId: 'parent-twap',
        operatorId: OP,
        incomingOperatorId: OTHER,
        parentStore: unwired,
      }),
    ).toMatchObject({ ok: false, reason: 'parent_store_unwired' });
  });

  it('unconfirmed EMS filled|partial refuse shift — owner stays; empty or confirmed allow shift', () => {
    const parentStore = claimedStore();
    const emsStore = new InMemoryEmsOrderStore();
    const fillConfirmStore = new InMemoryFillConfirmStore();
    seedFill(emsStore, { clientOrderId: 'child-filled' });
    seedFill(emsStore, {
      clientOrderId: 'child-partial',
      execution: execution({ status: 'partial', filledAmount: parseAmount('0.25') }),
    });
    expect(
      shiftLiveAlgoParent({
        parentClientOrderId: 'parent-twap',
        operatorId: OP,
        incomingOperatorId: OTHER,
        parentStore,
        ...books(),
        emsStore,
        fillConfirmStore,
      }),
    ).toMatchObject({ ok: false, reason: 'unconfirmed_fills' });
    expect(parentStore.get('parent-twap')).toMatchObject({ originator: OP, executionOwner: OP });
    expect(fillConfirmStore.get('child-filled')).toBeNull();

    expect(
      confirmChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'child-filled',
        confirmerId: OP,
        parentStore,
        emsStore,
        fillConfirmStore,
        now: new Date('2026-08-25T12:00:00.000Z'),
      }),
    ).toMatchObject({ ok: true });
    expect(
      shiftLiveAlgoParent({
        parentClientOrderId: 'parent-twap',
        operatorId: OP,
        incomingOperatorId: OTHER,
        parentStore,
        ...books(),
        emsStore,
        fillConfirmStore,
      }),
    ).toMatchObject({ ok: false, reason: 'unconfirmed_fills' });

    expect(
      confirmChildFill({
        parentClientOrderId: 'parent-twap',
        clientOrderId: 'child-partial',
        confirmerId: OP,
        parentStore,
        emsStore,
        fillConfirmStore,
        now: new Date('2026-08-25T12:00:01.000Z'),
      }),
    ).toMatchObject({ ok: true });
    expect(
      shiftLiveAlgoParent({
        parentClientOrderId: 'parent-twap',
        operatorId: OP,
        incomingOperatorId: OTHER,
        parentStore,
        ...books(),
        emsStore,
        fillConfirmStore,
      }),
    ).toMatchObject({ ok: true, shifted: true, originator: OP, executionOwner: OTHER });
  });

  it('unwired ems / fill stores refuse-closed', () => {
    const parentStore = claimedStore();
    const emsStore = new InMemoryEmsOrderStore();
    seedFill(emsStore);
    expect(
      shiftLiveAlgoParent({
        parentClientOrderId: 'parent-twap',
        operatorId: OP,
        incomingOperatorId: OTHER,
        parentStore,
      }),
    ).toMatchObject({ ok: false, reason: 'ems_store_unwired' });
    expect(
      shiftLiveAlgoParent({
        parentClientOrderId: 'parent-twap',
        operatorId: OP,
        incomingOperatorId: OTHER,
        parentStore,
        emsStore: { record: () => undefined, get: () => null, getByReconciliationKey: () => null } as unknown as EmsOrderStore,
      }),
    ).toMatchObject({ ok: false, reason: 'ems_store_unwired' });
    expect(
      shiftLiveAlgoParent({
        parentClientOrderId: 'parent-twap',
        operatorId: OP,
        incomingOperatorId: OTHER,
        parentStore,
        emsStore,
      }),
    ).toMatchObject({ ok: false, reason: 'fill_store_unwired' });
    expect(
      shiftLiveAlgoParent({
        parentClientOrderId: 'parent-twap',
        operatorId: OP,
        incomingOperatorId: OTHER,
        parentStore,
        emsStore,
        fillConfirmStore: { confirm: () => null } as unknown as FillConfirmStore,
      }),
    ).toMatchObject({ ok: false, reason: 'fill_store_unwired' });
    expect(parentStore.get('parent-twap')?.executionOwner).toBe(OP);
  });
});

describe('execution.oms.shift tRPC', () => {
  it('door exists (admin:write) and refuses anonymous shift', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const caller = router.createCaller(hmacSigned());
    expect(typeof caller.execution.oms.shift).toBe('function');
    const out = await caller.execution.oms.shift({
      parentClientOrderId: 'parent-1',
      incomingOperatorId: OTHER,
    });
    expect(out).toMatchObject({ ok: false, reason: 'not_found' });
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(
      router.createCaller(anon).execution.oms.shift({
        parentClientOrderId: 'parent-1',
        incomingOperatorId: OTHER,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('owner shift then incoming owns; other operator cannot steal; originator stays', async () => {
    const parentStore = claimedStore('parent-1');
    const router = createExecutionRouter(
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
    );
    const owner = router.createCaller(hmacSigned());
    const incoming = router.createCaller(hmacSigned(principal({ sub: OTHER, userId: OTHER })));
    const thief = router.createCaller(hmacSigned(principal({ sub: THIRD, userId: THIRD })));

    expect(await thief.execution.oms.shift({ parentClientOrderId: 'parent-1', incomingOperatorId: THIRD })).toMatchObject({
      ok: false,
      reason: 'not_owner',
    });
    expect(
      await owner.execution.oms.shift({
        parentClientOrderId: 'parent-1',
        incomingOperatorId: OTHER,
      }),
    ).toMatchObject({
      ok: true,
      shifted: true,
      originator: OP,
      executionOwner: OTHER,
    });
    expect(parentStore.get('parent-1')).toMatchObject({
      originator: OP,
      executionOwner: OTHER,
    });
    expect(await owner.execution.oms.ownership({ parentClientOrderId: 'parent-1' })).toMatchObject({
      ok: true,
      claimed: true,
      originator: OP,
      executionOwner: OTHER,
    });
    expect(await incoming.execution.oms.unclaim({ parentClientOrderId: 'parent-1' })).toMatchObject({
      ok: true,
      claimed: false,
      executionOwner: null,
    });
    expect(parentStore.get('parent-1')?.originator).toBe(OP);
  });

  it('body operatorId is ignored — signed principal is the outgoing owner', async () => {
    const parentStore = claimedStore('parent-1');
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
    const out = await caller.execution.oms.shift({
      parentClientOrderId: 'parent-1',
      incomingOperatorId: OTHER,
      operatorId: THIRD,
    } as { parentClientOrderId: string; incomingOperatorId: string });
    expect(out).toMatchObject({ ok: true, shifted: true, originator: OP, executionOwner: OTHER });
    expect(parentStore.get('parent-1')?.executionOwner).toBe(OTHER);
  });
});
