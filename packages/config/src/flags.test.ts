import { describe, expect, it } from 'vitest';
import {
  DROPS,
  DROP_NAMES,
  FLAG_REGISTRY,
  assertEnabled,
  compareDrops,
  explain,
  FlagDisabledError,
  isCapabilityBuilt,
  isEnabled,
  modulesWithoutKillSwitch,
  offReadiness,
  resolveAll,
  UnknownFlagError,
  type FlagContext,
} from './flags.js';
import { MODULE_IDS } from './modules.js';

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

describe('explain — why a flag is in its state', () => {
  it('attributes an on flag to the drop clock, and names the drop', () => {
    const e = explain('blueprint.onboarding', { drop: 'I' });
    expect(e).toMatchObject({ enabled: true, source: 'drop' });
    expect(e.reason).toContain('Blueprint');
  });

  it('attributes a not-yet flag to a pending drop', () => {
    expect(explain('token.tge', { drop: 'I' })).toMatchObject({ enabled: false, source: 'drop-pending' });
  });

  it('distinguishes phase-gated from merely waiting', () => {
    // The distinction an operator needs: `chain.mainnet` will NEVER turn on by
    // waiting, however far the drop clock advances. `token.tge` will.
    expect(explain('chain.mainnet', { drop: 'V' })).toMatchObject({ enabled: false, source: 'phase-gated' });
    expect(explain('token.tge', { drop: 'III' })).toMatchObject({ source: 'drop-pending' });
  });

  it('names the env var that pinned a flag', () => {
    const e = explain('token.tge', { drop: '0', env: { INTAFACED_FLAG_TOKEN_TGE: 'on' } });
    expect(e).toMatchObject({ enabled: true, source: 'env' });
    expect(e.reason).toContain('INTAFACED_FLAG_TOKEN_TGE');
  });

  it('reports an explicit override', () => {
    expect(explain('waitlist.enabled', { drop: 'V', overrides: { 'waitlist.enabled': false } })).toMatchObject({
      enabled: false,
      source: 'override',
    });
  });

  it('reports the kill-switch, and it beats everything else', () => {
    expect(
      explain('token.tge', {
        drop: 'V',
        overrides: { 'token.tge': true },
        env: { INTAFACED_FLAG_TOKEN_TGE: 'on' },
        disabledModules: ['token'],
      }),
    ).toMatchObject({ enabled: false, source: 'kill-switch' });
  });

  /**
   * The important one. `explain` mirrors `isEnabled`'s precedence by hand, so
   * without this they could silently drift — and an operator acting on a wrong
   * explanation is worse off than one with no explanation at all.
   */
  it('never disagrees with isEnabled, across every flag and a spread of contexts', () => {
    const contexts: FlagContext[] = [
      { drop: '0' },
      { drop: 'III' },
      { drop: 'V' },
      { drop: 'V', disabledModules: ['token', 'trade'] },
      { drop: '0', env: { INTAFACED_FLAG_TOKEN_TGE: 'on', INTAFACED_FLAG_CHAIN_MAINNET: 'off' } },
      { drop: 'II', overrides: { 'token.tge': true, 'waitlist.enabled': false } },
    ];

    for (const ctx of contexts) {
      for (const flag of FLAG_REGISTRY) {
        expect(explain(flag.key, ctx).enabled, `${flag.key} @ drop ${ctx.drop}`).toBe(isEnabled(flag.key, ctx));
      }
    }
  });
});

describe('§14 — every module needs a kill-switch', () => {
  it('leaves no module without one', () => {
    // A module with no flag is a module whose Definition of Done can never
    // pass, because the gate checks for exactly this. `market` and `indexer`
    // were missing — both would have been blocked on the day they landed.
    expect(modulesWithoutKillSwitch(MODULE_IDS)).toEqual([]);
  });
});

