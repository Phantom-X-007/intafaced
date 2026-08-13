import { describe, expect, it } from 'vitest';
import { CardSandboxAdapter } from '../rails/card-sandbox.js';
import { CryptoNativeAdapter } from '../rails/crypto-native.js';
import { MemoryChain } from '../rails/chain-port.js';
import { RailRegistry } from '../rails/registry.js';
import { RoutingInputError } from '../routing-inputs.js';
import {
  REFERENCE_RAIL_ROUTING_PROFILES,
  selectSmartCheckoutRail,
  SmartRoutingNoRailError,
  toRoutingDecisionRecord,
  type RailRoutingProfile,
} from './decide.js';

/**
 * Unit card — pay.routing product path · D26-P1-P3
 *
 * 1. Promise: geo/method/risk routing; refuse when data missing; log reasons;
 *    never invent approval/cost fields.
 * 2. Reachable break: tip only had assertInputs — no decide that selects a rail.
 * 3. Done bar: present dims + profiles → chosen rail; blank dims → input_missing;
 *    no match → routing_no_rail with full considered log.
 * 4. Class M-adjacent (chooses money path) but moves no value.
 * 5. Paths: services/svc-pay/src/routing/** — clear of #1694 settlement + #1657 fraud.
 */

function registry(): RailRegistry {
  return new RailRegistry([
    new CryptoNativeAdapter({ chain: new MemoryChain(), secret: 'routing-crypto-test-secret-at-least-32' }),
    new CardSandboxAdapter({ secret: 'routing-decide-test-secret-at-least-32-chars' }),
  ]);
}

const preference = ['crypto-native', 'card-sandbox'] as const;

