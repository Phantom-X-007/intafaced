import { describe, expect, it } from 'vitest';
import { QUANT_ENVIRONMENT_REQUIRED, QUANT_ENVIRONMENT_UNKNOWN, QUANT_SIMULATED_AS_LIVE } from './errors.js';
import { requireSimulatedStamp } from './honesty.js';

describe('requireSimulatedStamp', () => {
  it('refuses blank environment by name — never live', () => {
    expect(() => requireSimulatedStamp(undefined)).toThrow(QUANT_ENVIRONMENT_REQUIRED);
    expect(() => requireSimulatedStamp('live')).toThrow(QUANT_SIMULATED_AS_LIVE);
    expect(() => requireSimulatedStamp('paper', 'live')).toThrow(QUANT_SIMULATED_AS_LIVE);
    expect(() => requireSimulatedStamp('prod')).toThrow(QUANT_ENVIRONMENT_UNKNOWN);
  });

  it('stamps paper as paper, not live', () => {
    expect(requireSimulatedStamp('paper')).toMatchObject({
      environment: 'paper',
      kind: 'paper',
      live: false,
      simulated: true,
      claimLabel: 'Paper — not live performance',
    });
  });
});
