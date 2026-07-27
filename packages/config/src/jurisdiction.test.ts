import { describe, expect, it } from 'vitest';
import { checkAccess, assertReviewed, UnreviewedJurisdictionError, tierSatisfies } from './jurisdiction.js';
import { MODULES } from './modules.js';

describe('§22 sovereignty law — zero-KYC follows custody', () => {
  it('grants permissionless access to non-custodial protocol modules regardless of tier', () => {
    const d = checkAccess({ module: 'protocol', region: 'US', plane: 'protocol', kycTier: 'none' });
    expect(d.allowed).toBe(true);
    expect(d.code).toBe('allowed.permissionless');
  });

  it('never lets a protocol-plane module demand KYC, for any region in the matrix', () => {
    const permissionless = Object.values(MODULES).filter((m) => !m.custodial && m.planes.includes('protocol'));
    for (const m of permissionless) {
      for (const region of ['US', 'GB', 'NG', 'ZZ']) {
        const d = checkAccess({ module: m.id, region, plane: 'protocol', kycTier: 'none' });
        expect(d.code, `${m.id} in ${region}`).not.toBe('denied.kyc_required');
      }
    }
  });

  it('gates custodial modules behind the matrix tier', () => {
    const d = checkAccess({ module: 'bank', region: 'DE', plane: 'fiat', kycTier: 'basic' });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('denied.kyc_required');
    expect(d.requiredTier).toBe('full');
  });

  it('allows a custodial module once the tier is met', () => {
    const d = checkAccess({ module: 'bank', region: 'DE', plane: 'fiat', kycTier: 'full' });
    expect(d.allowed).toBe(true);
    expect(d.limitMultiplier).toBe(1);
  });

  it('honours per-region module blocks', () => {
    const d = checkAccess({ module: 'launch', region: 'US', plane: 'fiat', kycTier: 'institutional' });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('denied.module_blocked');
  });

  it('denies a plane the module does not operate on', () => {
    const d = checkAccess({ module: 'pay', region: 'DE', plane: 'protocol', kycTier: 'full' });
    expect(d.code).toBe('denied.plane_unsupported');
  });

  it('the bridge is custodial and therefore always tiered', () => {
    expect(MODULES.bridge.custodial).toBe(true);
    const d = checkAccess({ module: 'bridge', region: 'DE', plane: 'protocol', kycTier: 'none' });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('denied.kyc_required');
  });
});

describe('tier ordering', () => {
  it('is monotonic', () => {
    expect(tierSatisfies('full', 'basic')).toBe(true);
    expect(tierSatisfies('basic', 'full')).toBe(false);
    expect(tierSatisfies('institutional', 'institutional')).toBe(true);
    expect(tierSatisfies('none', 'none')).toBe(true);
  });
});

describe('counsel review gate', () => {
  it('refuses unreviewed launch markets', () => {
    expect(() => assertReviewed(['GB'])).toThrow(UnreviewedJurisdictionError);
  });

  it('names every unreviewed region so the operator fixes them in one pass', () => {
    try {
      assertReviewed(['GB', 'US']);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(UnreviewedJurisdictionError);
      expect((e as UnreviewedJurisdictionError).regions).toEqual(['GB', 'US']);
    }
  });
});
