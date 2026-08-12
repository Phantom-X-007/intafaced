import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import type { AuditedAction } from '../fleet/audit.js';
import { evaluateToolCall, type Guardrail, type Refusal, type SessionState } from '../fleet/guardrails.js';
import { RefusedError, type AgentRuntime } from '../runtime.js';
import type { SettlementResult } from '../metering/meter.js';
import { copyIntelAgentGuardrail } from './guardrail.js';
import { COPY_INTEL_AGENT_ID, COPY_INTEL_LEADERS_TOOL, COPY_INTEL_STATS_WRITE_TOOL, runCopyIntelStatsSession } from './session-run.js';

const USER = '11111111-1111-4111-8111-111111111111';
const SESSION = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-08-07T12:00:00.000Z');

function fixture(leaderId: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    leaderId,
    realisedPnl: '12.5',
    closedTrades: 10,
    winningTrades: 6,
    windowStart: '2026-08-01T00:00:00.000Z',
    windowEnd: '2026-08-07T00:00:00.000Z',
    source: 'platform-fills',
    ...overrides,
  } as {
    leaderId: string;
    realisedPnl: string | null;
    closedTrades: number | null;
    winningTrades: number | null;
    windowStart: string;
    windowEnd: string;
    source: string;
  };
}

function fakeAction(tool: string, status: 'executed' | 'refused'): AuditedAction {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    sessionId: SESSION,
    userId: USER,
    agentId: COPY_INTEL_AGENT_ID,
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
  openCalls = 0;
  settleCalls = 0;
  closeCalls = 0;
  guardrail: Guardrail = copyIntelAgentGuardrail();
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
      agentId: COPY_INTEL_AGENT_ID,
      guardrail: this.guardrail,
      guardrailVersion: this.guardrail.version,
      status: 'closed' as const,
      metered: true,
      openedAt: NOW,
      closedAt: NOW,
    };
  }
}

function runtimeOf(fake: FakeRuntime): AgentRuntime {
  return fake as unknown as AgentRuntime;
}

function baseInput(fake: FakeRuntime) {
  return {
    runtime: runtimeOf(fake),
    userId: USER,
    feeAssetId: 'IFC',
    plane: 'live' as const,
    now: NOW,
  };
}

