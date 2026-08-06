/**
 * Spot candle materialization job (A-TRADE-SPOT-1 residual).
 *
 * Default OFF. Never invents markets, timeframes, or empty candles.
 * When enabled: re-aggregates from real taker fills (SD-3 seeded excluded)
 * and upserts only *closed* buckets into `trade.spot_candles`.
 *
 * REST OHLCV still reads live from fills (`queryCandlesFromFills`) — this job
 * is the durable store for future consumers (WS fan-out, long history), not a
 * second truth that can invent zeros when the tape is silent.
 */
import type { Sql } from 'postgres';
import type { Timeframe } from '@intafaced/exchange-contract';
import { createJobHost, type JobHost } from '../futures/job-host.js';
import { materializeClosedCandles, queryCandlesFromFills } from './candles.js';

export interface CandleJobsConfig {
  /** Master kill — false = host created, no intervals. */
  enabled: boolean;
  /** Tick interval when enabled. */
  intervalMs: number;
  /**
   * Explicit markets to materialize. Empty = job not scheduled even when
   * enabled (never invent a market list).
   */
  marketIds: readonly string[];
  /** Timeframes to materialize. Caller supplies parsed list (default 1m). */
  timeframes: readonly Timeframe[];
  /** Max buckets pulled per market/timeframe per tick. */
  limit?: number;
}

export interface CandleJobsTickResult {
  marketId: string;
  timeframe: Timeframe;
  /** Buckets returned by live aggregation (may include open bucket). */
  candleCount: number;
  /** Closed buckets upserted (never invents empty). */
  written: number;
}

export interface CandleJobsDeps {
  sql: Sql;
  config: CandleJobsConfig;
  now?: () => number;
  onError?: (name: string, err: unknown) => void;
  onResult?: (result: CandleJobsTickResult) => void;
}

export interface CandleJobsHandle {
  host: JobHost;
  stop(): void;
}

/**
 * Assemble spot candle jobs. Disabled or empty markets → stopped host.
 */
export function startCandleJobs(deps: CandleJobsDeps): CandleJobsHandle {
  const host = createJobHost({ onError: deps.onError });

  if (!deps.config.enabled || deps.config.marketIds.length === 0 || deps.config.timeframes.length === 0) {
    return { host, stop: () => host.stopAll() };
  }

  const limit = deps.config.limit ?? 500;
  const now = deps.now ?? (() => Date.now());

  host.every('spot.candles', deps.config.intervalMs, async () => {
    for (const marketId of deps.config.marketIds) {
      if (!marketId.trim()) continue;
      for (const timeframe of deps.config.timeframes) {
        const candles = await queryCandlesFromFills(deps.sql, {
          marketId,
          timeframe,
          limit,
        });
        // Honest empty: no fills → candleCount 0, written 0 — never invent.
        const written = await materializeClosedCandles(deps.sql, {
          marketId,
          timeframe,
          candles,
          nowMs: now(),
        });
        deps.onResult?.({ marketId, timeframe, candleCount: candles.length, written });
      }
    }
  });

  return { host, stop: () => host.stopAll() };
}
