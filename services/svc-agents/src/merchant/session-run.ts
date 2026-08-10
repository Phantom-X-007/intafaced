/**
 * Merchant Stage-2 — the metered `merchant.watch` RUN.
 *
 * Spec: docs/ops/trk/agents.merchant.md Stage 1–2
 * ("approval-rate watch" / "read-only across pay" / no invent rates).
 *
 * Everything the merchant needed to *decide* already existed and was pure:
 * `guardrail.ts` declares the toolset, `watch.ts` refuses dark/missing metrics.
 * None of it ever ran on the fleet runtime, so a merchant watch was a guardrail
 * nobody enforced at call time and a usage nobody metered. This module is the
 * missing verb: it takes those same pure functions and runs them through
 * `openSession → act → settle → closeSession`.
 *
 * ── What this module deliberately does NOT do ────────────────────────────────
 *
 * It does not price, post, hold or total anything itself. The only money verb
 * here is `runtime.settleSession`, which is `UsageMeter` → `packages/ledger-client`.
 * There is no second accounting path, and the merchant never calls `ledger.post`
 * (§0.6). It never changes a pay rail (`pay.route.change` is on the money
 * denylist and is never invoked).
 *
 * ── Why the cheap refusals happen BEFORE the session opens ───────────────────
 *
 * A dark pay plane is known before any tool is touched. Opening a metered
 * session to discover it would bill a user for the platform's own unreadiness.
 *
 * ── Why a run that watches fixtures bills zero, honestly ─────────────────────
 *
 * The metered thing in this service is the ENGINE (`runtime.think`), and the
 * merchant does not call it: watching is arithmetic over rates the caller
 * supplied, not a completion. So a merchant run opens no usage window and
 * settles to `0`. That zero is reported as what it is.
 */

import { formatAmount, type Amount } from '@intafaced/ledger-client';
import { AgentError } from '../errors.js';
import { RefusedError, type AgentRuntime } from '../runtime.js';
import { watchApprovalFixtures, type ApprovalRatePoint, type MerchantAlert, type PayPlaneState } from './watch.js';

/** The agent id the merchant guardrail is registered under. */
export const MERCHANT_AGENT_ID = 'merchant';

/** The one tool a watch run invokes. Declared read-only in `guardrail.ts`. */
export const MERCHANT_METRICS_TOOL = 'pay.metrics.read';

