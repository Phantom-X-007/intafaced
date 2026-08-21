import { describe, expect, it } from 'vitest';
import { PayError } from './payment-service.js';
import {
  DEFAULT_SANDBOX_RAIL_ID,
  assertSandboxKeyDoesNotLookLive,
  isSandboxRailId,
  paymentModeFromRail,
  resolveMerchantRail,
} from './sandbox-key-routing.js';

describe('isSandboxRailId', () => {
  it('recognises card-sandbox and *-sandbox suffixes', () => {
    expect(isSandboxRailId('card-sandbox')).toBe(true);
    expect(isSandboxRailId('psp-sandbox')).toBe(true);
    expect(isSandboxRailId('crypto-native')).toBe(false);
    expect(isSandboxRailId('card-live')).toBe(false);
  });
});

describe('resolveMerchantRail — sandbox vs live key routing (ADR §2.5 step 4)', () => {
  it('routes a sandbox principal to the sandbox rail even when the body names a live rail', () => {
    expect(
      resolveMerchantRail({
        keyEnv: 'sandbox',
        requestedRail: 'crypto-native',
      }),
    ).toBe(DEFAULT_SANDBOX_RAIL_ID);
  });

  it('keeps a sandbox principal on the sandbox rail when the body already names it', () => {
    expect(
      resolveMerchantRail({
        keyEnv: 'sandbox',
        requestedRail: 'card-sandbox',
      }),
    ).toBe('card-sandbox');
  });

  it('allows a live principal onto a non-sandbox rail', () => {
    expect(
      resolveMerchantRail({
        keyEnv: 'live',
        requestedRail: 'crypto-native',
      }),
    ).toBe('crypto-native');
  });

  it('refuses a live principal that names a sandbox rail', () => {
    try {
      resolveMerchantRail({
        keyEnv: 'live',
        requestedRail: 'card-sandbox',
      });
      expect.unreachable('should have refused');
    } catch (err) {
      expect(err).toBeInstanceOf(PayError);
      expect((err as PayError).code).toBe('pay.sandbox_rail_refused');
    }
  });

  it('treats a missing key_env as live (sessions / legacy) — never silent sandbox upgrade', () => {
    expect(
      resolveMerchantRail({
        keyEnv: undefined,
        requestedRail: 'crypto-native',
      }),
    ).toBe('crypto-native');

    expect(() =>
      resolveMerchantRail({
        keyEnv: undefined,
        requestedRail: 'card-sandbox',
      }),
    ).toThrow(PayError);
  });

  it('does not invent a parallel stack — sandbox id is the existing card-sandbox rail', () => {
    const rail = resolveMerchantRail({ keyEnv: 'sandbox', requestedRail: 'anything' });
    expect(rail).toBe('card-sandbox');
    expect(isSandboxRailId(rail)).toBe(true);
  });
});

describe('paymentModeFromRail — never invent live', () => {
  it('discloses sandbox from card-sandbox and live from a non-sandbox rail', () => {
    expect(paymentModeFromRail('card-sandbox')).toBe('sandbox');
    expect(paymentModeFromRail('crypto-native')).toBe('live');
  });

  it('REFUSES a missing rail rather than reporting live', () => {
    try {
      paymentModeFromRail(null);
      expect.unreachable('should have refused');
    } catch (err) {
      expect(err).toBeInstanceOf(PayError);
      expect((err as PayError).code).toBe('pay.rail_mode_undisclosed');
    }
  });
});

describe('assertSandboxKeyDoesNotLookLive', () => {
  it('lets a sandbox key observe a sandbox rail', () => {
    expect(() => assertSandboxKeyDoesNotLookLive('sandbox', 'card-sandbox')).not.toThrow();
  });

  it('REFUSES a sandbox key observing a live rail', () => {
    try {
      assertSandboxKeyDoesNotLookLive('sandbox', 'crypto-native');
      expect.unreachable('should have refused');
    } catch (err) {
      expect(err).toBeInstanceOf(PayError);
      expect((err as PayError).code).toBe('pay.sandbox_looks_live');
    }
  });

  it('does not constrain a live key', () => {
    expect(() => assertSandboxKeyDoesNotLookLive('live', 'crypto-native')).not.toThrow();
  });
});
