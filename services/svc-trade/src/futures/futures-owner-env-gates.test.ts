import { describe, expect, it } from 'vitest';
import {
  futuresFundingOwnerGate,
  futuresLeverageOwnerGate,
  TRADE_FUTURES_FUNDING_INTERVAL_MS_ENV,
  TRADE_FUTURES_FUNDING_MAX_ABS_RATE_ENV,
  TRADE_FUTURES_MAX_LEVERAGE_ENV,
} from './futures-owner-env-gates.js';

describe('futures owner funding + leverage gates', () => {
  it('refuses funding when ceiling or interval unset', () => {
    expect(futuresFundingOwnerGate({})).toMatchObject({ configured: false, reason: 'funding_unset' });
  });

  it('parses owner funding env without inventing defaults', () => {
    expect(
      futuresFundingOwnerGate({
        [TRADE_FUTURES_FUNDING_MAX_ABS_RATE_ENV]: '0.001',
        [TRADE_FUTURES_FUNDING_INTERVAL_MS_ENV]: '28800000',
      }),
    ).toMatchObject({ configured: true, maxAbsRate: '0.001', intervalMs: 28_800_000 });
  });

  it('refuses leverage when unset', () => {
    expect(futuresLeverageOwnerGate({})).toMatchObject({ configured: false, reason: 'leverage_unset' });
  });

  it('parses owner max leverage string', () => {
    expect(futuresLeverageOwnerGate({ [TRADE_FUTURES_MAX_LEVERAGE_ENV]: '10' })).toMatchObject({
      configured: true,
      maxLeverage: '10',
    });
  });
});
