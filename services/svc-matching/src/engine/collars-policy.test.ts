import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client/money';
import { MemoryEventBus } from '@intafaced/events';
import { MatchingEngine } from './engine.js';
import { MemoryJournal } from './journal.js';
import type { CollarPolicyResult, EngineOrder, OrderSide } from './types.js';
import {
  COLLAR_UNPUBLISHED,
  FAT_FINGER_UNPUBLISHED,
  SEVERE_MARKET_UNSET,
  THROTTLE_UNPUBLISHED,
  collarMagnitudesUnset,
  fatFingerMagnitudesUnset,
  installCollars,
  throttleMagnitudesUnset,
} from './collars-policy.js';

installCollars();

/**
 * CARD D-collars hitch. Owner magnitudes blank: unpublished, not zero.
 * Severe-market is explicit. Do not invent a collar.
 */

const MARKET = 'BTC/USDT';
const ASK = '11111111-1111-4111-8111-111111111111';
const TAKE = '22222222-2222-4222-8222-222222222222';

type PolicyEngine = MatchingEngine & {
  applyCollar(marketId: string): Promise<CollarPolicyResult>;
  applyFatFinger(marketId: string): Promise<CollarPolicyResult>;
  applyThrottle(marketId: string): Promise<CollarPolicyResult>;
  enterSevereMarket(marketId: string, cmd?: { readonly severeMarket?: boolean | null }): Promise<CollarPolicyResult>;
};

function order(spec: { id: string; account?: string; side: OrderSide; qty: string; price: string }): EngineOrder {
  return {
    orderId: spec.id,
    accountId: spec.account ?? 'desk',
    type: 'limit',
    side: spec.side,
    qty: parseAmount(spec.qty),
    price: parseAmount(spec.price),
    stopPrice: null,
    tif: 'GTC',
  };
}

function build() {
  const journal = new MemoryJournal();
  const bus = new MemoryEventBus('svc-matching');
  const engine = new MatchingEngine({ journal, bus, snapshotEvery: 0 }) as PolicyEngine;
  return { journal, bus, engine };
}

describe('collars-policy — unpublished is not zero, never invent a collar', () => {
  it('applyCollar refuses collar_unpublished; band is null not zero', async () => {
    const { journal, engine } = build();
    const before = journal.length;
    const result = await engine.applyCollar(MARKET);
    expect(collarMagnitudesUnset()).toBe(true);
    expect(result.accepted).toBe(false);
    expect(result.unpublished).toBe(true);
    expect(result.band).toBeNull();
    expect(result.band).not.toBe(0);
    expect(result.rejected?.code).toBe(COLLAR_UNPUBLISHED);
    expect(journal.length).toBe(before);
    expect(journal.read().some((record) => record.kind === 'collar')).toBe(false);
  });

  it('fat-finger / throttle refuse unpublished, not a zero rate', async () => {
    const { engine } = build();
    const finger = await engine.applyFatFinger(MARKET);
    expect(fatFingerMagnitudesUnset()).toBe(true);
    expect(finger.accepted).toBe(false);
    expect(finger.unpublished).toBe(true);
    expect(finger.band).toBeNull();
    expect(finger.rejected?.code).toBe(FAT_FINGER_UNPUBLISHED);

    const throttle = await engine.applyThrottle(MARKET);
    expect(throttleMagnitudesUnset()).toBe(true);
    expect(throttle.accepted).toBe(false);
    expect(throttle.unpublished).toBe(true);
    expect(throttle.band).toBeNull();
    expect(throttle.rejected?.code).toBe(THROTTLE_UNPUBLISHED);
  });

  it('severe-market missing/false refuses severe_market_unset — not inferred', async () => {
    const { engine } = build();
    const missing = await engine.enterSevereMarket(MARKET);
    expect(missing.accepted).toBe(false);
    expect(missing.rejected?.code).toBe(SEVERE_MARKET_UNSET);
    expect(missing.band).toBeNull();

    const falsy = await engine.enterSevereMarket(MARKET, { severeMarket: false });
    expect(falsy.accepted).toBe(false);
    expect(falsy.rejected?.code).toBe(SEVERE_MARKET_UNSET);
  });

  it('explicit severe-market still unpublished while magnitudes are blank', async () => {
    const { engine } = build();
    const armed = await engine.enterSevereMarket(MARKET, { severeMarket: true });
    expect(armed.accepted).toBe(false);
    expect(armed.unpublished).toBe(true);
    expect(armed.band).toBeNull();
    expect(armed.rejected?.code).toBe(COLLAR_UNPUBLISHED);
  });

  it('normal submit still fills while collars are unpublished — not a hidden halt', async () => {
    const { engine } = build();
    await engine.submit(MARKET, order({ id: ASK, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    const take = await engine.submit(MARKET, order({ id: TAKE, side: 'buy', qty: '2', price: '100' }));
    expect(take.accepted).toBe(true);
    expect(take.fills).toHaveLength(1);
    expect(take.rejected).toBeUndefined();
  });
});
