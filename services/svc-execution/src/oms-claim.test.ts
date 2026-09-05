import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import {
  InMemoryApprovedAlgoParentStore,
  startApprovedAlgoParent,
  type ApprovedAlgoParent,
  type ApprovedAlgoParentStore,
  type RetainedAlgoSchedule,
} from './oms-start.js';
import { claimLiveAlgoParent, readLiveAlgoParentOwnership, unclaimLiveAlgoParent } from './oms-claim.js';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-oms-claim-test-edge-secret';
const OP = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';
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

describe('claimLiveAlgoParent', () => {
  it('live unowned parent + operator → owner set', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    expect(readLiveAlgoParentOwnership({ parentClientOrderId: 'parent-twap', parentStore })).toMatchObject({
      ok: true,
      claimed: false,
      executionOwner: null,
    });
    expect(claimLiveAlgoParent({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore })).toMatchObject({
      ok: true,
      claimed: true,
      parent: { parentClientOrderId: 'parent-twap', kind: 'twap' },
      executionOwner: OP,
    });
    expect(parentStore.get('parent-twap')?.executionOwner).toBe(OP);
    expect(parentStore.get('parent-twap')?.originator).toBe(OP);
    expect(readLiveAlgoParentOwnership({ parentClientOrderId: 'parent-twap', parentStore })).toMatchObject({
      ok: true,
      claimed: true,
      executionOwner: OP,
      originator: OP,
    });
  });

  it('same operator re-claim is idempotent; start keeps the owner', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    expect(claimLiveAlgoParent({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore })).toMatchObject({
      ok: true,
      executionOwner: OP,
    });
    expect(claimLiveAlgoParent({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore })).toMatchObject({
      ok: true,
      claimed: true,
      executionOwner: OP,
    });
    expect(
      startApprovedAlgoParent({
        parentClientOrderId: 'parent-twap',
        operatorId: OP,
        parentStore,
        jobs: { enabled: true },
        matchingVenueHalt: { venueHalted: false },
      }),
    ).toMatchObject({ ok: true, status: 'running' });
    expect(parentStore.get('parent-twap')).toMatchObject({
      status: 'running',
      executionOwner: OP,
    });
  });

  it('second operator claim refuses — no steal', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    claimLiveAlgoParent({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore });
    expect(claimLiveAlgoParent({ parentClientOrderId: 'parent-twap', operatorId: OTHER, parentStore })).toMatchObject({
      ok: false,
      reason: 'already_claimed',
    });
    expect(parentStore.get('parent-twap')?.executionOwner).toBe(OP);
  });

  it('owner unclaim returns unowned; other operator unclaim refuses', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(
      live({
        parentClientOrderId: 'parent-vwap',
        kind: 'vwap',
        status: 'running',
        startedAt: '2026-08-25T00:00:00.000Z',
      }),
    );
    claimLiveAlgoParent({ parentClientOrderId: 'parent-vwap', operatorId: OP, parentStore });
    expect(unclaimLiveAlgoParent({ parentClientOrderId: 'parent-vwap', operatorId: OTHER, parentStore })).toMatchObject({
      ok: false,
      reason: 'not_owner',
    });
    expect(parentStore.get('parent-vwap')?.executionOwner).toBe(OP);
    expect(unclaimLiveAlgoParent({ parentClientOrderId: 'parent-vwap', operatorId: OP, parentStore })).toMatchObject({
      ok: true,
      claimed: false,
      executionOwner: null,
      parent: { parentClientOrderId: 'parent-vwap', kind: 'vwap' },
    });
    expect(parentStore.get('parent-vwap')?.executionOwner).toBeNull();
    expect(readLiveAlgoParentOwnership({ parentClientOrderId: 'parent-vwap', parentStore })).toMatchObject({
      ok: true,
      claimed: false,
      executionOwner: null,
    });
    expect(unclaimLiveAlgoParent({ parentClientOrderId: 'parent-vwap', operatorId: OP, parentStore })).toMatchObject({
      ok: false,
      reason: 'unowned',
    });
  });

  it('missing operator id refuses — never invents a user', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    expect(claimLiveAlgoParent({ parentClientOrderId: 'parent-twap', parentStore })).toMatchObject({
      ok: false,
      reason: 'missing_operator',
    });
    expect(claimLiveAlgoParent({ parentClientOrderId: 'parent-twap', operatorId: '   ', parentStore })).toMatchObject({
      ok: false,
      reason: 'missing_operator',
    });
    expect(parentStore.get('parent-twap')?.executionOwner).toBeUndefined();
  });

  it('paper / not-live / missing parent refuse', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-paper', kind: 'twap', status: 'paper' }));
    parentStore.seed(live({ parentClientOrderId: 'parent-stop', kind: 'twap', status: 'stopped' }));
    expect(claimLiveAlgoParent({ parentClientOrderId: 'parent-paper', operatorId: OP, parentStore })).toMatchObject({
      ok: false,
      reason: 'paper',
    });
    expect(claimLiveAlgoParent({ parentClientOrderId: 'parent-stop', operatorId: OP, parentStore })).toMatchObject({
      ok: false,
      reason: 'not_live',
    });
    expect(claimLiveAlgoParent({ operatorId: OP, parentStore })).toMatchObject({
      ok: false,
      reason: 'missing_parent',
    });
    expect(claimLiveAlgoParent({ parentClientOrderId: 'missing', operatorId: OP, parentStore })).toMatchObject({
      ok: false,
      reason: 'not_found',
    });
  });

  it('unwired store / missing claim method', () => {
    expect(claimLiveAlgoParent({ parentClientOrderId: 'parent-twap', operatorId: OP })).toMatchObject({
      ok: false,
      reason: 'parent_store_unwired',
    });
    const unwired: ApprovedAlgoParentStore = {
      get: () => live({ parentClientOrderId: 'parent-twap', kind: 'twap' }),
      approve: (parent) => parent,
      start: () => null,
      stop: () => null,
      undeploy: () => null,
      expire: () => null,
    };
    expect(claimLiveAlgoParent({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore: unwired })).toMatchObject({
      ok: false,
      reason: 'parent_store_unwired',
    });
    const ownedUnwired: ApprovedAlgoParentStore = {
      ...unwired,
      get: () => live({ parentClientOrderId: 'parent-twap', kind: 'twap', executionOwner: OP }),
    };
    expect(unclaimLiveAlgoParent({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore: ownedUnwired })).toMatchObject({
      ok: false,
      reason: 'parent_store_unwired',
    });
  });
});

