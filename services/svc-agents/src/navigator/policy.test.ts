import { describe, expect, it } from 'vitest';
import { NAVIGATOR_MONEY_WRITE_TOOLS } from './guardrail.js';
import { describeNavigatorPolicy } from './policy.js';

describe('describeNavigatorPolicy — agents.navigator honesty door', () => {
  it('exposes money-write denylist and dark-plane refuse shape', () => {
    const policy = describeNavigatorPolicy();
    expect(policy.moneyWriteTools).toEqual(NAVIGATOR_MONEY_WRITE_TOOLS);
    expect(policy.moneyDeny.hasLedgerPost).toBe(1);
    expect(policy.moneyDeny.hasTradeOrder).toBe(1);
    expect(policy.darkPlaneRefuse.reason).toBe('trade_plane_dark');
    expect(policy.liveAllowedTasks).toEqual(['navigator.plan', 'navigator.tool_select']);
  });

  it('money deny billed amount is pinned zero string', () => {
    expect(describeNavigatorPolicy().moneyDenyBilledAmount).toBe('0');
  });
});
