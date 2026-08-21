import { describe, expect, it } from 'vitest';
import { effectiveNavigatorTradePlane } from './trade-plane-env.js';

describe('effectiveNavigatorTradePlane', () => {
  it('honors explicit dark', () => {
    expect(effectiveNavigatorTradePlane('dark', 'http://trade.test')).toBe('dark');
    expect(effectiveNavigatorTradePlane('dark', undefined)).toBe('dark');
  });

  it('coerces live to dark when TRADE_URL unset', () => {
    expect(effectiveNavigatorTradePlane('live', undefined)).toBe('dark');
    expect(effectiveNavigatorTradePlane('live', '   ')).toBe('dark');
  });

  it('allows live when TRADE_URL is set', () => {
    expect(effectiveNavigatorTradePlane('live', 'http://trade.test')).toBe('live');
  });
});
