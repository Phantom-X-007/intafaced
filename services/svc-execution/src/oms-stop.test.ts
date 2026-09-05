import { describe, expect, it } from 'vitest';
import { parseAmount, ZERO } from '@intafaced/ledger-client';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import type { VenueExecution } from '@intafaced/venue-adapter';
import { InMemoryEmsOrderStore } from './oms-ems-store.js';
import { InMemoryAlgoPauseStore } from './oms-pause.js';
import { InMemoryApprovedAlgoParentStore, type ApprovedAlgoParent, type RetainedAlgoSchedule } from './oms-start.js';
import { stopRunningAlgoParent } from './oms-stop.js';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-oms-stop-test-edge-secret';
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

function running(
  over: Partial<ApprovedAlgoParent> &
    Pick<ApprovedAlgoParent, 'parentClientOrderId' | 'kind'> & {
      schedule?: RetainedAlgoSchedule;
    },
): ApprovedAlgoParent {
  const schedule = over.schedule ?? (over.kind === 'pov' ? retainedPov() : over.kind === 'vwap' ? retainedVwap() : retainedTwap());
  return {
    status: 'running',
    startedAt: '2026-08-25T12:00:00.000Z',
    ...over,
    schedule,
  };
}

function execution(over: Partial<VenueExecution> = {}): VenueExecution {
  return {
    venueId: 'street',
    venueOrderId: 'v-1',
    filledAmount: parseAmount('1'),
    averagePrice: parseAmount('100'),
    feeAmount: ZERO,
    feeAsset: 'USDT',
    status: 'filled',
    executedAt: new Date('2026-08-25T00:00:00.000Z'),
    ...over,
  };
}

function seed(
  store: InMemoryEmsOrderStore,
  over: {
    clientOrderId?: string;
    parentClientOrderId?: string;
    venueId?: string;
    state?: 'ACKNOWLEDGED' | 'REJECTED' | 'UNWIRED' | 'SUBMIT_UNKNOWN' | 'OUTCOME_UNKNOWN';
    execution?: VenueExecution | null;
  } = {},
) {
  store.record({
    clientOrderId: over.clientOrderId ?? 'child-1',
    parentClientOrderId: over.parentClientOrderId ?? 'parent-1',
    executionGroupId: 'algo-1',
    childOrderId: over.clientOrderId ?? 'child-1',
    legIndex: 0,
    venueId: over.venueId ?? 'street',
    symbol: 'BTC/USDT',
    side: 'buy',
    execution: over.execution === undefined ? execution() : over.execution,
    state: over.state ?? 'ACKNOWLEDGED',
    reconciliationKey: null,
  });
}

function wired() {
  const parentStore = new InMemoryApprovedAlgoParentStore();
  const pauseStore = new InMemoryAlgoPauseStore();
  const emsStore = new InMemoryEmsOrderStore();
  return { parentStore, pauseStore, emsStore };
}

