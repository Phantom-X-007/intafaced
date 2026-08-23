import { describe, expect, it } from 'vitest';
import { collateralForBinaryBuy, createOutcomeMarket, OutcomeMarketError } from './outcome-market.js';

describe('custodial outcome market', () => {
  it('refuses to list an outcome market without settlementSource', () => {
    expect(() =>
      createOutcomeMarket({
        id: 'rain-vie-2026-08-24',
        question: 'Will the named fixture condition be met?',
        closeAt: '2026-08-24T12:00:00.000Z',
        settlementAssetId: 'fixture-settlement-asset',
        settlementSource: '',
      }),
    ).toThrowError(expect.objectContaining<Partial<OutcomeMarketError>>({ code: 'trade.outcome_settlement_source_unset' }));

    expect(() =>
      createOutcomeMarket({
        id: 'rain-vie-2026-08-24',
        question: 'Will the named fixture condition be met?',
        closeAt: '2026-08-24T12:00:00.000Z',
        settlementAssetId: 'fixture-settlement-asset',
        settlementSource: undefined as never,
      }),
    ).toThrowError(expect.objectContaining<Partial<OutcomeMarketError>>({ code: 'trade.outcome_settlement_source_unset' }));
  });

  it('refuses to list without a settlement asset', () => {
    expect(() =>
      createOutcomeMarket({
        id: 'rain-vie-2026-08-24',
        question: 'Will the named fixture condition be met?',
        closeAt: '2026-08-24T12:00:00.000Z',
        settlementAssetId: '',
        settlementSource: 'fixture-owner-source',
      }),
    ).toThrowError(expect.objectContaining<Partial<OutcomeMarketError>>({ code: 'trade.outcome_settlement_asset_unset' }));
  });

  it('binary YES buy is fully collateralized as a decimal string', () => {
    const market = createOutcomeMarket({
      id: 'rain-vie-2026-08-24',
      question: 'Will the named fixture condition be met?',
      closeAt: '2026-08-24T12:00:00.000Z',
      settlementAssetId: 'fixture-settlement-asset',
      settlementSource: 'fixture-owner-source',
    });

    expect(market.instruments).toEqual([
      { outcome: 'yes', symbol: 'rain-vie-2026-08-24:YES' },
      { outcome: 'no', symbol: 'rain-vie-2026-08-24:NO' },
    ]);
    expect(collateralForBinaryBuy('1.000000000000000001')).toBe('1.000000000000000001');
  });

  it('refuses numeric or non-positive size instead of coercing it', () => {
    expect(() => collateralForBinaryBuy(1 as never)).toThrowError(
      expect.objectContaining<Partial<OutcomeMarketError>>({ code: 'trade.outcome_size_invalid' }),
    );
    expect(() => collateralForBinaryBuy('0')).toThrowError(
      expect.objectContaining<Partial<OutcomeMarketError>>({ code: 'trade.outcome_size_invalid' }),
    );
  });
});