describe('selectSmartCheckoutRail — geo/method/risk product path', () => {
  it('refuses when any required dimension is missing — never invents defaults', () => {
    expect(() =>
      selectSmartCheckoutRail({
        inputs: { method: 'crypto', riskBand: 'low' },
        preference,
        profiles: REFERENCE_RAIL_ROUTING_PROFILES,
        rails: registry(),
        policy: 'allow-sandbox',
      }),
    ).toThrow(RoutingInputError);

    expect(() =>
      selectSmartCheckoutRail({
        inputs: { geoCountry: 'DE', riskBand: 'low' },
        preference,
        profiles: REFERENCE_RAIL_ROUTING_PROFILES,
        rails: registry(),
        policy: 'allow-sandbox',
      }),
    ).toThrow(RoutingInputError);

    expect(() =>
      selectSmartCheckoutRail({
        inputs: { geoCountry: 'DE', method: 'crypto' },
        preference,
        profiles: REFERENCE_RAIL_ROUTING_PROFILES,
        rails: registry(),
        policy: 'allow-sandbox',
      }),
    ).toThrow(RoutingInputError);
  });

  it('selects crypto-native for crypto + eligible geo/risk', () => {
    const decision = selectSmartCheckoutRail({
      inputs: { geoCountry: 'DE', method: 'crypto', riskBand: 'external:ok' },
      preference,
      profiles: REFERENCE_RAIL_ROUTING_PROFILES,
      rails: registry(),
      policy: 'allow-sandbox',
    });
    expect(decision.chosenRailId).toBe('crypto-native');
    expect(decision.adapter.id).toBe('crypto-native');
    expect(decision.inputs).toEqual({ geoCountry: 'DE', method: 'crypto', riskBand: 'external:ok' });
    expect(decision.considered.some((e) => e.railId === 'crypto-native' && e.outcome === 'chosen')).toBe(true);
  });

  it('skips crypto on method mismatch and chooses card-sandbox for card', () => {
    const decision = selectSmartCheckoutRail({
      inputs: { geoCountry: 'US', method: 'card', riskBand: 'low' },
      preference,
      profiles: REFERENCE_RAIL_ROUTING_PROFILES,
      rails: registry(),
      policy: 'allow-sandbox',
    });
    expect(decision.chosenRailId).toBe('card-sandbox');
    const crypto = decision.considered.find((e) => e.railId === 'crypto-native');
    expect(crypto).toEqual({ railId: 'crypto-native', outcome: 'skipped', reason: 'method-mismatch' });
  });

  it('skips a rail whose geo allowlist does not include the payer country', () => {
    const profiles: RailRoutingProfile[] = [{ railId: 'card-sandbox', methods: ['card'], countries: ['FR', 'US'], riskBands: ['low'] }];
    try {
      selectSmartCheckoutRail({
        inputs: { geoCountry: 'DE', method: 'card', riskBand: 'low' },
        preference: ['card-sandbox'],
        profiles,
        rails: registry(),
        policy: 'allow-sandbox',
      });
      expect.unreachable('geo mismatch must refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(SmartRoutingNoRailError);
      expect((e as SmartRoutingNoRailError).considered[0]?.reason).toBe('geo-mismatch');
    }
  });

  it('walks preference: geo-mismatched first rail, then eligible second', () => {
    const profiles: RailRoutingProfile[] = [
      { railId: 'crypto-native', methods: ['crypto'], countries: ['US'], riskBands: ['low'] },
      { railId: 'card-sandbox', methods: ['card'], countries: ['DE'], riskBands: ['low'] },
    ];
    // method card → crypto skipped for method; card matches DE
    const decision = selectSmartCheckoutRail({
      inputs: { geoCountry: 'DE', method: 'card', riskBand: 'low' },
      preference,
      profiles,
      rails: registry(),
      policy: 'allow-sandbox',
    });
    expect(decision.chosenRailId).toBe('card-sandbox');
    expect(decision.considered.find((e) => e.railId === 'crypto-native')?.reason).toBe('method-mismatch');
  });

  it('skips a rail when risk band is not on the allowlist — never invents a score', () => {
    const profiles: RailRoutingProfile[] = [
      { railId: 'crypto-native', methods: ['crypto'], countries: ['*'], riskBands: ['low'] },
      { railId: 'card-sandbox', methods: ['card'], countries: ['*'], riskBands: ['low'] },
    ];
    try {
      selectSmartCheckoutRail({
        inputs: { geoCountry: 'GB', method: 'crypto', riskBand: 'high' },
        preference,
        profiles,
        rails: registry(),
        policy: 'allow-sandbox',
      });
      expect.unreachable('high risk with low-only profiles must refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(SmartRoutingNoRailError);
      const err = e as SmartRoutingNoRailError;
      expect(err.code).toBe('pay.routing_no_rail');
      expect(err.considered.find((c) => c.railId === 'crypto-native')?.reason).toBe('risk-mismatch');
    }
  });

  it('skips rails with missing profiles rather than inventing eligibility', () => {
    try {
      selectSmartCheckoutRail({
        inputs: { geoCountry: 'DE', method: 'crypto', riskBand: 'low' },
        preference,
        profiles: [],
        rails: registry(),
        policy: 'allow-sandbox',
      });
      expect.unreachable('empty profiles must refuse');
    } catch (e) {
      const err = e as SmartRoutingNoRailError;
      expect(err.considered.every((c) => c.reason === 'profile-missing')).toBe(true);
    }
  });

  it('skips rails that omit a dimension allowlist (unset ≠ wildcard)', () => {
    const profiles: RailRoutingProfile[] = [
      { railId: 'crypto-native', methods: ['crypto'], riskBands: ['low'] }, // countries omitted
    ];
    try {
      selectSmartCheckoutRail({
        inputs: { geoCountry: 'DE', method: 'crypto', riskBand: 'low' },
        preference: ['crypto-native'],
        profiles,
        rails: registry(),
        policy: 'allow-sandbox',
      });
      expect.unreachable('geo-unset must skip');
    } catch (e) {
      expect((e as SmartRoutingNoRailError).considered[0]?.reason).toBe('geo-unset');
    }
  });

  it('under live-only, skips sandbox rails after dimension match', () => {
    try {
      selectSmartCheckoutRail({
        inputs: { geoCountry: 'DE', method: 'card', riskBand: 'low' },
        preference: ['card-sandbox'],
        profiles: REFERENCE_RAIL_ROUTING_PROFILES,
        rails: registry(),
        policy: 'live-only',
      });
      expect.unreachable('sandbox under live-only must refuse');
    } catch (e) {
      expect((e as SmartRoutingNoRailError).considered[0]?.reason).toBe('sandbox');
    }
  });

  it('decision record for payment_events carries reasons and bans invent scores', () => {
    const decision = selectSmartCheckoutRail({
      inputs: { geoCountry: 'fr', method: 'crypto', riskBand: 'low' },
      preference,
      profiles: REFERENCE_RAIL_ROUTING_PROFILES,
      rails: registry(),
      policy: 'allow-sandbox',
    });
    const record = toRoutingDecisionRecord(decision);
    expect(record.kind).toBe('pay.routing.decision');
    expect(record.chosenRailId).toBe('crypto-native');
    expect(record.geoCountry).toBe('fr');
    expect(record).not.toHaveProperty('approvalRate');
    expect(record).not.toHaveProperty('costBps');
  });
});
