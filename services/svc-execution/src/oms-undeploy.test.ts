import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
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

  it('happy TWAP/VWAP/POV stopped → undeployed', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(stopped({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    parentStore.seed(stopped({ parentClientOrderId: 'parent-vwap', kind: 'vwap' }));
    parentStore.seed(stopped({ parentClientOrderId: 'parent-pov', kind: 'pov' }));

    const twap = undeployStoppedAlgoParent({
      parentClientOrderId: 'parent-twap',
      parentStore,
    });
    const vwap = undeployStoppedAlgoParent({
      parentClientOrderId: 'parent-vwap',
      parentStore,
    });
    const pov = undeployStoppedAlgoParent({
      parentClientOrderId: 'parent-pov',
      parentStore,
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
    const caller = router.createCaller(signed());
    expect(typeof caller.execution.oms.undeploy).toBe('function');
    const out = await caller.execution.oms.undeploy({ parentClientOrderId: 'parent-1' });
    expect(out).toMatchObject({ ok: false, reason: 'not_found' });
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(
      router.createCaller(anon).execution.oms.undeploy({ parentClientOrderId: 'parent-1' }),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('undeploys a stopped parent through the injected store; start then refuses not_approved', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
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
      undefined,
      parentStore,
      { enabled: true },
    ).createCaller(signed());
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
});