describe('copy_intel.stats metered session run', () => {
  it('builds stats through the runtime, then settles and closes', async () => {
    const fake = new FakeRuntime();
    const result = await runCopyIntelStatsSession({
      ...baseInput(fake),
      fixtures: [fixture('leader-a'), fixture('leader-b', { realisedPnl: '3.0', winningTrades: 2 })],
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.stats).toHaveLength(2);
    expect(result.fixturesAccepted).toBe(2);
    expect(result.writesRefusedByGuardrail).toBe(0);
    // read ×2 then audited write ×2 — write path is the mountain promise
    expect(fake.toolCalls).toEqual([
      COPY_INTEL_LEADERS_TOOL,
      COPY_INTEL_LEADERS_TOOL,
      COPY_INTEL_STATS_WRITE_TOOL,
      COPY_INTEL_STATS_WRITE_TOOL,
    ]);
    expect(fake.openCalls).toBe(1);
    expect(fake.settleCalls).toBe(1);
    expect(fake.closeCalls).toBe(1);
    expect(result.metering.sessionClosed).toBe(true);
  });

  it('bills zero for a run that never called the engine — no invent fee share charge', async () => {
    const fake = new FakeRuntime();
    const result = await runCopyIntelStatsSession({ ...baseInput(fake), fixtures: [fixture('leader-a')] });

    expect(result.metering.billedAmount).toBe('0');
    expect(result.metering.settlements).toEqual([]);
    expect(typeof result.metering.billedAmount).toBe('string');
  });

  it('sums settled windows as decimal strings via bigint', async () => {
    const fake = new FakeRuntime();
    fake.settlements = [
      {
        sessionId: SESSION,
        windowId: 'w1',
        chargeKey: 'agent.usage:s:w1',
        amount: parseAmount('1.5'),
        chargeTxId: 'tx1',
        settled: true,
      },
      {
        sessionId: SESSION,
        windowId: 'w2',
        chargeKey: 'agent.usage:s:w2',
        amount: parseAmount('2.5'),
        chargeTxId: 'tx2',
        settled: true,
      },
    ];
    const result = await runCopyIntelStatsSession({ ...baseInput(fake), fixtures: [fixture('leader-a')] });
    expect(result.metering.billedAmount).toBe('4');
  });

  it('refuses a dark copy plane before opening a metered session', async () => {
    const fake = new FakeRuntime();
    const result = await runCopyIntelStatsSession({
      ...baseInput(fake),
      plane: 'dark',
      fixtures: [fixture('leader-a')],
    });

    expect(result).toMatchObject({
      status: 'refuse',
      reason: 'copy_plane_dark',
      userMessageKey: 'agents.copy_intel.unavailable',
    });
    expect(fake.openCalls).toBe(0);
    expect(result.metering.sessionId).toBeNull();
    expect(result.metering.billedAmount).toBe('0');
  });

  it('D26-P1-A5: refuses returns-ranked board before opening a session', async () => {
    const fake = new FakeRuntime();
    await expect(
      runCopyIntelStatsSession({
        ...baseInput(fake),
        fixtures: [fixture('leader-a')],
        rankBy: 'realisedPnl',
      }),
    ).rejects.toMatchObject({
      code: 'agents.refused',
      userMessageKey: 'agents.copy_intel.unavailable',
      userMessageParams: { reason: 'returns_ranked_board_forbidden', rankBy: 'realisedPnl' },
    });
    expect(fake.openCalls).toBe(0);
  });

  it('is empty — not a session — when nothing was asked for', async () => {
    const fake = new FakeRuntime();
    const result = await runCopyIntelStatsSession({ ...baseInput(fake), fixtures: [] });
    expect(result).toMatchObject({ status: 'empty', userMessageKey: 'agents.copy_intel.empty' });
    expect(fake.openCalls).toBe(0);
  });

  it('counts a guardrail refusal instead of inventing stats around it', async () => {
    const fake = new FakeRuntime();
    fake.guardrail = copyIntelAgentGuardrail();
    // Budget 1: first leader is read; extra fixtures refuse. Reads happen before
    // writes, so the audited write is also refused — never invent stats for
    // refused leaders and never ship unwritten audit as "ok".
    (fake.guardrail as { limits: { maxActionsPerSession: number } }).limits.maxActionsPerSession = 1;

    const result = await runCopyIntelStatsSession({
      ...baseInput(fake),
      fixtures: [fixture('a'), fixture('b'), fixture('c')],
    });

    expect(result).toMatchObject({
      status: 'refuse',
      reason: 'writes_refused',
      fixturesRefusedByGuardrail: 2,
      writesRefusedByGuardrail: 1,
    });
    if (result.status !== 'refuse') return;
    expect(fake.toolCalls).toEqual([COPY_INTEL_LEADERS_TOOL]);
  });

  it('writes audited stats only for leaders that passed the write tool', async () => {
    const fake = new FakeRuntime();
    // Budget exactly covers one read + one write — product write path on the wire.
    fake.guardrail = copyIntelAgentGuardrail();
    (fake.guardrail as { limits: { maxActionsPerSession: number } }).limits.maxActionsPerSession = 2;

    const result = await runCopyIntelStatsSession({
      ...baseInput(fake),
      fixtures: [fixture('solo')],
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.stats.map((s) => s.leaderId)).toEqual(['solo']);
    expect(result.audit).toHaveLength(1);
    expect(result.writesRefusedByGuardrail).toBe(0);
    expect(fake.toolCalls).toEqual([COPY_INTEL_LEADERS_TOOL, COPY_INTEL_STATS_WRITE_TOOL]);
  });

  it('refuses the whole run when every fixture was refused by the guardrail', async () => {
    const fake = new FakeRuntime();
    fake.guardrail = copyIntelAgentGuardrail();
    (fake.guardrail as { limits: { maxActionsPerSession: number } }).limits.maxActionsPerSession = 0;

    const result = await runCopyIntelStatsSession({
      ...baseInput(fake),
      fixtures: [fixture('a'), fixture('b')],
    });

    expect(result).toMatchObject({
      status: 'refuse',
      reason: 'no_live_leaders',
      fixturesRefusedByGuardrail: 2,
      writesRefusedByGuardrail: 0,
    });
    expect(fake.settleCalls).toBe(1);
    expect(fake.closeCalls).toBe(1);
  });

  it('refuses when reads succeed but every audited write is blocked by budget', async () => {
    const fake = new FakeRuntime();
    fake.guardrail = copyIntelAgentGuardrail();
    // One action: the read; the write tool then hits the budget.
    (fake.guardrail as { limits: { maxActionsPerSession: number } }).limits.maxActionsPerSession = 1;

    const result = await runCopyIntelStatsSession({
      ...baseInput(fake),
      fixtures: [fixture('a')],
    });

    expect(result).toMatchObject({
      status: 'refuse',
      reason: 'writes_refused',
      fixturesRefusedByGuardrail: 0,
      writesRefusedByGuardrail: 1,
    });
    expect(fake.toolCalls).toEqual([COPY_INTEL_LEADERS_TOOL]);
  });

  it('settles and closes even when the run throws', async () => {
    const fake = new FakeRuntime();
    fake.act = async () => {
      throw new Error('storage exploded');
    };
    await expect(runCopyIntelStatsSession({ ...baseInput(fake), fixtures: [fixture('a')] })).rejects.toThrow('storage exploded');
    expect(fake.settleCalls).toBe(1);
    expect(fake.closeCalls).toBe(1);
  });

  it('uses only declared read + write tools — never trade.order or fee-share invent paths', async () => {
    const fake = new FakeRuntime();
    await runCopyIntelStatsSession({ ...baseInput(fake), fixtures: [fixture('a'), fixture('b')] });

    expect(new Set(fake.toolCalls)).toEqual(new Set([COPY_INTEL_LEADERS_TOOL, COPY_INTEL_STATS_WRITE_TOOL]));
    expect(fake.toolCalls.some((t) => t === 'trade.order' || t === 'ledger.post' || t.includes('fee'))).toBe(false);
  });
});
