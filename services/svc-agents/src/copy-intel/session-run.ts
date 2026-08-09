/**
 * Copy-Intel Stage-2 — the metered `copy_intel.stats` RUN.
 *
 * Spec: docs/ops/trk/agents.copy-intel.md Stage 1–2
 * ("audited leader stats" / never invent PnL or fee share).
 *
 * Pure `stats.ts` already refuses dark planes and incomplete fixtures. This
 * module runs the same pure functions through `openSession → act → settle →
 * closeSession` so the declared toolset is enforced at call time and the run
 * settles through the one meter.
 *
 * ── What this module deliberately does NOT do ────────────────────────────────
 *
 * It does not invent fee share, profit-share bps, or follower counts. It does
 * not post ledger recipes. The only money verb is `runtime.settleSession`.
 * Ranking/stats are arithmetic over fixtures the caller supplied — so a clean
 * run bills `0` honestly (no engine completion).
 *
 * ── Why cheap refusals happen BEFORE the session opens ───────────────────────
 *
 * A dark copy plane is known before any tool is touched. Opening a metered
 * session to discover it would bill a user for the platform's own unreadiness.
 */

import { formatAmount, type Amount } from '@intafaced/ledger-client';
import { AgentError } from '../errors.js';
import { RefusedError, type AgentRuntime } from '../runtime.js';
import { buildLeaderStats, type AuditWrite, type CopyPlaneState, type LeaderPerformanceFixture, type LeaderStat } from './stats.js';

/** The agent id the copy-intel guardrail is registered under. */
export const COPY_INTEL_AGENT_ID = 'copy-intel';

/** The one tool a stats run invokes. Declared read in `guardrail.ts`. */
export const COPY_INTEL_LEADERS_TOOL = 'trade.copy.leaders.read';

export type CopyIntelRunSettlement = {
  readonly windowId: string;
  readonly amount: string;
  readonly chargeKey: string;
  readonly settled: boolean;
};

export type CopyIntelRunMetering = {
  readonly sessionId: string | null;
  readonly billedAmount: string;
  readonly assetId: string;
  readonly sessionClosed: boolean;
  readonly settlements: readonly CopyIntelRunSettlement[];
};

export type CopyIntelRunOk = {
  readonly status: 'ok';
  readonly stats: readonly LeaderStat[];
  readonly audit: readonly AuditWrite[];
  readonly skippedIncomplete: number;
  readonly fixturesAccepted: number;
  readonly fixturesRefusedByGuardrail: number;
  readonly metering: CopyIntelRunMetering;
};

export type CopyIntelRunEmpty = {
  readonly status: 'empty';
  readonly userMessageKey: 'agents.copy_intel.empty';
  readonly metering: CopyIntelRunMetering;
};

export type CopyIntelRunUnavailable = {
  readonly status: 'unavailable';
  readonly userMessageKey: 'agents.copy_intel.unavailable';
  readonly reason: 'no_data' | 'invalid_window' | 'copy_plane_dark';
  readonly metering: CopyIntelRunMetering;
};

export type CopyIntelRunRefuse = {
  readonly status: 'refuse';
  readonly reason: 'copy_plane_dark' | 'no_live_leaders';
  readonly userMessageKey: 'agents.copy_intel.unavailable';
  readonly fixturesRefusedByGuardrail: number;
  readonly metering: CopyIntelRunMetering;
};

export type CopyIntelRunResult = CopyIntelRunOk | CopyIntelRunEmpty | CopyIntelRunUnavailable | CopyIntelRunRefuse;

function unmetered(assetId: string): CopyIntelRunMetering {
  return { sessionId: null, billedAmount: '0', assetId, sessionClosed: false, settlements: [] };
}

async function settleAndClose(runtime: AgentRuntime, sessionId: string, assetId: string): Promise<CopyIntelRunMetering> {
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

export type CopyIntelRunInput = {
  readonly runtime: AgentRuntime;
  readonly userId: string;
  readonly feeAssetId: string;
  readonly plane: CopyPlaneState;
  readonly fixtures: readonly LeaderPerformanceFixture[];
  readonly leaderAllowlist?: ReadonlySet<string> | readonly string[];
  readonly now?: Date;
};

/**
 * Run `copy_intel.stats` as a metered, guardrailed session over pure stats.
 *
 * Each fixture is read through `runtime.act` on `trade.copy.leaders.read`.
 * Never invents PnL for a refused or missing leader.
 */
export async function runCopyIntelStatsSession(input: CopyIntelRunInput): Promise<CopyIntelRunResult> {
  const now = input.now ?? new Date();

  if (input.plane === 'dark') {
    return {
      status: 'refuse',
      reason: 'copy_plane_dark',
      userMessageKey: 'agents.copy_intel.unavailable',
      fixturesRefusedByGuardrail: 0,
      metering: unmetered(input.feeAssetId),
    };
  }

  if (input.fixtures.length === 0) {
    return {
      status: 'empty',
      userMessageKey: 'agents.copy_intel.empty',
      metering: unmetered(input.feeAssetId),
    };
  }

  const session = await input.runtime.openSession({ userId: input.userId, agentId: COPY_INTEL_AGENT_ID });

  let metering: CopyIntelRunMetering | null = null;
  try {
    const accepted: LeaderPerformanceFixture[] = [];
    let fixturesRefusedByGuardrail = 0;

    for (const fixture of input.fixtures) {
      try {
        const act = await input.runtime.act({
          sessionId: session.id,
          tool: COPY_INTEL_LEADERS_TOOL,
          execute: async () => fixture,
        });
        accepted.push(act.result as LeaderPerformanceFixture);
      } catch (err) {
        if (err instanceof RefusedError) {
          fixturesRefusedByGuardrail += 1;
          continue;
        }
        throw err;
      }
    }

    if (accepted.length === 0) {
      metering = await settleAndClose(input.runtime, session.id, input.feeAssetId);
      return {
        status: 'refuse',
        reason: 'no_live_leaders',
        userMessageKey: 'agents.copy_intel.unavailable',
        fixturesRefusedByGuardrail,
        metering,
      };
    }

    const built = buildLeaderStats(accepted, {
      now,
      copyPlane: input.plane,
      ...(input.leaderAllowlist === undefined ? {} : { leaderAllowlist: input.leaderAllowlist }),
    });

    metering = await settleAndClose(input.runtime, session.id, input.feeAssetId);

    if (built.status === 'ok') {
      return {
        status: 'ok',
        stats: built.stats,
        audit: built.audit,
        skippedIncomplete: built.skippedIncomplete,
        fixturesAccepted: accepted.length,
        fixturesRefusedByGuardrail,
        metering,
      };
    }

    if (built.status === 'empty') {
      return { status: 'empty', userMessageKey: built.userMessageKey, metering };
    }

    return {
      status: 'unavailable',
      userMessageKey: built.userMessageKey,
      reason: built.reason,
      metering,
    };
  } finally {
    if (metering === null) {
      await settleAndClose(input.runtime, session.id, input.feeAssetId).catch(() => {
        // Original error wins.
      });
    }
  }
}

export async function registerCopyIntelAgent(runtime: AgentRuntime, guardrail: unknown): Promise<{ agentId: string; version: number }> {
  const registered = await runtime.registerAgent(guardrail);
  if (registered.agentId !== COPY_INTEL_AGENT_ID) {
    throw new AgentError(
      `Refusing to register copy-intel guardrail under agent id "${registered.agentId}"`,
      'agents.agent_not_found',
      'agents.error.route_not_found',
      { task: registered.agentId },
    );
  }
  return { agentId: registered.agentId, version: registered.version };
}
