import { describe, expect, it } from 'vitest';
import { SUPPORT_DATA_TOOLS } from './data-tools.js';
import { SUPPORT_MONEY_TOOLS, supportAgentGuardrail, supportDeclaredTools } from './guardrail.js';
import { AGENTS_SUPPORT_ASSIST, describeSupportPolicy, OPS_SUPPORT_MOUNTAIN } from './policy.js';

describe('describeSupportPolicy — agents.support honesty door', () => {
  it('exposes desk split, money denylist, and plane gates', () => {
    const policy = describeSupportPolicy();
    expect(policy.agentAssist).toBe(AGENTS_SUPPORT_ASSIST);
    expect(policy.deskMountain).toBe(OPS_SUPPORT_MOUNTAIN);
    expect(policy.deskStandalone).toBe(true);
    expect(policy.deskProductComplete).toBe(false);
    expect(policy.moneyTools).toEqual(SUPPORT_MONEY_TOOLS);
    expect(policy.moneyDeny.hasLedgerPost).toBe(1);
    expect(policy.moneyDeny.hasPayRefund).toBe(1);
    expect(policy.moneyDeny.hasTradeOrder).toBe(1);
    expect(policy.declaredTools).toEqual(supportDeclaredTools(supportAgentGuardrail()));
    expect(policy.dataTools).toEqual(SUPPORT_DATA_TOOLS);
    expect(policy.darkPlaneRefuse).toEqual({
      reason: 'desk_plane_dark',
      userMessageKey: 'agents.support.unavailable',
    });
    expect(policy.liveAllowedTasks).toEqual(['support.classify', 'support.reply']);
    expect(policy.tierLawRefuse).toEqual({
      reason: 'tier_law_blank',
      userMessageKey: 'agents.support.tier_closed',
    });
  });

  it('pins invent flags false and escalation first-class', () => {
    const policy = describeSupportPolicy();
    expect(policy.inventsBalances).toBe(false);
    expect(policy.inventsRefunds).toBe(false);
    expect(policy.escalationFirstClass).toBe(true);
    expect(policy.escalationUserMessageKey).toBe('agents.support.escalated');
  });

  it('guardrail export mirrors board card', () => {
    const policy = describeSupportPolicy();
    expect(policy.guardrailExport).toContain('agentId,version,declared,moneyDenied,approvalRequired');
    expect(policy.guardrailExport).toContain(`support,${policy.guardrail.version},${policy.guardrail.declared}`);
    expect(policy.moneyDenyExport).toContain('ledger_post');
  });
});
