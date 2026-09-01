import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createGreeksAdapter, greeksAdapter } from './adapter.js';
import { ieeeFloat64ToDecimalString } from './ieee-decimal.js';
import { nativeAddonPath } from './native.js';
import type { NativeIeeeGreeks, NativeQuantLib } from './types.js';

const GREEK_KEYS = ['npv', 'delta', 'gamma', 'vega', 'theta'] as const;

function completeVanilla() {
  return {
    right: 'call' as const,
    strike: '100',
    spot: '100',
    volatility: '0.2',
    timeToExpiry: '1',
    riskFreeRate: '0.01',
    dividendYield: '0',
  };
}

function assertNoInventedGreeks(result: object): void {
  for (const key of GREEK_KEYS) {
    expect(key in result, `refuse must not invent ${key}`).toBe(false);
  }
  expect('yearFraction' in result, 'refuse must not invent yearFraction').toBe(false);
}

describe('greeks adapter — native QuantLib is not linked here', () => {
  it('reports unlinked (this environment has no QuantLib C++ 1.43 addon)', () => {
    expect(nativeAddonPath()).toBeNull();
    expect(greeksAdapter.linked).toBe(false);
  });

  it('refuses vanilla European Greeks and does not invent them', () => {
    const result = greeksAdapter.vanillaEuropean(completeVanilla());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('native_unavailable');
    expect(result.linked).toBe(false);
    assertNoInventedGreeks(result);
  });

  it('refuses day-count and does not invent a year fraction', () => {
    const result = greeksAdapter.yearFraction({
      convention: 'Actual365Fixed',
      start: '2026-01-01',
      end: '2026-07-01',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('native_unavailable');
    assertNoInventedGreeks(result);
  });
});

describe('greeks adapter — missing / IEEE inputs refuse even if a native stub is present', () => {
  const stub: NativeQuantLib = {
    vanillaEuropean: () => {
      throw new Error('native must not be called when inputs are missing');
    },
    yearFraction: () => {
      throw new Error('native must not be called when inputs are missing');
    },
  };
  const adapter = createGreeksAdapter({ native: stub });

  it('refuses a missing strike without calling native', () => {
    const { strike: _s, ...rest } = completeVanilla();
    const result = adapter.vanillaEuropean(rest);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('missing_input');
    expect(result.field).toBe('strike');
    assertNoInventedGreeks(result);
  });

  it('refuses blank vol without calling native', () => {
    const result = adapter.vanillaEuropean({ ...completeVanilla(), volatility: '   ' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('missing_input');
    assertNoInventedGreeks(result);
  });

  it('refuses an IEEE number on the wire', () => {
    const result = adapter.vanillaEuropean({
      ...completeVanilla(),
      // callers must not pass JS numbers; the cast is the attack we refuse
      strike: 100 as unknown as string,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('ieee_input');
    assertNoInventedGreeks(result);
  });

  it('refuses scientific-notation strings', () => {
    const result = adapter.vanillaEuropean({ ...completeVanilla(), timeToExpiry: '1e-1' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('invalid_decimal');
    assertNoInventedGreeks(result);
  });

  it('refuses a missing day-count end date', () => {
    const result = adapter.yearFraction({ convention: 'Actual365Fixed', start: '2026-01-01' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('missing_input');
    expect(result.field).toBe('end');
    assertNoInventedGreeks(result);
  });
});

describe('greeks adapter — QuantLib IEEE becomes a decimal string at the boundary', () => {
  it('converts stub QuantLib floats to decimal strings, never numbers on the result', () => {
    const ieee: NativeIeeeGreeks = {
      npv: 0.1 + 0.2,
      delta: 0.5,
      gamma: 0.02,
      vega: 0.4,
      theta: -0.03,
    };
    const adapter = createGreeksAdapter({
      native: {
        vanillaEuropean: () => ieee,
        yearFraction: () => 0.5,
      },
    });
    const result = adapter.vanillaEuropean(completeVanilla());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.npv).toBe('string');
    expect(typeof result.delta).toBe('string');
    expect(typeof result.gamma).toBe('string');
    expect(typeof result.vega).toBe('string');
    expect(typeof result.theta).toBe('string');
    expect(result.npv).toBe(ieeeFloat64ToDecimalString(0.1 + 0.2));
    expect(result.delta).toBe(ieeeFloat64ToDecimalString(0.5));
    expect(result.linked).toBe(true);
  });

  it('refuses non-finite native Greeks instead of inventing them', () => {
    const adapter = createGreeksAdapter({
      native: {
        vanillaEuropean: () => ({ npv: Number.NaN, delta: 0.5, gamma: 0.02, vega: 0.4, theta: -0.03 }),
        yearFraction: () => 0.5,
      },
    });
    const result = adapter.vanillaEuropean(completeVanilla());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('non_finite_native');
    assertNoInventedGreeks(result);
  });
});

describe('greeks adapter — this package is not a Black-Scholes engine', () => {
  it('TypeScript sources do not implement d1/d2 or a normal CDF', () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const files = readdirSync(dir).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'));
    const joined = files.map((name) => readFileSync(join(dir, name), 'utf8')).join('\n');
    expect(joined).not.toMatch(/\bd1\b/);
    expect(joined).not.toMatch(/\bd2\b/);
    expect(joined).not.toMatch(/erf\s*\(/);
    expect(joined).not.toMatch(/normalCdf|normCdf|cumulativeNormal/i);
  });
});
