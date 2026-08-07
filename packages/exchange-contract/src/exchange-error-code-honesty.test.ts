import { describe, expect, it } from 'vitest';
import {
  exchangeErrorCodeCatalogBoardCard,
  exchangeErrorCodeCatalogStatusLine,
  parseExchangeErrorCodeCatalogStatusLine,
  exchangeErrorCodeCatalogStatusLineMatches,
  exchangeErrorCodeCatalogStatusLineConsistent,
  exchangeErrorCodeCatalogExportHeader,
  exchangeErrorCodeCatalogExportLines,
  exchangeErrorCodeCatalogExportText,
  isDeclaredExchangeErrorCode,
  EXCHANGE_ERROR_CODES,
} from './exchange-error-code-honesty.js';

describe('L3 wave199 exchange-error-code catalog honesty', () => {
  it('exchange error code catalog boards', () => {
    expect(EXCHANGE_ERROR_CODES).toHaveLength(16);
    expect(EXCHANGE_ERROR_CODES).toContain('NotSupported');
    expect(exchangeErrorCodeCatalogBoardCard()).toEqual({
      codes: 16,
      hasNotSupported: 1,
      hasRateLimit: 1,
      hasInsufficientFunds: 1,
      hasOrderNotFound: 1,
    });
    expect(exchangeErrorCodeCatalogStatusLine()).toBe('codes=16 not_supported=1 rate_limit=1 insufficient_funds=1 order_not_found=1');
    expect(exchangeErrorCodeCatalogStatusLineMatches()).toBe(true);
    expect(exchangeErrorCodeCatalogStatusLineConsistent(exchangeErrorCodeCatalogStatusLine())).toBe(true);
    expect(exchangeErrorCodeCatalogExportText().startsWith(exchangeErrorCodeCatalogExportHeader())).toBe(true);
    expect(exchangeErrorCodeCatalogExportLines()).toEqual([...EXCHANGE_ERROR_CODES]);
    expect(isDeclaredExchangeErrorCode('NotSupported')).toBe(true);
    expect(isDeclaredExchangeErrorCode('UnknownError')).toBe(false);
    expect(parseExchangeErrorCodeCatalogStatusLine('nope')).toBeNull();
  });
});
