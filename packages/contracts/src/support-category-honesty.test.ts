import { describe, expect, it } from 'vitest';
import {
  supportCategoryCatalogBoardCard,
  supportCategoryCatalogStatusLine,
  parseSupportCategoryCatalogStatusLine,
  supportCategoryCatalogStatusLineMatches,
  supportCategoryCatalogStatusLineConsistent,
  supportCategoryCatalogExportHeader,
  supportCategoryCatalogExportLines,
  supportCategoryCatalogExportText,
  isDeclaredSupportCategory,
  SUPPORT_CATEGORIES,
} from './support-category-honesty.js';

describe('L3 wave130 support category catalog honesty', () => {
  it('category catalog boards', () => {
    expect(SUPPORT_CATEGORIES).toHaveLength(4);
    expect(supportCategoryCatalogBoardCard()).toEqual({
      categories: 4,
      hasDepositWithdraw: 1,
      hasOther: 1,
    });
    expect(supportCategoryCatalogStatusLine()).toBe('categories=4 deposit_withdraw=1 other=1');
    expect(supportCategoryCatalogStatusLineMatches()).toBe(true);
    expect(supportCategoryCatalogStatusLineConsistent(supportCategoryCatalogStatusLine())).toBe(true);
    expect(supportCategoryCatalogExportText().startsWith(supportCategoryCatalogExportHeader())).toBe(true);
    expect(supportCategoryCatalogExportLines()).toEqual([...SUPPORT_CATEGORIES]);
    expect(isDeclaredSupportCategory('trading')).toBe(true);
    expect(isDeclaredSupportCategory('billing')).toBe(false);
    expect(parseSupportCategoryCatalogStatusLine('nope')).toBeNull();
  });
});
