import { describe, expect, it } from 'vitest';
import type { AuditedAction } from '../fleet/audit.js';
import { evaluateToolCall, type Guardrail, type Refusal, type SessionState } from '../fleet/guardrails.js';
import { RefusedError, type AgentRuntime } from '../runtime.js';
import type { SettlementResult } from '../metering/meter.js';
import { SUPPORT_DATA_TOOLS } from './data-tools.js';
import { supportAgentGuardrail } from './guardrail.js';
import { runSupportReplySession, SUPPORT_AGENT_ID, SUPPORT_KB_TOOL } from './session-run.js';

/**
 * D26-P1-A2 Done bar — KB + account-state grounded; stoppable; no invent balance.
 *
 * Named suite so the mountain cannot regress without a red Done-bar door.
 */

const USER = '11111111-1111-4111-8111-111111111111';
const SESSION = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-08-12T12:00:00.000Z');

const law = {
  published: true as const,
  matrix: { free: [...SUPPORT_DATA_TOOLS] },
};

const ARTICLE = {
  articleKey: 'support.kb.withdrawal_hold',
  titleKey: 'support.kb.withdrawal_hold.title',
  bodyKey: 'support.kb.withdrawal_hold.body',
};

function fakeAction(tool: string, status: 'executed' | 'refused'): AuditedAction {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    sessionId: SESSION,
    userId: USER,
    agentId: SUPPORT_AGENT_ID,
    sequence: 0,
    kind: 'tool_call',
    status,
    tool,
    task: null,
    providerId: null,
    model: null,
    inputTokens: 0n,
    outputTokens: 0n,
    cost: 0n,
    refusalCode: null,
    userMessageKey: 'agents.action.executed',
    userMessageParams: {},
    inputDigest: null,
    outputDigest: null,
    prevHash: null,
    hash: 'h',
    occurredAt: NOW,
  };
}

class FakeRuntime {
  readonly toolCalls: string[] = [];
  readonly refusedCalls: string[] = [];
  readonly executed: string[] = [];
  openCalls = 0;
  settleCalls = 0;
  closeCalls = 0;
  guardrail: Guardrail = supportAgentGuardrail();
  settlements: SettlementResult[] = [];

  async openSession(input: { userId: string; agentId: string }) {
    this.openCalls += 1;
    return {
      id: SESSION,
      userId: input.userId,
      agentId: input.agentId,
      guardrail: this.guardrail,
      guardrailVersion: this.guardrail.version,
      status: 'open' as const,
      metered: true,
      openedAt: NOW,
      closedAt: null,
    };
  }

  private state(): SessionState {
    const toolCalls: Record<string, number> = {};
    for (const t of this.toolCalls) toolCalls[t] = (toolCalls[t] ?? 0) + 1;
    return {
      status: 'open',
      actionCount: this.toolCalls.length + this.refusedCalls.length,
      toolCalls,
      spend: 0n,
      approvedTools: [],
    };
  }

  async act(input: { sessionId: string; tool: string; execute: () => Promise<unknown> }) {
    const decision = evaluateToolCall(this.guardrail, this.state(), { tool: input.tool });
    if (!decision.allowed) {
      this.refusedCalls.push(input.tool);
      throw new RefusedError(decision as Refusal, fakeAction(input.tool, 'refused'));
    }
    this.executed.push(input.tool);
    const result = await input.execute();
    this.toolCalls.push(input.tool);
    return { result, action: fakeAction(input.tool, 'executed') };
  }

  async settleSession(_sessionId: string): Promise<SettlementResult[]> {
    this.settleCalls += 1;
    return this.settlements;
  }

  async closeSession(_sessionId: string) {
    this.closeCalls += 1;
    return {
      id: SESSION,
      userId: USER,
      agentId: SUPPORT_AGENT_ID,
      guardrail: this.guardrail,
      guardrailVersion: this.guardrail.version,
      status: 'closed' as const,
      metered: true,
      openedAt: NOW,
      closedAt: NOW,
    };
  }
}

function baseInput(fake: FakeRuntime) {
  return {
    runtime: fake as unknown as AgentRuntime,
    userId: USER,
    feeAssetId: 'IFC',
    plane: 'live' as const,
    tierLaw: law,
    userTier: 'free',
  };
}

describe('D26-P1-A2 agents.support Done bar', () => {
  it('grounds a reply from KB + account state without inventing balances', async () => {
    const fake = new FakeRuntime();
    const result = await runSupportReplySession({
      ...baseInput(fake),
      asks: [
        { tool: SUPPORT_KB_TOOL, articles: [ARTICLE] },
        {
          tool: 'identity.account.read',
          account: { userId: USER, status: 'active' as const, kycTier: 'tier2' },
        },
      ],
    });
    expect(result.status).toBe('ok');
    expect(fake.executed).toEqual([SUPPORT_KB_TOOL, 'identity.account.read']);
    expect(fake.settleCalls).toBe(1);
    expect(fake.closeCalls).toBe(1);
  });

  it('refuses when account-state was asked and missing — no invent from KB alone', async () => {
    const fake = new FakeRuntime();
    const result = await runSupportReplySession({
      ...baseInput(fake),
      asks: [
        { tool: SUPPORT_KB_TOOL, articles: [ARTICLE] },
        { tool: 'identity.account.read', account: null },
      ],
    });
    expect(result).toMatchObject({
      status: 'refuse',
      reason: 'account_state_missing',
    });
    expect(fake.settleCalls).toBe(1);
    expect(fake.closeCalls).toBe(1);
  });

  it('stops on AbortSignal and never invents a silent feeCharge', async () => {
    const fake = new FakeRuntime();
    const ac = new AbortController();
    ac.abort();
    const result = await runSupportReplySession({
      ...baseInput(fake),
      signal: ac.signal,
      asks: [
        { tool: SUPPORT_KB_TOOL, articles: [ARTICLE] },
        {
          tool: 'identity.account.read',
          account: { userId: USER, status: 'active' as const, kycTier: 'tier2' },
        },
      ],
    });
    expect(result).toMatchObject({ status: 'stopped', reason: 'aborted' });
    expect(fake.executed).toEqual([]);
    if (result.status !== 'stopped') return;
    expect(result.metering.billedAmount).toBe('0');
  });
});
