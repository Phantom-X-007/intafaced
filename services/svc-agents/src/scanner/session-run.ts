/**
 * Market Scanner Stage-2 — the metered `scanner.rank` RUN.
 *
 * Spec: docs/ops/trk/TRK-agents.scanner.md Stage 2
 * ("Guardrail registration + `scanner.rank` skill drives pure ranker only /
 * Metering settles").
 *
 * Everything the scanner needed to *decide* already existed and was pure:
 * `guardrail.ts` declares the toolset, `tier-gate.ts` gates depth, `data-tools.ts`
 * refuses missing quotes, `rank.ts` ranks. None of it ever ran on the fleet
 * runtime, so a scanner rank was a guardrail nobody enforced at call time and a
 * usage nobody metered. This module is the missing verb: it takes those same
 * pure functions and runs them through `openSession → act → settle →
 * closeSession`, so the declared toolset is enforced by the runtime that wrote
 * the audit rows and the run settles through the one meter.
 *
 * ── What this module deliberately does NOT do ────────────────────────────────
 *
 * It does not price, post, hold or total anything itself. The only money verb
 * here is `runtime.settleSession`, which is `UsageMeter` → `packages/ledger-client`.
 * There is no second accounting path, and the scanner never calls `ledger.post`
 * (§0.6). Amounts are scaled bigint from the meter and leave as decimal strings.
 *
 * ── Why the cheap refusals happen BEFORE the session opens ───────────────────
 *
 * An unsealed D26-P0-11 signal-inputs law, a dark market plane, and an
 * unpublished tier matrix are known before any tool is touched. Opening a
 * metered session to discover them would bill a user for the platform's own
 * unreadiness, and would leave an audit trail implying the scanner tried. It
 * did not try — it refused, and it refused for free.
 *
 * ── Why a run that ranks fixtures bills zero, honestly ───────────────────────
 *
 * The metered thing in this service is the ENGINE (`runtime.think`), and the
 * scanner does not call it: ranking is arithmetic over quotes the caller
 * supplied, not a completion. So a scanner run opens no usage window and
 * settles to `0`. That zero is reported as what it is. The alternative — a
 * synthetic charge so the run "looks metered" — would be a fabricated cost, and
 * a fabricated cost is the same class of lie as a fabricated price.
 */

import { formatAmount, type Amount } from '@intafaced/ledger-client';
import { AgentError } from '../errors.js';
import { RefusedError, type AgentRuntime } from '../runtime.js';
import { invokeScannerDataTool, type TickerFixture } from './data-tools.js';
import { readLiveSpotTickers, type SpotTickersPort } from './spot-tickers-port.js';
import { rankFixtures, type MarketPlaneState, type RankedSignal } from './rank.js';
import {
  SCANNER_SIGNAL_INPUTS_LAW_RESIDUAL,
  resolveScannerSignalInputsLaw,
  scannerSignalInputsGate,
  type ScannerSignalInputsGateRefuseReason,
  type ScannerSignalInputsLaw,
} from './signal-inputs-law.js';
import { scannerTierGate, type ScannerTierLaw } from './tier-gate.js';

export type { SpotTickersPort } from './spot-tickers-port.js';

/** The agent id the scanner guardrail is registered under. */
export const SCANNER_AGENT_ID = 'scanner';

/** The one tool a rank run invokes. Declared read-only in `guardrail.ts`. */
export const SCANNER_TICKER_TOOL = 'trade.ticker';

