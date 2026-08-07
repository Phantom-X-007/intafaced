import { describe, expect, it } from 'vitest';
import {
  fiatCurrencyCatalogBoardCard,
  fiatCurrencyCatalogStatusLine,
  parseFiatCurrencyCatalogStatusLine,
  fiatCurrencyCatalogStatusLineMatches,
  fiatCurrencyCatalogStatusLineConsistent,
  fiatCurrencyCatalogExportHeader,
  fiatCurrencyCatalogExportLines,
  fiatCurrencyCatalogExportText,
  isDeclaredFiatCurrency,
  FIAT_CODES,
} from './fiat-currency-honesty.js';
import { FIAT_CURRENCIES } from './fiat.js';

describe('L3 wave217 fiat-currency catalog honesty', () => {
  it('fiat currency catalog boards', () => {
    expect(FIAT_CODES.length).toBe(FIAT_CURRENCIES.length);
    expect(FIAT_CODES.length).toBeGreaterThanOrEqual(100);
    expect(FIAT_CODES).toContain('USD');
    expect(FIAT_CODES).toContain('EUR');
    const card = fiatCurrencyCatalogBoardCard();
    expect(card.hasUsd).toBe(1);
    expect(card.hasEur).toBe(1);
    expect(card.hasJpy).toBe(1);
    expect(card.currencies).toBe(FIAT_CURRENCIES.length);
    expect(card.zeroMinor).toBe(FIAT_CURRENCIES.filter((c) => c.minorUnits === 0).length);
    expect(fiatCurrencyCatalogStatusLineMatches()).toBe(true);
    expect(fiatCurrencyCatalogStatusLineConsistent(fiatCurrencyCatalogStatusLine())).toBe(true);
    expect(fiatCurrencyCatalogExportText().startsWith(fiatCurrencyCatalogExportHeader())).toBe(true);
    expect(fiatCurrencyCatalogExportLines()).toEqual([...FIAT_CODES]);
    expect(isDeclaredFiatCurrency('USD')).toBe(true);
    expect(isDeclaredFiatCurrency('XXX')).toBe(false);
    expect(parseFiatCurrencyCatalogStatusLine('nope')).toBeNull();
  });
});
