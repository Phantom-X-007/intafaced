import { describe, expect, it } from 'vitest';
import { MODULES } from '@intafaced/config/modules';
import { checkAccess } from '@intafaced/config/jurisdiction';
import { FIAT_PLANE, PLANES, planeById, PROTOCOL_PLANE } from './plane';

/**
 * §22 — the switch must tell the truth about custody.
 *
 * These assertions are not about the UI looking right. They are about the badge
 * a user reads being the same fact `checkAccess` gates on and `pnpm
 * scan:custody` enforces. If the registry ever says svc-protocol is custodial,
 * or that svc-trade is not, this fails — which is the only way the copy on
 * screen and the rule in the services stay married.
 */

describe('the plane definitions are read from the module registry, not retyped', () => {
  it('marks the Fiat Plane custodial because svc-trade is', () => {
    expect(FIAT_PLANE.custodial).toBe(MODULES.trade.custodial);
    expect(FIAT_PLANE.custodial).toBe(true);
    expect(FIAT_PLANE.venue).toBe('CEX');
  });

  it('marks the Protocol Plane non-custodial because svc-protocol is', () => {
    expect(PROTOCOL_PLANE.custodial).toBe(MODULES.protocol.custodial);
    expect(PROTOCOL_PLANE.custodial).toBe(false);
    expect(PROTOCOL_PLANE.venue).toBe('DEX');
  });

  it('offers exactly the two planes doctrine §16.8 names', () => {
    expect(PLANES.map((p) => p.id).sort()).toEqual(['fiat', 'protocol']);
    expect(planeById('protocol')).toBe(PROTOCOL_PLANE);
    expect(planeById('fiat')).toBe(FIAT_PLANE);
  });
});

describe('§22 — zero-KYC follows custody, and the UI says so', () => {
  /**
   * The DEX claim, checked against the matrix rather than against our own copy:
   * a user with no verification, in a region the matrix knows, reaches the
   * Protocol Plane permissionlessly.
   */
  it('the plane the UI calls sovereign is the one checkAccess lets through unverified', () => {
    const decision = checkAccess({ module: PROTOCOL_PLANE.moduleId, region: 'US', plane: 'protocol', kycTier: 'none' });
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe('allowed.permissionless');
  });

  it('the plane the UI calls custodial is the one that refuses an unverified user', () => {
    const decision = checkAccess({ module: FIAT_PLANE.moduleId, region: 'DE', plane: 'fiat', kycTier: 'none' });
    expect(decision.allowed).toBe(false);
  });

  it('states custody in a sentence, not a symbol', () => {
    // A badge that only means something to whoever wrote it is not disclosure.
    expect(PROTOCOL_PLANE.custodyStatement).toMatch(/You hold/);
    expect(FIAT_PLANE.custodyStatement).toMatch(/INTAFACED holds/);
    expect(PROTOCOL_PLANE.access).toMatch(/No sign-in/);
  });
});
