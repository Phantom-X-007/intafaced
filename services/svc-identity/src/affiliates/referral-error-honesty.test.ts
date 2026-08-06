import { describe, expect, it } from 'vitest';
import {
  referralErrorCatalogBoardCard,
  referralErrorCatalogStatusLine,
  parseReferralErrorCatalogStatusLine,
  referralErrorCatalogStatusLineMatches,
  referralErrorCatalogStatusLineConsistent,
  referralErrorCatalogExportHeader,
  referralErrorCatalogExportLines,
  referralErrorCatalogExportText,
  isDeclaredReferralErrorCode,
  REFERRAL_ERROR_CODES,
} from './referral-error-honesty.js';

describe('L3 wave132 referral error catalog honesty', () => {
  it('error code catalog boards', () => {
    expect(REFERRAL_ERROR_CODES).toHaveLength(6);
    expect(referralErrorCatalogBoardCard()).toEqual({
      codes: 6,
      hasCycle: 1,
      hasDepth: 1,
      hasSelf: 1,
    });
    expect(referralErrorCatalogStatusLine()).toBe('codes=6 cycle=1 depth=1 self=1');
    expect(referralErrorCatalogStatusLineMatches()).toBe(true);
    expect(referralErrorCatalogStatusLineConsistent(referralErrorCatalogStatusLine())).toBe(true);
    expect(referralErrorCatalogExportText().startsWith(referralErrorCatalogExportHeader())).toBe(
      true,
    );
    expect(referralErrorCatalogExportLines()).toEqual([...REFERRAL_ERROR_CODES]);
    expect(isDeclaredReferralErrorCode('referral.unknown_referrer')).toBe(true);
    expect(isDeclaredReferralErrorCode('referral.payout')).toBe(false);
    expect(parseReferralErrorCatalogStatusLine('nope')).toBeNull();
  });
});
