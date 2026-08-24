import { parseAmount, ZERO } from '@intafaced/ledger-client';
import type { VenueExecution } from '@intafaced/venue-adapter';
import { describe, expect, it } from 'vitest';
import { executeOmsArbAtomicLegs } from './oms-arb-execute-legs.js';
import type { OmsSubmitFn } from './oms-trade-submit.js';

const FILLED: VenueExecution = {
  venueId: 'binance-spot',
  venueOrderId: 'v1',
  filledAmount: parseAmount('1'),
  averagePrice: parseAmount('100'),
  feeAmount: ZERO,
  feeAsset: 'USDT',
  status: 'filled',
  executedAt: new Date('2026-08-24T00:00:00.000Z'),
};

describe('executeOmsArbAtomicLegs', () => {
  it('submits buy+sell legs under parent clientOrderId', async () => {
    const calls: string[] = [];
    const submit: OmsSubmitFn = async (req) => {
      calls.push(`${req.side}:${req.clientOrderId}`);
      return { ...FILLED, venueId: req.side === 'buy' ? 'binance-spot' : 'bybit-spot' };
    };
    const result = await executeOmsArbAtomicLegs(
      {
        parentClientOrderId: 'arb-parent-1',
        symbol: 'BTC/USDT',
        amount: '1',
        buyVenueId: 'binance-spot',
        sellVenueId: 'bybit-spot',
        buyLimitPrice: '100',
        sellLimitPrice: '101',
        inventory: { prePositionedByVenue: { 'binance-spot': true, 'bybit-spot': true } },
      },
      { 'binance-spot': submit, 'bybit-spot': submit },
    );
    expect(result).toMatchObject({ ok: true, parentClientOrderId: 'arb-parent-1' });
    expect(calls).toEqual(['buy:arb-parent-1-buy', 'sell:arb-parent-1-sell']);
  });

  it('refuses when second venue is not wired', async () => {
    const submit: OmsSubmitFn = async () => FILLED;
    const result = await executeOmsArbAtomicLegs(
      {
        parentClientOrderId: 'arb-parent-2',
        symbol: 'BTC/USDT',
        amount: '1',
        buyVenueId: 'binance-spot',
        sellVenueId: 'bybit-spot',
        buyLimitPrice: '100',
        sellLimitPrice: '101',
        inventory: { prePositionedByVenue: { 'binance-spot': true, 'bybit-spot': true } },
      },
      { 'binance-spot': submit },
    );
    expect(result).toMatchObject({ ok: false, reason: 'submit_failed' });
    if (result.ok || result.reason !== 'submit_failed') throw new Error('expected submit_failed');
    expect(result.partialExecutions?.length).toBe(1);
  });
});
