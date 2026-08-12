import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import type { AuditedAction } from '../fleet/audit.js';
import { evaluateToolCall, type Guardrail, type Refusal, type SessionState } from '../fleet/guardrails.js';
import { RefusedError, type AgentRuntime } from '../runtime.js';
import type { SettlementResult } from '../metering/meter.js';
import { merchantAgentGuardrail } from './guardrail.js';
import { MERCHANT_AGENT_ID, MERCHANT_METRICS_TOOL, runMerchantWatchSession } from './session-run.js';

/**
 * The metered `merchant.watch` run.
 *
 * Postgres is doubled here; the POLICY is not. The double calls the real
 * `evaluateToolCall` against the real `merchantAgentGuardrail()`.
 */

const USER = '11111111-1111-4111-8111-111111111111';
const SESSION = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-08-07T12:00:00.000Z');

function point(railId: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    railId,
    approvalRate: '0.70',
    attempts: 100,
    asOf: '2026-08-07T11:59:30.000Z',
    maxAgeMs: 120_000,
    ...overrides,
  } as {
    railId: string;
    approvalRate: string | null;
    attempts: number | null;
    asOf: string;
    maxAgeMs: number;
  };
}

function fakeAction(tool: string, status: 'executed' | 'refused'): AuditedAction {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    sessionId: SESSION,
    userId: USER,
    agentId: MERCHANT_AGENT_ID,
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
  guardrail: Guardrail = merchantAgentGuardrail();
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
      agentId: MERCHANT_AGENT_ID,
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

describe('merchant.watch metered session run', () => {
  it('watches through the runtime, then settles and closes the session', async () => {
    const fake = new FakeRuntime();
    const result = await runMerchantWatchSession({
      ...baseInput(fake),
      points: [point('card-visa', { approvalRate: '0.70' }), point('card-mc', { approvalRate: '0.90' })],
      threshold: '0.85',
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    expect(result.alerts.map((a) => a.railId)).toEqual(['card-visa']);
    expect(result.pointsAccepted).toBe(2);
    expect(result.pointsRefusedByGuardrail).toBe(0);
    expect(fake.toolCalls).toEqual([MERCHANT_METRICS_TOOL, MERCHANT_METRICS_TOOL]);
    expect(fake.openCalls).toBe(1);
    expect(fake.settleCalls).toBe(1);
    expect(fake.closeCalls).toBe(1);
    expect(result.metering.sessionId).toBe(SESSION);
    expect(result.metering.sessionClosed).toBe(true);
  });

  it('bills zero for a run that never called the engine, and does not invent a charge', async () => {
    const fake = new FakeRuntime();
    const result = await runMerchantWatchSession({ ...baseInput(fake), points: [point('card-visa')] });

    expect(result.metering.billedAmount).toBe('0');
    expect(result.metering.settlements).toEqual([]);
    expect(typeof result.metering.billedAmount).toBe('string');
  });

  it('reports what the meter settled as decimal strings, summed in bigint', async () => {
    const fake = new FakeRuntime();
    fake.settlements = [
      {
        sessionId: SESSION,
        windowId: '2026-08-07T12:00',
        chargeKey: 'agent.usage:s:w1',
        amount: parseAmount('1.5'),
        chargeTxId: 'tx1',
        settled: true,
      },
      {
        sessionId: SESSION,
        windowId: '2026-08-07T12:05',
        chargeKey: 'agent.usage:s:w2',
        amount: parseAmount('2.5'),
        chargeTxId: 'tx2',
        settled: true,
      },
    ];

    const result = await runMerchantWatchSession({ ...baseInput(fake), points: [point('card-visa')] });
    expect(result.metering.billedAmount).toBe('4');
    expect(result.metering.settlements.map((s) => s.amount)).toEqual(['1.5', '2.5']);
  });

  it('refuses a dark pay plane before opening a metered session', async () => {
    const fake = new FakeRuntime();
    const result = await runMerchantWatchSession({
      ...baseInput(fake),
      plane: 'dark',
      points: [point('card-visa')],
    });

    expect(result).toMatchObject({
      status: 'refuse',
      reason: 'pay_plane_dark',
      userMessageKey: 'agents.merchant.unavailable',
    });
    expect(fake.openCalls).toBe(0);
    expect(result.metering.sessionId).toBeNull();
    expect(result.metering.billedAmount).toBe('0');
  });

  it('D26-P1-A4: allowlist missing a rail → incomplete_coverage after the metered read', async () => {
    const fake = new FakeRuntime();
    const result = await runMerchantWatchSession({
      ...baseInput(fake),
      points: [point('card-a')],
      railAllowlist: ['card-a', 'card-b'],
    });

    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'incomplete_coverage',
      userMessageKey: 'agents.merchant.unavailable',
      missingRailIds: ['card-b'],
    });
    expect(fake.openCalls).toBe(1);
    expect(fake.settleCalls).toBe(1);
    expect(result.metering.billedAmount).toBe('0');
  });

  it('is empty — not a session — when nothing was asked for', async () => {
    const fake = new FakeRuntime();
    const result = await runMerchantWatchSession({ ...baseInput(fake), points: [] });

    expect(result).toMatchObject({ status: 'empty', userMessageKey: 'agents.merchant.empty' });
    expect(fake.openCalls).toBe(0);
  });

  it('counts a guardrail refusal instead of inventing rates around it', async () => {
    const fake = new FakeRuntime();
    fake.guardrail = merchantAgentGuardrail();
    (fake.guardrail as { limits: { maxActionsPerSession: number } }).limits.maxActionsPerSession = 1;

    const result = await runMerchantWatchSession({
      ...baseInput(fake),
      points: [point('a'), point('b'), point('c')],
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.pointsAccepted).toBe(1);
    expect(result.pointsRefusedByGuardrail).toBe(2);
    expect(fake.settleCalls).toBe(1);
    expect(fake.closeCalls).toBe(1);
  });

  it('refuses the whole run when every point was refused by the guardrail', async () => {
    const fake = new FakeRuntime();
    fake.guardrail = merchantAgentGuardrail();
    (fake.guardrail as { limits: { maxActionsPerSession: number } }).limits.maxActionsPerSession = 0;

    const result = await runMerchantWatchSession({
      ...baseInput(fake),
      points: [point('a'), point('b')],
    });

    expect(result).toMatchObject({
      status: 'refuse',
      reason: 'no_live_metrics',
      userMessageKey: 'agents.merchant.unavailable',
      pointsRefusedByGuardrail: 2,
    });
    expect(fake.openCalls).toBe(1);
    expect(fake.settleCalls).toBe(1);
    expect(fake.closeCalls).toBe(1);
  });

  it('settles and closes even when the run throws', async () => {
    const fake = new FakeRuntime();
    const boom = new Error('storage exploded');
    fake.act = async () => {
      throw boom;
    };

    await expect(runMerchantWatchSession({ ...baseInput(fake), points: [point('card-visa')] })).rejects.toThrow('storage exploded');

    expect(fake.settleCalls).toBe(1);
    expect(fake.closeCalls).toBe(1);
  });

  it('only ever asks for the declared read tool — never a money-write or rail-change one', async () => {
    const fake = new FakeRuntime();
    await runMerchantWatchSession({ ...baseInput(fake), points: [point('a'), point('b')] });

    expect(new Set(fake.toolCalls)).toEqual(new Set([MERCHANT_METRICS_TOOL]));
    expect(fake.toolCalls.some((t) => t === 'pay.route.change' || t.startsWith('ledger.') || t === 'pay.capture')).toBe(false);
  });
});
