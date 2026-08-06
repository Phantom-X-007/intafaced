import { describe, expect, it } from 'vitest';
import {
  identityTierCatalogBoardCard,
  identityTierCatalogStatusLine,
  parseIdentityTierCatalogStatusLine,
  identityTierCatalogStatusLineMatches,
  identityTierCatalogStatusLineConsistent,
  identityTierCatalogExportHeader,
  identityTierCatalogExportLine,
  identityTierCatalogExportText,
  isDeclaredKycTier,
  isDeclaredCardTier,
  kycTierNames,
  cardTierNames,
  KYC_TIERS,
  CARD_TIERS,
} from './identity-tier-honesty.js';

describe('L3 wave90 identity tier catalog honesty', () => {
  it('kyc and card tier catalogs', () => {
    expect(KYC_TIERS).toHaveLength(4);
    expect(CARD_TIERS).toHaveLength(4);
    expect(identityTierCatalogBoardCard()).toEqual({
      kycTiers: 4,
      cardTiers: 4,
      kycNone: 1,
      cardNone: 1,
    });
    expect(identityTierCatalogStatusLine()).toBe('kyc=4 card=4 kyc_none=1 card_none=1');
    expect(identityTierCatalogStatusLineMatches()).toBe(true);
    expect(identityTierCatalogStatusLineConsistent(identityTierCatalogStatusLine())).toBe(true);
    expect(identityTierCatalogExportText().startsWith(identityTierCatalogExportHeader())).toBe(true);
    expect(identityTierCatalogExportLine()).toBe('4,4,1,1');
    expect(isDeclaredKycTier('institutional')).toBe(true);
    expect(isDeclaredKycTier('vip')).toBe(false);
    expect(isDeclaredCardTier('obsidian')).toBe(true);
    expect(isDeclaredCardTier('gold')).toBe(false);
    expect(kycTierNames()).toContain('basic');
    expect(cardTierNames()).toContain('metal');
    expect(parseIdentityTierCatalogStatusLine('nope')).toBeNull();
  });
});
