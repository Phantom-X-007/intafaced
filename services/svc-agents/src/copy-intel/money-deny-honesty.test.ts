import { describe, expect, it } from 'vitest';
import { COPY_INTEL_MONEY_WRITE_TOOLS } from './guardrail.js';
import {
  copyIntelMoneyDenyBoardCard,
  copyIntelMoneyDenyStatusLine,
  parseCopyIntelMoneyDenyStatusLine,
  copyIntelMoneyDenyStatusLineMatches,
  copyIntelMoneyDenyStatusLineConsistent,
  copyIntelMoneyDenyExportHeader,
  copyIntelMoneyDenyExportLine,
  copyIntelMoneyDenyExportText,
  isCopyIntelMoneyDenied,
} from './money-deny-honesty.js';

describe('L3 wave106 copy-intel money denylist honesty', () => {
  it('denylist boards mirror guardrail.ts exactly', () => {
    expect(COPY_INTEL_MONEY_WRITE_TOOLS).toContain('ledger.post');
    expect(COPY_INTEL_MONEY_WRITE_TOOLS).toContain('trade.copy.follow');
    for (const t of COPY_INTEL_MONEY_WRITE_TOOLS) {
      expect(isCopyIntelMoneyDenied(t)).toBe(true);
    }
    expect(isCopyIntelMoneyDenied('trade.copy.leaders.read')).toBe(false);
    expect(copyIntelMoneyDenyBoardCard()).toEqual({
      tools: COPY_INTEL_MONEY_WRITE_TOOLS.length,
      hasLedgerPost: 1,
      hasTradeOrder: 1,
      hasCopyFollow: 1,
    });
    expect(copyIntelMoneyDenyStatusLineMatches()).toBe(true);
    expect(copyIntelMoneyDenyStatusLineConsistent(copyIntelMoneyDenyStatusLine())).toBe(true);
    expect(copyIntelMoneyDenyExportText().startsWith(copyIntelMoneyDenyExportHeader())).toBe(true);
    expect(copyIntelMoneyDenyExportLine()).toBe(`${COPY_INTEL_MONEY_WRITE_TOOLS.length},1,1,1`);
    expect(parseCopyIntelMoneyDenyStatusLine('nope')).toBeNull();
  });
});
