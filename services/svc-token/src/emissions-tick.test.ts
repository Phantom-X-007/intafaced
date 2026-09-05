import { describe, expect, it } from 'vitest';
import { TokenError } from './token-service.js';
import { readEmissionsTickMs, requireEmissionsTickMsForAutoTick } from './emissions-tick.js';

describe('readEmissionsTickMs', () => {
  it('blank / missing / garbage is unset — 86400000 is only owner-present', () => {
    expect(readEmissionsTickMs(undefined)).toBeUndefined();
    expect(readEmissionsTickMs('')).toBeUndefined();
    expect(readEmissionsTickMs('  ')).toBeUndefined();
    expect(readEmissionsTickMs('0')).toBeUndefined();
    expect(readEmissionsTickMs('999')).toBeUndefined();
    expect(readEmissionsTickMs('86400000.0')).toBeUndefined();
    expect(readEmissionsTickMs('1d')).toBeUndefined();
    expect(readEmissionsTickMs('86400000')).toBe(86_400_000);
    expect(readEmissionsTickMs('1000')).toBe(1_000);
  });
});

describe('requireEmissionsTickMsForAutoTick', () => {
  it('auto-tick off does not invent 86400000', () => {
    expect(requireEmissionsTickMsForAutoTick(false, undefined)).toBeUndefined();
    expect(requireEmissionsTickMsForAutoTick(false, '')).toBeUndefined();
    expect(requireEmissionsTickMsForAutoTick(false, '86400000')).toBe(86_400_000);
  });

  it('auto-tick on refuses unset — never invents 86400000', () => {
    expect(() => requireEmissionsTickMsForAutoTick(true, undefined)).toThrow(TokenError);
    expect(() => requireEmissionsTickMsForAutoTick(true, '')).toThrow(TokenError);
    expect(() => requireEmissionsTickMsForAutoTick(true, '999')).toThrow(TokenError);
    try {
      requireEmissionsTickMsForAutoTick(true, undefined);
      throw new Error('expected refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(TokenError);
      expect((e as TokenError).code).toBe('token.emissions_tick_unset');
    }
  });

  it('auto-tick on accepts owner-published 86400000', () => {
    expect(requireEmissionsTickMsForAutoTick(true, '86400000')).toBe(86_400_000);
  });
});