describe('drop ordering', () => {
  it('compares by sequence, not lexicographically', () => {
    expect(compareDrops('0', 'V')).toBeLessThan(0);
    expect(compareDrops('IV', 'III')).toBeGreaterThan(0);
    expect(compareDrops('II', 'II')).toBe(0);
  });

  it('names every drop', () => {
    for (const drop of DROPS) expect(DROP_NAMES[drop]).toBeTruthy();
    expect(DROP_NAMES.III).toBe('Soft launch');
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

/**
 * Product Done bar — `infra.drop-flags` / L14 wave 10.
 *
 * `isEnabled` is a registry read. Product surfaces (waitlist capture, referral
 * queue) must REFUSE when the drop clock (or an override) says off. Before
 * `assertEnabled`, nothing threw: wrong phase was silent open if a caller
 * forgot to branch on the boolean.
 */
describe('assertEnabled — waitlist / referral refuse wrong phase', () => {
  it('lets waitlist and referral through at drop 0 (Tease — §11:449)', () => {
    expect(() => assertEnabled('waitlist.enabled', { drop: '0' })).not.toThrow();
    expect(() => assertEnabled('referral.queue', { drop: '0' })).not.toThrow();
  });

  it('refuses waitlist when explicitly off (operator closed capture)', () => {
    expect(() => assertEnabled('waitlist.enabled', { drop: '0', overrides: { 'waitlist.enabled': false } })).toThrow(FlagDisabledError);
    try {
      assertEnabled('waitlist.enabled', { drop: 'V', overrides: { 'waitlist.enabled': false } });
      expect.unreachable('must refuse');
    } catch (err) {
      expect(err).toBeInstanceOf(FlagDisabledError);
      const e = err as FlagDisabledError;
      expect(e.code).toBe('flag.waitlist.enabled.disabled');
      expect(e.source).toBe('override');
      expect(e.key).toBe('waitlist.enabled');
    }
  });

  it('refuses referral queue when env-pinned off', () => {
    expect(() =>
      assertEnabled('referral.queue', {
        drop: '0',
        env: { INTAFACED_FLAG_REFERRAL_QUEUE: 'off' },
      }),
    ).toThrow(FlagDisabledError);
  });

  it('refuses a later-phase flag before its drop (wrong phase)', () => {
    // bank.cardWaitlist is drop II — at Tease it must not capture.
    expect(() => assertEnabled('bank.cardWaitlist', { drop: '0' })).toThrow(FlagDisabledError);
    try {
      assertEnabled('bank.cardWaitlist', { drop: 'I' });
      expect.unreachable('must refuse');
    } catch (err) {
      const e = err as FlagDisabledError;
      expect(e.code).toBe('flag.bank.cardWaitlist.drop_pending');
      expect(e.source).toBe('drop-pending');
    }
    expect(() => assertEnabled('bank.cardWaitlist', { drop: 'II' })).not.toThrow();
  });

  it('refuses founding badges and season engine before their drops', () => {
    expect(() => assertEnabled('launch.foundingBadges', { drop: '0' })).toThrow(FlagDisabledError);
    expect(() => assertEnabled('identity.seasonEngine', { drop: 'IV' })).toThrow(FlagDisabledError);
    expect(() => assertEnabled('identity.seasonEngine', { drop: 'V' })).not.toThrow();
  });

  it('refuses unknown keys the same way isEnabled does', () => {
    expect(() => assertEnabled('not.a.flag', { drop: 'V' })).toThrow(UnknownFlagError);
  });

  it('kill-switch refuses even when the drop clock would open the flag', () => {
    expect(() => assertEnabled('waitlist.enabled', { drop: 'V', disabledModules: ['core-ops'] })).toThrow(FlagDisabledError);
  });
});

/**
 * Tracker Done bar: OFF for an unbuilt feature reads unbuilt, not "ready".
 * Enforced flags waiting on the drop clock read drop-pending (built control).
 */
describe('offReadiness — OFF-and-unbuilt vs OFF-and-ready', () => {
  it('marks waitlist / referral as unbuilt when off (plan rows, no live service gate)', () => {
    expect(isCapabilityBuilt('waitlist.enabled')).toBe(false);
    expect(isCapabilityBuilt('referral.queue')).toBe(false);
    expect(offReadiness('waitlist.enabled', { drop: '0', overrides: { 'waitlist.enabled': false } })).toBe('unbuilt');
    expect(offReadiness('referral.queue', { drop: '0', overrides: { 'referral.queue': false } })).toBe('unbuilt');
  });

  it('marks a built control waiting on the clock as drop-pending, not unbuilt', () => {
    // trade.spot is service-env enforced — feature exists; drop III has not arrived.
    expect(isCapabilityBuilt('trade.spot')).toBe(true);
    expect(offReadiness('trade.spot', { drop: '0' })).toBe('drop-pending');
  });

  it('returns null when the flag is on', () => {
    expect(offReadiness('waitlist.enabled', { drop: '0' })).toBeNull();
    expect(offReadiness('trade.spot', { drop: 'III' })).toBeNull();
  });
});
