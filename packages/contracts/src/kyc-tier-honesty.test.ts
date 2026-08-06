import { describe, expect, it } from 'vitest';
import {
  kycTierCatalogBoardCard,
  kycTierCatalogStatusLine,
  parseKycTierCatalogStatusLine,
  kycTierCatalogStatusLineMatches,
  kycTierCatalogStatusLineConsistent,
  kycTierCatalogExportHeader,
  kycTierCatalogExportLines,
  kycTierCatalogExportText,
  isDeclaredKycTierOnly,
  KYC_TIERS_ONLY,
} from './kyc-tier-honesty.js';

describe('L3 wave136 KYC tier catalog honesty', () => {
  it('KYC tier catalog boards', () => {
    expect(KYC_TIERS_ONLY).toHaveLength(4);
    expect(kycTierCatalogBoardCard()).toEqual({
      tiers: 4,
      hasNone: 1,
      hasInstitutional: 1,
    });
    expect(kycTierCatalogStatusLine()).toBe('tiers=4 none=1 institutional=1');
    expect(kycTierCatalogStatusLineMatches()).toBe(true);
    expect(kycTierCatalogStatusLineConsistent(kycTierCatalogStatusLine())).toBe(true);
    expect(kycTierCatalogExportText().startsWith(kycTierCatalogExportHeader())).toBe(true);
    expect(kycTierCatalogExportLines()).toEqual([...KYC_TIERS_ONLY]);
    expect(isDeclaredKycTierOnly('full')).toBe(true);
    expect(isDeclaredKycTierOnly('vip')).toBe(false);
    expect(parseKycTierCatalogStatusLine('nope')).toBeNull();
  });
});
