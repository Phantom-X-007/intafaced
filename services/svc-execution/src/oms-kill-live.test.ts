import { describe, expect, it } from 'vitest';
import { parseAmount, ZERO } from '@intafaced/ledger-client';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import type { VenueOrder } from '@intafaced/venue-contracts';
import type { OmsCancelFn } from './oms-cancel.js';
import { InMemoryEmsOrderStore } from './oms-ems-store.js';
import {
  InMemoryApprovedAlgoParentStore,
  type ApprovedAlgoParent,
  type ApprovedAlgoParentStore,
  type RetainedAlgoSchedule,
} from './oms-start.js';
import { killLiveAlgoParent } from './oms-kill-live.js';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-oms-kill-live-test-edge-secret';
const OP = '33333333-3333-4333-8333-333333333333';
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-execution' });
const now = new Date('2026-08-25T00:00:00.000Z');

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

function live(
  over: Partial<ApprovedAlgoParent> &
    Pick<ApprovedAlgoParent, 'parentClientOrderId' | 'kind'> & {
      schedule?: RetainedAlgoSchedule;
    },
): ApprovedAlgoParent {
  return {
    status: 'running',
    startedAt: '2026-08-25T12:00:00.000Z',
    ...over,
    schedule: over.schedule ?? retainedTwap(),
  };
}

function venueOrder(over: Partial<VenueOrder> = {}): VenueOrder {
  return {
    venueId: 'street',
    venueOrderId: 'v-1',
    clientOrderId: 'child-1',
    symbol: 'BTC/USDT',
    side: 'buy',
    type: 'limit',
    price: parseAmount('100'),
    amount: parseAmount('1'),
    filled: ZERO,
    remaining: parseAmount('1'),
    averagePrice: null,
    status: 'canceled',
    feePaid: ZERO,
    feeAsset: 'USDT',
    createdAt: now,
    observedAt: now,
    ...over,
  };
}

class FakeCancel {
  readonly calls: { symbol: string; clientOrderId: string }[] = [];
  constructor(
    private readonly next: VenueOrder | Error,
    readonly id = 'street',
  ) {}
  fn: OmsCancelFn = async (symbol, clientOrderId) => {
    this.calls.push({ symbol, clientOrderId });
    if (this.next instanceof Error) throw this.next;
    return this.next;
  };
}

function seedAck(
  store: InMemoryEmsOrderStore,
  over: {
    clientOrderId?: string;
    parentClientOrderId?: string;
    executionGroupId?: string;
    venueId?: string;
    state?: 'ACKNOWLEDGED' | 'REJECTED' | 'UNWIRED' | 'SUBMIT_UNKNOWN' | 'OUTCOME_UNKNOWN' | 'CANCELED';
  } = {},
) {
  store.record({
    clientOrderId: over.clientOrderId ?? 'child-1',
    parentClientOrderId: over.parentClientOrderId ?? 'parent-1',
    executionGroupId: over.executionGroupId ?? 'algo-1',
    childOrderId: over.clientOrderId ?? 'child-1',
    legIndex: 0,
    venueId: over.venueId ?? 'street',
    symbol: 'BTC/USDT',
    side: 'buy',
    execution: null,
    state: over.state ?? 'ACKNOWLEDGED',
    reconciliationKey: null,
  });
}

function stubStore(over: Partial<ApprovedAlgoParentStore> = {}): ApprovedAlgoParentStore {
  return {
    get: () => null,
    approve: (parent) => parent,
    start: () => null,
    stop: () => null,
    undeploy: () => null,
    expire: () => null,
    ...over,
  };
}

function wired() {
  const parentStore = new InMemoryApprovedAlgoParentStore();
  const emsStore = new InMemoryEmsOrderStore();
  return { parentStore, emsStore };
}

