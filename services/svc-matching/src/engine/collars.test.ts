import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client/money';
import { MemoryEventBus } from '@intafaced/events';
import { MatchingEngine } from './engine.js';
import { MemoryJournal } from './journal.js';
import type { CollarResult, EngineOrder, OrderSide } from './types.js';
import {
  COLLAR_UNPUBLISHED,
  FAT_FINGER_UNPUBLISHED,
  SEVERE_MARKET_UNSET,
  THROTTLE_UNPUBLISHED,
  collarMagnitudesUnset,
  fatFingerMagnitudesUnset,
  installCollars,
  throttleMagnitudesUnset,
} from './collars.js';

installCollars();

/**
 * CARD D-collars hitch. Owner magnitudes blank: unpublished, not zero.
 * Severe-market is explicit. Do not invent a collar.
 */

const MARKET = 'BTC/USDT';
const ASK = '11111111-1111-4111-8111-111111111111';
const TAKE = '22222222-2222-4222-8222-222222222222';

type CollarEngine = MatchingEngine & {
  applyCollar(marketId: string): Promise<CollarResult>;
  applyFatFinger(marketId: string): Promise<CollarResult>;
  throttleCheck(marketId: string): Promise<CollarResult>;
  collarBand(marketId: string): Promise<CollarResult>;
  enterSevereMarket(marketId: string, cmd?: { readonly severe?: boolean | null }): Promise<CollarResult>;
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
  const engine = new MatchingEngine({ journal, bus, snapshotEvery: 0 }) as CollarEngine;
  return { journal, bus, engine };
}

function presentsZeroBand(result: CollarResult): boolean {
  return JSON.stringify(result).includes(':0') && ('band' in result || 'bps' in result || 'qty' in result);
}

describe('collars — unpublished is not zero, never invent a collar', () => {
  it('applyCollar refuses collar_unpublished; no 0-width band', async () => {
    const { journal, engine } = build();
    const before = journal.length;
    const result = await engine.applyCollar(MARKET);
    expect(collarMagnitudesUnset()).toBe(true);
    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(COLLAR_UNPUBLISHED);
    expect(presentsZeroBand(result)).toBe(false);
    expect(journal.length).toBe(before);
    expect(journal.read().some((record) => record.kind === 'collar')).toBe(false);
  });

  it('collarBand / fat-finger / throttle refuse unpublished, not zero', async () => {
    const { engine } = build();
    const band = await engine.collarBand(MARKET);
    expect(band.accepted).toBe(false);
    expect(band.rejected?.code).toBe(COLLAR_UNPUBLISHED);
    expect(presentsZeroBand(band)).toBe(false);

    const finger = await engine.applyFatFinger(MARKET);
    expect(fatFingerMagnitudesUnset()).toBe(true);
    expect(finger.accepted).toBe(false);
    expect(finger.rejected?.code).toBe(FAT_FINGER_UNPUBLISHED);
    expect(presentsZeroBand(finger)).toBe(false);

    const throttle = await engine.throttleCheck(MARKET);
    expect(throttleMagnitudesUnset()).toBe(true);
    expect(throttle.accepted).toBe(false);
    expect(throttle.rejected?.code).toBe(THROTTLE_UNPUBLISHED);
    expect(presentsZeroBand(throttle)).toBe(false);
  });

  it('severe-market missing/false refuses severe_market_unset — not inferred', async () => {
    const { engine } = build();
    const missing = await engine.enterSevereMarket(MARKET);
    expect(missing.accepted).toBe(false);
    expect(missing.rejected?.code).toBe(SEVERE_MARKET_UNSET);

    const falsy = await engine.enterSevereMarket(MARKET, { severe: false });
    expect(falsy.accepted).toBe(false);
    expect(falsy.rejected?.code).toBe(SEVERE_MARKET_UNSET);
  });

  it('explicit severe-market still unpublished while magnitudes are blank', async () => {
    const { engine } = build();
    const armed = await engine.enterSevereMarket(MARKET, { severe: true });
    expect(armed.accepted).toBe(false);
    expect(armed.rejected?.code).toBe(COLLAR_UNPUBLISHED);
    expect(presentsZeroBand(armed)).toBe(false);
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
