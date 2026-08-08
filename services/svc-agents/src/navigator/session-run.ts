/**
 * Navigator Stage-2 — the metered `navigator.answer` RUN.
 *
 * Spec: docs/ops/trk/agents.navigator.md Stage 2 ("Real data tools with typed
 * refusals / Audit log of user-affecting actions / Tier gating per product law").
 *
 * Everything the navigator needed to *decide* already existed and was pure:
 * `guardrail.ts` declares the toolset, `tier-gate.ts` gates grants, `tool-select.ts`
 * picks candidates, `data-tools.ts` refuses missing or stale fixtures. None of it
 * ever ran on the fleet runtime, so a navigator answer was a guardrail nobody
 * enforced at call time and a usage nobody metered. This module is the missing
 * verb: it drives those same pure functions through
 * `openSession → act → settle → closeSession`, so the declared toolset is enforced
 * by the runtime that writes the audit rows, and the run settles through the one
 * meter.
 *
 * ── Why every ask goes to `runtime.act`, including the ones we expect to fail ──
 *
 * It would be cheaper to filter an undeclared tool out here and never bother the
 * runtime with it. That is exactly the shape of bug #1114 was written to stop: a
 * guardrail that only ever sees calls a caller already decided were fine is not
 * enforcing anything, and the refusal never reaches `agent_actions`, so the audit
 * trail shows a session in which nothing was ever attempted.
 *
 * So the run asks for what it was asked for. The runtime decides. That matters
 * most for the one case that is not hypothetical: the tier matrix is
 * **caller-supplied product law**, and a matrix that grants `trade.order` would
 * sail through the tier gate. It does not sail through the session guardrail —
 * `trade.order` is not declared on `navigatorAgentGuardrail()`, so `act` refuses
 * it and `execute` is never reached. The money-write tool is not run because the
 * guardrail said no, not because this file remembered to check.
 *
 * ── What this module deliberately does NOT do ────────────────────────────────
 *
 * It does not price, post, hold or total anything. The only money verb here is
 * `runtime.settleSession`, which is `UsageMeter` → `packages/ledger-client`. The
 * navigator never calls `ledger.post` (§0.6). Amounts are scaled bigint from the
 * meter and leave as decimal strings.
 *
 * ── Why an unanswered ask is reported, never filled in ───────────────────────
 *
 * A navigator that cannot reach a quote returns a shorter answer plus the list
 * of what it could not check. It does not round the gap off, and it does not
 * substitute a plausible number. A confident wrong sentence about a user's money
 * is worse than no sentence, so `complete: false` and a named `unanswered` row
 * are the product, not an error path. When NOTHING was reachable there is no
 * answer to give at all, and the run refuses rather than shipping an empty
 * finding list dressed as a result.
 *
 * ── Why a run that reads fixtures bills zero, honestly ───────────────────────
 *
 * The metered thing in this service is the ENGINE (`runtime.think`), and this
 * run does not call it: an answer assembled from tool output is data movement,
 * not a completion. So the run opens no usage window and settles to `0`. That
 * zero is reported as what it is. A synthetic charge so the run "looks metered"
 * would be a fabricated cost, and a fabricated cost is the same class of lie as
 * a fabricated price.
 */

import { formatAmount, type Amount } from '@intafaced/ledger-client';
import type { CopyKey } from '../copy.js';
import { RefusedError, type AgentRuntime } from '../runtime.js';
import {
  invokeNavigatorDataTool,
  type DataToolOk,
  type DataToolResult,
  type MarketListFixture,
  type QuoteFixture,
  type SessionFixture,
} from './data-tools.js';
import type { TradeDataPlane } from './grounded.js';
import { navigatorTierGate, type NavigatorTierLaw } from './tier-gate.js';

/** The agent id the navigator guardrail is registered under. */
export const NAVIGATOR_AGENT_ID = 'navigator';

/**
 * One thing the user wants looked up, and the fixture rows the caller can
 * supply for it.
 *
 * The tool name is whatever the surface asked for — deliberately a plain
 * `string` and not a union of the declared tools, because narrowing it here
 * would move the allowlist decision out of the guardrail and into the type
 * system of the caller.
 */
export type NavigatorAsk = {
  readonly tool: string;
  readonly quote?: QuoteFixture | null;
  readonly markets?: readonly MarketListFixture[] | null;
  readonly session?: SessionFixture | null;
};

/** Who said no. `guardrail` is the runtime; `tool` is the data tool itself. */
export type NavigatorUnansweredBy = 'guardrail' | 'tool';

