import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import type { AuditedAction } from '../fleet/audit.js';
import { evaluateToolCall, type Guardrail, type Refusal, type SessionState } from '../fleet/guardrails.js';
import { RefusedError, type AgentRuntime } from '../runtime.js';
import type { SettlementResult } from '../metering/meter.js';
import { NAVIGATOR_DATA_TOOLS } from './data-tools.js';
import { navigatorAgentGuardrail } from './guardrail.js';
import { runNavigatorAnswerSession, NAVIGATOR_AGENT_ID } from './session-run.js';

/**
 * The metered `navigator.answer` run.
 *
 * Postgres is doubled here; the POLICY is not. The double calls the real
 * `evaluateToolCall` against the real `navigatorAgentGuardrail()`, and the run
 * under test calls the real data tools. What is faked is row storage —
 * `runtime.test.ts` owns the database properties (append-only, the window seal,
 * the unique request id) against real Postgres, and re-faking them here would
 * only test the fake.
 */

const USER = '11111111-1111-4111-8111-111111111111';
const SESSION = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-08-07T12:00:00.000Z');

const law = {
  published: true as const,
  matrix: { free: [...NAVIGATOR_DATA_TOOLS] },
};

function quoteAsk(marketId: string, overrides: Partial<{ last: string | null; asOf: string; maxAgeMs: number }> = {}) {
  return {
    tool: 'trade.quote',
    quote: {
      marketId,
      last: '100',
      asOf: '2026-08-07T11:59:30.000Z',
      maxAgeMs: 120_000,
      ...overrides,
    },
  };
}

function fakeAction(tool: string, status: 'executed' | 'refused'): AuditedAction {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    sessionId: SESSION,
    userId: USER,
    agentId: NAVIGATOR_AGENT_ID,
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

/**
 * A runtime double that enforces the real guardrail.
 *
 * `executed` records the tools whose `execute` closure actually ran. It is the
 * handle the guardrail tests below assert on: a tool that appears there was
 * really invoked, whatever the run later reported about it.
 *
 * `settlements` is what the meter would hand back; the default is `[]`, which is
 * what a real navigator run produces — it never calls the engine, so it opens no
 * usage window and there is nothing to settle.
 */
class FakeRuntime {
  readonly toolCalls: string[] = [];
  readonly refusedCalls: string[] = [];
  readonly executed: string[] = [];
  openCalls = 0;
  settleCalls = 0;
  closeCalls = 0;
  guardrail: Guardrail = navigatorAgentGuardrail();
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
      agentId: NAVIGATOR_AGENT_ID,
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
    tierLaw: law,
    userTier: 'free',
    now: NOW,
  };
}

