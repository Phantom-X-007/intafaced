/**
 * Navigator product policy door — money-write denylist + dark-plane refuse.
 *
 * No session run, no tool_select. Integrators read this before wiring UI.
 */
import { NAVIGATOR_MONEY_WRITE_TOOLS } from './guardrail.js';
import { navigatorGrounded } from './grounded.js';
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

/** Static policy surface for navigator (Stage-1 guardrail + Stage-2 plane gate). */
export function describeNavigatorPolicy(): NavigatorPolicySummary {
  const dark = navigatorGrounded('dark');
  if (dark.status !== 'refuse') {
    throw new Error('navigator policy: dark plane must refuse');
  }
  const live = navigatorGrounded('live');
  if (live.status !== 'ok') {
    throw new Error('navigator policy: live plane must allow tasks');
  }
  return {
    moneyWriteTools: [...NAVIGATOR_MONEY_WRITE_TOOLS],
    moneyDeny: navigatorMoneyDenyBoardCard(),
    moneyDenyStatusLine: navigatorMoneyDenyStatusLine(),
    moneyDenyExport: navigatorMoneyDenyExportText(),
    moneyDenyBilledAmount: NAVIGATOR_MONEY_DENY_BILLED_AMOUNT,
    darkPlaneRefuse: {
      reason: dark.reason,
      userMessageKey: dark.userMessageKey,
    },
    liveAllowedTasks: live.allowedTasks,
  };
}
