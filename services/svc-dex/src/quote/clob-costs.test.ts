import { describe, expect, it } from 'vitest';
import { ClobFeeUnconfiguredError, clobCostsFromOptional } from './clob-costs.js';

describe('S-I3 clob costs — no silent zero understatement', () => {
  it('omits the CLOB venue when both knobs are unset', () => {
    expect(clobCostsFromOptional(undefined, undefined)).toBeNull();
  });

  it('accepts an explicit schedule including honest zero settlement', () => {
    const costs = clobCostsFromOptional(10, '0');
    expect(costs?.feeBps).toBe(10);
    expect(costs?.settlementCost).toBe(0n);
  });

  it('refuses a one-sided config that would quote a guessed zero', () => {
    expect(() => clobCostsFromOptional(0, undefined)).toThrow(ClobFeeUnconfiguredError);
    expect(() => clobCostsFromOptional(undefined, '0')).toThrow(ClobFeeUnconfiguredError);
  });
});
