import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client/money';
import { MemoryEventBus } from '@intafaced/events';
import { MatchingEngine } from './engine.js';
import { MemoryJournal } from './journal.js';
import type { EngineOrder, OrderSide } from './types.js';
import { MMP_SIDECAR_REFUSED, MMP_UNPUBLISHED, applyMmp, installMmp, mmpMagnitudesUnset, type MmpResult } from './mmp.js';

installMmp();

/**
 * CARD E3 hitch. MMP law in-repo.
 * Magnitudes OWNER-SET → unset-refuse. Not a vendor MM. Quoted qty only — no sidecar.
 */

const MARKET = 'BTC/USDT';
const ASK = '11111111-1111-4111-8111-111111111111';
const BID = '22222222-2222-4222-8222-222222222222';

type MmpEngine = MatchingEngine & {
  applyMmp(marketId: string): Promise<MmpResult>;
};

type MmpFields = {
  mmp?: boolean;
  mmpMaxQuote?: unknown;
  mmpMaxPosition?: unknown;
  mmpMaxLoss?: unknown;
  mmpMaxDelta?: unknown;
  mmpMaxVega?: unknown;
  mmpVendor?: boolean;
  sidecar?: boolean;
};

function order(spec: { id: string; account?: string; side: OrderSide; qty: string; price: string } & MmpFields): EngineOrder {
  return {
    orderId: spec.id,
    accountId: spec.account ?? 'desk',
    type: 'limit',
    side: spec.side,
    qty: parseAmount(spec.qty),
    price: parseAmount(spec.price),
    stopPrice: null,
    tif: 'GTC',
    ...(spec.mmp === true ? { mmp: true } : {}),
    ...(spec.mmpMaxQuote !== undefined ? { mmpMaxQuote: spec.mmpMaxQuote } : {}),
    ...(spec.mmpMaxPosition !== undefined ? { mmpMaxPosition: spec.mmpMaxPosition } : {}),
    ...(spec.mmpMaxLoss !== undefined ? { mmpMaxLoss: spec.mmpMaxLoss } : {}),
    ...(spec.mmpMaxDelta !== undefined ? { mmpMaxDelta: spec.mmpMaxDelta } : {}),
    ...(spec.mmpMaxVega !== undefined ? { mmpMaxVega: spec.mmpMaxVega } : {}),
    ...(spec.mmpVendor === true ? { mmpVendor: true } : {}),
    ...(spec.sidecar === true ? { sidecar: true } : {}),
  } as EngineOrder;
}

function liveIds(engine: MatchingEngine): string[] {
  return engine.restingOrders(MARKET).map((row) => row.orderId);
}

function build() {
  const journal = new MemoryJournal();
  const bus = new MemoryEventBus('svc-matching');
  const engine = new MatchingEngine({ journal, bus, snapshotEvery: 0 }) as MmpEngine;
  return { journal, bus, engine };
}

function presentsZeroMax(result: MmpResult): boolean {
  const raw = result as MmpResult & {
    maxQuote?: unknown;
    maxPosition?: unknown;
    maxLoss?: unknown;
    delta?: unknown;
    quoteSize?: unknown;
    max?: unknown;
    band?: unknown;
  };
  return (
    raw.maxQuote === 0 ||
    raw.maxPosition === 0 ||
    raw.maxLoss === 0 ||
    raw.delta === 0 ||
    raw.quoteSize === 0 ||
    raw.max === 0 ||
    raw.band === 0
  );
}

describe('mmp — unpublished is not zero, not a vendor MM', () => {
  it('MMP on a quote/submit with unset magnitudes refuses mmp_unpublished; book empty', async () => {
    const { engine } = build();
    const flagged = await engine.submit(MARKET, order({ id: ASK, side: 'sell', qty: '1', price: '100', mmp: true }));
    expect(mmpMagnitudesUnset()).toBe(true);
    expect(flagged.accepted).toBe(false);
    expect(flagged.rejected?.code).toBe(MMP_UNPUBLISHED);
    expect(liveIds(engine)).toEqual([]);

    const magnitude = await engine.submit(MARKET, order({ id: BID, side: 'buy', qty: '1', price: '99', mmpMaxQuote: parseAmount('1') }));
    expect(magnitude.accepted).toBe(false);
    expect(magnitude.rejected?.code).toBe(MMP_UNPUBLISHED);
    expect(liveIds(engine)).toEqual([]);

    const blankDelta = await engine.submit(
      MARKET,
      order({ id: '33333333-3333-4333-8333-333333333333', side: 'sell', qty: '1', price: '100', mmpMaxDelta: '' }),
    );
    expect(blankDelta.accepted).toBe(false);
    expect(blankDelta.rejected?.code).toBe(MMP_UNPUBLISHED);
    expect(liveIds(engine)).toEqual([]);
  });

  it('vendor/sidecar flag refuses mmp_sidecar_refused', async () => {
    const { engine } = build();
    const vendor = await engine.submit(MARKET, order({ id: ASK, side: 'sell', qty: '1', price: '100', mmpVendor: true }));
    expect(vendor.accepted).toBe(false);
    expect(vendor.rejected?.code).toBe(MMP_SIDECAR_REFUSED);

    const sidecar = await engine.submit(MARKET, order({ id: BID, side: 'buy', qty: '1', price: '99', sidecar: true }));
    expect(sidecar.accepted).toBe(false);
    expect(sidecar.rejected?.code).toBe(MMP_SIDECAR_REFUSED);
    expect(liveIds(engine)).toEqual([]);
  });

  it('applyMmp unpublished; never returns 0 as a live max', async () => {
    const { engine } = build();
    const hitch = await engine.applyMmp(MARKET);
    const direct = applyMmp(MARKET);
    expect(hitch.accepted).toBe(false);
    expect(hitch.rejected?.code).toBe(MMP_UNPUBLISHED);
    expect(direct.accepted).toBe(false);
    expect(direct.rejected?.code).toBe(MMP_UNPUBLISHED);
    expect(presentsZeroMax(hitch)).toBe(false);
    expect(presentsZeroMax(direct)).toBe(false);
    expect('maxQuote' in hitch).toBe(false);
    expect('maxPosition' in hitch).toBe(false);
    expect('maxLoss' in hitch).toBe(false);
    expect('delta' in hitch).toBe(false);
    expect('band' in hitch).toBe(false);
  });

  it('no MATCHING_MMP_ env invented', () => {
    expect(mmpMagnitudesUnset()).toBe(true);
    expect(Object.keys(process.env).filter((key) => key.startsWith('MATCHING_MMP_'))).toEqual([]);
  });
});
