import { describe, expect, it } from 'vitest';
import { SUPPORT_MONEY_TOOLS } from './guardrail.js';
import {
  supportMoneyDenyBoardCard,
  supportMoneyDenyStatusLine,
  parseSupportMoneyDenyStatusLine,
  supportMoneyDenyStatusLineMatches,
  supportMoneyDenyStatusLineConsistent,
  supportMoneyDenyExportHeader,
  supportMoneyDenyExportLine,
  supportMoneyDenyExportText,
  isSupportMoneyDenied,
} from './money-deny-honesty.js';

describe('L3 wave110 support money denylist honesty', () => {
  it('denylist boards mirror guardrail.ts', () => {
    expect(SUPPORT_MONEY_TOOLS).toContain('ledger.post');
    for (const t of SUPPORT_MONEY_TOOLS) {
      expect(isSupportMoneyDenied(t)).toBe(true);
    }
    expect(isSupportMoneyDenied('support.ticket.read')).toBe(false);
    expect(supportMoneyDenyBoardCard()).toEqual({
      tools: SUPPORT_MONEY_TOOLS.length,
      hasLedgerPost: 1,
      hasPayRefund: 1,
      hasTradeOrder: 1,
    });
    expect(supportMoneyDenyStatusLineMatches()).toBe(true);
    expect(supportMoneyDenyStatusLineConsistent(supportMoneyDenyStatusLine())).toBe(true);
    expect(supportMoneyDenyExportText().startsWith(supportMoneyDenyExportHeader())).toBe(true);
    expect(supportMoneyDenyExportLine()).toBe(`${SUPPORT_MONEY_TOOLS.length},1,1,1`);
    expect(parseSupportMoneyDenyStatusLine('nope')).toBeNull();
  });
});
