/**
 * Navigator product policy — money-write denylist + dark-plane refuse.
 */
import { NAVIGATOR_MONEY_WRITE_TOOLS } from './guardrail.js';
import {
  navigatorMoneyDenyBoardCard,
  navigatorMoneyDenyExportText,
  navigatorMoneyDenyStatusLine,
  NAVIGATOR_MONEY_DENY_BILLED_AMOUNT,
} from './money-deny-honesty.js';

export type NavigatorPolicySummary = {
  readonly moneyWriteTools: readonly string[];
  readonly moneyDeny: ReturnType<typeof navigatorMoneyDenyBoardCard>;
  readonly moneyDenyStatusLine: string;
  readonly moneyDenyExport: string;
  readonly moneyDenyBilledAmount: typeof NAVIGATOR_MONEY_DENY_BILLED_AMOUNT;
  readonly darkPlaneRefuse: {
    readonly reason: 'trade_plane_dark';
    readonly userMessageKey: 'agents.navigator.unavailable';
  };
  readonly liveAllowedTasks: readonly ['navigator.plan', 'navigator.tool_select'];
};

export function describeNavigatorPolicy(): NavigatorPolicySummary {
  return {
    moneyWriteTools: NAVIGATOR_MONEY_WRITE_TOOLS,
    moneyDeny: navigatorMoneyDenyBoardCard(),
    moneyDenyStatusLine: navigatorMoneyDenyStatusLine(),
    moneyDenyExport: navigatorMoneyDenyExportText(),
    moneyDenyBilledAmount: NAVIGATOR_MONEY_DENY_BILLED_AMOUNT,
    darkPlaneRefuse: {
      reason: 'trade_plane_dark',
      userMessageKey: 'agents.navigator.unavailable',
    },
    liveAllowedTasks: ['navigator.plan', 'navigator.tool_select'],
  };
}
