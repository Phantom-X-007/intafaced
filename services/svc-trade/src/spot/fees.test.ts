import { describe, expect, it } from 'vitest';
import { MoneyError, mulBps, parseAmount as amt, formatAmount, recipes } from '@intafaced/ledger-client';
import { effectiveFeeBps, fillPayAmounts, fillReceivablesSurviveFees, ratesForFill } from './fees.js';

/**
 * Fee tiers, as pure arithmetic.
 *
 * No database, no ledger, no network — these run in every environment, which
 * matters because the rate produced here is the number the six-entry
 * `tradeFill` recipe is handed. Getting it wrong does not fail loudly; it just
 * charges the wrong amount, forever, to everyone.
 */
describe('effectiveFeeBps', () => {
  it('leaves the published rate alone at rank 0', () => {
    expect(effectiveFeeBps(20, 0)).toBe(20);
    expect(effectiveFeeBps(200, 0)).toBe(200);
  });

  it('reduces the rate — the discount is a fraction OF the fee', () => {
    // 350 bps of discount on a 200 bps fee is 7 bps off, not 96.5% off.
    expect(effectiveFeeBps(200, 350)).toBe(193);
    expect(effectiveFeeBps(100, 350)).toBe(97);
  });

  it('never increases a rate, at any rank, for any published fee', () => {
    for (const published of [0, 1, 5, 10, 20, 50, 100, 200, 500, 9999]) {
      for (const discount of [0, 25, 50, 100, 150, 200, 275, 350, 9999]) {
        const effective = effectiveFeeBps(published, discount);
        expect(effective).toBeLessThanOrEqual(published);
        expect(effective).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('is monotonic — a higher rank never pays more', () => {
    let previous = effectiveFeeBps(200, 0);
    for (const discount of [25, 50, 100, 150, 200, 275, 350]) {
      const current = effectiveFeeBps(200, discount);
      expect(current).toBeLessThanOrEqual(previous);
      previous = current;
    }
  });

  it('rounds the discount DOWN, so a discount never invents value', () => {
    // 10 bps x 350 bps = 0.35 bps of relief. Not representable, so not granted.
    // The honest consequence of integer basis points, stated rather than hidden.
    expect(effectiveFeeBps(10, 350)).toBe(10);
    // 100 x 350 = 3.5 -> 3 bps of relief, not 4.
    expect(effectiveFeeBps(100, 350)).toBe(97);
  });

  it('a near-total discount still leaves a non-negative rate', () => {
    // 200 x 0.9999 = 199.98 -> 199 bps of relief, so 1 bps is still charged.
    expect(effectiveFeeBps(200, 9999)).toBe(1);
    // 1 x 0.9999 = 0.9999 -> no representable relief at all.
    expect(effectiveFeeBps(1, 9999)).toBe(1);
  });

  it('refuses a rate or a discount outside 0..9999 bps', () => {
    expect(() => effectiveFeeBps(10_000, 0)).toThrow(MoneyError);
    expect(() => effectiveFeeBps(-1, 0)).toThrow(MoneyError);
    expect(() => effectiveFeeBps(20, 10_000)).toThrow(MoneyError);
    expect(() => effectiveFeeBps(20, -1)).toThrow(MoneyError);
    expect(() => effectiveFeeBps(20.5, 0)).toThrow(MoneyError);
  });
});

describe('ratesForFill', () => {
  it('resolves both sides independently — each carries its own rank', () => {
    const rates = ratesForFill({ makerBps: 100, takerBps: 200 }, 0, 350);
    expect(rates.makerFeeBps).toBe(100);
    expect(rates.takerFeeBps).toBe(193);
  });

  it('a discount is worth real money on a real fill', () => {
    // 1 BTC received at 200 bps, with and without a rank-7 discount.
    const received = amt('1');
    const full = mulBps(received, ratesForFill({ makerBps: 100, takerBps: 200 }, 0, 0).takerFeeBps);
    const discounted = mulBps(received, ratesForFill({ makerBps: 100, takerBps: 200 }, 0, 350).takerFeeBps);

    expect(formatAmount(full)).toBe('0.02');
    expect(formatAmount(discounted)).toBe('0.0193');
    expect(discounted).toBeLessThan(full);
  });
});

describe('fillReceivablesSurviveFees', () => {
  /**
   * THE GAP THIS GUARDS.
   *
   * `markets_dust_free_ck` only forces tick×lot ≥ 1 wei. A one-wei receivable
   * with any non-zero fee has fee == amount under mulBps ceil, and tradeFill
   * refuses. settleFill used to insert fill rows first, so the refusal left
   * trade.fills permanently ahead of the ledger. This pure guard must agree
   * with the recipe on every boundary case.
   */
  it('refuses the 1-wei × non-zero fee case the recipe refuses', () => {
    const oneWei = 1n;
    expect(
      fillReceivablesSurviveFees({
        takerPaysAmount: oneWei,
        makerPaysAmount: oneWei,
        makerFeeBps: 10,
        takerFeeBps: 20,
      }),
    ).toBe(false);

    expect(() =>
      recipes.tradeFill({
        fillId: 'f-dust',
        makerId: 'm',
        takerId: 't',
        makerOrderId: 'mo',
        takerOrderId: 'to',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        qty: oneWei,
        quoteAmount: oneWei,
        takerSide: 'buy',
        makerFeeBps: 10,
        takerFeeBps: 20,
      }),
    ).toThrow(/Fee exceeds fill value/);
  });

  it('allows a zero-fee 1-wei fill (receivable survives)', () => {
    expect(
      fillReceivablesSurviveFees({
        takerPaysAmount: 1n,
        makerPaysAmount: 1n,
        makerFeeBps: 0,
        takerFeeBps: 0,
      }),
    ).toBe(true);
  });

  it('allows a normal notional with published fees', () => {
    const pays = fillPayAmounts({
      takerSide: 'buy',
      qty: amt('0.01'),
      quoteAmount: amt('500'),
    });
    expect(
      fillReceivablesSurviveFees({
        ...pays,
        makerFeeBps: 10,
        takerFeeBps: 20,
      }),
    ).toBe(true);
  });

  it('fillPayAmounts matches tradeFill asset split for both sides', () => {
    const buy = fillPayAmounts({ takerSide: 'buy', qty: amt('2'), quoteAmount: amt('100') });
    expect(buy.takerPaysAmount).toBe(amt('100'));
    expect(buy.makerPaysAmount).toBe(amt('2'));
    const sell = fillPayAmounts({ takerSide: 'sell', qty: amt('2'), quoteAmount: amt('100') });
    expect(sell.takerPaysAmount).toBe(amt('2'));
    expect(sell.makerPaysAmount).toBe(amt('100'));
  });
});