/** One settled usage window, as it leaves the service. */
export type MerchantRunSettlement = {
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
export type MerchantRunMetering = {
  /** Null when the run refused before opening a session — nothing was metered. */
  readonly sessionId: string | null;
  /** Total settled by this run, decimal string. */
  readonly billedAmount: string;
  readonly assetId: string;
  readonly sessionClosed: boolean;
  readonly settlements: readonly MerchantRunSettlement[];
};

export type MerchantRunOk = {
  readonly status: 'ok';
  readonly watchedAt: string;
  readonly considered: number;
  readonly skippedStale: number;
  readonly skippedIncomplete: number;
  readonly skippedLowSample: number;
  readonly alerts: readonly MerchantAlert[];
  /** Points the metrics tool accepted. */
  readonly pointsAccepted: number;
  /** Points the session guardrail itself refused (budget, undeclared). */
  readonly pointsRefusedByGuardrail: number;
  readonly metering: MerchantRunMetering;
};

export type MerchantRunEmpty = {
  readonly status: 'empty';
  readonly userMessageKey: 'agents.merchant.empty';
  readonly metering: MerchantRunMetering;
};

export type MerchantRunUnavailable = {
  readonly status: 'unavailable';
  readonly userMessageKey: 'agents.merchant.unavailable';
  readonly reason: 'stale' | 'no_metrics' | 'pay_plane_dark';
  readonly metering: MerchantRunMetering;
};

export type MerchantRunRefuse = {
  readonly status: 'refuse';
  readonly reason: 'pay_plane_dark' | 'no_live_metrics';
  readonly userMessageKey: 'agents.merchant.unavailable';
  readonly pointsRefusedByGuardrail: number;
  readonly metering: MerchantRunMetering;
};

export type MerchantRunResult = MerchantRunOk | MerchantRunEmpty | MerchantRunUnavailable | MerchantRunRefuse;

function unmetered(assetId: string): MerchantRunMetering {
  return { sessionId: null, billedAmount: '0', assetId, sessionClosed: false, settlements: [] };
}

/**
 * Settle every open window, then close the session.
 *
 * Runs on every exit path including the thrown one. A session left open holds
 * usage that only a sweep job would ever find, and the sweep is not a plan.
 */
async function settleAndClose(runtime: AgentRuntime, sessionId: string, assetId: string): Promise<MerchantRunMetering> {
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

export type MerchantRunInput = {
  readonly runtime: AgentRuntime;
  readonly userId: string;
  /** Asset the fleet meters in. Supplied by the caller; this module holds no rate. */
  readonly feeAssetId: string;
  readonly plane: PayPlaneState;
  readonly points: readonly ApprovalRatePoint[];
  readonly threshold?: string;
  readonly railAllowlist?: ReadonlySet<string> | readonly string[];
  /** Minimum attempts before a point can alert. Default 1 (zero-sample never alerts). */
  readonly minAttempts?: number;
  readonly now?: Date;
};

/**
 * Run `merchant.watch` as a metered, guardrailed session over the pure watcher.
 *
 * Each point is fetched through `runtime.act`, so the runtime — not this
 * module — decides whether `pay.metrics.read` is allowed, counts it against the
 * session's action budget, and writes the audit row. A guardrail refusal is
 * counted rather than thrown: one refused rail is not a failed watch.
 */
export async function runMerchantWatchSession(input: MerchantRunInput): Promise<MerchantRunResult> {
  const now = input.now ?? new Date();

  // ── Free refusals, before a session exists ────────────────────────────────
  if (input.plane === 'dark') {
    return {
      status: 'refuse',
      reason: 'pay_plane_dark',
      userMessageKey: 'agents.merchant.unavailable',
      pointsRefusedByGuardrail: 0,
      metering: unmetered(input.feeAssetId),
    };
  }

  if (input.points.length === 0) {
    return {
      status: 'empty',
      userMessageKey: 'agents.merchant.empty',
      metering: unmetered(input.feeAssetId),
    };
  }

  // ── The metered run ───────────────────────────────────────────────────────
  const session = await input.runtime.openSession({ userId: input.userId, agentId: MERCHANT_AGENT_ID });

  let metering: MerchantRunMetering | null = null;
  try {
    const accepted: ApprovalRatePoint[] = [];
    let pointsRefusedByGuardrail = 0;

    for (const point of input.points) {
      try {
        const act = await input.runtime.act({
          sessionId: session.id,
          tool: MERCHANT_METRICS_TOOL,
          execute: async () => point,
        });
        accepted.push(act.result as ApprovalRatePoint);
      } catch (err) {
        if (err instanceof RefusedError) {
          pointsRefusedByGuardrail += 1;
          continue;
        }
        throw err;
      }
    }

    if (accepted.length === 0) {
      metering = await settleAndClose(input.runtime, session.id, input.feeAssetId);
      return {
        status: 'refuse',
        reason: 'no_live_metrics',
        userMessageKey: 'agents.merchant.unavailable',
        pointsRefusedByGuardrail,
        metering,
      };
    }

    const watched = watchApprovalFixtures(accepted, {
      now,
      payPlane: input.plane,
      ...(input.threshold === undefined ? {} : { threshold: input.threshold }),
      ...(input.railAllowlist === undefined ? {} : { railAllowlist: input.railAllowlist }),
      ...(input.minAttempts === undefined ? {} : { minAttempts: input.minAttempts }),
    });

    metering = await settleAndClose(input.runtime, session.id, input.feeAssetId);

    if (watched.status === 'ok') {
      return {
        status: 'ok',
        watchedAt: watched.watchedAt,
        considered: watched.considered,
        skippedStale: watched.skippedStale,
        skippedIncomplete: watched.skippedIncomplete,
        skippedLowSample: watched.skippedLowSample,
        alerts: watched.alerts,
        pointsAccepted: accepted.length,
        pointsRefusedByGuardrail,
        metering,
      };
    }

    if (watched.status === 'empty') {
      return { status: 'empty', userMessageKey: watched.userMessageKey, metering };
    }

    return {
      status: 'unavailable',
      userMessageKey: watched.userMessageKey,
      reason: watched.reason,
      metering,
    };
  } finally {
    if (metering === null) {
      await settleAndClose(input.runtime, session.id, input.feeAssetId).catch(() => {
        // Original error wins; settlement failure on top must not replace it.
      });
    }
  }
}

/**
 * Register the merchant guardrail so `openSession('merchant')` can bind it.
 *
 * Separate from the run because registration is a deployment act, not a
 * per-request one.
 */
export async function registerMerchantAgent(runtime: AgentRuntime, guardrail: unknown): Promise<{ agentId: string; version: number }> {
  const registered = await runtime.registerAgent(guardrail);
  if (registered.agentId !== MERCHANT_AGENT_ID) {
    throw new AgentError(
      `Refusing to register merchant guardrail under agent id "${registered.agentId}"`,
      'agents.agent_not_found',
      'agents.error.route_not_found',
      { task: registered.agentId },
    );
  }
  return { agentId: registered.agentId, version: registered.version };
}
