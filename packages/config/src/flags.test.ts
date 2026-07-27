import { describe, expect, it } from 'vitest';
import { FLAG_REGISTRY, isEnabled, resolveAll, UnknownFlagError } from './flags.js';

const base = { drop: '0' } as const;

describe('§11 drop sequence', () => {
  it('ships everything dark at drop 0 except the tease flags', () => {
    const all = resolveAll(base);
    expect(all['waitlist.enabled']).toBe(true);
    expect(all['mining.testnet']).toBe(true);
    expect(all['blueprint.onboarding']).toBe(false);
    expect(all['token.tge']).toBe(false);
  });

  it('opens flags cumulatively as drops advance', () => {
    expect(isEnabled('blueprint.onboarding', { drop: 'I' })).toBe(true);
    expect(isEnabled('waitlist.enabled', { drop: 'IV' })).toBe(true);
    expect(isEnabled('token.tge', { drop: 'III' })).toBe(false);
    expect(isEnabled('token.tge', { drop: 'IV' })).toBe(true);
  });

  it('leaves phase-gated flags off at every drop until explicitly enabled', () => {
    for (const drop of ['0', 'I', 'II', 'III', 'IV', 'V'] as const) {
      expect(isEnabled('chain.mainnet', { drop })).toBe(false);
    }
    expect(isEnabled('chain.mainnet', { drop: '0', overrides: { 'chain.mainnet': true } })).toBe(true);
  });
});

describe('overrides', () => {
  it('lets an explicit override win over the drop default', () => {
    expect(isEnabled('waitlist.enabled', { drop: 'V', overrides: { 'waitlist.enabled': false } })).toBe(false);
  });

  it('reads env overrides', () => {
    expect(isEnabled('token.tge', { drop: '0', env: { INTAFACED_FLAG_TOKEN_TGE: 'on' } })).toBe(true);
  });

  it('prefers an explicit override over the env override', () => {
    expect(isEnabled('token.tge', { drop: '0', overrides: { 'token.tge': false }, env: { INTAFACED_FLAG_TOKEN_TGE: 'on' } })).toBe(false);
  });
});

describe('kill-switch (§14 admin controls)', () => {
  it('beats every other signal', () => {
    expect(
      isEnabled('token.tge', {
        drop: 'V',
        overrides: { 'token.tge': true },
        env: { INTAFACED_FLAG_TOKEN_TGE: 'on' },
        disabledModules: ['token'],
      }),
    ).toBe(false);
  });
});

describe('registry hygiene', () => {
  it('rejects undeclared flags', () => {
    expect(() => isEnabled('made.up.flag', base)).toThrow(UnknownFlagError);
  });

  it('has no duplicate keys', () => {
    const keys = FLAG_REGISTRY.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
