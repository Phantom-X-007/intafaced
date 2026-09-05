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
import { createExecutionRouter } from './router.js';

const MATCHING_OPEN = { venueHalted: false } as const;
const MATCHING_HALTED = { venueHalted: true } as const;

const SECRET = 'a-execution-oms-start-test-edge-secret';
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

describe('startApprovedAlgoParent', () => {
  it('jobs off refuses even with an approved parent', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(approved({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    expect(
      startApprovedAlgoParent({
        parentClientOrderId: 'parent-twap',
        parentStore,
        jobs: { enabled: false },
      }),
    ).toMatchObject({ ok: false, reason: 'jobs_off' });
    expect(parentStore.get('parent-twap')?.status).toBe('approved');
  });

  it('jobs unwired / store unwired', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(approved({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    expect(startApprovedAlgoParent({ parentClientOrderId: 'parent-twap', parentStore })).toMatchObject({
      ok: false,
      reason: 'jobs_gate_unwired',
    });
    expect(startApprovedAlgoParent({ parentClientOrderId: 'parent-twap', jobs: { enabled: true } })).toMatchObject({
      ok: false,
      reason: 'parent_store_unwired',
    });
  });

  it('missing parent id', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    expect(startApprovedAlgoParent({ parentStore, jobs: { enabled: true } })).toMatchObject({
      ok: false,
      reason: 'missing_parent',
    });
    expect(startApprovedAlgoParent({ parentClientOrderId: '   ', parentStore, jobs: { enabled: true } })).toMatchObject({
      ok: false,
      reason: 'missing_parent',
    });
  });

  it('not_found when the store has no row', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    expect(
      startApprovedAlgoParent({
        parentClientOrderId: 'missing',
        parentStore,
        jobs: { enabled: true },
      }),
    ).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('not_approved when status is not approved', () => {
    const parentStore: ApprovedAlgoParentStore = {
      get: () =>
        ({
          parentClientOrderId: 'parent-held',
          kind: 'twap',
          status: 'held',
          schedule: retainedTwap(),
          startedAt: null,
        }) as ApprovedAlgoParent,
      approve: (parent) => parent,
      start: () => null,
      stop: () => null,
      undeploy: () => null,
      expire: () => null,
    };
    expect(
      startApprovedAlgoParent({
        parentClientOrderId: 'parent-held',
        parentStore,
        jobs: { enabled: true },
      }),
    ).toMatchObject({ ok: false, reason: 'not_approved' });
  });

  it('already_started when status is running', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed({
      ...approved({ parentClientOrderId: 'parent-run', kind: 'twap' }),
      status: 'running',
      startedAt: '2026-08-25T00:00:00.000Z',
    });
    expect(
      startApprovedAlgoParent({
        parentClientOrderId: 'parent-run',
        parentStore,
        jobs: { enabled: true },
      }),
    ).toMatchObject({ ok: false, reason: 'already_started' });
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
        }) as ApprovedAlgoParent,
      approve: (parent) => parent,
      start: () => null,
      stop: () => null,
      undeploy: () => null,
      expire: () => null,
    };
    expect(
      startApprovedAlgoParent({
        parentClientOrderId: 'parent-ice',
        parentStore,
        jobs: { enabled: true },
      }),
    ).toMatchObject({ ok: false, reason: 'unsupported_kind' });
  });

  it('missing_schedule for zero duration / POV without bps', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(
      approved({
        parentClientOrderId: 'parent-zero',
        kind: 'twap',
        schedule: { durationMs: 0, sliceIntervalMs: 10_000, slicesPlanned: 6, participationBps: null },
      }),
    );
    parentStore.seed(
      approved({
        parentClientOrderId: 'parent-pov-nobs',
        kind: 'pov',
        schedule: { durationMs: 90_000, sliceIntervalMs: 5_000, slicesPlanned: 18, participationBps: null },
      }),
    );
    expect(
      startApprovedAlgoParent({
        parentClientOrderId: 'parent-zero',
        parentStore,
        jobs: { enabled: true },
      }),
    ).toMatchObject({ ok: false, reason: 'missing_schedule' });
    expect(
      startApprovedAlgoParent({
        parentClientOrderId: 'parent-pov-nobs',
        parentStore,
        jobs: { enabled: true },
      }),
    ).toMatchObject({ ok: false, reason: 'missing_schedule' });
  });

  it('happy TWAP, VWAP, POV: jobs on + approved + retained schedule → ok, echo, running', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    const now = new Date('2026-08-25T12:00:00.000Z');
    parentStore.seed(approved({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    parentStore.seed(approved({ parentClientOrderId: 'parent-vwap', kind: 'vwap' }));
    parentStore.seed(approved({ parentClientOrderId: 'parent-pov', kind: 'pov' }));

    const twap = startApprovedAlgoParent({
      parentClientOrderId: 'parent-twap',
      operatorId: OP,
      parentStore,
      jobs: { enabled: true },
      matchingVenueHalt: MATCHING_OPEN,
      now,
    });
    const vwap = startApprovedAlgoParent({
      parentClientOrderId: 'parent-vwap',
      operatorId: OP,
      parentStore,
      jobs: { enabled: true },
      matchingVenueHalt: MATCHING_OPEN,
      now,
    });
    const pov = startApprovedAlgoParent({
      parentClientOrderId: 'parent-pov',
      operatorId: OP,
      parentStore,
      jobs: { enabled: true },
      matchingVenueHalt: MATCHING_OPEN,
      now,
    });

    expect(twap).toEqual({
      ok: true,
      started: true,
      parentClientOrderId: 'parent-twap',
      kind: 'twap',
      status: 'running',
      schedule: retainedTwap(),
      startedAt: '2026-08-25T12:00:00.000Z',
    });
    expect(vwap).toEqual({
      ok: true,
      started: true,
      parentClientOrderId: 'parent-vwap',
      kind: 'vwap',
      status: 'running',
      schedule: retainedVwap(),
      startedAt: '2026-08-25T12:00:00.000Z',
    });
    expect(pov).toEqual({
      ok: true,
      started: true,
      parentClientOrderId: 'parent-pov',
      kind: 'pov',
      status: 'running',
      schedule: retainedPov(),
      startedAt: '2026-08-25T12:00:00.000Z',
    });
    expect(parentStore.get('parent-twap')?.status).toBe('running');
    expect(parentStore.get('parent-vwap')?.status).toBe('running');
    expect(parentStore.get('parent-pov')?.status).toBe('running');
    expect(parentStore.get('parent-twap')?.executionOwner).toBe(OP);
    expect(parentStore.get('parent-vwap')?.executionOwner).toBe(OP);
    expect(parentStore.get('parent-pov')?.executionOwner).toBe(OP);
  });

  it('missing operator refuses — unsigned cannot go live', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(approved({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    expect(
      startApprovedAlgoParent({
        parentClientOrderId: 'parent-twap',
        parentStore,
        jobs: { enabled: true },
      }),
    ).toMatchObject({ ok: false, reason: 'missing_operator' });
    expect(
      startApprovedAlgoParent({
        parentClientOrderId: 'parent-twap',
        operatorId: '   ',
        parentStore,
        jobs: { enabled: true },
      }),
    ).toMatchObject({ ok: false, reason: 'missing_operator' });
    expect(parentStore.get('parent-twap')?.status).toBe('approved');
    expect(parentStore.get('parent-twap')?.executionOwner ?? null).toBeNull();
  });

  it('owned parent refuses a second operator', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(approved({ parentClientOrderId: 'parent-twap', kind: 'twap', executionOwner: OP, originator: OP }));
    expect(
      startApprovedAlgoParent({
        parentClientOrderId: 'parent-twap',
        operatorId: OTHER,
        parentStore,
        jobs: { enabled: true },
      }),
    ).toMatchObject({ ok: false, reason: 'not_owner' });
    expect(parentStore.get('parent-twap')?.status).toBe('approved');
    expect(
      startApprovedAlgoParent({
        parentClientOrderId: 'parent-twap',
        operatorId: OP,
        parentStore,
        jobs: { enabled: true },
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: true, status: 'running' });
    expect(parentStore.get('parent-twap')?.executionOwner).toBe(OP);
  });

  it('start does not rewrite duration/interval/slices/participation', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    const retained: RetainedAlgoSchedule = {
      durationMs: 12_345,
      sliceIntervalMs: 678,
      slicesPlanned: 3,
      participationBps: 42,
    };
    parentStore.seed(
      approved({
        parentClientOrderId: 'parent-odd',
        kind: 'pov',
        schedule: retained,
      }),
    );
    const result = startApprovedAlgoParent({
      parentClientOrderId: 'parent-odd',
      operatorId: OP,
      parentStore,
      jobs: { enabled: true },
      matchingVenueHalt: MATCHING_OPEN,
      now: new Date('2026-08-25T12:00:00.000Z'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.schedule).toEqual(retained);
    expect(parentStore.get('parent-odd')?.schedule).toEqual(retained);
  });

  it('expireAt is optional on approve/start; clone copies it when present', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(approved({ parentClientOrderId: 'parent-no-exp', kind: 'twap' }));
    const started = startApprovedAlgoParent({
      parentClientOrderId: 'parent-no-exp',
      operatorId: OP,
      parentStore,
      jobs: { enabled: true },
      matchingVenueHalt: MATCHING_OPEN,
      now: new Date('2026-08-25T12:00:00.000Z'),
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.schedule.expireAt).toBeUndefined();

    const withExpire: RetainedAlgoSchedule = {
      ...retainedTwap(),
      expireAt: '2026-08-25T18:00:00.000Z',
    };
    parentStore.seed(approved({ parentClientOrderId: 'parent-exp', kind: 'twap', schedule: withExpire }));
    const kept = startApprovedAlgoParent({
      parentClientOrderId: 'parent-exp',
      operatorId: OP,
      parentStore,
      jobs: { enabled: true },
      matchingVenueHalt: MATCHING_OPEN,
      now: new Date('2026-08-25T12:00:00.000Z'),
    });
    expect(kept.ok).toBe(true);
    if (!kept.ok) return;
    expect(kept.schedule).toEqual(withExpire);
    expect(parentStore.get('parent-exp')?.schedule.expireAt).toBe('2026-08-25T18:00:00.000Z');
  });

  it('store.expire marks expired only when schedule.expireAt is already on the row', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(approved({ parentClientOrderId: 'parent-no-exp', kind: 'twap' }));
    parentStore.seed(
      approved({
        parentClientOrderId: 'parent-exp',
        kind: 'twap',
        schedule: { ...retainedTwap(), expireAt: '2026-08-25T18:00:00.000Z' },
      }),
    );
    expect(parentStore.expire('missing')).toBeNull();
    expect(parentStore.expire('parent-no-exp')).toBeNull();
    expect(parentStore.get('parent-no-exp')?.status).toBe('approved');
    const expired = parentStore.expire('parent-exp');
    expect(expired?.status).toBe('expired');
    expect(expired?.schedule.expireAt).toBe('2026-08-25T18:00:00.000Z');
    expect(parentStore.get('parent-exp')?.status).toBe('expired');
  });

  it('matching halt-all refuses venue_halted; missing source refuses; parent stays approved', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(approved({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    parentStore.seed(approved({ parentClientOrderId: 'parent-vwap', kind: 'vwap' }));
    parentStore.seed(approved({ parentClientOrderId: 'parent-pov', kind: 'pov' }));
    for (const id of ['parent-twap', 'parent-vwap', 'parent-pov'] as const) {
      expect(
        startApprovedAlgoParent({
          parentClientOrderId: id,
          operatorId: OP,
          parentStore,
          jobs: { enabled: true },
          matchingVenueHalt: MATCHING_HALTED,
        }),
      ).toMatchObject({ ok: false, reason: 'venue_halted' });
      expect(
        startApprovedAlgoParent({
          parentClientOrderId: id,
          operatorId: OP,
          parentStore,
          jobs: { enabled: true },
        }),
      ).toMatchObject({ ok: false, reason: 'venue_halt_unavailable' });
      expect(parentStore.get(id)?.status).toBe('approved');
    }
  });
});

describe('execution.oms.start tRPC', () => {
  it('door exists (admin:write) and returns jobs_off when default jobs gate is off', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const caller = router.createCaller(hmacSigned());
    const out = await caller.execution.oms.start({ parentClientOrderId: 'parent-1' });
    expect(out).toMatchObject({ ok: false, reason: 'jobs_off' });
  });

  it('refuses anonymous start', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(router.createCaller(anon).execution.oms.start({ parentClientOrderId: 'parent-1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('starts from signed principal and binds that operator', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(approved({ parentClientOrderId: 'parent-1', kind: 'twap' }));
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
      { enabled: false },
      undefined,
      undefined,
      undefined,
      MATCHING_OPEN,
    ).createCaller(hmacSigned());
    const out = await caller.execution.oms.start({ parentClientOrderId: 'parent-1' });
    expect(out).toMatchObject({ ok: true, started: true, status: 'running' });
    expect(parentStore.get('parent-1')?.executionOwner).toBe(OP);
  });

  it('body operatorId is ignored — signed principal is the operator', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(approved({ parentClientOrderId: 'parent-1', kind: 'twap' }));
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
      { enabled: false },
      undefined,
      undefined,
      undefined,
      MATCHING_OPEN,
    ).createCaller(hmacSigned());
    const out = await caller.execution.oms.start({
      parentClientOrderId: 'parent-1',
      operatorId: OTHER,
    } as { parentClientOrderId: string });
    expect(out).toMatchObject({ ok: true, started: true, status: 'running' });
    expect(parentStore.get('parent-1')?.executionOwner).toBe(OP);
  });

  it('jobs on + matching halt-all refuses venue_halted at the tRPC door', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(approved({ parentClientOrderId: 'parent-1', kind: 'twap' }));
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
      { enabled: false },
      undefined,
      undefined,
      undefined,
      MATCHING_HALTED,
    ).createCaller(hmacSigned());
    expect(await caller.execution.oms.start({ parentClientOrderId: 'parent-1' })).toMatchObject({
      ok: false,
      reason: 'venue_halted',
    });
    expect(parentStore.get('parent-1')?.status).toBe('approved');
  });
});