describe('navigator.answer metered session run', () => {
  it('answers through the runtime, then settles and closes the session', async () => {
    const fake = new FakeRuntime();
    const result = await runNavigatorAnswerSession({
      ...baseInput(fake),
      asks: [
        quoteAsk('btc-usdt'),
        { tool: 'trade.markets.list', markets: [{ marketId: 'btc-usdt', symbol: 'BTC/USDT', status: 'open' as const }] },
      ],
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    expect(result.answered).toBe(2);
    expect(result.asked).toBe(2);
    expect(result.complete).toBe(true);
    expect(result.unanswered).toEqual([]);
    // The facts are echoes of what the caller supplied — nothing was derived.
    expect(result.findings[0]).toMatchObject({ tool: 'trade.quote', marketId: 'btc-usdt', last: '100' });

    // One audited tool call per ask — the guardrail saw every lookup.
    expect(fake.toolCalls).toEqual(['trade.quote', 'trade.markets.list']);
    expect(fake.openCalls).toBe(1);
    expect(fake.settleCalls).toBe(1);
    expect(fake.closeCalls).toBe(1);
    expect(result.metering.sessionId).toBe(SESSION);
    expect(result.metering.sessionClosed).toBe(true);
  });

  it('bills zero for a run that never called the engine, and does not invent a charge', async () => {
    const fake = new FakeRuntime();
    const result = await runNavigatorAnswerSession({ ...baseInput(fake), asks: [quoteAsk('btc-usdt')] });

    expect(result.metering.billedAmount).toBe('0');
    expect(result.metering.settlements).toEqual([]);
    expect(result.metering.assetId).toBe('IFC');
    // Money is a decimal string on the wire, never a number.
    expect(typeof result.metering.billedAmount).toBe('string');
  });

  it('reports what the meter settled as decimal strings, summed in bigint', async () => {
    const fake = new FakeRuntime();
    fake.settlements = [
      {
        sessionId: SESSION,
        windowId: '2026-08-07T12:00',
        chargeKey: 'agent.usage:s:w1',
        amount: parseAmount('0.75'),
        chargeTxId: 'tx1',
        settled: true,
      },
      {
        sessionId: SESSION,
        windowId: '2026-08-07T12:05',
        chargeKey: 'agent.usage:s:w2',
        amount: parseAmount('0.25'),
        chargeTxId: 'tx2',
        settled: true,
      },
    ];

    const result = await runNavigatorAnswerSession({ ...baseInput(fake), asks: [quoteAsk('btc-usdt')] });

    // 0.75 + 0.25 = 1 at the ledger's scale — summed as bigint, formatted once.
    expect(result.metering.billedAmount).toBe('1');
    expect(result.metering.settlements.map((s) => s.amount)).toEqual(['0.75', '0.25']);
    expect(result.metering.settlements.every((s) => typeof s.amount === 'string')).toBe(true);
  });

  // ── The guardrail is load-bearing ─────────────────────────────────────────

  it('does not run a money-write tool a caller-supplied tier matrix tried to grant', async () => {
    const fake = new FakeRuntime();
    const result = await runNavigatorAnswerSession({
      ...baseInput(fake),
      // Product law is caller-supplied, so a bad matrix is a real input. The
      // tier gate would hand `trade.order` over; the session guardrail must not.
      tierLaw: { published: true, matrix: { free: ['trade.quote', 'trade.order'] } },
      asks: [quoteAsk('btc-usdt'), { tool: 'trade.order' }],
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    // THE assertion: the money-write tool never reached its executor. If the
    // runtime stopped enforcing the declared toolset, `execute` would have run
    // and this line would fail — which is the point of the test.
    expect(fake.executed).toEqual(['trade.quote']);
    expect(fake.executed).not.toContain('trade.order');
    expect(fake.refusedCalls).toEqual(['trade.order']);

    // And the refusal is reported as a gap, not swallowed.
    expect(result.unanswered).toEqual([
      {
        tool: 'trade.order',
        refusedBy: 'guardrail',
        reason: 'agents.tool_not_declared',
        userMessageKey: 'agents.refused.tool_not_declared',
      },
    ]);
    expect(result.complete).toBe(false);
    expect(result.answered).toBe(1);
  });

  it('records a guardrail refusal as an unanswered ask instead of answering around it', async () => {
    const fake = new FakeRuntime();
    // A guardrail whose action budget allows exactly one call.
    fake.guardrail = navigatorAgentGuardrail();
    (fake.guardrail as { limits: { maxActionsPerSession: number } }).limits.maxActionsPerSession = 1;

    const result = await runNavigatorAnswerSession({
      ...baseInput(fake),
      asks: [quoteAsk('btc-usdt'), quoteAsk('eth-usdt'), quoteAsk('sol-usdt')],
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.answered).toBe(1);
    expect(result.unanswered).toHaveLength(2);
    expect(result.unanswered.every((u) => u.refusedBy === 'guardrail' && u.reason === 'agents.action_limit')).toBe(true);
    expect(fake.executed).toEqual(['trade.quote']);
    // Still settled and closed despite the refusals.
    expect(fake.settleCalls).toBe(1);
    expect(fake.closeCalls).toBe(1);
  });

  it('never reaches the executor for any tool outside the declared set', async () => {
    const fake = new FakeRuntime();
    const declared = new Set(navigatorAgentGuardrail().tools.map((t) => t.name));

    await runNavigatorAnswerSession({
      ...baseInput(fake),
      tierLaw: { published: true, matrix: { free: ['trade.quote', 'ledger.post', 'bank.transfer', 'p2p.release'] } },
      asks: [quoteAsk('btc-usdt'), { tool: 'ledger.post' }, { tool: 'bank.transfer' }, { tool: 'p2p.release' }],
    });

    expect(fake.executed.every((t) => declared.has(t))).toBe(true);
    expect(fake.refusedCalls.sort()).toEqual(['bank.transfer', 'ledger.post', 'p2p.release']);
  });

  // ── Honesty: never fabricate what a tool could not return ─────────────────

  it('drops an ask the data tool refuses instead of filling it in', async () => {
    const fake = new FakeRuntime();
    const result = await runNavigatorAnswerSession({
      ...baseInput(fake),
      asks: [
        quoteAsk('btc-usdt'),
        quoteAsk('ghost-usdt', { last: null }), // no quote — refused, never zero-filled
        quoteAsk('stale-usdt', { asOf: '2026-08-07T00:00:00.000Z' }), // older than maxAgeMs
      ],
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.answered).toBe(1);
    expect(result.complete).toBe(false);
    expect(result.unanswered.map((u) => [u.refusedBy, u.reason])).toEqual([
      ['tool', 'incomplete_quote'],
      ['tool', 'stale'],
    ]);
    // The only fact carried is the one a tool actually returned.
    expect(result.findings).toHaveLength(1);
  });

  it('refuses the whole run when nothing was reachable — no empty answer dressed as a result', async () => {
    const fake = new FakeRuntime();
    const result = await runNavigatorAnswerSession({
      ...baseInput(fake),
      asks: [quoteAsk('a-usdt', { last: null }), quoteAsk('b-usdt', { last: null })],
    });

    expect(result).toMatchObject({
      status: 'refuse',
      reason: 'no_grounded_answer',
      userMessageKey: 'agents.navigator.unavailable',
    });
    if (result.status !== 'refuse') return;
    expect(result.unanswered).toHaveLength(2);
    // The session it opened is still settled and closed.
    expect(fake.openCalls).toBe(1);
    expect(fake.settleCalls).toBe(1);
    expect(fake.closeCalls).toBe(1);
  });

  // ── Free refusals, before a session exists ────────────────────────────────

  it('refuses a dark trade plane before opening a metered session', async () => {
    const fake = new FakeRuntime();
    const result = await runNavigatorAnswerSession({ ...baseInput(fake), plane: 'dark', asks: [quoteAsk('btc-usdt')] });

    expect(result).toMatchObject({
      status: 'refuse',
      reason: 'trade_plane_dark',
      userMessageKey: 'agents.navigator.unavailable',
    });
    // Nothing opened means nothing to bill for the platform's own darkness.
    expect(fake.openCalls).toBe(0);
    expect(result.metering.sessionId).toBeNull();
    expect(result.metering.billedAmount).toBe('0');
  });

  it('refuses an unpublished tier law before opening a metered session', async () => {
    const fake = new FakeRuntime();
    const result = await runNavigatorAnswerSession({ ...baseInput(fake), tierLaw: null, asks: [quoteAsk('btc-usdt')] });

    expect(result).toMatchObject({
      status: 'refuse',
      reason: 'tier_law_blank',
      userMessageKey: 'agents.navigator.tier_closed',
    });
    expect(fake.openCalls).toBe(0);
  });

  it('refuses when the tier grants none of the asked tools', async () => {
    const fake = new FakeRuntime();
    const result = await runNavigatorAnswerSession({
      ...baseInput(fake),
      tierLaw: { published: true, matrix: { free: ['identity.session.read'] } },
      asks: [quoteAsk('btc-usdt')],
    });

    expect(result).toMatchObject({
      status: 'refuse',
      reason: 'tier_not_granted',
      userMessageKey: 'agents.navigator.tier_closed',
    });
    expect(fake.openCalls).toBe(0);
  });

  it('is empty — not a session — when nothing was asked', async () => {
    const fake = new FakeRuntime();
    const result = await runNavigatorAnswerSession({ ...baseInput(fake), asks: [] });

    expect(result).toMatchObject({ status: 'empty', userMessageKey: 'agents.navigator.empty' });
    expect(fake.openCalls).toBe(0);
    expect(result.metering.billedAmount).toBe('0');
  });

  // ── The thrown path ───────────────────────────────────────────────────────

  it('settles and closes even when the run throws', async () => {
    const fake = new FakeRuntime();
    const boom = new Error('storage exploded');
    fake.act = async () => {
      throw boom;
    };

    await expect(runNavigatorAnswerSession({ ...baseInput(fake), asks: [quoteAsk('btc-usdt')] })).rejects.toThrow('storage exploded');

    // No leaked open session, no unbilled window left for a sweep nobody runs.
    expect(fake.settleCalls).toBe(1);
    expect(fake.closeCalls).toBe(1);
  });

  it('propagates the original failure even when settlement also fails', async () => {
    const fake = new FakeRuntime();
    fake.act = async () => {
      throw new Error('tool exploded');
    };
    fake.settleSession = async () => {
      throw new Error('meter exploded');
    };

    // The error worth reporting is the one that broke the run, not the one the
    // cleanup hit on the way out.
    await expect(runNavigatorAnswerSession({ ...baseInput(fake), asks: [quoteAsk('btc-usdt')] })).rejects.toThrow('tool exploded');
  });
});
