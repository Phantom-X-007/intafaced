import { describe, expect, it } from 'vitest';
import { MemoryLedger, parseAmount, recipes } from '@intafaced/ledger-client';
import { OtcDeskService } from './otc-service.js';
import { FixedOtcStake } from './stake-source.js';
import { UNPUBLISHED_OTC_DESK_LAW, type OtcDeskLaw } from './desk-law.js';
import { OtcError } from './errors.js';

const USER = '00000000-0000-4000-8000-000000000001';
/** Minimal principal — avoid pulling auth/contracts into this suite's graph. */
const principal = { userId: USER } as import('@intafaced/auth').Principal;

const published: OtcDeskLaw = {
  published: true,
  spreadBps: 50,
  minStake: parseAmount('500'),
  counterparty: 'platform',
  quoteTtlMs: 60_000,
};

describe('OtcDeskService', () => {
  it('deskStatus refuse-closed when law blank', () => {
    const svc = new OtcDeskService(new MemoryLedger(), new FixedOtcStake(parseAmount('0')), {
      law: UNPUBLISHED_OTC_DESK_LAW,
    });
    const s = svc.deskStatus();
    expect(s.published).toBe(false);
    expect(s.residual).toContain('DIRECTION §8');
  });

  it('quote refuses when desk law blank — never invents spread', async () => {
    const svc = new OtcDeskService(new MemoryLedger(), new FixedOtcStake(parseAmount('9999')), {
      law: UNPUBLISHED_OTC_DESK_LAW,
    });
    await expect(
      svc.quote(principal, {
        side: 'buy',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        qty: '1',
        midPrice: '100',
      }),
    ).rejects.toMatchObject({ code: 'trade.otc_desk_law_blank' });
  });

  it('quote refuses stake gate when below owner min', async () => {
    const svc = new OtcDeskService(new MemoryLedger(), new FixedOtcStake(parseAmount('100')), {
      law: published,
    });
    await expect(
      svc.quote(principal, {
        side: 'buy',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        qty: '1',
        midPrice: '100',
      }),
    ).rejects.toMatchObject({ code: 'trade.otc_stake_gate' });
  });

  it('quote → accept binds price; last look refused; settle via ledger', async () => {
    const ledger = new MemoryLedger();
    await ledger.post(recipes.marketMakerSeedFund({ assetId: 'BTC', amount: parseAmount('10'), seedId: 'otc-btc' }));
    await ledger.post(recipes.deposit({ userId: USER, assetId: 'USDT', amount: parseAmount('10000'), rail: 'test', railRef: 'otc-u' }));

    let now = new Date('2026-08-07T12:00:00.000Z');
    const svc = new OtcDeskService(ledger, new FixedOtcStake(parseAmount('1000')), {
      law: published,
      now: () => now,
    });

    const quote = await svc.quote(principal, {
      side: 'buy',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      qty: '1',
      midPrice: '200',
    });
    expect(quote.counterparty).toBe('platform');
    expect(quote.spreadBps).toBe(50);
    expect(quote.qty).toBe('1');
    expect(quote.expiresAt).toBeTruthy();

    await expect(svc.accept(principal, { quoteId: quote.quoteId, assertedPrice: '1' })).rejects.toMatchObject({
      code: 'trade.otc_last_look_forbidden',
    });

    const bound = await svc.accept(principal, { quoteId: quote.quoteId });
    expect(bound.fillPrice).toBe(quote.quotedPrice);
    expect(bound.fillNotional).toBe(quote.userNotional);

    const settled = await svc.settle(principal, { quoteId: quote.quoteId });
    expect(settled.fillId).toBeTruthy();
    expect(ledger.reconcile()).toEqual({ ok: true });
  });

  it('accept after expiry refuses', async () => {
    let now = new Date('2026-08-07T12:00:00.000Z');
    const svc = new OtcDeskService(new MemoryLedger(), new FixedOtcStake(parseAmount('1000')), {
      law: published,
      now: () => now,
    });
    const quote = await svc.quote(principal, {
      side: 'sell',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      qty: '1',
      midPrice: '200',
    });
    now = new Date('2026-08-07T13:00:00.000Z');
    await expect(svc.accept(principal, { quoteId: quote.quoteId })).rejects.toMatchObject({
      code: 'trade.otc_quote_expired',
    });
  });

  it('blank mid refuses', async () => {
    const svc = new OtcDeskService(new MemoryLedger(), new FixedOtcStake(parseAmount('1000')), { law: published });
    await expect(
      svc.quote(principal, {
        side: 'buy',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        qty: '1',
        midPrice: '',
      }),
    ).rejects.toBeInstanceOf(OtcError);
  });
});
