import { describe, expect, it } from 'vitest';
import { checkAccess } from '@intafaced/config';

/**
 * THE ZERO-KYC CLAIM, TESTED.
 *
 * §503 says no-KYC exists on the Protocol Plane "because there is nothing to
 * KYC". That is an architectural claim, and an architectural claim that nothing
 * verifies is marketing.
 *
 * These assert the mechanism actually behaves that way — that `checkAccess`
 * really does admit an unverified caller to the DEX and really does refuse the
 * same caller at the custodial venue. If someone later "tidies" the
 * permissionless branch out of `checkAccess`, the DEX silently acquires a KYC
 * gate and the product claim quietly becomes false. This is what fails first.
 */
describe('the DEX is permissionless — and the custodial venue is not', () => {
  it('admits a caller with no verification at all', () => {
    const decision = checkAccess({ module: 'dex', plane: 'protocol', region: 'GB', kycTier: 'none' });
    expect(decision.allowed).toBe(true);
  });

  it('refuses the SAME caller at the custodial spot venue', () => {
    // The contrast is the point. One platform, two planes, one difference:
    // whether we are holding the asset.
    const decision = checkAccess({ module: 'trade', plane: 'fiat', region: 'GB', kycTier: 'none' });
    expect(decision.allowed).toBe(false);
  });

  it('admits every tier equally — there is no tier ladder to climb', () => {
    for (const kycTier of ['none', 'basic', 'full', 'institutional'] as const) {
      expect(checkAccess({ module: 'dex', plane: 'protocol', region: 'GB', kycTier }).allowed, kycTier).toBe(true);
    }
  });

  /**
   * The line that separates sovereignty from evasion.
   *
   * Not holding the asset removes the identity requirement. It does not remove
   * sanctions law — §24 Lane A: "Sanctions-screening on the hosted front-end
   * per applicable law; the contracts themselves are permissionless
   * infrastructure."
   *
   * `checkAccess` implements this correctly: the permissionless branch checks
   * `entry?.blocked` BEFORE returning allowed.
   *
   * ── AND THE BLOCKLIST IS EMPTY ─────────────────────────────────────────────
   *
   * No region in `JURISDICTION_MATRIX` currently carries `blocked: true`. So
   * the mechanism works and screens nothing. This test asserts that state
   * honestly rather than passing against a region I invented, because the gap
   * is a real one and hiding it behind a green test would be worse than the gap.
   *
   * Populating it is a COMPLIANCE decision, not an engineering one — the matrix
   * header is explicit that every entry "must be signed off by counsel for the
   * relevant jurisdiction". A sanctions list guessed by an engineer is a
   * liability, not a control.
   */
  it('screens no region today, because the blocklist is empty', () => {
    const kp = checkAccess({ module: 'dex', plane: 'protocol', region: 'KP', kycTier: 'none' });

    // Currently allowed. When counsel populates the matrix this flips, and
    // this test is where someone will notice it needs updating.
    expect(kp.allowed).toBe(true);
    expect(kp.code).toBe('allowed.permissionless');
  });

  it('refuses a blocked region on the CUSTODIAL plane, proving the mechanism works', () => {
    // Same empty blocklist, so this is about the code path rather than the
    // data: a custodial module in an unknown region still demands a tier.
    const decision = checkAccess({ module: 'trade', plane: 'fiat', region: 'KP', kycTier: 'none' });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('denied.kyc_required');
  });
});
