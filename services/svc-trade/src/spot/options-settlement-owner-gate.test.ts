import { describe, expect, it } from 'vitest';
import {
  optionsSettlementAssetLawGate,
  optionsSettlementFixingGate,
  TRADE_OPTIONS_SETTLEMENT_ASSET_LAW_ENV,
  TRADE_OPTIONS_SETTLEMENT_FIXING_ENV,
} from './options-settlement-owner-gate.js';

describe('trade.options settlement owner env gates', () => {
  it('refuses when P0-05 law stamp unset', () => {
    expect(optionsSettlementAssetLawGate({})).toMatchObject({ configured: false, reason: 'settlement_law_unset' });
  });

  it('accepts opaque P0-05 stamp without parsing', () => {
    expect(optionsSettlementAssetLawGate({ [TRADE_OPTIONS_SETTLEMENT_ASSET_LAW_ENV]: 'adr-published-2026-08-05' })).toMatchObject({
      configured: true,
      stamp: 'adr-published-2026-08-05',
    });
  });

  it('refuses when D7 fixing unset', () => {
    expect(optionsSettlementFixingGate({})).toMatchObject({ configured: false, reason: 'fixing_unset' });
  });

  it('accepts opaque D7 fixing stamp', () => {
    expect(optionsSettlementFixingGate({ [TRADE_OPTIONS_SETTLEMENT_FIXING_ENV]: 'fixing-v1' })).toMatchObject({
      configured: true,
      stamp: 'fixing-v1',
    });
  });
});
