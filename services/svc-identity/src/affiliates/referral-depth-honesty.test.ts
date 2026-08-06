import { describe, expect, it } from 'vitest';
import {
  referralDepthCatalogBoardCard,
  referralDepthCatalogStatusLine,
  parseReferralDepthCatalogStatusLine,
  referralDepthCatalogStatusLineMatches,
  referralDepthBoardCard,
  referralDepthStatusLine,
  parseReferralDepthStatusLine,
  referralDepthStatusLineMatches,
  referralDepthStatusLineConsistent,
  referralDepthExportHeader,
  referralDepthExportLine,
  referralDepthExportText,
  referralDepthInRange,
  DEFAULT_MAX_REFERRAL_DEPTH,
} from './referral-depth-honesty.js';

describe('L3 wave94 referral depth honesty', () => {
  it('catalog and depth boards', () => {
    expect(DEFAULT_MAX_REFERRAL_DEPTH).toBe(5);
    expect(referralDepthCatalogBoardCard()).toEqual({ defaultMaxDepth: 5, minDepth: 0 });
    expect(referralDepthCatalogStatusLineMatches()).toBe(true);
    expect(parseReferralDepthCatalogStatusLine(referralDepthCatalogStatusLine())).toEqual({
      defaultMax: 5,
      min: 0,
    });

    const ok = { depth: 3 };
    expect(referralDepthBoardCard(ok)).toEqual({
      depth: 3,
      maxDepth: 5,
      withinCap: 1,
      overCap: 0,
    });
    expect(referralDepthStatusLine(ok)).toBe('depth=3 max=5 within=1 over=0');
    expect(referralDepthStatusLineMatches(ok)).toBe(true);
    expect(referralDepthStatusLineConsistent(referralDepthStatusLine(ok))).toBe(true);
    expect(referralDepthExportText(ok).startsWith(referralDepthExportHeader())).toBe(true);
    expect(referralDepthExportLine(ok)).toBe('3,5,1,0');
    expect(referralDepthInRange(ok, 0, 5)).toBe(true);

    const over = { depth: 6 };
    expect(referralDepthBoardCard(over).overCap).toBe(1);
    expect(referralDepthStatusLineMatches(over)).toBe(true);
    expect(parseReferralDepthStatusLine('nope')).toBeNull();
  });
});
