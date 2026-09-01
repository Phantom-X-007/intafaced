import { describe, expect, it } from 'vitest';
import { IeeeNonFiniteError, ieeeFloat64ToDecimalString } from './ieee-decimal.js';

describe('ieeeFloat64ToDecimalString', () => {
  it('maps 0 and -0 to "0"', () => {
    expect(ieeeFloat64ToDecimalString(0)).toBe('0');
    expect(ieeeFloat64ToDecimalString(-0)).toBe('0');
  });

  it('is exact for dyadic values', () => {
    expect(ieeeFloat64ToDecimalString(0.5)).toBe('0.5');
    expect(ieeeFloat64ToDecimalString(2)).toBe('2');
    expect(ieeeFloat64ToDecimalString(-4)).toBe('-4');
  });

  it('shows the actual IEEE value of 0.1, not the decimal literal', () => {
    const s = ieeeFloat64ToDecimalString(0.1);
    expect(s.startsWith('0.1')).toBe(true);
    expect(s === '0.1').toBe(false);
    expect(Number(s)).toBe(0.1);
  });

  it('refuses NaN and infinities', () => {
    expect(() => ieeeFloat64ToDecimalString(Number.NaN)).toThrow(IeeeNonFiniteError);
    expect(() => ieeeFloat64ToDecimalString(Number.POSITIVE_INFINITY)).toThrow(IeeeNonFiniteError);
  });
});