describe('execution.oms.claim tRPC', () => {
  it('door exists (admin:write) and refuses anonymous claim', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const caller = router.createCaller(hmacSigned());
    expect(typeof caller.execution.oms.claim).toBe('function');
    expect(typeof caller.execution.oms.unclaim).toBe('function');
    expect(typeof caller.execution.oms.ownership).toBe('function');
    const out = await caller.execution.oms.claim({ parentClientOrderId: 'parent-1' });
    expect(out).toMatchObject({ ok: false, reason: 'not_found' });
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(router.createCaller(anon).execution.oms.claim({ parentClientOrderId: 'parent-1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('claims from signed principal and refuses a second operator', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-1', kind: 'twap' }));
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
      undefined,
      undefined,
      undefined,
      parentStore,
    );
    const owner = router.createCaller(hmacSigned());
    const seen = await owner.execution.oms.ownership({ parentClientOrderId: 'parent-1' });
    expect(seen).toMatchObject({ ok: true, claimed: false, executionOwner: null });
    const claimed = await owner.execution.oms.claim({ parentClientOrderId: 'parent-1' });
    expect(claimed).toMatchObject({ ok: true, claimed: true, executionOwner: OP });
    expect(parentStore.get('parent-1')?.executionOwner).toBe(OP);

    const other = router.createCaller(hmacSigned(principal({ sub: OTHER, userId: OTHER })));
    expect(await other.execution.oms.claim({ parentClientOrderId: 'parent-1' })).toMatchObject({
      ok: false,
      reason: 'already_claimed',
    });
    expect(await other.execution.oms.unclaim({ parentClientOrderId: 'parent-1' })).toMatchObject({
      ok: false,
      reason: 'not_owner',
    });
    expect(await other.execution.oms.ownership({ parentClientOrderId: 'parent-1' })).toMatchObject({
      ok: true,
      claimed: true,
      executionOwner: OP,
    });

    const released = await owner.execution.oms.unclaim({ parentClientOrderId: 'parent-1' });
    expect(released).toMatchObject({ ok: true, claimed: false, executionOwner: null });
    expect(parentStore.get('parent-1')?.executionOwner).toBeNull();
  });

  it('body operatorId is ignored — signed principal is the owner', async () => {
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
      undefined,
      undefined,
      undefined,
      parentStore,
    ).createCaller(hmacSigned());
    const out = await caller.execution.oms.claim({
      parentClientOrderId: 'parent-1',
      operatorId: OTHER,
    } as { parentClientOrderId: string });
    expect(out).toMatchObject({ ok: true, claimed: true, executionOwner: OP });
    expect(parentStore.get('parent-1')?.executionOwner).toBe(OP);
  });
});