/** One settled usage window, as it leaves the service. */
export type ScannerRunSettlement = {
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
export type ScannerRunMetering = {
  /** Null when the run refused before opening a session — nothing was metered. */
  readonly sessionId: string | null;
  /** Total settled by this run, decimal string. */
  readonly billedAmount: string;
  readonly assetId: string;
  readonly sessionClosed: boolean;
  readonly settlements: readonly ScannerRunSettlement[];
};

export type ScannerRunRefuseReason =
  | 'market_plane_dark'
  | 'tier_law_blank'
  | 'tier_not_granted'
  | 'depth_invalid'
  | 'no_live_tickers'
  | 'rank_limit_unset'
  | ScannerSignalInputsGateRefuseReason;

export type ScannerRunOk = {
  readonly status: 'ok';
  readonly userTier: string;
  readonly maxSignals: number;
  readonly signals: readonly RankedSignal[];
  readonly rankedAt: string;
  readonly considered: number;
  readonly skippedStale: number;
  readonly skippedIncomplete: number;
  /** Tickers the data tool returned honestly. */
  readonly tickersAccepted: number;
  /** Tickers the data tool refused (missing / stale / invalid) — never filled in. */
  readonly tickersRefusedByTool: number;
  /** Tool calls the session guardrail itself refused (budget, undeclared). */
  readonly tickersRefusedByGuardrail: number;
  readonly metering: ScannerRunMetering;
};

export type ScannerRunRefuse = {
  readonly status: 'refuse';
  readonly reason: ScannerRunRefuseReason;
  readonly userMessageKey:
    'agents.scanner.unavailable' | 'agents.scanner.tier_closed' | 'agents.scanner.signal_inputs_closed' | 'agents.scanner.rank_limit_unset';
  readonly residual?: typeof SCANNER_SIGNAL_INPUTS_LAW_RESIDUAL;
  readonly tickersRefusedByTool: number;
  readonly tickersRefusedByGuardrail: number;
  readonly metering: ScannerRunMetering;
};

export type ScannerRunEmpty = {
  readonly status: 'empty';
  readonly userMessageKey: 'agents.scanner.empty';
  readonly metering: ScannerRunMetering;
};

export type ScannerRunUnavailable = {
  readonly status: 'unavailable';
  readonly userMessageKey: 'agents.scanner.unavailable';
  readonly reason: 'stale' | 'no_quotes' | 'market_plane_dark';
  readonly metering: ScannerRunMetering;
};

export type ScannerRunResult = ScannerRunOk | ScannerRunRefuse | ScannerRunEmpty | ScannerRunUnavailable;

function unmetered(assetId: string): ScannerRunMetering {
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
async function settleAndClose(runtime: AgentRuntime, sessionId: string, assetId: string): Promise<ScannerRunMetering> {
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

export type ScannerRunInput = {
  readonly runtime: AgentRuntime;
  readonly userId: string;
  /** Asset the fleet meters in. Supplied by the caller; this module holds no rate. */
  readonly feeAssetId: string;
  readonly plane: MarketPlaneState;
  /** D26-P0-11 signal-inputs law. Blank → refuse ranked signals before any session. */
  readonly signalInputsLaw?: ScannerSignalInputsLaw | null;
  /** Product-law tier matrix. Blank → refuse-closed, before any session opens. */
  readonly tierLaw?: ScannerTierLaw | null;
  readonly userTier: string;
  /**
   * Fixture/dark body tickers. Ignored when `plane === 'live'` — live truth is
   * `spotTickersPort` only.
   */
  readonly tickers: readonly TickerFixture[];
  /** Required for live. Unset in production until Class X spot quotes exist. */
  readonly spotTickersPort?: SpotTickersPort;
  readonly now?: Date;
  readonly marketAllowlist?: ReadonlySet<string> | readonly string[];
};

/**
 * Run `scanner.rank` as a metered, guardrailed session over the pure ranker.
 *
 * Each ticker is fetched through `runtime.act`, so the runtime — not this
 * module — decides whether `trade.ticker` is allowed, counts it against the
 * session's action budget, and writes the audit row. A guardrail refusal is
 * caught and counted rather than thrown, because one refused tool is not a
 * failed scan: the honest answer is a shorter list plus the count of what was
 * refused, never a longer list padded with invented rows.
 */
export async function runScannerRankSession(input: ScannerRunInput): Promise<ScannerRunResult> {
  const now = input.now ?? new Date();

  // ── Free refusals, before a session exists ────────────────────────────────
  // D26-P1-A3: no ranked signals until P0-11 seals what may rank.
  const inputsGate = scannerSignalInputsGate(resolveScannerSignalInputsLaw(input.signalInputsLaw));
  if (inputsGate.status === 'refuse') {
    return {
      status: 'refuse',
      reason: inputsGate.reason,
      userMessageKey: inputsGate.userMessageKey,
      residual: inputsGate.residual,
      tickersRefusedByTool: 0,
      tickersRefusedByGuardrail: 0,
      metering: unmetered(input.feeAssetId),
    };
  }

  if (input.plane === 'dark') {
    return {
      status: 'refuse',
      reason: 'market_plane_dark',
      userMessageKey: 'agents.scanner.unavailable',
      tickersRefusedByTool: 0,
      tickersRefusedByGuardrail: 0,
      metering: unmetered(input.feeAssetId),
    };
  }

  const tier = scannerTierGate({ law: input.tierLaw, userTier: input.userTier });
  if (tier.status === 'refuse') {
    return {
      status: 'refuse',
      reason: tier.reason,
      userMessageKey: tier.userMessageKey,
      tickersRefusedByTool: 0,
      tickersRefusedByGuardrail: 0,
      metering: unmetered(input.feeAssetId),
    };
  }

  if (!tier.allowedTools.includes(SCANNER_TICKER_TOOL)) {
    return {
      status: 'refuse',
      reason: 'tier_not_granted',
      userMessageKey: 'agents.scanner.tier_closed',
      tickersRefusedByTool: 0,
      tickersRefusedByGuardrail: 0,
      metering: unmetered(input.feeAssetId),
    };
  }

  let tickers = input.tickers;
  if (input.plane === 'live') {
    const live = await readLiveSpotTickers(input.spotTickersPort);
    if (!live.ok) {
      return {
        status: 'refuse',
        reason: 'no_live_tickers',
        userMessageKey: 'agents.scanner.unavailable',
        tickersRefusedByTool: 0,
        tickersRefusedByGuardrail: 0,
        metering: unmetered(input.feeAssetId),
      };
    }
    tickers = live.tickers;
  }

  if (tickers.length === 0) {
    // Nothing was asked for. Opening a session to rank nothing would be a
    // charge for a scan that never happened.
    return {
      status: 'empty',
      userMessageKey: 'agents.scanner.empty',
      metering: unmetered(input.feeAssetId),
    };
  }

  // ── The metered run ───────────────────────────────────────────────────────
  const session = await input.runtime.openSession({ userId: input.userId, agentId: SCANNER_AGENT_ID });

  let metering: ScannerRunMetering | null = null;
  try {
    const accepted: TickerFixture[] = [];
    let tickersRefusedByTool = 0;
    let tickersRefusedByGuardrail = 0;

    for (const ticker of tickers) {
      let toolResult: ReturnType<typeof invokeScannerDataTool>;
      try {
        const act = await input.runtime.act({
          sessionId: session.id,
          tool: SCANNER_TICKER_TOOL,
          execute: async () =>
            invokeScannerDataTool({
              tool: SCANNER_TICKER_TOOL,
              plane: input.plane,
              tierLaw: input.tierLaw,
              userTier: input.userTier,
              now,
              ticker,
            }),
        });
        toolResult = act.result as ReturnType<typeof invokeScannerDataTool>;
      } catch (err) {
        // The session guardrail said no (action budget, tool not declared on
        // the registered guardrail). Counted, not invented around.
        if (err instanceof RefusedError) {
          tickersRefusedByGuardrail += 1;
          continue;
        }
        throw err;
      }

      if (toolResult.status === 'ok' && toolResult.tool === SCANNER_TICKER_TOOL) {
        accepted.push({
          marketId: toolResult.marketId,
          last: toolResult.last,
          volume24h: toolResult.volume24h,
          change24hBps: toolResult.change24hBps,
          asOf: toolResult.asOf,
          maxAgeMs: ticker.maxAgeMs,
        });
      } else {
        tickersRefusedByTool += 1;
      }
    }

    if (accepted.length === 0) {
      metering = await settleAndClose(input.runtime, session.id, input.feeAssetId);
      return {
        status: 'refuse',
        reason: 'no_live_tickers',
        userMessageKey: 'agents.scanner.unavailable',
        tickersRefusedByTool,
        tickersRefusedByGuardrail,
        metering,
      };
    }

    // The pure Stage-1 ranker, unchanged. Depth is the tier's, not this
    // module's opinion.
    const ranked = rankFixtures(accepted, {
      now,
      limit: tier.maxSignals,
      marketPlane: input.plane,
      signalInputsLaw: resolveScannerSignalInputsLaw(input.signalInputsLaw),
      ...(input.marketAllowlist === undefined ? {} : { marketAllowlist: input.marketAllowlist }),
    });

    if (ranked.status === 'refuse') {
      metering = await settleAndClose(input.runtime, session.id, input.feeAssetId);
      return {
        status: 'refuse',
        reason: ranked.reason,
        userMessageKey: ranked.userMessageKey,
        residual: ranked.residual,
        tickersRefusedByTool,
        tickersRefusedByGuardrail,
        metering,
      };
    }

    metering = await settleAndClose(input.runtime, session.id, input.feeAssetId);

    if (ranked.status === 'ok') {
      return {
        status: 'ok',
        userTier: tier.userTier,
        maxSignals: tier.maxSignals,
        signals: ranked.signals,
        rankedAt: ranked.rankedAt,
        considered: ranked.considered,
        skippedStale: ranked.skippedStale,
        skippedIncomplete: ranked.skippedIncomplete,
        tickersAccepted: accepted.length,
        tickersRefusedByTool,
        tickersRefusedByGuardrail,
        metering,
      };
    }

    if (ranked.status === 'empty') {
      return { status: 'empty', userMessageKey: ranked.userMessageKey, metering };
    }

    return {
      status: 'unavailable',
      userMessageKey: ranked.userMessageKey,
      reason: ranked.reason,
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

/**
 * Register the scanner guardrail so `openSession('scanner')` can bind it.
 *
 * Separate from the run because registration is a deployment act, not a
 * per-request one — and because a run that silently registered its own
 * guardrail could widen its powers on the way in.
 */
export async function registerScannerAgent(runtime: AgentRuntime, guardrail: unknown): Promise<{ agentId: string; version: number }> {
  const registered = await runtime.registerAgent(guardrail);
  if (registered.agentId !== SCANNER_AGENT_ID) {
    throw new AgentError(
      `Refusing to register scanner guardrail under agent id "${registered.agentId}"`,
      'agents.agent_not_found',
      'agents.error.route_not_found',
      { task: registered.agentId },
    );
  }
  return { agentId: registered.agentId, version: registered.version };
}