/** An ask that produced no fact, and the reason it produced none. */
export type NavigatorUnanswered = {
  readonly tool: string;
  readonly refusedBy: NavigatorUnansweredBy;
  /** Guardrail refusal code, or the data tool's typed refuse reason. */
  readonly reason: string;
  readonly userMessageKey: CopyKey;
};

/** One settled usage window, as it leaves the service. */
export type NavigatorRunSettlement = {
  readonly windowId: string;
  /** Decimal string. Money never crosses the wire as a `number` (§0.5). */
  readonly amount: string;
  readonly chargeKey: string;
  /** False when the window was already settled — the idempotent retry path. */
  readonly settled: boolean;
};

/**
 * What the run cost and whether it was cleaned up.
 *
 * Present on every outcome, including refusals: "we refused and billed you
 * nothing" is a claim the caller should be able to read, not infer.
 */
export type NavigatorRunMetering = {
  /** Null when the run refused before opening a session — nothing was metered. */
  readonly sessionId: string | null;
  /** Total settled by this run, decimal string. */
  readonly billedAmount: string;
  readonly assetId: string;
  readonly sessionClosed: boolean;
  readonly settlements: readonly NavigatorRunSettlement[];
};

export type NavigatorRunRefuseReason = 'trade_plane_dark' | 'tier_law_blank' | 'tier_not_granted' | 'no_grounded_answer';

export type NavigatorRunOk = {
  readonly status: 'ok';
  readonly userTier: string;
  /** Only what a tool actually returned. Never a reconstruction. */
  readonly findings: readonly DataToolOk[];
  readonly unanswered: readonly NavigatorUnanswered[];
  readonly asked: number;
  readonly answered: number;
  /** False when at least one ask went unanswered — the surface must say so. */
  readonly complete: boolean;
  readonly metering: NavigatorRunMetering;
};

export type NavigatorRunRefuse = {
  readonly status: 'refuse';
  readonly reason: NavigatorRunRefuseReason;
  readonly userMessageKey: 'agents.navigator.unavailable' | 'agents.navigator.tier_closed';
  readonly unanswered: readonly NavigatorUnanswered[];
  readonly metering: NavigatorRunMetering;
};

export type NavigatorRunEmpty = {
  readonly status: 'empty';
  readonly userMessageKey: 'agents.navigator.empty';
  readonly metering: NavigatorRunMetering;
};

export type NavigatorRunResult = NavigatorRunOk | NavigatorRunRefuse | NavigatorRunEmpty;

function unmetered(assetId: string): NavigatorRunMetering {
  return { sessionId: null, billedAmount: '0', assetId, sessionClosed: false, settlements: [] };
}

/**
 * Settle every open window, then close the session.
 *
 * Runs on every exit path including the thrown one. A session left open holds
 * usage that only a sweep job would ever find, and the sweep is not a plan.
 * Settlement failure is not swallowed into a fake zero — the caller is told the
 * run could not be accounted for.
 */
async function settleAndClose(runtime: AgentRuntime, sessionId: string, assetId: string): Promise<NavigatorRunMetering> {
  const results = await runtime.settleSession(sessionId);
  const closed = await runtime.closeSession(sessionId);

  let total: Amount = 0n;
  for (const r of results) total += r.amount;

  return {
    sessionId,
    billedAmount: formatAmount(total),
    assetId,
    sessionClosed: closed.status === 'closed',
    settlements: results.map((r) => ({
      windowId: r.windowId,
      amount: formatAmount(r.amount),
      chargeKey: r.chargeKey,
      settled: r.settled,
    })),
  };
}

export type NavigatorRunInput = {
  readonly runtime: AgentRuntime;
  readonly userId: string;
  /** Asset the fleet meters in. Supplied by the caller; this module holds no rate. */
  readonly feeAssetId: string;
  readonly plane: TradeDataPlane;
  /** Product-law tier matrix. Blank → refuse-closed, before any session opens. */
  readonly tierLaw?: NavigatorTierLaw | null;
  readonly userTier: string;
  readonly asks: readonly NavigatorAsk[];
  readonly now?: Date;
};

/**
 * Run `navigator.answer` as a metered, guardrailed session over the pure tools.
 *
 * Each ask is dispatched through `runtime.act`, so the runtime — not this module
 * — decides whether the tool is allowed, counts it against the session's action
 * budget, and writes the audit row. A guardrail refusal is caught and recorded
 * as an unanswered ask rather than thrown, because one refused tool is not a
 * failed question: the honest answer is a shorter finding list plus the named
 * gap, never a longer one padded with invented facts.
 */
