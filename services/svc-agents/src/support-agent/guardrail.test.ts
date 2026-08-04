import { describe, expect, it } from 'vitest';
import { parseAmount as amt } from '@intafaced/ledger-client';
import { EMPTY_SESSION_STATE, evaluateCompletion, evaluateToolCall, type SessionState } from '../fleet/guardrails.js';
import { isSupportMoneyTool, SUPPORT_MONEY_TOOLS, supportAgentGuardrail } from './guardrail.js';

const state = (overrides: Partial<SessionState> = {}): SessionState => ({
  ...EMPTY_SESSION_STATE,
  ...overrides,
});

const completion = (task: string) => ({
  task,
  maxOutputTokens: 256,
  worstCaseCost: amt('0.01'),
});

describe('support agent Stage-1 guardrail', () => {
  const g = () => supportAgentGuardrail();

  it('allows read-only desk tools that are declared', () => {
    expect(evaluateToolCall(g(), state(), { tool: 'support.kb.search' })).toEqual({ allowed: true });
    expect(evaluateToolCall(g(), state(), { tool: 'support.ticket.read' })).toEqual({ allowed: true });
  });

  it('allows support.classify / support.reply completion tasks', () => {
    expect(evaluateCompletion(g(), state(), completion('support.classify'), 'IFC')).toEqual({ allowed: true });
    expect(evaluateCompletion(g(), state(), completion('support.reply'), 'IFC')).toEqual({ allowed: true });
  });

  it('refuses navigator / trade completion tasks', () => {
    expect(evaluateCompletion(g(), state(), completion('navigator.plan'), 'IFC')).toMatchObject({
      allowed: false,
      code: 'agents.task_not_allowed',
    });
  });

  it('refuses every money-path tool by undeclared default — not after run', () => {
    for (const tool of SUPPORT_MONEY_TOOLS) {
      expect(isSupportMoneyTool(tool)).toBe(true);
      expect(evaluateToolCall(g(), state(), { tool }), tool).toMatchObject({
        allowed: false,
        code: 'agents.tool_not_declared',
        userMessageKey: 'agents.refused.tool_not_declared',
      });
    }
  });

  it('never grants a write tool in trade/pay/bank/ledger modules', () => {
    const moneyModules = new Set(['trade', 'pay', 'bank', 'ledger', 'p2p']);
    for (const tool of g().tools) {
      expect(moneyModules.has(tool.module)).toBe(false);
      expect(tool.mode).toBe('read');
    }
  });

  it('refuses support tools outside the grant list', () => {
    expect(evaluateToolCall(g(), state(), { tool: 'support.ticket.delete' })).toMatchObject({
      allowed: false,
      code: 'agents.tool_not_declared',
    });
  });
});
