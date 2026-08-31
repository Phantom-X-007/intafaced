import { describe, expect, it } from 'vitest';
import {
  HOUSE_MAY_SEE_TENANT_PRIVATE_INTENT,
  TENANT_PRIVATE_INTENT_DETAIL,
  TENANT_PRIVATE_QUOTES_DETAIL,
  TENANT_PRIVATE_RESTING_ORDERS_DETAIL,
  admitHouseMarketPayload,
  houseMayReadMarketView,
  isolateHouseIntentBarrier,
} from './house-intent-barrier.js';

describe('typed information-barrier pin', () => {
  it('house may not see tenant private intent', () => {
    expect(HOUSE_MAY_SEE_TENANT_PRIVATE_INTENT).toBe(false);
  });
});

describe('houseMayReadMarketView', () => {
  it('allows public L2 and refuses private tenant views', () => {
    expect(houseMayReadMarketView('public_l2')).toBe(true);
    expect(houseMayReadMarketView('tenant_private_resting_orders')).toBe(false);
    expect(houseMayReadMarketView('tenant_private_quotes')).toBe(false);
    expect(houseMayReadMarketView('tenant_private_intent')).toBe(false);
  });
});

describe('isolateHouseIntentBarrier', () => {
  it('clears public L2', () => {
    expect(isolateHouseIntentBarrier({ kind: 'public_l2' })).toEqual({ ok: true, view: 'public_l2' });
  });

  it('refuses tenant private resting orders', () => {
    expect(isolateHouseIntentBarrier({ kind: 'tenant_private_resting_orders' })).toEqual({
      ok: false,
      reason: 'tenant_private_resting_orders',
      detail: TENANT_PRIVATE_RESTING_ORDERS_DETAIL,
    });
  });

  it('refuses tenant private quotes', () => {
    expect(isolateHouseIntentBarrier({ kind: 'tenant_private_quotes' })).toEqual({
      ok: false,
      reason: 'tenant_private_quotes',
      detail: TENANT_PRIVATE_QUOTES_DETAIL,
    });
  });

  it('refuses tenant private intent', () => {
    expect(isolateHouseIntentBarrier({ kind: 'tenant_private_intent' })).toEqual({
      ok: false,
      reason: 'tenant_private_intent',
      detail: TENANT_PRIVATE_INTENT_DETAIL,
    });
  });
});

describe('admitHouseMarketPayload — house path handed private data refuses', () => {
  it('clears public L2 only', () => {
    expect(admitHouseMarketPayload({ publicL2: { bids: [], asks: [] } })).toEqual({
      ok: true,
      view: 'public_l2',
    });
  });

  it('clears when no market view is handed', () => {
    expect(admitHouseMarketPayload({})).toEqual({ ok: true, view: 'public_l2' });
  });

  it('refuses private resting orders even when empty and even with public L2', () => {
    expect(
      admitHouseMarketPayload({
        publicL2: { bids: [], asks: [] },
        tenantPrivateRestingOrders: [],
      }),
    ).toMatchObject({ ok: false, reason: 'tenant_private_resting_orders' });
  });

  it('refuses private quotes including null', () => {
    expect(admitHouseMarketPayload({ tenantPrivateQuotes: null })).toEqual({
      ok: false,
      reason: 'tenant_private_quotes',
      detail: TENANT_PRIVATE_QUOTES_DETAIL,
    });
  });

  it('refuses private intent', () => {
    expect(admitHouseMarketPayload({ tenantPrivateIntent: { side: 'buy' } })).toEqual({
      ok: false,
      reason: 'tenant_private_intent',
      detail: TENANT_PRIVATE_INTENT_DETAIL,
    });
  });

  it('resting orders win over quotes and intent when several private fields are handed', () => {
    expect(
      admitHouseMarketPayload({
        tenantPrivateRestingOrders: [{ id: 'o-1' }],
        tenantPrivateQuotes: [{ id: 'q-1' }],
        tenantPrivateIntent: { side: 'sell' },
      }),
    ).toMatchObject({ ok: false, reason: 'tenant_private_resting_orders' });
  });

  it('quotes win over intent when resting orders are absent', () => {
    expect(
      admitHouseMarketPayload({
        tenantPrivateQuotes: [{ id: 'q-1' }],
        tenantPrivateIntent: { side: 'sell' },
      }),
    ).toMatchObject({ ok: false, reason: 'tenant_private_quotes' });
  });
});
