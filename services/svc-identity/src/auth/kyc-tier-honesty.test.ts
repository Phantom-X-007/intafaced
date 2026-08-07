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
  isDeclaredKycTier,
  KYC_TIERS,
} from './kyc-tier-honesty.js';

describe('L3 wave177 kyc-tier catalog honesty', () => {
  it('kyc tier catalog boards', () => {
    expect(KYC_TIERS).toEqual(['none', 'basic', 'full', 'institutional']);
    expect(kycTierCatalogBoardCard()).toEqual({
      tiers: 4,
      hasNone: 1,
      hasBasic: 1,
      hasFull: 1,
      hasInstitutional: 1,
    });
    expect(kycTierCatalogStatusLine()).toBe('tiers=4 none=1 basic=1 full=1 institutional=1');
    expect(kycTierCatalogStatusLineMatches()).toBe(true);
    expect(kycTierCatalogStatusLineConsistent(kycTierCatalogStatusLine())).toBe(true);
    expect(kycTierCatalogExportText().startsWith(kycTierCatalogExportHeader())).toBe(true);
    expect(kycTierCatalogExportLines()).toEqual([...KYC_TIERS]);
    expect(isDeclaredKycTier('full')).toBe(true);
    expect(isDeclaredKycTier('premium')).toBe(false);
    expect(parseKycTierCatalogStatusLine('nope')).toBeNull();
  });
});
