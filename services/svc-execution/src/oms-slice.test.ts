import { describe, expect, it } from 'vitest';
import { parseAmount, ZERO } from '@intafaced/ledger-client';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import type { SubmitRequest, VenueExecution } from '@intafaced/venue-adapter';
import {
  InMemoryApprovedAlgoParentStore,
  type ApprovedAlgoParent,
  type ApprovedAlgoParentStore,
  type RetainedAlgoSchedule,
} from './oms-start.js';
import { sliceLiveAlgoParent } from './oms-slice.js';
import type { OmsSubmitFn } from './oms-trade-submit.js';
import { InMemoryAlgoPauseStore } from './oms-pause.js';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-oms-slice-test-edge-secret';
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

function live(
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
};

describe('sliceLiveAlgoParent', () => {
  it('live parent + explicit slice qty → submit called once', async () => {
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
    parentStore.seed(live({ parentClientOrderId: 'parent-pov', kind: 'pov' }));

    const twapSubmit = trackingSubmit();
    const twap = await sliceLiveAlgoParent({
      parentClientOrderId: 'parent-twap',
      ...sliceFields,
      parentStore,
      submit: twapSubmit.submit,
    });
    expect(twap).toMatchObject({
      ok: true,
      sliced: true,
      parent: { parentClientOrderId: 'parent-twap', kind: 'twap' },
      child: { venueId: 'street' },
    });
    expect(twapSubmit.calls).toHaveLength(1);
    expect(twapSubmit.calls[0]).toEqual({
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: parseAmount('0.5'),
      limitPrice: parseAmount('100'),
      clientOrderId: twapSubmit.calls[0]!.clientOrderId,
    });
    if (!twap.ok) return;
    expect(twap.child.clientOrderId).toBe(twapSubmit.calls[0]!.clientOrderId);
    expect(twap.execution.venueOrderId).toBe('v-slice-1');

    const vwapSubmit = trackingSubmit();
    const vwap = await sliceLiveAlgoParent({
      parentClientOrderId: 'parent-vwap',
      ...sliceFields,
      amount: '1.25',
      parentStore,
      submit: vwapSubmit.submit,
    });
    expect(vwap).toMatchObject({ ok: true, parent: { kind: 'vwap' } });
    expect(vwapSubmit.calls).toHaveLength(1);
    expect(vwapSubmit.calls[0]?.amount).toBe(parseAmount('1.25'));

    const povSubmit = trackingSubmit();
    const pov = await sliceLiveAlgoParent({
      parentClientOrderId: 'parent-pov',
      ...sliceFields,
      side: 'sell',
      parentStore,
      submit: povSubmit.submit,
    });
    expect(pov).toMatchObject({ ok: true, parent: { kind: 'pov' } });
    expect(povSubmit.calls).toHaveLength(1);
    expect(povSubmit.calls[0]?.side).toBe('sell');
  });

  it('paper parent refuses — submit is not called', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-paper', kind: 'twap', status: 'paper' }));
    const street = trackingSubmit();
    const out = await sliceLiveAlgoParent({
      parentClientOrderId: 'parent-paper',
      ...sliceFields,
      parentStore,
      submit: street.submit,
    });
    expect(out).toMatchObject({ ok: false, reason: 'paper' });
    expect(street.calls).toEqual([]);
  });

  it('not-live (stopped/expired/undeployed) refuses — submit is not called', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-stop', kind: 'twap', status: 'stopped' }));
    parentStore.seed(live({ parentClientOrderId: 'parent-exp', kind: 'twap', status: 'expired' }));
    parentStore.seed(live({ parentClientOrderId: 'parent-und', kind: 'twap', status: 'undeployed' }));
    const street = trackingSubmit();
    expect(
      await sliceLiveAlgoParent({
        parentClientOrderId: 'parent-stop',
        ...sliceFields,
        parentStore,
        submit: street.submit,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      await sliceLiveAlgoParent({
        parentClientOrderId: 'parent-exp',
        ...sliceFields,
        parentStore,
        submit: street.submit,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      await sliceLiveAlgoParent({
        parentClientOrderId: 'parent-und',
        ...sliceFields,
        parentStore,
        submit: street.submit,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(street.calls).toEqual([]);
  });

  it('missing qty refuses — never invents size from duration or slicesPlanned', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(
      live({
        parentClientOrderId: 'parent-twap',
        kind: 'twap',
        schedule: { durationMs: 60_000, sliceIntervalMs: 10_000, slicesPlanned: 6, participationBps: null },
      }),
    );
    const street = trackingSubmit();
    expect(
      await sliceLiveAlgoParent({
        parentClientOrderId: 'parent-twap',
        venueId: 'street',
        symbol: 'BTC/USDT',
        side: 'buy',
        limitPrice: '100',
        parentStore,
        submit: street.submit,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_qty' });
    expect(
      await sliceLiveAlgoParent({
        parentClientOrderId: 'parent-twap',
        amount: '   ',
        venueId: 'street',
        symbol: 'BTC/USDT',
        side: 'buy',
        limitPrice: '100',
        parentStore,
        submit: street.submit,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_qty' });
    expect(
      await sliceLiveAlgoParent({
        parentClientOrderId: 'parent-twap',
        amount: 'not-an-amount',
        venueId: 'street',
        symbol: 'BTC/USDT',
        side: 'buy',
        limitPrice: '100',
        parentStore,
        submit: street.submit,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_qty' });
    expect(
      await sliceLiveAlgoParent({
        parentClientOrderId: 'parent-twap',
        amount: '0',
        venueId: 'street',
        symbol: 'BTC/USDT',
        side: 'buy',
        limitPrice: '100',
        parentStore,
        submit: street.submit,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_qty' });
    expect(street.calls).toEqual([]);
  });

  it('missing parent / not_found', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    const street = trackingSubmit();
    expect(await sliceLiveAlgoParent({ parentStore, submit: street.submit, ...sliceFields })).toMatchObject({
      ok: false,
      reason: 'missing_parent',
    });
    expect(
      await sliceLiveAlgoParent({
        parentClientOrderId: '   ',
        parentStore,
        submit: street.submit,
        ...sliceFields,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      await sliceLiveAlgoParent({
        parentClientOrderId: 'missing',
        parentStore,
        submit: street.submit,
        ...sliceFields,
      }),
    ).toMatchObject({ ok: false, reason: 'not_found' });
    expect(street.calls).toEqual([]);
  });

  it('refuses inventing venue or price', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    const street = trackingSubmit();
    expect(
      await sliceLiveAlgoParent({
        parentClientOrderId: 'parent-twap',
        amount: '0.5',
        symbol: 'BTC/USDT',
        side: 'buy',
        limitPrice: '100',
        parentStore,
        submit: street.submit,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_venue' });
    expect(
      await sliceLiveAlgoParent({
        parentClientOrderId: 'parent-twap',
        amount: '0.5',
        venueId: 'street',
        symbol: 'BTC/USDT',
        side: 'buy',
        parentStore,
        submit: street.submit,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_price' });
    expect(
      await sliceLiveAlgoParent({
        parentClientOrderId: 'parent-twap',
        amount: '0.5',
        venueId: 'street',
        symbol: 'BTC/USDT',
        side: 'buy',
        limitPrice: 'not-a-price',
        parentStore,
        submit: street.submit,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_price' });
    expect(street.calls).toEqual([]);
  });

  it('unwired store / unwired submit', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    expect(await sliceLiveAlgoParent({ parentClientOrderId: 'parent-twap', ...sliceFields })).toMatchObject({
      ok: false,
      reason: 'parent_store_unwired',
    });
    expect(
      await sliceLiveAlgoParent({
        parentClientOrderId: 'parent-twap',
        ...sliceFields,
        parentStore,
      }),
    ).toMatchObject({ ok: false, reason: 'submit_unwired' });
    const unwired: ApprovedAlgoParentStore = {
      get: () => parentStore.get('parent-twap'),
      approve: (parent) => parent,
      start: () => null,
      stop: () => null,
      undeploy: () => null,
      expire: () => null,
    };
    const street = trackingSubmit();
    expect(
      await sliceLiveAlgoParent({
        parentClientOrderId: 'parent-twap',
        ...sliceFields,
        parentStore: unwired,
        submit: street.submit,
      }),
    ).toMatchObject({ ok: true, sliced: true });
  });

  it('paused live parent refuses a new child', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    const pauseStore = new InMemoryAlgoPauseStore();
    pauseStore.pause({ kind: 'parent', id: 'parent-twap' });
    const street = trackingSubmit();
    expect(
      await sliceLiveAlgoParent({
        parentClientOrderId: 'parent-twap',
        ...sliceFields,
        parentStore,
        pauseStore,
        submit: street.submit,
      }),
    ).toMatchObject({ ok: false, reason: 'algo_paused' });
    expect(street.calls).toEqual([]);
  });

  it('submitByVenue uses the named venue once — never a second invented child', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    const street = trackingSubmit();
    const other = trackingSubmit();
    const out = await sliceLiveAlgoParent({
      parentClientOrderId: 'parent-twap',
      ...sliceFields,
      parentStore,
      submitByVenue: { street: street.submit, other: other.submit },
    });
    expect(out.ok).toBe(true);
    expect(street.calls).toHaveLength(1);
    expect(other.calls).toEqual([]);
  });
});

describe('execution.oms.slice tRPC', () => {
  it('door exists (admin:write) and refuses anonymous slice', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const caller = router.createCaller(signed());
    expect(typeof caller.execution.oms.slice).toBe('function');
    const out = await caller.execution.oms.slice({ parentClientOrderId: 'parent-1', ...sliceFields });
    expect(out).toMatchObject({ ok: false, reason: 'not_found' });
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(router.createCaller(anon).execution.oms.slice({ parentClientOrderId: 'parent-1', ...sliceFields })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('slices a live parent through the injected store and submit bridge', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    const street = trackingSubmit();
    const caller = createExecutionRouter(
      new SealedHouseTenantRegistry(),
      { street: street.submit },
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
    ).createCaller(signed());
    const out = await caller.execution.oms.slice({
      parentClientOrderId: 'parent-1',
      ...sliceFields,
    });
    expect(out).toMatchObject({
      ok: true,
      sliced: true,
      parent: { parentClientOrderId: 'parent-1', kind: 'twap' },
      child: { venueId: 'street' },
    });
    expect(street.calls).toHaveLength(1);
    expect(street.calls[0]?.amount).toBe(parseAmount('0.5'));
    expect(parentStore.get('parent-1')?.status).toBe('approved');
  });
});
