import { describe, expect, it } from 'vitest';
import {
  AmbassadorProgrammeError,
  assertFreezeReason,
  badgeOf,
  type AmbassadorRecord,
} from './programme.js';

const base = (overrides: Partial<AmbassadorRecord> = {}): AmbassadorRecord => ({
  userId: '11111111-1111-4111-8111-111111111111',
  status: 'active',
  appointedBy: '22222222-2222-4222-8222-222222222222',
  appointedAt: new Date('2026-08-01T00:00:00Z'),
  frozenAt: null,
  frozenBy: null,
  freezeReason: null,
  ...overrides,
});

describe('badgeOf — public label', () => {
  it('is not ambassador when no row', () => {
    expect(badgeOf('u', null)).toEqual({ userId: 'u', isAmbassador: false, status: null });
  });

  it('isAmbassador only when active', () => {
    expect(badgeOf('u', base()).isAmbassador).toBe(true);
    expect(badgeOf('u', base({ status: 'frozen', frozenAt: new Date(), frozenBy: 'op', freezeReason: 'pause' })).isAmbassador).toBe(
      false,
    );
  });
});

describe('assertFreezeReason', () => {
  it('trims and accepts a named reason', () => {
    expect(assertFreezeReason('  policy breach  ')).toBe('policy breach');
  });

  it('refuses empty / short reasons', () => {
    expect(() => assertFreezeReason('  x  ')).toThrow(AmbassadorProgrammeError);
    expect(() => assertFreezeReason('')).toThrow(AmbassadorProgrammeError);
  });
});