describe('killLiveAlgoParent', () => {
  it('kills a running TWAP parent when venue confirms canceled — killed: true', async () => {
    const { parentStore, emsStore } = wired();
    parentStore.seed(live({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    seedAck(emsStore);
    const street = new FakeCancel(venueOrder());
    const result = await killLiveAlgoParent({
      parentClientOrderId: 'parent-1',
      parentStore,
      emsStore,
      cancelByVenue: { street: street.fn },
    });
    expect(result).toMatchObject({
      ok: true,
      killed: true,
      parent: { parentClientOrderId: 'parent-1', kind: 'twap' },
    });
    if (!result.ok) return;
    expect(result.children).toEqual([
      { clientOrderId: 'child-1', venueId: 'street', outcome: 'stopped', status: 'canceled' },
    ]);
    expect(result.residual).toEqual({ filled: '0', remaining: '1' });
    expect(street.calls).toEqual([{ symbol: 'BTC/USDT', clientOrderId: 'child-1' }]);
    expect(parentStore.get('parent-1')?.status).toBe('stopped');
  });

  it('kills an approved VWAP/POV parent — store.kill covers approved|running', async () => {
    const { parentStore, emsStore } = wired();
    parentStore.seed(live({ parentClientOrderId: 'parent-vwap', kind: 'vwap', status: 'approved', startedAt: null }));
    parentStore.seed(live({ parentClientOrderId: 'parent-pov', kind: 'pov' }));
    seedAck(emsStore, { parentClientOrderId: 'parent-vwap', clientOrderId: 'child-vwap' });
    seedAck(emsStore, { parentClientOrderId: 'parent-pov', clientOrderId: 'child-pov' });
    const street = new FakeCancel(venueOrder());
    const vwap = await killLiveAlgoParent({
      parentClientOrderId: 'parent-vwap',
      parentStore,
      emsStore,
      cancelByVenue: { street: street.fn },
    });
    const pov = await killLiveAlgoParent({
      parentClientOrderId: 'parent-pov',
      parentStore,
      emsStore,
      cancelByVenue: { street: street.fn },
    });
    expect(vwap).toMatchObject({ ok: true, killed: true, parent: { kind: 'vwap' } });
    expect(pov).toMatchObject({ ok: true, killed: true, parent: { kind: 'pov' } });
    expect(parentStore.get('parent-vwap')?.status).toBe('stopped');
    expect(parentStore.get('parent-pov')?.status).toBe('stopped');
  });

  it('venue throw is unknown — killed is not true, parent stays live, never invents canceled', async () => {
    const { parentStore, emsStore } = wired();
    parentStore.seed(live({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    seedAck(emsStore);
    const street = new FakeCancel(new Error('venue 503'));
    const result = await killLiveAlgoParent({
      parentClientOrderId: 'parent-1',
      parentStore,
      emsStore,
      cancelByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.killed).toBe(false);
    expect(result.children[0]).toMatchObject({ outcome: 'unknown', reason: 'cancel_failed' });
    expect(result.residual).toEqual({ filled: '0', remaining: null });
    expect(result.children[0] && result.children[0].status === 'canceled').toBe(false);
    expect(parentStore.get('parent-1')?.status).toBe('running');
  });

  it('pending cancel is unknown — killed is not true', async () => {
    const { parentStore, emsStore } = wired();
    parentStore.seed(live({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    seedAck(emsStore);
    const street = new FakeCancel(venueOrder({ status: 'pending', venueOrderId: null }));
    const result = await killLiveAlgoParent({
      parentClientOrderId: 'parent-1',
      parentStore,
      emsStore,
      cancelByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.killed).toBe(false);
    expect(result.children[0]).toMatchObject({ outcome: 'unknown', reason: 'cancel_failed' });
    expect(parentStore.get('parent-1')?.status).toBe('running');
  });

  it('unconfirmed venue status is unknown — killed is not true', async () => {
    const { parentStore, emsStore } = wired();
    parentStore.seed(live({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    seedAck(emsStore);
    const street = new FakeCancel(venueOrder({ status: 'open' }));
    const result = await killLiveAlgoParent({
      parentClientOrderId: 'parent-1',
      parentStore,
      emsStore,
      cancelByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.killed).toBe(false);
    expect(result.children[0]).toMatchObject({
      outcome: 'unknown',
      status: 'open',
      reason: 'venue_status_unconfirmed',
    });
    expect(parentStore.get('parent-1')?.status).toBe('running');
  });

  it('SUBMIT_UNKNOWN with no cancel injection is unknown — killed is not true', async () => {
    const { parentStore, emsStore } = wired();
    parentStore.seed(live({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    seedAck(emsStore, { state: 'SUBMIT_UNKNOWN' });
    const result = await killLiveAlgoParent({
      parentClientOrderId: 'parent-1',
      parentStore,
      emsStore,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.killed).toBe(false);
    expect(result.children[0]).toMatchObject({ outcome: 'unknown', reason: 'cancel_failed' });
    expect(parentStore.get('parent-1')?.status).toBe('running');
  });

  it('internal venue is unknown — does not invent a matching cancel, killed is not true', async () => {
    const { parentStore, emsStore } = wired();
    parentStore.seed(live({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    seedAck(emsStore, { venueId: 'book', clientOrderId: 'child-book' });
    const book = new FakeCancel(venueOrder({ venueId: 'book', clientOrderId: 'child-book' }), 'book');
    const result = await killLiveAlgoParent({
      parentClientOrderId: 'parent-1',
      parentStore,
      emsStore,
      cancelByVenue: { book: book.fn },
      kindsByVenue: { book: 'internal' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.killed).toBe(false);
    expect(result.children[0]).toMatchObject({
      clientOrderId: 'child-book',
      venueId: 'book',
      outcome: 'unknown',
      reason: 'internal_venue',
    });
    expect(book.calls).toHaveLength(0);
    expect(parentStore.get('parent-1')?.status).toBe('running');
  });

  it('venueId internal without kindsByVenue is unknown — never cancel into matching', async () => {
    const { parentStore, emsStore } = wired();
    parentStore.seed(live({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    seedAck(emsStore, { venueId: 'internal', clientOrderId: 'child-int' });
    const internal = new FakeCancel(venueOrder({ venueId: 'internal', clientOrderId: 'child-int' }), 'internal');
    const result = await killLiveAlgoParent({
      parentClientOrderId: 'parent-1',
      parentStore,
      emsStore,
      cancelByVenue: { internal: internal.fn },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.killed).toBe(false);
    expect(result.children[0]).toMatchObject({ outcome: 'unknown', reason: 'internal_venue' });
    expect(internal.calls).toHaveLength(0);
  });

  it('any unknown child keeps killed false even when a sibling stopped', async () => {
    const { parentStore, emsStore } = wired();
    parentStore.seed(live({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    seedAck(emsStore, { clientOrderId: 'child-ok' });
    seedAck(emsStore, { clientOrderId: 'child-bad' });
    const calls: string[] = [];
    const cancelByVenue = {
      street: async (_symbol: string, clientOrderId: string) => {
        calls.push(clientOrderId);
        if (clientOrderId === 'child-bad') throw new Error('venue 503');
        return venueOrder({ clientOrderId });
      },
    };
    const result = await killLiveAlgoParent({
      parentClientOrderId: 'parent-1',
      parentStore,
      emsStore,
      cancelByVenue,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.killed).toBe(false);
    expect(result.children.find((c) => c.clientOrderId === 'child-ok')).toMatchObject({ outcome: 'stopped' });
    expect(result.children.find((c) => c.clientOrderId === 'child-bad')).toMatchObject({ outcome: 'unknown' });
    expect(result.residual.remaining).toBeNull();
    expect(parentStore.get('parent-1')?.status).toBe('running');
    expect(calls).toEqual(['child-ok', 'child-bad']);
  });

  it('filled race is stopped with filled — not rewritten to canceled, killed: true', async () => {
    const { parentStore, emsStore } = wired();
    parentStore.seed(live({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    seedAck(emsStore);
    const street = new FakeCancel(
      venueOrder({ status: 'filled', filled: parseAmount('1'), remaining: ZERO, averagePrice: parseAmount('100') }),
    );
    const result = await killLiveAlgoParent({
      parentClientOrderId: 'parent-1',
      parentStore,
      emsStore,
      cancelByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.killed).toBe(true);
    expect(result.children[0]).toEqual({
      clientOrderId: 'child-1',
      venueId: 'street',
      outcome: 'stopped',
      status: 'filled',
    });
    expect(result.residual).toEqual({ filled: '1', remaining: '0' });
    expect(parentStore.get('parent-1')?.status).toBe('stopped');
  });

  it('REJECTED child is already_stopped and is not canceled again — killed: true', async () => {
    const { parentStore, emsStore } = wired();
    parentStore.seed(live({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    seedAck(emsStore, { state: 'REJECTED' });
    const street = new FakeCancel(venueOrder());
    const result = await killLiveAlgoParent({
      parentClientOrderId: 'parent-1',
      parentStore,
      emsStore,
      cancelByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.killed).toBe(true);
    expect(result.children[0]).toMatchObject({ outcome: 'already_stopped', reason: 'REJECTED' });
    expect(street.calls).toHaveLength(0);
    expect(parentStore.get('parent-1')?.status).toBe('stopped');
  });

  it('empty children is an honest empty kill — killed: true, store.kill ok, no fake cancel', async () => {
    const { parentStore, emsStore } = wired();
    parentStore.seed(live({ parentClientOrderId: 'parent-none', kind: 'twap' }));
    const street = new FakeCancel(venueOrder());
    const result = await killLiveAlgoParent({
      parentClientOrderId: 'parent-none',
      parentStore,
      emsStore,
      cancelByVenue: { street: street.fn },
    });
    expect(result).toEqual({
      ok: true,
      killed: true,
      parent: { parentClientOrderId: 'parent-none', kind: 'twap' },
      children: [],
      residual: { filled: '0', remaining: '0' },
    });
    expect(street.calls).toHaveLength(0);
    expect(parentStore.get('parent-none')?.status).toBe('stopped');
  });

  it('does not cancel a child of a different parent', async () => {
    const { parentStore, emsStore } = wired();
    parentStore.seed(live({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    parentStore.seed(live({ parentClientOrderId: 'parent-2', kind: 'vwap' }));
    seedAck(emsStore, { parentClientOrderId: 'parent-1' });
    seedAck(emsStore, { clientOrderId: 'child-other', parentClientOrderId: 'parent-2' });
    const street = new FakeCancel(venueOrder());
    const result = await killLiveAlgoParent({
      parentClientOrderId: 'parent-1',
      parentStore,
      emsStore,
      cancelByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.killed).toBe(true);
    expect(result.children.map((c) => c.clientOrderId)).toEqual(['child-1']);
    expect(street.calls).toHaveLength(1);
    expect(parentStore.get('parent-2')?.status).toBe('running');
  });

  it('missing parent id', async () => {
    const { parentStore, emsStore } = wired();
    expect(await killLiveAlgoParent({ parentStore, emsStore })).toMatchObject({
      ok: false,
      reason: 'missing_parent',
    });
    expect(await killLiveAlgoParent({ parentClientOrderId: '   ', parentStore, emsStore })).toMatchObject({
      ok: false,
      reason: 'missing_parent',
    });
  });

  it('parent_only when executionGroupId is supplied — no cancel', async () => {
    const { parentStore, emsStore } = wired();
    parentStore.seed(live({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    seedAck(emsStore);
    const street = new FakeCancel(venueOrder());
    expect(
      await killLiveAlgoParent({
        parentClientOrderId: 'parent-1',
        executionGroupId: 'algo-1',
        parentStore,
        emsStore,
        cancelByVenue: { street: street.fn },
      }),
    ).toMatchObject({ ok: false, reason: 'parent_only' });
    expect(street.calls).toHaveLength(0);
    expect(parentStore.get('parent-1')?.status).toBe('running');
  });

  it('not_found when the store has no row', async () => {
    const { parentStore, emsStore } = wired();
    expect(await killLiveAlgoParent({ parentClientOrderId: 'missing', parentStore, emsStore })).toMatchObject({
      ok: false,
      reason: 'not_found',
    });
  });

  it('already_stopped when status is stopped — no re-cancel', async () => {
    const { parentStore, emsStore } = wired();
    parentStore.seed(live({ parentClientOrderId: 'parent-done', kind: 'twap', status: 'stopped' }));
    seedAck(emsStore, { parentClientOrderId: 'parent-done' });
    const street = new FakeCancel(venueOrder());
    expect(
      await killLiveAlgoParent({
        parentClientOrderId: 'parent-done',
        parentStore,
        emsStore,
        cancelByVenue: { street: street.fn },
      }),
    ).toMatchObject({ ok: false, reason: 'already_stopped' });
    expect(street.calls).toHaveLength(0);
  });

  it('not_live for paper/staged/expired/undeployed/abandoned', async () => {
    const { parentStore, emsStore } = wired();
    const statuses = ['paper', 'staged', 'expired', 'undeployed', 'abandoned'] as const;
    for (const status of statuses) {
      parentStore.seed(live({ parentClientOrderId: `parent-${status}`, kind: 'twap', status }));
      expect(
        await killLiveAlgoParent({
          parentClientOrderId: `parent-${status}`,
          parentStore,
          emsStore,
        }),
      ).toMatchObject({ ok: false, reason: 'not_live' });
    }
  });

  it('unsupported_kind is refused', async () => {
    const { parentStore, emsStore } = wired();
    parentStore.seed(live({ parentClientOrderId: 'parent-ice', kind: 'twap' }));
    const row = parentStore.get('parent-ice');
    if (!row) throw new Error('seed missing');
    parentStore.seed({ ...row, kind: 'iceberg' as ApprovedAlgoParent['kind'] });
    expect(await killLiveAlgoParent({ parentClientOrderId: 'parent-ice', parentStore, emsStore })).toMatchObject({
      ok: false,
      reason: 'unsupported_kind',
    });
  });

  it('store / ems unwired, including missing .kill', async () => {
    const { parentStore, emsStore } = wired();
    parentStore.seed(live({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    const street = new FakeCancel(venueOrder());
    expect(await killLiveAlgoParent({ parentClientOrderId: 'parent-1', emsStore })).toMatchObject({
      ok: false,
      reason: 'parent_store_unwired',
    });
    expect(await killLiveAlgoParent({ parentClientOrderId: 'parent-1', parentStore })).toMatchObject({
      ok: false,
      reason: 'ems_store_unwired',
    });
    expect(
      await killLiveAlgoParent({
        parentClientOrderId: 'parent-1',
        parentStore: stubStore({
          get: () => live({ parentClientOrderId: 'parent-1', kind: 'twap' }),
        }),
        emsStore,
        cancelByVenue: { street: street.fn },
      }),
    ).toMatchObject({ ok: false, reason: 'parent_store_unwired' });
    expect(street.calls).toEqual([]);
  });
});

describe('execution.oms.killLiveAlgoParent tRPC', () => {
  it('refuses anonymous kill', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(
      router.createCaller(anon).execution.oms.killLiveAlgoParent({ parentClientOrderId: 'parent-1' }),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('kills through the injected stores — signed principal', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    const emsStore = new InMemoryEmsOrderStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    seedAck(emsStore);
    const street = new FakeCancel(venueOrder());
    const caller = createExecutionRouter(
      new SealedHouseTenantRegistry(),
      {},
      { street: street.fn },
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
    ).createCaller(signed());
    const out = await caller.execution.oms.killLiveAlgoParent({ parentClientOrderId: 'parent-1' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.killed).toBe(true);
    expect(out.children[0]?.outcome).toBe('stopped');
    expect(parentStore.get('parent-1')?.status).toBe('stopped');
  });

  it('unknown child cancel through tRPC is not killed: true', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    const emsStore = new InMemoryEmsOrderStore();
    parentStore.seed(live({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    seedAck(emsStore);
    const street = new FakeCancel(new Error('venue 503'));
    const caller = createExecutionRouter(
      new SealedHouseTenantRegistry(),
      {},
      { street: street.fn },
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
    ).createCaller(signed());
    const out = await caller.execution.oms.killLiveAlgoParent({ parentClientOrderId: 'parent-1' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.killed).toBe(false);
    expect(out.children[0]).toMatchObject({ outcome: 'unknown' });
    expect(parentStore.get('parent-1')?.status).toBe('running');
  });
});
