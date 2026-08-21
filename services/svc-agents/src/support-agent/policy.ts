/**
 * Support product policy door — money denylist + desk plane + tier law honesty.
 *
 * No live desk port, no tier matrix invent. Integrators read this before wiring UI.
 */
import { SUPPORT_DATA_TOOLS } from './data-tools.js';
import { supportGrounded } from './grounded.js';
import {
  SUPPORT_MONEY_TOOLS,
  supportAgentGuardrail,
  supportDeclaredTools,
  supportGuardrailBoardCard,
  supportGuardrailExportText,
  supportGuardrailStatusLine,
} from './guardrail.js';
import { supportMoneyDenyBoardCard, supportMoneyDenyExportText, supportMoneyDenyStatusLine } from './money-deny-honesty.js';
import { supportTierGate } from './tier-gate.js';

export const AGENTS_SUPPORT_ASSIST = 'agents.support' as const;
export const OPS_SUPPORT_MOUNTAIN = 'ops.support' as const;

export type SupportPolicySummary = {
  readonly agentAssist: typeof AGENTS_SUPPORT_ASSIST;
  readonly deskMountain: typeof OPS_SUPPORT_MOUNTAIN;
  readonly deskStandalone: true;
  readonly deskProductComplete: false;
  readonly moneyTools: readonly string[];
  readonly moneyDeny: ReturnType<typeof supportMoneyDenyBoardCard>;
  readonly moneyDenyStatusLine: string;
  readonly moneyDenyExport: string;
  readonly guardrail: ReturnType<typeof supportGuardrailBoardCard>;
  readonly guardrailStatusLine: string;
  readonly guardrailExport: string;
  readonly declaredTools: readonly string[];
  readonly dataTools: readonly string[];
  readonly darkPlaneRefuse: {
    readonly reason: 'desk_plane_dark';
    readonly userMessageKey: 'agents.support.unavailable';
  };
  readonly liveAllowedTasks: readonly ['support.classify', 'support.reply'];
  readonly tierLawRefuse: {
    readonly reason: 'tier_law_blank';
    readonly userMessageKey: 'agents.support.tier_closed';
  };
  readonly escalationUserMessageKey: 'agents.support.escalated';
  readonly inventsBalances: false;
  readonly inventsRefunds: false;
  readonly escalationFirstClass: true;
};

/** Static policy surface for agents.support (D26-P1-A2 / guardrail + plane gates). */
export function describeSupportPolicy(): SupportPolicySummary {
  const dark = supportGrounded({ plane: 'dark' });
  if (dark.status !== 'refuse' || dark.reason !== 'desk_plane_dark') {
    throw new Error('support policy: dark desk plane must refuse');
  }
  const live = supportGrounded({ plane: 'live' });
  if (live.status !== 'ok') {
    throw new Error('support policy: live desk plane must allow tasks');
  }
  const tierBlank = supportTierGate({ law: null, userTier: 'free' });
  if (tierBlank.status !== 'refuse' || tierBlank.reason !== 'tier_law_blank') {
    throw new Error('support policy: blank tier law must refuse');
  }
  const g = supportAgentGuardrail();
  return {
    agentAssist: AGENTS_SUPPORT_ASSIST,
    deskMountain: OPS_SUPPORT_MOUNTAIN,
    deskStandalone: true,
    deskProductComplete: false,
    moneyTools: [...SUPPORT_MONEY_TOOLS],
    moneyDeny: supportMoneyDenyBoardCard(),
    moneyDenyStatusLine: supportMoneyDenyStatusLine(),
    moneyDenyExport: supportMoneyDenyExportText(),
    guardrail: supportGuardrailBoardCard(g),
    guardrailStatusLine: supportGuardrailStatusLine(g),
    guardrailExport: supportGuardrailExportText(g),
    declaredTools: supportDeclaredTools(g),
    dataTools: [...SUPPORT_DATA_TOOLS],
    darkPlaneRefuse: {
      reason: dark.reason,
      userMessageKey: dark.userMessageKey,
    },
    liveAllowedTasks: [...live.allowedTasks] as ['support.classify', 'support.reply'],
    tierLawRefuse: {
      reason: tierBlank.reason,
      userMessageKey: tierBlank.userMessageKey,
    },
    escalationUserMessageKey: 'agents.support.escalated',
    inventsBalances: false,
    inventsRefunds: false,
    escalationFirstClass: true,
  };
}
