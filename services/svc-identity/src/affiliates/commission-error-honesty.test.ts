import { describe, expect, it } from 'vitest';
import {
  commissionErrorCatalogBoardCard,
  commissionErrorCatalogStatusLine,
  parseCommissionErrorCatalogStatusLine,
  commissionErrorCatalogStatusLineMatches,
  commissionErrorCatalogStatusLineConsistent,
  commissionErrorCatalogExportHeader,
  commissionErrorCatalogExportLines,
  commissionErrorCatalogExportText,
  isDeclaredCommissionErrorCode,
  COMMISSION_ERROR_CODES,
} from './commission-error-honesty.js';

describe('L3 wave121 commission error catalog honesty', () => {
  it('error code catalog boards', () => {
    expect(COMMISSION_ERROR_CODES).toHaveLength(3);
    expect(commissionErrorCatalogBoardCard()).toEqual({
      codes: 3,
      hasRate: 1,
      hasFee: 1,
    });
    expect(commissionErrorCatalogStatusLine()).toBe('codes=3 rate=1 fee=1');
    expect(commissionErrorCatalogStatusLineMatches()).toBe(true);
    expect(commissionErrorCatalogStatusLineConsistent(commissionErrorCatalogStatusLine())).toBe(true);
    expect(commissionErrorCatalogExportText().startsWith(commissionErrorCatalogExportHeader())).toBe(true);
    expect(commissionErrorCatalogExportLines()).toEqual([...COMMISSION_ERROR_CODES]);
    expect(isDeclaredCommissionErrorCode('commission.rate')).toBe(true);
    expect(isDeclaredCommissionErrorCode('commission.payout')).toBe(false);
    expect(parseCommissionErrorCatalogStatusLine('nope')).toBeNull();
  });
});
