import { describe, expect, it } from 'vitest';
import {
  ledgerEntryDirectionCatalogBoardCard,
  ledgerEntryDirectionCatalogStatusLine,
  parseLedgerEntryDirectionCatalogStatusLine,
  ledgerEntryDirectionCatalogStatusLineMatches,
  ledgerEntryDirectionCatalogStatusLineConsistent,
  ledgerEntryDirectionCatalogExportHeader,
  ledgerEntryDirectionCatalogExportLines,
  ledgerEntryDirectionCatalogExportText,
  isDeclaredLedgerEntryDirection,
  LEDGER_ENTRY_DIRECTIONS,
} from './ledger-entry-direction-honesty.js';

describe('L3 wave218 ledger-entry-direction catalog honesty', () => {
  it('ledger entry direction catalog boards', () => {
    expect(LEDGER_ENTRY_DIRECTIONS).toEqual(['debit', 'credit']);
    expect(ledgerEntryDirectionCatalogBoardCard()).toEqual({
      directions: 2,
      hasDebit: 1,
      hasCredit: 1,
    });
    expect(ledgerEntryDirectionCatalogStatusLine()).toBe('directions=2 debit=1 credit=1');
    expect(ledgerEntryDirectionCatalogStatusLineMatches()).toBe(true);
    expect(ledgerEntryDirectionCatalogStatusLineConsistent(ledgerEntryDirectionCatalogStatusLine())).toBe(true);
    expect(ledgerEntryDirectionCatalogExportText().startsWith(ledgerEntryDirectionCatalogExportHeader())).toBe(true);
    expect(ledgerEntryDirectionCatalogExportLines()).toEqual([...LEDGER_ENTRY_DIRECTIONS]);
    expect(isDeclaredLedgerEntryDirection('debit')).toBe(true);
    expect(isDeclaredLedgerEntryDirection('transfer')).toBe(false);
    expect(parseLedgerEntryDirectionCatalogStatusLine('nope')).toBeNull();
  });
});
