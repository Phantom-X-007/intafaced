import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import {
  InMemoryApprovedAlgoParentStore,
  type ApprovedAlgoParent,
  type ApprovedAlgoParentStore,
  type RetainedAlgoSchedule,
} from './oms-start.js';
import { releaseExpiredParentResidual } from './oms-release-residual.js';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-oms-release-residual-test-edge-secret';
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

function expired(
  over: Partial<ApprovedAlgoParent> &
    Pick<ApprovedAlgoParent, 'parentClientOrderId' | 'kind'> & {
      schedule?: RetainedAlgoSchedule;
    },
): ApprovedAlgoParent {
  const schedule = over.schedule ?? (over.kind === 'pov' ? retainedPov() : over.kind === 'vwap' ? retainedVwap() : retainedTwap());
  return {
    status: 'expired',
    startedAt: '2026-08-25T12:00:00.000Z',
    ...over,
    schedule,
  };
}

describe('releaseExpiredParentResidual', () => {
  it('releases leftover already on an expired parent and echoes it via ledger-client', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    const leftover = '1.25';
    parentStore.seed(
      expired({
        parentClientOrderId: 'parent-twap',
        kind: 'twap',
        residual: { remaining: leftover },
      }),
    );
    parentStore.seed(
      expired({
        parentClientOrderId: 'parent-vwap',
        kind: 'vwap',
        residual: { remaining: '0.5' },
      }),
    );
    parentStore.seed(
      expired({
        parentClientOrderId: 'parent-pov',
        kind: 'pov',
        residual: { remaining: '2' },
      }),
    );

    const twap = releaseExpiredParentResidual({ parentClientOrderId: 'parent-twap', parentStore });
    const vwap = releaseExpiredParentResidual({ parentClientOrderId: 'parent-vwap', parentStore });
    const pov = releaseExpiredParentResidual({ parentClientOrderId: 'parent-pov', parentStore });

    expect(twap).toEqual({
      ok: true,
      released: true,
      parent: { parentClientOrderId: 'parent-twap', kind: 'twap' },
      status: 'expired',
      residual: { remaining: formatAmount(parseAmount(leftover)), released: true },
    });
    expect(vwap).toMatchObject({
      ok: true,
      released: true,
      parent: { parentClientOrderId: 'parent-vwap', kind: 'vwap' },
      residual: { remaining: formatAmount(parseAmount('0.5')), released: true },
    });
    expect(pov).toMatchObject({
      ok: true,
      released: true,
      parent: { kind: 'pov' },
      residual: { remaining: formatAmount(parseAmount('2')), released: true },
    });
    expect(parentStore.get('parent-twap')?.residual).toEqual({ remaining: leftover, released: true });
    expect(parentStore.get('parent-vwap')?.residual?.released).toBe(true);
    expect(parentStore.get('parent-pov')?.residual?.released).toBe(true);
  });

  it('refuses missing residual — null, empty, or absent leftover', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(expired({ parentClientOrderId: 'parent-none', kind: 'twap' }));
    parentStore.seed(
      expired({
        parentClientOrderId: 'parent-null',
        kind: 'twap',
        residual: null,
      }),
    );
    parentStore.seed(
      expired({
        parentClientOrderId: 'parent-empty',
        kind: 'twap',
        residual: { remaining: '   ' },
      }),
    );
    expect(releaseExpiredParentResidual({ parentClientOrderId: 'parent-none', parentStore })).toMatchObject({
      ok: false,
      reason: 'missing_residual',
    });
    expect(releaseExpiredParentResidual({ parentClientOrderId: 'parent-null', parentStore })).toMatchObject({
      ok: false,
      reason: 'missing_residual',
    });
    expect(releaseExpiredParentResidual({ parentClientOrderId: 'parent-empty', parentStore })).toMatchObject({
      ok: false,
      reason: 'missing_residual',
    });
    expect(parentStore.get('parent-none')?.residual).toBeUndefined();
  });

  it('refuses inventing amount — no leftover does not compute one from duration', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(
      expired({
        parentClientOrderId: 'parent-dur',
        kind: 'twap',
        startedAt: '2026-08-25T12:00:00.000Z',
        schedule: { durationMs: 60_000, sliceIntervalMs: 10_000, slicesPlanned: 6, participationBps: null },
      }),
    );
    const out = releaseExpiredParentResidual({
      parentClientOrderId: 'parent-dur',
      parentStore,
    });
    expect(out).toMatchObject({ ok: false, reason: 'missing_residual' });
    expect(parentStore.get('parent-dur')?.status).toBe('expired');
    expect(parentStore.get('parent-dur')?.residual).toBeUndefined();
  });

  it('not_expired — this door does not expire a live parent', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(
      expired({
        parentClientOrderId: 'parent-live',
        kind: 'twap',
        status: 'approved',
        startedAt: null,
        residual: { remaining: '1.25' },
      }),
    );
    parentStore.seed(
      expired({
        parentClientOrderId: 'parent-run',
        kind: 'twap',
        status: 'running',
        residual: { remaining: '1.25' },
      }),
    );
    expect(releaseExpiredParentResidual({ parentClientOrderId: 'parent-live', parentStore })).toMatchObject({
      ok: false,
      reason: 'not_expired',
    });
    expect(releaseExpiredParentResidual({ parentClientOrderId: 'parent-run', parentStore })).toMatchObject({
      ok: false,
      reason: 'not_expired',
    });
    expect(parentStore.get('parent-live')?.status).toBe('approved');
    expect(parentStore.get('parent-live')?.residual?.released).toBeUndefined();
  });

  it('already_released', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(
      expired({
        parentClientOrderId: 'parent-done',
        kind: 'twap',
        residual: { remaining: '1.25', released: true },
      }),
    );
    expect(releaseExpiredParentResidual({ parentClientOrderId: 'parent-done', parentStore })).toMatchObject({
      ok: false,
      reason: 'already_released',
    });
  });

  it('unsupported_kind is refused', () => {
    const parentStore: ApprovedAlgoParentStore = {
      get: () =>
        ({
          parentClientOrderId: 'parent-ice',
          kind: 'iceberg',
          status: 'expired',
          schedule: retainedTwap(),
          startedAt: null,
          residual: { remaining: '1.25' },
        }) as ApprovedAlgoParent,
      approve: (parent) => parent,
      start: () => null,
      stop: () => null,
      undeploy: () => null,
      expire: () => null,
      releaseResidual: () => null,
    };
    expect(releaseExpiredParentResidual({ parentClientOrderId: 'parent-ice', parentStore })).toMatchObject({
      ok: false,
      reason: 'unsupported_kind',
    });
  });

  it('store unwired / missing parent / not_found', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    expect(releaseExpiredParentResidual({ parentClientOrderId: 'parent-1' })).toMatchObject({
      ok: false,
      reason: 'parent_store_unwired',
    });
    expect(releaseExpiredParentResidual({ parentStore })).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(releaseExpiredParentResidual({ parentClientOrderId: '   ', parentStore })).toMatchObject({
      ok: false,
      reason: 'missing_parent',
    });
    expect(releaseExpiredParentResidual({ parentClientOrderId: 'missing', parentStore })).toMatchObject({
      ok: false,
      reason: 'not_found',
    });
  });
});

describe('execution.oms.releaseResidual tRPC', () => {
  it('door exists (admin:write) and refuses anonymous releaseResidual', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const caller = router.createCaller(hmacSigned());
    expect(typeof caller.execution.oms.releaseResidual).toBe('function');
    const out = await caller.execution.oms.releaseResidual({ parentClientOrderId: 'parent-1' });
    expect(out).toMatchObject({ ok: false, reason: 'not_found' });
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(router.createCaller(anon).execution.oms.releaseResidual({ parentClientOrderId: 'parent-1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('releases leftover through the injected store via ledger-client', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    const leftover = '1.25';
    parentStore.seed(
      expired({
        parentClientOrderId: 'parent-1',
        kind: 'twap',
        residual: { remaining: leftover },
      }),
    );
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
    const out = await caller.execution.oms.releaseResidual({ parentClientOrderId: 'parent-1' });
    expect(out).toEqual({
      ok: true,
      released: true,
      parent: { parentClientOrderId: 'parent-1', kind: 'twap' },
      status: 'expired',
      residual: { remaining: formatAmount(parseAmount(leftover)), released: true },
    });
    expect(parentStore.get('parent-1')?.residual).toEqual({ remaining: leftover, released: true });
  });
});
