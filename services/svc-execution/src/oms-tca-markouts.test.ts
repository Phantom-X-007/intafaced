import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import { CaptureLake } from '@intafaced/venue-adapter';
import type { VenueBookSnapshot } from '@intafaced/venue-contracts';
import { InMemoryEmsOrderStore } from './oms-ems-store.js';
import { recordMarkoutsForParent } from './oms-tca-markouts.js';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-tca-markouts-test-edge-secret';
const OP = '33333333-3333-4333-8333-333333333333';
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-execution' });
const FILL_AT = new Date('2026-08-24T12:00:00.000Z');
const PLUS_60S = new Date('2026-08-24T12:01:00.000Z');

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

function snapshot(now: Date, bid = '100', ask = '102'): VenueBookSnapshot {
  return {
    venueId: 'street',
    symbol: 'BTC/USDT',
    sequence: 9,
    sequenced: true,
    observedAt: now,
    bids: [[parseAmount(bid), parseAmount('2')]],
    asks: [[parseAmount(ask), parseAmount('2')]],
  };
}

function recordFill(store: InMemoryEmsOrderStore, parent = 'parent-1') {
  store.record({
    clientOrderId: 'child-1',
    parentClientOrderId: parent,
    executionGroupId: 'group-1',
    childOrderId: 'child-1',
    venueId: 'street',
    symbol: 'BTC/USDT',
    side: 'buy',
    execution: {
      venueId: 'street',
      venueOrderId: 'v-1',
      filledAmount: parseAmount('1'),
      averagePrice: parseAmount('101'),
      feeAmount: parseAmount('0.1'),
      feeAsset: 'USDT',
      status: 'filled',
      executedAt: FILL_AT,
    },
    state: 'ACKNOWLEDGED',
    recordedAtMs: 1,
  });
}

function lakeWithMarkout(): CaptureLake {
  let now = FILL_AT;
  const lake = new CaptureLake({ now: () => now });
  lake.recordBook(snapshot(FILL_AT));
  now = PLUS_60S;
  lake.recordBook(snapshot(PLUS_60S, '104', '106'));
  return lake;
}

describe('recordMarkoutsForParent', () => {
  it('records a post-fill markout from a retained capture book', () => {
    const emsStore = new InMemoryEmsOrderStore();
    recordFill(emsStore);
    const result = recordMarkoutsForParent({
      parentClientOrderId: 'parent-1',
      emsStore,
      captureLake: lakeWithMarkout(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parent).toEqual({ parentClientOrderId: 'parent-1' });
    expect(result.fillVwap).toBe('101');
    expect(result.markouts).toHaveLength(1);
    expect(result.markouts[0]).toMatchObject({
      horizonMs: 60_000,
      capturedAt: PLUS_60S.toISOString(),
      mid: '105',
      fillVwap: '101',
      markout: '4',
      source: 'capture.lake',
      venueId: 'street',
    });
    expect(result.markouts[0]?.markoutBps).toMatch(/^\d+(\.\d+)?$/);
  });

  it('refuses when only the arrival book is retained — no invented later mid', () => {
    const emsStore = new InMemoryEmsOrderStore();
    recordFill(emsStore);
    const lake = new CaptureLake({ now: () => FILL_AT });
    lake.recordBook(snapshot(FILL_AT));
    expect(recordMarkoutsForParent({ parentClientOrderId: 'parent-1', emsStore, captureLake: lake })).toMatchObject({
      ok: false,
      reason: 'missing_retained_inputs',
    });
  });

  it('does not treat fill VWAP as a markout when capture is missing', () => {
    const emsStore = new InMemoryEmsOrderStore();
    recordFill(emsStore);
    expect(recordMarkoutsForParent({ parentClientOrderId: 'parent-1', emsStore })).toMatchObject({
      ok: false,
      reason: 'missing_retained_inputs',
    });
  });

  it('does not mark out another parent', () => {
    const emsStore = new InMemoryEmsOrderStore();
    recordFill(emsStore, 'parent-1');
    emsStore.record({
      clientOrderId: 'child-other',
      parentClientOrderId: 'parent-other',
      venueId: 'street',
      symbol: 'BTC/USDT',
      side: 'buy',
      execution: {
        venueId: 'street',
        venueOrderId: 'v-2',
        filledAmount: parseAmount('9'),
        averagePrice: parseAmount('200'),
        feeAmount: parseAmount('1'),
        feeAsset: 'USDT',
        status: 'filled',
        executedAt: FILL_AT,
      },
      state: 'ACKNOWLEDGED',
      recordedAtMs: 2,
    });
    const result = recordMarkoutsForParent({
      parentClientOrderId: 'parent-1',
      emsStore,
      captureLake: lakeWithMarkout(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fillVwap).toBe('101');
    expect(result.markouts).toHaveLength(1);
  });

  it('refuses a missing parent, empty journal, or unwired store', () => {
    expect(recordMarkoutsForParent({ emsStore: new InMemoryEmsOrderStore() })).toMatchObject({
      ok: false,
      reason: 'missing_parent',
    });
    expect(recordMarkoutsForParent({ parentClientOrderId: 'parent-1' })).toMatchObject({
      ok: false,
      reason: 'ems_store_unwired',
    });
    expect(
      recordMarkoutsForParent({
        parentClientOrderId: 'ghost',
        emsStore: new InMemoryEmsOrderStore(),
        captureLake: lakeWithMarkout(),
      }),
    ).toMatchObject({ ok: false, reason: 'no_ems_evidence' });
  });
});

describe('execution.oms.tca.markouts tRPC', () => {
  it('records markouts through the injected stores', async () => {
    const emsStore = new InMemoryEmsOrderStore();
    recordFill(emsStore);
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
      emsStore,
      lakeWithMarkout(),
    ).createCaller(hmacSigned());
    const out = await caller.execution.oms.tca.markouts({ parentClientOrderId: 'parent-1' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.markouts[0]).toMatchObject({ horizonMs: 60_000, mid: '105', markout: '4', source: 'capture.lake' });
  });
});
