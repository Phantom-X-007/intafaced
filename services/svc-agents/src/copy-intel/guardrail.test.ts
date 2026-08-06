import { describe, expect, it } from 'vitest';
import { parseAmount as amt } from '@intafaced/ledger-client';
import { EMPTY_SESSION_STATE, evaluateCompletion, evaluateToolCall, type SessionState } from '../fleet/guardrails.js';
import { COPY_INTEL_MONEY_WRITE_TOOLS, copyIntelAgentGuardrail, isCopyIntelMoneyWriteTool } from './guardrail.js';

const state = (overrides: Partial<SessionState> = {}): SessionState => ({
  ...EMPTY_SESSION_STATE,
  ...overrides,
});

const completion = (task: string) => ({
  task,
  maxOutputTokens: 512,
  worstCaseCost: amt('0.05'),
});

describe('copy-intel Stage-1 guardrail', () => {
  const g = () => copyIntelAgentGuardrail();

  it('allows copy_intel.stats and declared tools', () => {
    expect(evaluateCompletion(g(), state(), completion('copy_intel.stats'), 'IFC')).toEqual({ allowed: true });
    expect(evaluateToolCall(g(), state(), { tool: 'trade.copy.leaders.read' })).toEqual({ allowed: true });
    expect(evaluateToolCall(g(), state(), { tool: 'trade.copy.stats.write' })).toEqual({ allowed: true });
  });

  it('refuses trade placement / follow tools', () => {
    for (const tool of COPY_INTEL_MONEY_WRITE_TOOLS) {
      expect(isCopyIntelMoneyWriteTool(tool)).toBe(true);
      expect(evaluateToolCall(g(), state(), { tool }), tool).toMatchObject({
        allowed: false,
        code: 'agents.tool_not_declared',
      });
    }
  });
});