describe('stopRunningAlgoParent', () => {
  it('jobs-unrelated: stop works even if jobs are off', () => {
    const { parentStore, pauseStore, emsStore } = wired();
    parentStore.seed(running({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    const result = stopRunningAlgoParent({
      parentClientOrderId: 'parent-twap',
      parentStore,
      pauseStore,
      emsStore,
    });
    expect(result).toMatchObject({ ok: true, stopped: true, parent: { parentClientOrderId: 'parent-twap', kind: 'twap' } });
    expect(parentStore.get('parent-twap')?.status).toBe('stopped');
    expect(pauseStore.isPaused({ parentClientOrderId: 'parent-twap' })).toBe(true);
  });

  it('missing parent id', () => {
    const { parentStore, pauseStore, emsStore } = wired();
    expect(stopRunningAlgoParent({ parentStore, pauseStore, emsStore })).toMatchObject({
      ok: false,
      reason: 'missing_parent',
    });
    expect(stopRunningAlgoParent({ parentClientOrderId: '   ', parentStore, pauseStore, emsStore })).toMatchObject({
      ok: false,
      reason: 'missing_parent',
    });
  });

  it('parent_only when executionGroupId is supplied', () => {
    const { parentStore, pauseStore, emsStore } = wired();
    parentStore.seed(running({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    expect(
      stopRunningAlgoParent({
        parentClientOrderId: 'parent-1',
        executionGroupId: 'algo-1',
        parentStore,
        pauseStore,
        emsStore,
      }),
    ).toMatchObject({ ok: false, reason: 'parent_only' });
    expect(parentStore.get('parent-1')?.status).toBe('running');
  });

  it('not_found when the store has no row', () => {
    const { parentStore, pauseStore, emsStore } = wired();
    expect(
      stopRunningAlgoParent({
        parentClientOrderId: 'missing',
        parentStore,
        pauseStore,
        emsStore,
      }),
    ).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('not_running when status is approved', () => {
    const { parentStore, pauseStore, emsStore } = wired();
    parentStore.seed({
      ...running({ parentClientOrderId: 'parent-approved', kind: 'twap' }),
      status: 'approved',
      startedAt: null,
    });
    expect(
      stopRunningAlgoParent({
        parentClientOrderId: 'parent-approved',
        parentStore,
        pauseStore,
        emsStore,
      }),
    ).toMatchObject({ ok: false, reason: 'not_running' });
    expect(parentStore.get('parent-approved')?.status).toBe('approved');
    expect(pauseStore.isPaused({ parentClientOrderId: 'parent-approved' })).toBe(false);
  });

  it('already_stopped when status is stopped', () => {
    const { parentStore, pauseStore, emsStore } = wired();
    parentStore.seed({
      ...running({ parentClientOrderId: 'parent-done', kind: 'twap' }),
      status: 'stopped',
    });
    expect(
      stopRunningAlgoParent({
        parentClientOrderId: 'parent-done',
        parentStore,
        pauseStore,
        emsStore,
      }),
    ).toMatchObject({ ok: false, reason: 'already_stopped' });
  });

  it('store / pause / ems unwired', () => {
    const { parentStore, pauseStore, emsStore } = wired();
    parentStore.seed(running({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    expect(stopRunningAlgoParent({ parentClientOrderId: 'parent-1', pauseStore, emsStore })).toMatchObject({
      ok: false,
      reason: 'parent_store_unwired',
    });
    expect(stopRunningAlgoParent({ parentClientOrderId: 'parent-1', parentStore, emsStore })).toMatchObject({
      ok: false,
      reason: 'pause_store_unwired',
    });
    expect(stopRunningAlgoParent({ parentClientOrderId: 'parent-1', parentStore, pauseStore })).toMatchObject({
      ok: false,
      reason: 'ems_store_unwired',
    });
  });

  it('happy TWAP/VWAP/POV running → stopped + paused + residual', () => {
    const { parentStore, pauseStore, emsStore } = wired();
    parentStore.seed(running({ parentClientOrderId: 'parent-twap', kind: 'twap' }));
    parentStore.seed(running({ parentClientOrderId: 'parent-vwap', kind: 'vwap' }));
    parentStore.seed(running({ parentClientOrderId: 'parent-pov', kind: 'pov' }));
    seed(emsStore, {
      parentClientOrderId: 'parent-twap',
      clientOrderId: 'child-twap',
      execution: execution({ filledAmount: parseAmount('1'), venueOrderId: 'v-twap' }),
    });
    seed(emsStore, {
      parentClientOrderId: 'parent-vwap',
      clientOrderId: 'child-vwap',
      execution: execution({ filledAmount: parseAmount('2'), venueOrderId: 'v-vwap' }),
    });
    seed(emsStore, {
      parentClientOrderId: 'parent-pov',
      clientOrderId: 'child-pov',
      execution: execution({ filledAmount: parseAmount('3'), venueOrderId: 'v-pov' }),
    });

    const twap = stopRunningAlgoParent({
      parentClientOrderId: 'parent-twap',
      parentStore,
      pauseStore,
      emsStore,
    });
    const vwap = stopRunningAlgoParent({
      parentClientOrderId: 'parent-vwap',
      parentStore,
      pauseStore,
      emsStore,
    });
    const pov = stopRunningAlgoParent({
      parentClientOrderId: 'parent-pov',
      parentStore,
      pauseStore,
      emsStore,
    });

    expect(twap).toEqual({
      ok: true,
      parent: { parentClientOrderId: 'parent-twap', kind: 'twap' },
      stopped: true,
      children: [{ clientOrderId: 'child-twap', venueId: 'street', outcome: 'live', status: 'filled' }],
      residual: { filled: '1', remaining: '0' },
      schedule: retainedTwap(),
    });
    expect(vwap).toEqual({
      ok: true,
      parent: { parentClientOrderId: 'parent-vwap', kind: 'vwap' },
      stopped: true,
      children: [{ clientOrderId: 'child-vwap', venueId: 'street', outcome: 'live', status: 'filled' }],
      residual: { filled: '2', remaining: '0' },
      schedule: retainedVwap(),
    });
    expect(pov).toEqual({
      ok: true,
      parent: { parentClientOrderId: 'parent-pov', kind: 'pov' },
      stopped: true,
      children: [{ clientOrderId: 'child-pov', venueId: 'street', outcome: 'live', status: 'filled' }],
      residual: { filled: '3', remaining: '0' },
      schedule: retainedPov(),
    });
    expect(parentStore.get('parent-twap')?.status).toBe('stopped');
    expect(parentStore.get('parent-vwap')?.status).toBe('stopped');
    expect(parentStore.get('parent-pov')?.status).toBe('stopped');
    expect(pauseStore.isPaused({ parentClientOrderId: 'parent-twap' })).toBe(true);
    expect(pauseStore.isPaused({ parentClientOrderId: 'parent-vwap' })).toBe(true);
    expect(pauseStore.isPaused({ parentClientOrderId: 'parent-pov' })).toBe(true);
  });

  it('never invents a cancel — no canceled children, REJECTED stays already_stopped', () => {
    const { parentStore, pauseStore, emsStore } = wired();
    parentStore.seed(running({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    seed(emsStore, { clientOrderId: 'child-live', execution: execution({ status: 'partial', filledAmount: parseAmount('0.4') }) });
    seed(emsStore, { clientOrderId: 'child-rej', state: 'REJECTED', execution: null });
    seed(emsStore, { clientOrderId: 'child-unw', state: 'UNWIRED', execution: null });
    const result = stopRunningAlgoParent({
      parentClientOrderId: 'parent-1',
      parentStore,
      pauseStore,
      emsStore,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.children.some((c) => c.status === 'canceled')).toBe(false);
    expect(result.children.find((c) => c.clientOrderId === 'child-live')).toMatchObject({
      outcome: 'live',
      status: 'partial',
    });
    expect(result.children.find((c) => c.clientOrderId === 'child-rej')).toMatchObject({
      outcome: 'already_stopped',
      reason: 'REJECTED',
    });
    expect(result.children.find((c) => c.clientOrderId === 'child-unw')).toMatchObject({
      outcome: 'already_stopped',
      reason: 'UNWIRED',
    });
    expect(result.residual).toEqual({ filled: '0.4', remaining: null });
  });

  it('does not rewrite the retained schedule', () => {
    const { parentStore, pauseStore, emsStore } = wired();
    const retained: RetainedAlgoSchedule = {
      durationMs: 12_345,
      sliceIntervalMs: 678,
      slicesPlanned: 3,
      participationBps: 42,
    };
    parentStore.seed(running({ parentClientOrderId: 'parent-odd', kind: 'pov', schedule: retained }));
    const result = stopRunningAlgoParent({
      parentClientOrderId: 'parent-odd',
      parentStore,
      pauseStore,
      emsStore,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.schedule).toEqual(retained);
    expect(parentStore.get('parent-odd')?.schedule).toEqual(retained);
  });

  it('empty EMS residual remaining null — no invented remaining', () => {
    const { parentStore, pauseStore, emsStore } = wired();
    parentStore.seed(running({ parentClientOrderId: 'parent-empty', kind: 'twap' }));
    const result = stopRunningAlgoParent({
      parentClientOrderId: 'parent-empty',
      parentStore,
      pauseStore,
      emsStore,
    });
    expect(result).toEqual({
      ok: true,
      parent: { parentClientOrderId: 'parent-empty', kind: 'twap' },
      stopped: true,
      children: [],
      residual: { filled: '0', remaining: null },
      schedule: retainedTwap(),
    });
  });

  it('confirmed fills sum via ledger-client; unknown/partial keep remaining null', () => {
    const { parentStore, pauseStore, emsStore } = wired();
    parentStore.seed(running({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    seed(emsStore, {
      clientOrderId: 'child-1',
      execution: execution({ filledAmount: parseAmount('1'), venueOrderId: 'v-1' }),
    });
    seed(emsStore, {
      clientOrderId: 'child-2',
      execution: execution({ filledAmount: parseAmount('2'), venueOrderId: 'v-2' }),
    });
    const known = stopRunningAlgoParent({
      parentClientOrderId: 'parent-1',
      parentStore,
      pauseStore,
      emsStore,
    });
    expect(known.ok).toBe(true);
    if (!known.ok) return;
    expect(known.residual).toEqual({ filled: '3', remaining: '0' });

    const again = wired();
    again.parentStore.seed(running({ parentClientOrderId: 'parent-unk', kind: 'vwap' }));
    seed(again.emsStore, {
      parentClientOrderId: 'parent-unk',
      clientOrderId: 'child-known',
      execution: execution({ filledAmount: parseAmount('1') }),
    });
    seed(again.emsStore, {
      parentClientOrderId: 'parent-unk',
      clientOrderId: 'child-unknown',
      state: 'SUBMIT_UNKNOWN',
      execution: null,
    });
    const unknown = stopRunningAlgoParent({
      parentClientOrderId: 'parent-unk',
      parentStore: again.parentStore,
      pauseStore: again.pauseStore,
      emsStore: again.emsStore,
    });
    expect(unknown.ok).toBe(true);
    if (!unknown.ok) return;
    expect(unknown.children.find((c) => c.clientOrderId === 'child-unknown')).toMatchObject({
      outcome: 'unknown',
      reason: 'SUBMIT_UNKNOWN',
    });
    expect(unknown.residual).toEqual({ filled: '1', remaining: null });
  });

  it('store.stop only flips running → stopped; missing or not running returns null', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(running({ parentClientOrderId: 'parent-run', kind: 'twap' }));
    parentStore.seed({
      ...running({ parentClientOrderId: 'parent-approved', kind: 'twap' }),
      status: 'approved',
      startedAt: null,
    });
    expect(parentStore.stop('missing')).toBeNull();
    expect(parentStore.stop('parent-approved')).toBeNull();
    expect(parentStore.get('parent-approved')?.status).toBe('approved');
    const stopped = parentStore.stop('parent-run');
    expect(stopped?.status).toBe('stopped');
    expect(stopped?.schedule).toEqual(retainedTwap());
    expect(parentStore.stop('parent-run')).toBeNull();
  });
});

describe('execution.oms.stop tRPC', () => {
  it('door exists (HMAC as svc-execution) and refuses anonymous stop', async () => {
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
    );
    const caller = router.createCaller(hmacSigned());
    expect(typeof caller.execution.oms.stop).toBe('function');
    const out = await caller.execution.oms.stop({ parentClientOrderId: 'parent-1' });
    expect(out).toMatchObject({ ok: false, reason: 'not_found' });
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(router.createCaller(anon).execution.oms.stop({ parentClientOrderId: 'parent-1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('stops through the injected stores, reports residual, never calls cancel', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    const pauseStore = new InMemoryAlgoPauseStore();
    const emsStore = new InMemoryEmsOrderStore();
    parentStore.seed(running({ parentClientOrderId: 'parent-1', kind: 'twap' }));
    seed(emsStore, { execution: execution({ filledAmount: parseAmount('1') }) });
    const cancelCalls: string[] = [];
    const caller = createExecutionRouter(
      new SealedHouseTenantRegistry(),
      {},
      {
        street: async (symbol, clientOrderId) => {
          cancelCalls.push(`${symbol}:${clientOrderId}`);
          throw new Error('cancelByVenue must not be called on stop');
        },
      },
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
      pauseStore,
      parentStore,
    ).createCaller(hmacSigned());
    const out = await caller.execution.oms.stop({ parentClientOrderId: 'parent-1' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.stopped).toBe(true);
    expect(out.parent).toEqual({ parentClientOrderId: 'parent-1', kind: 'twap' });
    expect(out.residual).toEqual({ filled: '1', remaining: '0' });
    expect(out.children[0]?.outcome).toBe('live');
    expect(out.children.some((c) => c.status === 'canceled')).toBe(false);
    expect(cancelCalls).toEqual([]);
    expect(parentStore.get('parent-1')?.status).toBe('stopped');
    expect(pauseStore.isPaused({ parentClientOrderId: 'parent-1' })).toBe(true);
  });
});
