import { describe, expect, it } from 'vitest';
import { EXECUTION_MM_SPREAD_SKEW_BANDS_ENV, mmSpreadSkewBandsGate, validateMmOwnerSpreadSkew } from './mm-spread-skew-bands.js';

const SAMPLE = JSON.stringify({
  minHalfSpreadBps: 1,
  maxHalfSpreadBps: 50,
  minInventorySkewBps: -25,
  maxInventorySkewBps: 25,
});

describe('MM spread/skew owner bands gate', () => {
  it('refuses when env is unset', () => {
    expect(mmSpreadSkewBandsGate({})).toEqual({
      configured: false,
      reason: 'bands_unset',
      detail: `${EXECUTION_MM_SPREAD_SKEW_BANDS_ENV} is unset`,
    });
  });

  it('parses owner JSON bands without inventing defaults', () => {
    const gate = mmSpreadSkewBandsGate({ [EXECUTION_MM_SPREAD_SKEW_BANDS_ENV]: SAMPLE });
    expect(gate.configured).toBe(true);
    if (!gate.configured) throw new Error('expected configured bands');
    expect(gate.bands).toEqual({
      minHalfSpreadBps: 1,
      maxHalfSpreadBps: 50,
      minInventorySkewBps: -25,
      maxInventorySkewBps: 25,
    });
  });

  it('validates caller magnitudes against owner bands', () => {
    const gate = mmSpreadSkewBandsGate({ [EXECUTION_MM_SPREAD_SKEW_BANDS_ENV]: SAMPLE });
    if (!gate.configured) throw new Error('expected configured bands');
    expect(validateMmOwnerSpreadSkew(gate.bands, 10, 0)).toEqual({ ok: true });
    expect(validateMmOwnerSpreadSkew(gate.bands, 0, 0)).toMatchObject({ ok: false, reason: 'half_spread_out_of_band' });
  });
});
