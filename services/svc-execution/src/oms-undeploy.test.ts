import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import { InMemoryAlgoPauseStore } from './oms-pause.js';
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
  over: Partial<ApprovedAlgoParent> & Pick<ApprovedAlgoParent, 'parentClientOrderId' | 'kind'> & {
    schedule?: RetainedAlgoSchedule;
  },
): ApprovedAlgoParent {
  const schedule =
    over.schedule ??
    (over.kind === 'pov' ? retainedPov() : over.kind === 'vwap' ? retainedVwap() : retainedTwap());
  return {
    status: 'stopped',
    startedAt: '2026-08-25T12:00:00.000Z',
    ...over,
    schedule,
  };
}

describe('undeployStoppedAlgoParent', () => {
  it('refuses missing parent, unwired store, and not found', () => {
    expect(undeployStoppedAlgoParent({ parentStore: new InMemoryApprovedAlgoParentStore() })).toMatchObject({
      ok: false,
      reason: 'missing_parent',
    });
    expect(undeployStoppedAlgoParent({ parentClientOrderId: 'parent-1' })).toMatchObject({
      ok: false,
      reason: 'parent_store_unwired',
    });
    expect(
      undeployStoppedAlgoParent({
        parentClientOrderId: 'ghost',
        parentStore: new InMemoryApprovedAlgoParentStore(),
      }),
    ).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('refuses approved and running — not stopped', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed({
      ...stopped({ parentClientOrderId: 'parent-approved', kind: 'twap' }),
      status: 'approved',
      startedAt: null,
    });
    parentStore.seed({
      ...stopped({ parentClientOrderId: 'parent-running', kind: 'twap' }),
      status: 'running',
    });
    expect(
      undeployStoppedAlgoParent({ parentClientOrderId: 'parent-approved', parentStore }),
    ).toMatchObject({ ok: false, reason: 'not_stopped' });
    expect(
      undeployStoppedAlgoParent({ parentClientOrderId: 'parent-running', parentStore }),
    ).toMatchObject({ ok: false, reason: 'not_stopped' });
  });

  it('refuses already undeployed', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed({
      ...stopped({ parentClientOrderId: 'parent-1', kind: 'twap' }),
      status: 'undeployed',
    });
    expect(undeployStoppedAlgoParent({ parentClientOrderId: 'parent-1', parentStore })).toMatchObject({
      ok: false,
      reason: 'already_undeployed',
    });
  });

  it('refuses executionGroupId — parent only', () => {
    expect(
      undeployStoppedAlgoParent({
        parentClientOrderId: 'parent-1',
        executionGroupId: 'grp-1',
        parentStore: new InMemoryApprovedAlgoParentStore(),
      }),
    ).toMatchObject({ ok: false, reason: 'parent_only' });
  });

  it('undeploys stopped TWAP/VWAP/POV and echoes the retained schedule', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(stopped({ parentClientOrderId: 'p-twap', kind: 'twap' }));
    parentStore.seed(stopped({ parentClientOrderId: 'p-vwap', kind: 'vwap' }));
    parentStore.seed(stopped({ parentClientOrderId: 'p-pov', kind: 'pov' }));

    const twap = undeployStoppedAlgoParent({ parentClientOrderId: 'p-twap', parentStore });
    expect(twap).toEqual({
      ok: true,
      parent: { parentClientOrderId: 'p-twap', kind: 'twap' },
      undeployed: true,
      status: 'undeployed',
      schedule: retainedTwap(),
    });
    expect(undeployStoppedAlgoParent({ parentClientOrderId: 'p-vwap', parentStore })).toMatchObject({
      ok: true,
      kind: 'vwap',
      status: 'undeployed',
      schedule: retainedVwap(),
    });
    expect(undeployStoppedAlgoParent({ parentClientOrderId: 'p-pov', parentStore })).toMatchObject({
      ok: true,
      kind: 'pov',
      status: 'undeployed',
      schedule: retainedPov(),
    });
  });

  it('cannot start again until approved', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(stopped({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    expect(undeployStoppedAlgoParent({ parentClientOrderId: 'parent-1', parentStore })).toMatchObject({
      ok: true,
      undeployed: true,
    });
    expect(parentStore.get('parent-1')?.status).toBe('undeployed');
    expect(
      startApprovedAlgoParent({
        parentClientOrderId: 'parent-1',
        parentStore,
        jobs: { enabled: true },
      }),
    ).toMatchObject({ ok: false, reason: 'not_approved' });
  });

  it('store.undeploy only flips stopped → undeployed', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(stopped({ parentClientOrderId: 'parent-stop', kind: 'twap' }));
    parentStore.seed({
      ...stopped({ parentClientOrderId: 'parent-run', kind: 'twap' }),
      status: 'running',
    });
    expect(parentStore.undeploy('missing')).toBeNull();
    expect(parentStore.undeploy('parent-run')).toBeNull();
    expect(parentStore.get('parent-run')?.status).toBe('running');
    const next = parentStore.undeploy('parent-stop');
    expect(next?.status).toBe('undeployed');
    expect(next?.schedule).toEqual(retainedTwap());
    expect(parentStore.undeploy('parent-stop')).toBeNull();
  });
});

describe('execution.oms.undeploy tRPC', () => {
  it('door exists (admin:write) and refuses anonymous undeploy', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const caller = router.createCaller(signed());
    expect(typeof caller.execution.oms.undeploy).toBe('function');
    const out = await caller.execution.oms.undeploy({ parentClientOrderId: 'parent-1' });
    expect(out).toMatchObject({ ok: false, reason: 'not_found' });
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(
      router.createCaller(anon).execution.oms.undeploy({ parentClientOrderId: 'parent-1' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('undeploys through the injected store; start then refuses not_approved', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    const pauseStore = new InMemoryAlgoPauseStore();
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
      undefined,
      undefined,
      pauseStore,
      parentStore,
    ).createCaller(signed());
    const out = await caller.execution.oms.undeploy({ parentClientOrderId: 'parent-1' });
    expect(out).toEqual({
      ok: true,
      parent: { parentClientOrderId: 'parent-1', kind: 'twap' },
      undeployed: true,
      status: 'undeployed',
      schedule: retainedTwap(),
    });
    expect(parentStore.get('parent-1')?.status).toBe('undeployed');
    expect(
      startApprovedAlgoParent({
        parentClientOrderId: 'parent-1',
        parentStore,
        jobs: { enabled: true },
      }),
    ).toMatchObject({ ok: false, reason: 'not_approved' });
  });
});
