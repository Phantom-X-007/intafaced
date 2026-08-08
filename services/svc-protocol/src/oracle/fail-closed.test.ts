import { describe, expect, it } from 'vitest';
import { markFromPair, OracleRefuseError } from './fail-closed.js';

describe('fail-closed oracle marks (S-A12)', () => {
  const now = 1_700_000_000;
  const a = { priceWad: 100n * 10n ** 18n, updatedAt: now - 10 };
  const b = { priceWad: 101n * 10n ** 18n, updatedAt: now - 5 };

  it('returns the conservative (min) mark when sources agree', () => {
    const m = markFromPair(a, b, now, 60, 200); // 2% ok
    expect(m.priceWad).toBe(a.priceWad);
  });

  it('refuses on disagreement beyond threshold', () => {
    expect(() => markFromPair(a, { ...b, priceWad: 120n * 10n ** 18n }, now, 60, 200)).toThrow(OracleRefuseError);
    try {
      markFromPair(a, { ...b, priceWad: 120n * 10n ** 18n }, now, 60, 200);
    } catch (e) {
      expect((e as OracleRefuseError).code).toBe('oracle.disagreement');
    }
  });

  it('refuses stale reports — never falls back', () => {
    expect(() => markFromPair(a, b, now + 10_000, 60, 200)).toThrow(/stale/);
  });

  it('refuses missing feed — never invents', () => {
    expect(() => markFromPair(a, null, now, 60, 200)).toThrow(/missing/);
  });
});
