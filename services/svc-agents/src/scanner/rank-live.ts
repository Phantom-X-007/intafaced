/**
 * Market Scanner Stage-2 — rank via live (allowlisted) data tools.
 *
 * Spec: docs/ops/trk/agents.scanner.md Stage 2.
 * Honesty: D26-P1-A3 — ranked signals only after P0-11 signal-inputs law;
 * else refuse (no invent alpha).
 *
 * Composes: P0-11 inputs gate + market plane + tier depth gate + ticker tool
 * honesty → Stage-1 rankFixtures. Caller still supplies fixture tickers
 * (allowlisted residual path until a live spot client is wired). Never invents
 * rows when tools refuse.
 */

import { invokeScannerDataTool, type TickerFixture } from './data-tools.js';
import { rankFixtures, type MarketPlaneState, type RankResult } from './rank.js';
import {
  SCANNER_SIGNAL_INPUTS_LAW_RESIDUAL,
  resolveScannerSignalInputsLaw,
  scannerSignalInputsGate,
  type ScannerSignalInputsGateRefuseReason,
  type ScannerSignalInputsLaw,
} from './signal-inputs-law.js';
import { scannerTierGate, type ScannerTierLaw } from './tier-gate.js';

export type RankLiveOk = Extract<RankResult, { status: 'ok' }> & {
  readonly maxSignals: number;
  readonly userTier: string;
  readonly tickersAccepted: number;
  readonly tickersRefused: number;
};

export type RankLiveRefuse = {
  readonly status: 'refuse';
  readonly reason:
    | 'tier_law_blank'
    | 'tier_not_granted'
    | 'depth_invalid'
    | 'market_plane_dark'
    | 'no_live_tickers'
    | 'rank_limit_unset'
    | ScannerSignalInputsGateRefuseReason;
  readonly userMessageKey:
    'agents.scanner.unavailable' | 'agents.scanner.tier_closed' | 'agents.scanner.signal_inputs_closed' | 'agents.scanner.rank_limit_unset';
  readonly residual?: typeof SCANNER_SIGNAL_INPUTS_LAW_RESIDUAL;
};

export type RankLiveResult = RankLiveOk | Exclude<RankResult, { status: 'ok' }> | RankLiveRefuse;

/**
 * Rank signals from allowlisted ticker fixtures under published tier depth.
 * Dark plane / blank P0-11 / blank tier law / all tickers refused → typed refuse (no invent).
 */
export function rankLiveFromTickers(input: {
  plane: MarketPlaneState;
  tierLaw?: ScannerTierLaw | null;
  userTier: string;
  tickers: readonly TickerFixture[];
  now?: Date;
  marketAllowlist?: ReadonlySet<string> | readonly string[];
  /** D26-P0-11. Omitted / blank → refuse before any rank (no default board). */
  signalInputsLaw?: ScannerSignalInputsLaw | null;
}): RankLiveResult {
  const inputsGate = scannerSignalInputsGate(resolveScannerSignalInputsLaw(input.signalInputsLaw));
  if (inputsGate.status === 'refuse') {
    return {
      status: 'refuse',
      reason: inputsGate.reason,
      userMessageKey: inputsGate.userMessageKey,
      residual: inputsGate.residual,
    };
  }

  if (input.plane === 'dark') {
    return {
      status: 'refuse',
      reason: 'market_plane_dark',
      userMessageKey: 'agents.scanner.unavailable',
    };
  }

  const tier = scannerTierGate({ law: input.tierLaw, userTier: input.userTier });
  if (tier.status === 'refuse') {
    return {
      status: 'refuse',
      reason: tier.reason,
      userMessageKey: tier.userMessageKey,
    };
  }

  if (!tier.allowedTools.includes('trade.ticker')) {
    return {
      status: 'refuse',
      reason: 'tier_not_granted',
      userMessageKey: 'agents.scanner.tier_closed',
    };
  }

  const accepted: TickerFixture[] = [];
  let tickersRefused = 0;
  const now = input.now ?? new Date();

  for (const ticker of input.tickers) {
    const toolResult = invokeScannerDataTool({
      tool: 'trade.ticker',
      plane: input.plane,
      tierLaw: input.tierLaw,
      userTier: input.userTier,
      now,
      ticker,
    });
    if (toolResult.status === 'ok' && toolResult.tool === 'trade.ticker') {
      accepted.push({
        marketId: toolResult.marketId,
        last: toolResult.last,
        volume24h: toolResult.volume24h,
        change24hBps: toolResult.change24hBps,
        asOf: toolResult.asOf,
        maxAgeMs: ticker.maxAgeMs,
      });
    } else {
      tickersRefused += 1;
    }
  }

  if (accepted.length === 0) {
    if (input.tickers.length === 0) {
      return { status: 'empty', userMessageKey: 'agents.scanner.empty' };
    }
    return {
      status: 'refuse',
      reason: 'no_live_tickers',
      userMessageKey: 'agents.scanner.unavailable',
    };
  }

  const ranked = rankFixtures(accepted, {
    now,
    limit: tier.maxSignals,
    marketPlane: input.plane,
    signalInputsLaw: resolveScannerSignalInputsLaw(input.signalInputsLaw),
    ...(input.marketAllowlist === undefined ? {} : { marketAllowlist: input.marketAllowlist }),
  });

  if (ranked.status === 'ok') {
    return {
      ...ranked,
      maxSignals: tier.maxSignals,
      userTier: tier.userTier,
      tickersAccepted: accepted.length,
      tickersRefused,
    };
  }

  return ranked;
}
