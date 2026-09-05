import { describe, expect, it } from 'vitest';
import { ZERO } from '@intafaced/ledger-client';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import type { SubmitRequest, VenueExecution } from '@intafaced/venue-adapter';
import { InMemoryEmsOrderStore } from './oms-ems-store.js';
import {
  InMemoryApprovedAlgoParentStore,
  type ApprovedAlgoParent,
  type ApprovedAlgoParentStore,
  type RetainedAlgoSchedule,
} from './oms-start.js';
import { abandonStagedParent } from './oms-abandon.js';
import { stageApprovedParent } from './oms-stage.js';
import { releaseStagedParentToLive } from './oms-release.js';
import { sliceLiveAlgoParent } from './oms-slice.js';
import type { OmsSubmitFn } from './oms-trade-submit.js';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-oms-abandon-test-edge-secret';
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

function withStore(parentStore: ApprovedAlgoParentStore) {
  return createExecutionRouter(
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

function approved(
  over: Partial<ApprovedAlgoParent> &
    Pick<ApprovedAlgoParent, 'parentClientOrderId' | 'kind'> & {
      schedule?: RetainedAlgoSchedule;
    },
): ApprovedAlgoParent {
  const schedule = over.schedule ?? (over.kind === 'pov' ? retainedPov() : over.kind === 'vwap' ? retainedVwap() : retainedTwap());
  return {
    status: 'approved',
    startedAt: null,
    ...over,
    schedule,
  };
}

function ack(req: SubmitRequest): VenueExecution {
  return {
    venueId: 'street',
    venueOrderId: 'v-slice-1',
    filledAmount: req.amount,
    averagePrice: req.limitPrice,
    feeAmount: ZERO,
    feeAsset: 'USDT',
    status: 'filled',
    executedAt: new Date('2026-08-25T00:00:00.000Z'),
  };
}

function trackingSubmit(): { calls: SubmitRequest[]; submit: OmsSubmitFn } {
  const calls: SubmitRequest[] = [];
  return {
    calls,
    submit: async (req) => {
      calls.push(req);
      return ack(req);
    },
  };
}

const sliceFields = {
  amount: '0.5',
  venueId: 'street',
  symbol: 'BTC/USDT',
  side: 'buy' as const,
  limitPrice: '100',
  parentCap: '100',
};

describe('abandonStagedParent', () => {
  it('staged parent + operator → abandoned, never live, no children or fills', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    const emsStore = new InMemoryEmsOrderStore();
    parentStore.seed(approved({ parentClientOrderId: 'parent-twap', kind: 'twap', residual: { remaining: '1.25' } }));
    parentStore.seed(approved({ parentClientOrderId: 'parent-vwap', kind: 'vwap' }));
    parentStore.seed(approved({ parentClientOrderId: 'parent-pov', kind: 'pov' }));
    expect(stageApprovedParent({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore })).toMatchObject({
      ok: true,
      status: 'staged',
    });
    expect(stageApprovedParent({ parentClientOrderId: 'parent-vwap', operatorId: OP, parentStore })).toMatchObject({
      ok: true,
      status: 'staged',
    });
    expect(stageApprovedParent({ parentClientOrderId: 'parent-pov', operatorId: OP, parentStore })).toMatchObject({
      ok: true,
      status: 'staged',
    });

    const twap = abandonStagedParent({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore });
    const vwap = abandonStagedParent({ parentClientOrderId: 'parent-vwap', operatorId: OP, parentStore });
    const pov = abandonStagedParent({ parentClientOrderId: 'parent-pov', operatorId: OP, parentStore });

    expect(twap).toEqual({
      ok: true,
      abandoned: true,
      parent: { parentClientOrderId: 'parent-twap', kind: 'twap' },
      status: 'abandoned',
      executionOwner: OP,
      children: [],
    });
    expect(vwap).toMatchObject({ ok: true, abandoned: true, parent: { kind: 'vwap' }, status: 'abandoned' });
    expect(pov).toMatchObject({ ok: true, abandoned: true, parent: { kind: 'pov' }, status: 'abandoned' });
    expect(twap).not.toHaveProperty('fill');
    expect(twap).not.toHaveProperty('fills');
    expect(twap).not.toHaveProperty('venue');
    expect(twap).not.toHaveProperty('venueId');
    expect(parentStore.get('parent-twap')?.status).toBe('abandoned');
    expect(parentStore.get('parent-twap')?.executionOwner).toBe(OP);
    expect(parentStore.get('parent-twap')?.originator).toBe(OP);
    expect(parentStore.get('parent-twap')?.residual).toEqual({ remaining: '1.25' });
    expect(parentStore.get('parent-vwap')?.status).toBe('abandoned');
    expect(parentStore.get('parent-pov')?.status).toBe('abandoned');
    expect(emsStore.list()).toEqual([]);
  });

  it('same operator re-abandon is idempotent', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(approved({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    stageApprovedParent({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore });
    expect(abandonStagedParent({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore })).toMatchObject({
      ok: true,
      abandoned: true,
    });
    expect(abandonStagedParent({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore })).toMatchObject({
      ok: true,
      abandoned: true,
      executionOwner: OP,
    });
    expect(parentStore.get('parent-twap')?.status).toBe('abandoned');
  });

  it('missing operator id refuses — never invents a user', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(approved({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    stageApprovedParent({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore });
    expect(abandonStagedParent({ parentClientOrderId: 'parent-twap', parentStore })).toMatchObject({
      ok: false,
      reason: 'missing_operator',
    });
    expect(abandonStagedParent({ parentClientOrderId: 'parent-twap', operatorId: '   ', parentStore })).toMatchObject({
      ok: false,
      reason: 'missing_operator',
    });
    expect(parentStore.get('parent-twap')?.status).toBe('staged');
  });

  it('live / released refuse — use undeployDrain for live', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(approved({ parentClientOrderId: 'parent-approved', kind: 'twap' }));
    parentStore.seed(
      approved({
        parentClientOrderId: 'parent-run',
        kind: 'twap',
        status: 'running',
        startedAt: '2026-08-25T00:00:00.000Z',
      }),
    );
    parentStore.seed(approved({ parentClientOrderId: 'parent-released', kind: 'twap' }));
    stageApprovedParent({ parentClientOrderId: 'parent-released', operatorId: OP, parentStore });
    expect(
      releaseStagedParentToLive({
        parentClientOrderId: 'parent-released',
        operatorId: OP,
        parentStore,
        matchingVenueHalt: { venueHalted: false },
      }),
    ).toMatchObject({
      ok: true,
      status: 'approved',
    });
    expect(abandonStagedParent({ parentClientOrderId: 'parent-approved', operatorId: OP, parentStore })).toMatchObject({
      ok: false,
      reason: 'already_live',
    });
    expect(abandonStagedParent({ parentClientOrderId: 'parent-run', operatorId: OP, parentStore })).toMatchObject({
      ok: false,
      reason: 'already_live',
    });
    expect(abandonStagedParent({ parentClientOrderId: 'parent-released', operatorId: OP, parentStore })).toMatchObject({
      ok: false,
      reason: 'already_live',
    });
    expect(parentStore.get('parent-approved')?.status).toBe('approved');
    expect(parentStore.get('parent-run')?.status).toBe('running');
    expect(parentStore.get('parent-released')?.status).toBe('approved');
  });

  it('paper / stopped refuse — not staged', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(approved({ parentClientOrderId: 'parent-paper', kind: 'twap', status: 'paper' }));
    parentStore.seed(approved({ parentClientOrderId: 'parent-stop', kind: 'twap', status: 'stopped' }));
    expect(abandonStagedParent({ parentClientOrderId: 'parent-paper', operatorId: OP, parentStore })).toMatchObject({
      ok: false,
      reason: 'not_staged',
    });
    expect(abandonStagedParent({ parentClientOrderId: 'parent-stop', operatorId: OP, parentStore })).toMatchObject({
      ok: false,
      reason: 'not_staged',
    });
    expect(parentStore.get('parent-paper')?.status).toBe('paper');
    expect(parentStore.get('parent-stop')?.status).toBe('stopped');
  });

  it('other operator cannot abandon', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(approved({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    stageApprovedParent({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore });
    expect(abandonStagedParent({ parentClientOrderId: 'parent-twap', operatorId: OTHER, parentStore })).toMatchObject({
      ok: false,
      reason: 'not_owner',
    });
    expect(parentStore.get('parent-twap')?.status).toBe('staged');
  });

  it('unwired store / missing abandon method', () => {
    expect(abandonStagedParent({ parentClientOrderId: 'parent-twap', operatorId: OP })).toMatchObject({
      ok: false,
      reason: 'parent_store_unwired',
    });
    const unwired: ApprovedAlgoParentStore = {
      get: () =>
        approved({
          parentClientOrderId: 'parent-twap',
          kind: 'twap',
          status: 'staged',
          executionOwner: OP,
        }),
      approve: (parent) => parent,
      start: () => null,
      stop: () => null,
      undeploy: () => null,
      expire: () => null,
    };
    expect(abandonStagedParent({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore: unwired })).toMatchObject({
      ok: false,
      reason: 'parent_store_unwired',
    });
  });

  it('missing parent / not_found', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    expect(abandonStagedParent({ parentStore, operatorId: OP })).toMatchObject({
      ok: false,
      reason: 'missing_parent',
    });
    expect(abandonStagedParent({ parentClientOrderId: '   ', operatorId: OP, parentStore })).toMatchObject({
      ok: false,
      reason: 'missing_parent',
    });
    expect(abandonStagedParent({ parentClientOrderId: 'missing', operatorId: OP, parentStore })).toMatchObject({
      ok: false,
      reason: 'not_found',
    });
  });

  it('unsupported kind refuses', () => {
    const parentStore: ApprovedAlgoParentStore = {
      get: () =>
        ({
          parentClientOrderId: 'parent-ice',
          kind: 'iceberg',
          status: 'staged',
          schedule: retainedTwap(),
          startedAt: null,
          executionOwner: OP,
        }) as unknown as ApprovedAlgoParent,
      approve: (parent) => parent,
      start: () => null,
      stop: () => null,
      undeploy: () => null,
      expire: () => null,
      abandon: () => null,
    };
    expect(abandonStagedParent({ parentClientOrderId: 'parent-ice', operatorId: OP, parentStore })).toMatchObject({
      ok: false,
      reason: 'unsupported_kind',
    });
  });
});

describe('after abandon', () => {
  it('release refuses not_staged — never goes live', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(approved({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    stageApprovedParent({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore });
    expect(abandonStagedParent({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore })).toMatchObject({
      ok: true,
      status: 'abandoned',
    });
    expect(releaseStagedParentToLive({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore })).toMatchObject({
      ok: false,
      reason: 'not_staged',
    });
    expect(parentStore.get('parent-twap')?.status).toBe('abandoned');
  });

  it('slice refuses — submit is not called, no invented fill', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(approved({ parentClientOrderId: 'parent-twap', kind: 'twap', residual: { remaining: '10' } }));
    stageApprovedParent({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore });
    abandonStagedParent({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore });
    const street = trackingSubmit();
    const out = await sliceLiveAlgoParent({
      parentClientOrderId: 'parent-twap',
      ...sliceFields,
      parentStore,
      submit: street.submit,
    });
    expect(out).toMatchObject({ ok: false, reason: 'not_live' });
    expect(street.calls).toEqual([]);
    expect(parentStore.get('parent-twap')?.status).toBe('abandoned');
    expect(parentStore.get('parent-twap')?.residual).toEqual({ remaining: '10' });
  });
});

describe('execution.oms.abandon tRPC', () => {
  it('door exists (admin:write) and refuses anonymous abandon', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const caller = router.createCaller(hmacSigned());
    expect(typeof caller.execution.oms.abandon).toBe('function');
    expect(await caller.execution.oms.abandon({ parentClientOrderId: 'parent-1' })).toMatchObject({
      ok: false,
      reason: 'not_found',
    });
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(router.createCaller(anon).execution.oms.abandon({ parentClientOrderId: 'parent-1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('stages then abandons through the injected store — no venue, no fill, never live', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(approved({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    const caller = withStore(parentStore).createCaller(hmacSigned());
    const staged = await caller.execution.oms.stage({ parentClientOrderId: 'parent-1' });
    expect(staged).toMatchObject({ ok: true, status: 'staged' });

    const abandoned = await caller.execution.oms.abandon({ parentClientOrderId: 'parent-1' });
    expect(abandoned).toEqual({
      ok: true,
      abandoned: true,
      parent: { parentClientOrderId: 'parent-1', kind: 'twap' },
      status: 'abandoned',
      executionOwner: OP,
      children: [],
    });
    expect(abandoned).not.toHaveProperty('fill');
    expect(abandoned).not.toHaveProperty('venue');
    expect(parentStore.get('parent-1')?.status).toBe('abandoned');

    const sliced = await caller.execution.oms.slice({
      parentClientOrderId: 'parent-1',
      amount: '0.5',
      venueId: 'street',
      symbol: 'BTC/USDT',
      side: 'buy',
      limitPrice: '100',
    });
    expect(sliced).toMatchObject({ ok: false, reason: 'not_live' });

    const released = await caller.execution.oms.release({ parentClientOrderId: 'parent-1' });
    expect(released).toMatchObject({ ok: false, reason: 'not_staged' });
  });

  it('body operatorId is ignored — signed principal is the operator', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(approved({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    const caller = withStore(parentStore).createCaller(hmacSigned());
    await caller.execution.oms.stage({ parentClientOrderId: 'parent-1' });
    const abandoned = await caller.execution.oms.abandon({
      parentClientOrderId: 'parent-1',
      operatorId: OTHER,
    } as { parentClientOrderId: string });
    expect(abandoned).toMatchObject({ ok: true, executionOwner: OP });
    expect(parentStore.get('parent-1')?.executionOwner).toBe(OP);
  });
});
