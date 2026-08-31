import { describe, expect, it } from 'vitest';
import { QUANT_ENVIRONMENT_REQUIRED, QUANT_SIMULATED_AS_LIVE } from '../errors.js';
import { claimMarketplace } from './claim.js';

describe('marketplace.claim — simulated is never live', () => {
  it('refuses a missing environment instead of defaulting to live', () => {
    expect(() => claimMarketplace({ strategyId: 'alpha', pnl: '1' })).toThrow(QUANT_ENVIRONMENT_REQUIRED);
  });

  it('refuses presenting paper PnL as live', () => {
    expect(() => claimMarketplace({ strategyId: 'alpha', environment: 'paper', presentedAs: 'live', pnl: '1' })).toThrow(
      QUANT_SIMULATED_AS_LIVE,
    );
  });

  it('stamps a paper claim; pnl stays a decimal string', () => {
    const claim = claimMarketplace({ strategyId: 'alpha', environment: 'paper', pnl: '12.50' });
    expect(claim.live).toBe(false);
    expect(claim.simulated).toBe(true);
    expect(claim.environment).toBe('paper');
    expect(claim.kind).toBe('paper');
    expect(claim.claimLabel).toBe('Paper — not live performance');
    expect(claim.pnl).toBe('12.50');
    expect(typeof claim.pnl).toBe('string');
  });
});
