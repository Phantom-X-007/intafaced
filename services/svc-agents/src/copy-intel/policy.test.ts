import { describe, expect, it } from 'vitest';
import { COPY_INTEL_MONEY_WRITE_TOOLS } from './guardrail.js';
import { describeCopyIntelPolicy } from './policy.js';
import { RETURNS_RANKED_BOARD_REFUSE_REASON } from './returns-board-refuse.js';

describe('describeCopyIntelPolicy — agents.copy-intel honesty door', () => {
  it('exposes money-write denylist and returns-rank ban', () => {
    const policy = describeCopyIntelPolicy();
    expect(policy.moneyWriteTools).toEqual(COPY_INTEL_MONEY_WRITE_TOOLS);
    expect(policy.moneyDeny.hasLedgerPost).toBe(1);
    expect(policy.moneyDeny.hasTradeOrder).toBe(1);
    expect(policy.returnsRankedBoardRefuseReason).toBe(RETURNS_RANKED_BOARD_REFUSE_REASON);
    expect(policy.rankedByReturns).toBe(false);
    expect(policy.directorySortKey).toBe('leaderId');
  });

  it('forbidden sort keys include returns and pnl aliases', () => {
    const policy = describeCopyIntelPolicy();
    expect(policy.returnsRankForbiddenKeys).toContain('returns');
    expect(policy.returnsRankSortKeys).toContain('realisedPnl');
    expect(policy.marketingBoardModes).toContain('leaderboard');
  });
});
