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

/** Blank / all-invalid timeframes refuse. Never invent 1m. */
export const TRADE_CANDLE_JOBS_TIMEFRAMES_UNSET = 'trade.candle_jobs_timeframes_unset' as const;
/** Blank / non-integer / out of 1..1000 limit refuse. Never invent 500. */
export const TRADE_CANDLE_JOBS_LIMIT_UNSET = 'trade.candle_jobs_limit_unset' as const;
export const CANDLE_JOBS_LIMIT_MAX = 1000;

export class CandleJobsUnsetError extends Error {
  constructor(
    message: string,
    readonly code: typeof TRADE_CANDLE_JOBS_TIMEFRAMES_UNSET | typeof TRADE_CANDLE_JOBS_LIMIT_UNSET,
  ) {
    super(message);
    this.name = 'CandleJobsUnsetError';
  }
}

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
  /** Timeframes to materialize. Empty when enabled+markets → typed refuse (never invent 1m). */
  timeframes: readonly Timeframe[];
  /**
   * Max buckets pulled per market/timeframe per tick.
   * Unset/null/out of 1..1000 when enabled+markets → typed refuse (never invent 500).
   */
  limit?: number | null;
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

/** Owner-published job window. Missing / null / non-int / out of 1..max refuses. Never invent 500. */
export function publishedCandleJobsLimit(value: number | undefined | null): number {
  if (value === undefined || value === null || !Number.isInteger(value) || value < 1 || value > CANDLE_JOBS_LIMIT_MAX) {
    throw new CandleJobsUnsetError('candle jobs limit is unset — refuse to invent 500', TRADE_CANDLE_JOBS_LIMIT_UNSET);
  }
  return value;
}

/**
 * Assemble spot candle jobs. Disabled or empty markets → stopped host.
 * Enabled + markets with blank timeframes or unset limit → typed refuse
 * (never invent 1m / 500). Owner may pass 1m and 500 explicitly.
 */
export function startCandleJobs(deps: CandleJobsDeps): CandleJobsHandle {
  const host = createJobHost({ onError: deps.onError });

  if (!deps.config.enabled || deps.config.marketIds.length === 0) {
    return { host, stop: () => host.stopAll() };
  }

  if (deps.config.timeframes.length === 0) {
    throw new CandleJobsUnsetError('candle jobs timeframes are unset — refuse to invent 1m', TRADE_CANDLE_JOBS_TIMEFRAMES_UNSET);
  }

  const limit = publishedCandleJobsLimit(deps.config.limit);
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