export async function runNavigatorAnswerSession(input: NavigatorRunInput): Promise<NavigatorRunResult> {
  const now = input.now ?? new Date();

  // ── Free refusals, before a session exists ────────────────────────────────
  //
  // A dark trade plane and an unpublished tier matrix are known before any tool
  // is touched. Opening a metered session to discover them would bill a user for
  // the platform's own unreadiness, and would leave an audit trail implying the
  // navigator tried. It did not try — it refused, and it refused for free.
  if (input.plane === 'dark') {
    return {
      status: 'refuse',
      reason: 'trade_plane_dark',
      userMessageKey: 'agents.navigator.unavailable',
      unanswered: [],
      metering: unmetered(input.feeAssetId),
    };
  }

  const tier = navigatorTierGate({ law: input.tierLaw, userTier: input.userTier });
  if (tier.status === 'refuse') {
    return {
      status: 'refuse',
      reason: tier.reason,
      userMessageKey: tier.userMessageKey,
      unanswered: [],
      metering: unmetered(input.feeAssetId),
    };
  }

  if (input.asks.length === 0) {
    // Nothing was asked. Opening a session to answer nothing would be a charge
    // for a lookup that never happened.
    return {
      status: 'empty',
      userMessageKey: 'agents.navigator.empty',
      metering: unmetered(input.feeAssetId),
    };
  }

  // If the tier grants none of the asked tools, every ask would refuse inside
  // the session for a reason already knowable outside it. Refuse closed, free.
  const granted = new Set(tier.allowedTools);
  if (!input.asks.some((ask) => granted.has(ask.tool.trim()))) {
    return {
      status: 'refuse',
      reason: 'tier_not_granted',
      userMessageKey: 'agents.navigator.tier_closed',
      unanswered: [],
      metering: unmetered(input.feeAssetId),
    };
  }

  // ── The metered run ───────────────────────────────────────────────────────
  const session = await input.runtime.openSession({ userId: input.userId, agentId: NAVIGATOR_AGENT_ID });

  let metering: NavigatorRunMetering | null = null;
  try {
    const findings: DataToolOk[] = [];
    const unanswered: NavigatorUnanswered[] = [];

    for (const ask of input.asks) {
      const tool = ask.tool.trim();
      let toolResult: DataToolResult;

      try {
        const act = await input.runtime.act({
          sessionId: session.id,
          tool,
          // Reached only after the guardrail has allowed the call. An undeclared
          // tool — including every money-write one — never gets this far.
          execute: async () =>
            invokeNavigatorDataTool({
              tool,
              plane: input.plane,
              tierLaw: input.tierLaw,
              userTier: input.userTier,
              now,
              quote: ask.quote ?? null,
              markets: ask.markets ?? null,
              session: ask.session ?? null,
            }),
        });
        toolResult = act.result as DataToolResult;
      } catch (err) {
        // The session guardrail said no (undeclared tool, action budget, spend
        // ceiling). Recorded as a gap in the answer, not routed around.
        if (err instanceof RefusedError) {
          unanswered.push({
            tool,
            refusedBy: 'guardrail',
            reason: err.refusal.code,
            userMessageKey: err.refusal.userMessageKey,
          });
          continue;
        }
        throw err;
      }

      if (toolResult.status === 'ok') {
        findings.push(toolResult);
      } else {
        unanswered.push({
          tool,
          refusedBy: 'tool',
          reason: toolResult.reason,
          userMessageKey: toolResult.userMessageKey,
        });
      }
    }

    metering = await settleAndClose(input.runtime, session.id, input.feeAssetId);

    if (findings.length === 0) {
      // Nothing was reachable. There is no answer to give, and a result object
      // with an empty finding list would read like one.
      return {
        status: 'refuse',
        reason: 'no_grounded_answer',
        userMessageKey: 'agents.navigator.unavailable',
        unanswered,
        metering,
      };
    }

    return {
      status: 'ok',
      userTier: tier.userTier,
      findings,
      unanswered,
      asked: input.asks.length,
      answered: findings.length,
      complete: unanswered.length === 0,
      metering,
    };
  } finally {
    // Only if a return path did not already settle: `settleSession` is
    // idempotent, but closing twice on the throw path would still be noise.
    if (metering === null) {
      await settleAndClose(input.runtime, session.id, input.feeAssetId).catch(() => {
        // The original error is the one worth propagating; a settlement failure
        // on top of it must not replace it. The window stays open and unsealed,
        // which is the state a sweep can still find and finish.
      });
    }
  }
}
