import { describe, expect, it } from 'vitest';
import { parseAmount as amt } from '@intafaced/ledger-client';
import { EMPTY_SESSION_STATE, evaluateCompletion, evaluateToolCall, type SessionState } from '../fleet/guardrails.js';
import { isMerchantMoneyWriteTool, MERCHANT_MONEY_WRITE_TOOLS, merchantAgentGuardrail } from './guardrail.js';

const state = (overrides: Partial<SessionState> = {}): SessionState => ({
  ...EMPTY_SESSION_STATE,
  ...overrides,
});

const completion = (task: string) => ({
  task,
  maxOutputTokens: 512,
  worstCaseCost: amt('0.05'),
});

describe('merchant agent Stage-1 guardrail', () => {
  const g = () => merchantAgentGuardrail();

  it('allows merchant.watch and read metrics tools', () => {
    expect(evaluateCompletion(g(), state(), completion('merchant.watch'), 'IFC')).toEqual({ allowed: true });
    expect(evaluateToolCall(g(), state(), { tool: 'pay.metrics.read' })).toEqual({ allowed: true });
    expect(evaluateToolCall(g(), state(), { tool: 'pay.rails.list' })).toEqual({ allowed: true });
  });

  it('refuses money-write / rail-change tools as undeclared', () => {
    for (const tool of MERCHANT_MONEY_WRITE_TOOLS) {
      expect(isMerchantMoneyWriteTool(tool)).toBe(true);
      expect(evaluateToolCall(g(), state(), { tool }), tool).toMatchObject({
        allowed: false,
        code: 'agents.tool_not_declared',
      });
    }
  });

  it('refuses navigator / trade placement tasks', () => {
    expect(evaluateCompletion(g(), state(), completion('navigator.plan'), 'IFC')).toMatchObject({
      allowed: false,
      code: 'agents.task_not_allowed',
    });
  });

  it('Stage-1 grants only read tools', () => {
    for (const tool of g().tools) {
      expect(tool.mode).toBe('read');
    }
  });
});
