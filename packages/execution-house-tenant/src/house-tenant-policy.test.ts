import { describe, expect, it } from 'vitest';
import { authorizeTenantVenue, type HouseTenant } from './house-tenant.js';
import {
  HOUSE_TENANT_BLOCKED_TARGETS,
  HOUSE_TENANT_POLICY_RULING,
  describeHouseTenantPolicy,
  evaluateHouseTenantPolicyGate,
  policyAllowsExternalOnly,
  policyBlocksInternalHalf,
  policyKillSwitchFirst,
} from './house-tenant-policy.js';

function tenant(over: Partial<HouseTenant> = {}): HouseTenant {
  return {
    tenantId: 'house-1',
    keyNamespace: 'execution.tenant.house-1',
    killed: false,
    ...over,
  };
}

describe('describeHouseTenantPolicy', () => {
  it('states D26-P0-01 external-only kill-first honesty', () => {
    const p = describeHouseTenantPolicy();
    expect(p.ruling).toBe(HOUSE_TENANT_POLICY_RULING);
    expect(p.externalOnlyV1).toBe(true);
    expect(p.killSwitchAppliesFirst).toBe(true);
    expect(p.internalVenueBlocked).toBe(true);
    expect(p.matchingBookBlocked).toBe(true);
    expect(p.blockedTargets).toEqual(HOUSE_TENANT_BLOCKED_TARGETS);
    expect(p.inventsVenueList).toBe(false);
    expect(p.inventsInternalTradingPath).toBe(false);
    expect(p.noMatchingPathPrivilege).toBe(true);
    expect(p.noSecondMoneyBook).toBe(true);
    expect(p.houseMaySpendTenantMoney).toBe(false);
    expect(p.houseFillMayLookLikeTenant).toBe(false);
    expect(p.missingTenantIdRefuses).toBe(true);
  });
});

describe('policy predicates', () => {
  it('kill_switch is first', () => {
    expect(policyKillSwitchFirst(true)).toBe(true);
    expect(policyKillSwitchFirst(false)).toBe(false);
  });

  it('blocks internal and matching-book targets', () => {
    expect(policyBlocksInternalHalf({ kind: 'internal' })).toBe(true);
    expect(policyBlocksInternalHalf({ kind: 'matching-book' })).toBe(true);
    expect(policyBlocksInternalHalf({ kind: 'external', venueId: 'street-a' })).toBe(false);
  });

  it('allows only non-empty opaque external venue ids', () => {
    expect(policyAllowsExternalOnly({ kind: 'external', venueId: 'street-a' })).toBe(true);
    expect(policyAllowsExternalOnly({ kind: 'external', venueId: '  ' })).toBe(false);
    expect(policyAllowsExternalOnly({ kind: 'internal' })).toBe(false);
  });
});

describe('evaluateHouseTenantPolicyGate — kill first (ADR rule 5)', () => {
  it('returns clear for external opaque venue when not killed', () => {
    expect(evaluateHouseTenantPolicyGate(false, { kind: 'external', venueId: 'ext-1' })).toBe('clear');
  });

  it('returns internal_venue for blocked halves when not killed', () => {
    expect(evaluateHouseTenantPolicyGate(false, { kind: 'internal' })).toBe('internal_venue');
    expect(evaluateHouseTenantPolicyGate(false, { kind: 'matching-book' })).toBe('internal_venue');
  });

  it('returns invalid_venue for empty external id', () => {
    expect(evaluateHouseTenantPolicyGate(false, { kind: 'external', venueId: '' })).toBe('invalid_venue');
  });

  it('kill_switch wins over internal_venue when both apply', () => {
    expect(evaluateHouseTenantPolicyGate(true, { kind: 'internal' })).toBe('kill_switch');
    expect(evaluateHouseTenantPolicyGate(true, { kind: 'external', venueId: 'ext-1' })).toBe('kill_switch');
  });

  it('matches authorizeTenantVenue reason ordering', () => {
    const cases: Array<{ killed: boolean; target: Parameters<typeof evaluateHouseTenantPolicyGate>[1] }> = [
      { killed: false, target: { kind: 'external', venueId: 'ext-1' } },
      { killed: false, target: { kind: 'internal' } },
      { killed: false, target: { kind: 'matching-book' } },
      { killed: false, target: { kind: 'external', venueId: '' } },
      { killed: true, target: { kind: 'internal' } },
      { killed: true, target: { kind: 'external', venueId: 'ext-1' } },
    ];
    for (const { killed, target } of cases) {
      const gate = evaluateHouseTenantPolicyGate(killed, target);
      const auth = authorizeTenantVenue(tenant({ killed }), target);
      if (gate === 'clear') {
        expect(auth.ok).toBe(true);
      } else {
        expect(auth.ok).toBe(false);
        if (!auth.ok) expect(auth.reason).toBe(gate);
      }
    }
  });
});
