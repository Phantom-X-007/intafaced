import { describe, expect, it } from 'vitest';
import { NAVIGATOR_MONEY_WRITE_TOOLS } from './guardrail.js';
import {
  navigatorMoneyDenyBoardCard,
  navigatorMoneyDenyStatusLine,
  parseNavigatorMoneyDenyStatusLine,
  navigatorMoneyDenyStatusLineMatches,
  navigatorMoneyDenyStatusLineConsistent,
  navigatorMoneyDenyExportHeader,
  navigatorMoneyDenyExportLine,
  navigatorMoneyDenyExportText,
  isNavigatorMoneyDenied,
} from './money-deny-honesty.js';

describe('L3 wave123 navigator money denylist honesty', () => {
  it('denylist boards mirror guardrail.ts', () => {
    expect(NAVIGATOR_MONEY_WRITE_TOOLS).toContain('ledger.post');
    for (const t of NAVIGATOR_MONEY_WRITE_TOOLS) {
      expect(isNavigatorMoneyDenied(t)).toBe(true);
    }
    expect(isNavigatorMoneyDenied('trade.quote')).toBe(false);
    expect(navigatorMoneyDenyBoardCard()).toEqual({
      tools: NAVIGATOR_MONEY_WRITE_TOOLS.length,
      hasLedgerPost: 1,
      hasTradeOrder: 1,
      hasBankTransfer: 1,
    });
    expect(navigatorMoneyDenyStatusLineMatches()).toBe(true);
    expect(navigatorMoneyDenyStatusLineConsistent(navigatorMoneyDenyStatusLine())).toBe(true);
    expect(navigatorMoneyDenyExportText().startsWith(navigatorMoneyDenyExportHeader())).toBe(true);
    expect(navigatorMoneyDenyExportLine()).toBe(`${NAVIGATOR_MONEY_WRITE_TOOLS.length},1,1,1`);
    expect(parseNavigatorMoneyDenyStatusLine('nope')).toBeNull();
  });
});
