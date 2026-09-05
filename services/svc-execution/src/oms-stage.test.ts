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
import { stageApprovedParent } from './oms-stage.js';
import { releaseStagedParentToLive } from './oms-release.js';
import { sliceLiveAlgoParent } from './oms-slice.js';
import type { OmsSubmitFn } from './oms-trade-submit.js';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-oms-stage-test-edge-secret';
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

const MATCHING_OPEN = { venueHalted: false } as const;
const MATCHING_HALTED = { venueHalted: true } as const;

function withStore(parentStore: ApprovedAlgoParentStore, matchingVenueHalt: { readonly venueHalted: boolean } = MATCHING_OPEN) {
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
    { enabled: false },
    { enabled: false },
    undefined,
    undefined,
    undefined,
    matchingVenueHalt,
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

describe('stageApprovedParent', () => {
  it('approved parent + operator → staged, not live, no children or fills', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(approved({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    parentStore.seed(approved({ parentClientOrderId: 'parent-vwap', kind: 'vwap' }));
    parentStore.seed(approved({ parentClientOrderId: 'parent-pov', kind: 'pov' }));

    const twap = stageApprovedParent({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore });
    const vwap = stageApprovedParent({ parentClientOrderId: 'parent-vwap', operatorId: OP, parentStore });
    const pov = stageApprovedParent({ parentClientOrderId: 'parent-pov', operatorId: OP, parentStore });

    expect(twap).toEqual({
      ok: true,
      staged: true,
      parent: { parentClientOrderId: 'parent-twap', kind: 'twap' },
      status: 'staged',
      executionOwner: OP,
      children: [],
    });
    expect(vwap).toMatchObject({ ok: true, staged: true, parent: { kind: 'vwap' }, status: 'staged' });
    expect(pov).toMatchObject({ ok: true, staged: true, parent: { kind: 'pov' }, status: 'staged' });
    expect(twap).not.toHaveProperty('fill');
    expect(twap).not.toHaveProperty('fills');
    expect(twap).not.toHaveProperty('venue');
    expect(twap).not.toHaveProperty('venueId');
    expect(parentStore.get('parent-twap')?.status).toBe('staged');
    expect(parentStore.get('parent-twap')?.executionOwner).toBe(OP);
    expect(parentStore.get('parent-twap')?.originator).toBe(OP);
    expect(parentStore.get('parent-vwap')?.status).toBe('staged');
    expect(parentStore.get('parent-pov')?.status).toBe('staged');
  });

  it('same operator re-stage is idempotent', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(approved({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    expect(stageApprovedParent({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore })).toMatchObject({
      ok: true,
      staged: true,
    });
    expect(stageApprovedParent({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore })).toMatchObject({
      ok: true,
      staged: true,
      executionOwner: OP,
    });
    expect(parentStore.get('parent-twap')?.status).toBe('staged');
  });

  it('missing operator id refuses — never invents a user', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(approved({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    expect(stageApprovedParent({ parentClientOrderId: 'parent-twap', parentStore })).toMatchObject({
      ok: false,
      reason: 'missing_operator',
    });
    expect(stageApprovedParent({ parentClientOrderId: 'parent-twap', operatorId: '   ', parentStore })).toMatchObject({
      ok: false,
      reason: 'missing_operator',
    });
    expect(parentStore.get('parent-twap')?.status).toBe('approved');
    expect(parentStore.get('parent-twap')?.executionOwner).toBeUndefined();
  });

  it('running / paper / stopped refuse — does not park a live working parent', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(
      approved({
        parentClientOrderId: 'parent-run',
        kind: 'twap',
        status: 'running',
        startedAt: '2026-08-25T00:00:00.000Z',
      }),
    );
    parentStore.seed(approved({ parentClientOrderId: 'parent-paper', kind: 'twap', status: 'paper' }));
    parentStore.seed(approved({ parentClientOrderId: 'parent-stop', kind: 'twap', status: 'stopped' }));
    expect(stageApprovedParent({ parentClientOrderId: 'parent-run', operatorId: OP, parentStore })).toMatchObject({
      ok: false,
      reason: 'already_live',
    });
    expect(stageApprovedParent({ parentClientOrderId: 'parent-paper', operatorId: OP, parentStore })).toMatchObject({
      ok: false,
      reason: 'paper',
    });
    expect(stageApprovedParent({ parentClientOrderId: 'parent-stop', operatorId: OP, parentStore })).toMatchObject({
      ok: false,
      reason: 'not_approved',
    });
    expect(parentStore.get('parent-run')?.status).toBe('running');
    expect(parentStore.get('parent-paper')?.status).toBe('paper');
    expect(parentStore.get('parent-stop')?.status).toBe('stopped');
  });

  it('other operator cannot steal a staged parent', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(approved({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    expect(stageApprovedParent({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore })).toMatchObject({
      ok: true,
    });
    expect(stageApprovedParent({ parentClientOrderId: 'parent-twap', operatorId: OTHER, parentStore })).toMatchObject({
      ok: false,
      reason: 'not_owner',
    });
    expect(parentStore.get('parent-twap')?.executionOwner).toBe(OP);
  });

  it('unwired store / missing stage method', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(approved({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    expect(stageApprovedParent({ parentClientOrderId: 'parent-twap', operatorId: OP })).toMatchObject({
      ok: false,
      reason: 'parent_store_unwired',
    });
    const unwired: ApprovedAlgoParentStore = {
      get: () => parentStore.get('parent-twap'),
      approve: (parent) => parent,
      start: () => null,
      stop: () => null,
      undeploy: () => null,
      expire: () => null,
    };
    expect(stageApprovedParent({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore: unwired })).toMatchObject({
      ok: false,
      reason: 'parent_store_unwired',
    });
  });

  it('missing parent / not_found', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    expect(stageApprovedParent({ parentStore, operatorId: OP })).toMatchObject({
      ok: false,
      reason: 'missing_parent',
    });
    expect(stageApprovedParent({ parentClientOrderId: '   ', operatorId: OP, parentStore })).toMatchObject({
      ok: false,
      reason: 'missing_parent',
    });
    expect(stageApprovedParent({ parentClientOrderId: 'missing', operatorId: OP, parentStore })).toMatchObject({
      ok: false,
      reason: 'not_found',
    });
  });

  it('unsupported_kind is refused', () => {
    const parentStore: ApprovedAlgoParentStore = {
      get: () =>
        ({
          parentClientOrderId: 'parent-ice',
          kind: 'iceberg',
          status: 'approved',
          schedule: retainedTwap(),
          startedAt: null,
        }) as unknown as ApprovedAlgoParent,
      approve: (parent) => parent,
      start: () => null,
      stop: () => null,
      undeploy: () => null,
      expire: () => null,
      stage: () => null,
    };
    expect(stageApprovedParent({ parentClientOrderId: 'parent-ice', operatorId: OP, parentStore })).toMatchObject({
      ok: false,
      reason: 'unsupported_kind',
    });
  });
});

describe('releaseStagedParentToLive', () => {
  it('staged parent + operator → approved (live), no invented fill', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    const emsStore = new InMemoryEmsOrderStore();
    parentStore.seed(approved({ parentClientOrderId: 'parent-twap', kind: 'twap', residual: { remaining: '1.25' } }));
    expect(stageApprovedParent({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore })).toMatchObject({
      ok: true,
      status: 'staged',
    });
    const out = releaseStagedParentToLive({
      parentClientOrderId: 'parent-twap',
      operatorId: OP,
      parentStore,
      matchingVenueHalt: MATCHING_OPEN,
    });
    expect(out).toEqual({
      ok: true,
      released: true,
      parent: { parentClientOrderId: 'parent-twap', kind: 'twap' },
      status: 'approved',
      executionOwner: OP,
    });
    expect(out).not.toHaveProperty('fill');
    expect(out).not.toHaveProperty('fills');
    expect(out).not.toHaveProperty('children');
    expect(out).not.toHaveProperty('venue');
    expect(out).not.toHaveProperty('venueId');
    expect(parentStore.get('parent-twap')?.status).toBe('approved');
    expect(parentStore.get('parent-twap')?.executionOwner).toBe(OP);
    expect(parentStore.get('parent-twap')?.residual).toEqual({ remaining: '1.25' });
    expect(emsStore.list()).toEqual([]);
  });

  it('missing operator id refuses — never invents a user', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(approved({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    stageApprovedParent({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore });
    expect(releaseStagedParentToLive({ parentClientOrderId: 'parent-twap', parentStore })).toMatchObject({
      ok: false,
      reason: 'missing_operator',
    });
    expect(releaseStagedParentToLive({ parentClientOrderId: 'parent-twap', operatorId: '   ', parentStore })).toMatchObject({
      ok: false,
      reason: 'missing_operator',
    });
    expect(parentStore.get('parent-twap')?.status).toBe('staged');
  });

  it('not_staged when status is approved/running/paper', () => {
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
    parentStore.seed(approved({ parentClientOrderId: 'parent-paper', kind: 'twap', status: 'paper' }));
    expect(releaseStagedParentToLive({ parentClientOrderId: 'parent-approved', operatorId: OP, parentStore })).toMatchObject({
      ok: false,
      reason: 'not_staged',
    });
    expect(releaseStagedParentToLive({ parentClientOrderId: 'parent-run', operatorId: OP, parentStore })).toMatchObject({
      ok: false,
      reason: 'not_staged',
    });
    expect(releaseStagedParentToLive({ parentClientOrderId: 'parent-paper', operatorId: OP, parentStore })).toMatchObject({
      ok: false,
      reason: 'not_staged',
    });
    expect(parentStore.get('parent-approved')?.status).toBe('approved');
  });

  it('other operator cannot release', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(approved({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    stageApprovedParent({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore });
    expect(releaseStagedParentToLive({ parentClientOrderId: 'parent-twap', operatorId: OTHER, parentStore })).toMatchObject({
      ok: false,
      reason: 'not_owner',
    });
    expect(parentStore.get('parent-twap')?.status).toBe('staged');
  });

  it('unwired store / missing release method', () => {
    expect(releaseStagedParentToLive({ parentClientOrderId: 'parent-twap', operatorId: OP })).toMatchObject({
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
    expect(releaseStagedParentToLive({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore: unwired })).toMatchObject({
      ok: false,
      reason: 'parent_store_unwired',
    });
  });

  it('missing parent / not_found', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    expect(releaseStagedParentToLive({ parentStore, operatorId: OP })).toMatchObject({
      ok: false,
      reason: 'missing_parent',
    });
    expect(releaseStagedParentToLive({ parentClientOrderId: 'missing', operatorId: OP, parentStore })).toMatchObject({
      ok: false,
      reason: 'not_found',
    });
  });

  it('matching halt-all refuses venue_halted; missing source refuses; parent stays staged', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(approved({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    stageApprovedParent({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore });
    expect(
      releaseStagedParentToLive({
        parentClientOrderId: 'parent-twap',
        operatorId: OP,
        parentStore,
        matchingVenueHalt: MATCHING_HALTED,
      }),
    ).toMatchObject({ ok: false, reason: 'venue_halted' });
    expect(releaseStagedParentToLive({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore })).toMatchObject({
      ok: false,
      reason: 'venue_halt_unavailable',
    });
    expect(parentStore.get('parent-twap')?.status).toBe('staged');
  });
});

describe('slice while staged', () => {
  it('refuses — submit is not called, no invented fill', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(approved({ parentClientOrderId: 'parent-twap', kind: 'twap', residual: { remaining: '10' } }));
    stageApprovedParent({ parentClientOrderId: 'parent-twap', operatorId: OP, parentStore });
    const street = trackingSubmit();
    const out = await sliceLiveAlgoParent({
      parentClientOrderId: 'parent-twap',
      ...sliceFields,
      parentStore,
      submit: street.submit,
    });
    expect(out).toMatchObject({ ok: false, reason: 'staged' });
    expect(street.calls).toEqual([]);
    expect(parentStore.get('parent-twap')?.status).toBe('staged');
    expect(parentStore.get('parent-twap')?.residual).toEqual({ remaining: '10' });
  });
});

describe('execution.oms.stage / release tRPC', () => {
  it('doors exist (admin:write) and refuse anonymous stage/release', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const caller = router.createCaller(hmacSigned());
    expect(typeof caller.execution.oms.stage).toBe('function');
    expect(typeof caller.execution.oms.release).toBe('function');
    expect(await caller.execution.oms.stage({ parentClientOrderId: 'parent-1' })).toMatchObject({
      ok: false,
      reason: 'not_found',
    });
    expect(await caller.execution.oms.release({ parentClientOrderId: 'parent-1' })).toMatchObject({
      ok: false,
      reason: 'not_found',
    });
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(router.createCaller(anon).execution.oms.stage({ parentClientOrderId: 'parent-1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    await expect(router.createCaller(anon).execution.oms.release({ parentClientOrderId: 'parent-1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('stages then releases through the injected store — no venue, no fill', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(approved({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    const caller = withStore(parentStore).createCaller(hmacSigned());
    const staged = await caller.execution.oms.stage({ parentClientOrderId: 'parent-1' });
    expect(staged).toEqual({
      ok: true,
      staged: true,
      parent: { parentClientOrderId: 'parent-1', kind: 'twap' },
      status: 'staged',
      executionOwner: OP,
      children: [],
    });
    expect(staged).not.toHaveProperty('fill');
    expect(parentStore.get('parent-1')?.status).toBe('staged');

    const sliced = await caller.execution.oms.slice({
      parentClientOrderId: 'parent-1',
      amount: '0.5',
      venueId: 'street',
      symbol: 'BTC/USDT',
      side: 'buy',
      limitPrice: '100',
    });
    expect(sliced).toMatchObject({ ok: false, reason: 'staged' });

    const released = await caller.execution.oms.release({ parentClientOrderId: 'parent-1' });
    expect(released).toEqual({
      ok: true,
      released: true,
      parent: { parentClientOrderId: 'parent-1', kind: 'twap' },
      status: 'approved',
      executionOwner: OP,
    });
    expect(released).not.toHaveProperty('fill');
    expect(released).not.toHaveProperty('venue');
    expect(parentStore.get('parent-1')?.status).toBe('approved');
  });

  it('body operatorId is ignored — signed principal is the operator', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(approved({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    const caller = withStore(parentStore).createCaller(hmacSigned());
    const staged = await caller.execution.oms.stage({
      parentClientOrderId: 'parent-1',
      operatorId: OTHER,
    } as { parentClientOrderId: string });
    expect(staged).toMatchObject({ ok: true, executionOwner: OP });
    expect(parentStore.get('parent-1')?.executionOwner).toBe(OP);
    const released = await caller.execution.oms.release({
      parentClientOrderId: 'parent-1',
      operatorId: OTHER,
    } as { parentClientOrderId: string });
    expect(released).toMatchObject({ ok: true, executionOwner: OP });
  });
});
