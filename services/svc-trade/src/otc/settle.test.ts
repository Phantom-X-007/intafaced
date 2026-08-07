import { describe, expect, it } from 'vitest';
import { formatAmount, marketMaker, MemoryLedger, parseAmount, recipes, userAvailable } from '@intafaced/ledger-client';
import { planOtcSettle, postOtcSettle } from './settle.js';
import { acceptOtcQuote, buildOtcQuote } from './rfq.js';
import { UNPUBLISHED_OTC_DESK_LAW, type OtcDeskLaw } from './desk-law.js';
import { OtcError } from './errors.js';

const USER = '00000000-0000-4000-8000-000000000001';

const published: OtcDeskLaw = {
  published: true,
  spreadBps: 100,
  minStake: parseAmount('100'),
  counterparty: 'platform',
  quoteTtlMs: 30_000,
};

describe('planOtcSettle / postOtcSettle', () => {
  it('refuses when desk law blank — no ledger posts planned', () => {
    const q = buildOtcQuote({
      quoteId: 'q1',
      userId: USER,
      side: 'buy',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      qty: parseAmount('1'),
      midPrice: parseAmount('100'),
      spreadBps: 100,
      counterparty: 'platform',
      counterpartyId: 'platform:otc-desk',
      now: new Date('2026-08-07T10:00:00.000Z'),
      quoteTtlMs: 30_000,
    });
    const bound = acceptOtcQuote({ quote: q, now: new Date('2026-08-07T10:00:01.000Z') });
    expect(() =>
      planOtcSettle({
        law: UNPUBLISHED_OTC_DESK_LAW,
        bound,
        takerOrderId: 't1',
        makerOrderId: 'm1',
        fillId: 'f1',
      }),
    ).toThrow(OtcError);
  });

  it('posts hold + mm hold + fill via ledger-client only at bound quoted notional', async () => {
    const ledger = new MemoryLedger();
    await ledger.post(recipes.marketMakerSeedFund({ assetId: 'BTC', amount: parseAmount('10'), seedId: 'otc-btc' }));
    await ledger.post(recipes.deposit({ userId: USER, assetId: 'USDT', amount: parseAmount('1000'), rail: 'test', railRef: 'otc-fund' }));

    const q = buildOtcQuote({
      quoteId: 'q1',
      userId: USER,
      side: 'buy',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      qty: parseAmount('1'),
      midPrice: parseAmount('100'),
      spreadBps: 100,
      counterparty: 'platform',
      counterpartyId: 'platform:otc-desk',
      now: new Date('2026-08-07T10:00:00.000Z'),
      quoteTtlMs: 30_000,
    });
    const bound = acceptOtcQuote({ quote: q, now: new Date('2026-08-07T10:00:01.000Z') });
    expect(formatAmount(bound.fillNotional)).toBe('101');

    const plan = planOtcSettle({
      law: published,
      bound,
      takerOrderId: 'taker-otc-1',
      makerOrderId: 'maker-otc-1',
      fillId: 'fill-otc-1',
    });

    expect(plan.fill.reason).toBe('trade.fill.mm_maker');
    expect(plan.fill.meta?.takerFeeBps).toBe(0);
    expect(plan.fill.meta?.makerFeeBps).toBe(0);

    await postOtcSettle(ledger, plan);

    expect(formatAmount((await ledger.balance(userAvailable(USER, 'BTC'))).amount)).toBe('1');
    expect(formatAmount((await ledger.balance(marketMaker('USDT'))).amount)).toBe('101');
    expect(ledger.reconcile()).toEqual({ ok: true });
  });
});
