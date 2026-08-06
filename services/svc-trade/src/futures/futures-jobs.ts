/**
 * Futures job assembly (trade.futures residual).
 *
 * Wires loaders + stores + marks/rates + ticks into JobHost.
 * Default OFF — ops must enable. Never invents marks, rates, or market lists.
 *
 * Marks: matching depth mid by default. When a venue fabric MarkSource is
 * injected (A-TRADE-VENUE-1), that public mid is preferred; depth remains the
 * fallback. Either path returns null rather than inventing.
 */
import type { Sql } from 'postgres';
import type { LedgerClient } from '@intafaced/ledger-client';
import type { EventBus } from '@intafaced/events';
import type { MatchingClient } from '../spot/matching-client.js';
import { createJobHost, type JobHost } from './job-host.js';
import { runFundingTick } from './funding-tick.js';
import { runLiquidationTick, type MarkSource } from './liquidation-tick.js';
import { markSourceFromDepth } from './mark-from-depth.js';
import { markSourcePrefer } from './mark-from-venue.js';
import { memoryFundingRateBook, type FundingRateEntry } from './funding-rate-source.js';
import { sqlFundingPositionLoader, sqlLiquidationPositionLoader } from './position-loaders.js';
import { sqlFundingPeriodStore, sqlLiquidationAttemptStore, sqlPositionCloser } from './tick-stores.js';

export interface FuturesJobsConfig {
  /** Master kill — false = host created but no intervals started. */
  enabled: boolean;
  /** Liquidation scan interval. Default 15s when enabled. */
  liqIntervalMs: number;
  /** Funding tick interval per market. Default 8h when enabled. */
  fundingIntervalMs: number;
  /**
   * Market ids to run funding for. Empty = funding job not scheduled
   * (never invent a market list).
   */
  fundingMarketIds: readonly string[];
}

export interface FuturesJobsDeps {
  sql: Sql;
  ledger: Pick<LedgerClient, 'post'>;
  matching: MatchingClient;
  bus: EventBus | null;
  config: FuturesJobsConfig;
  /**
   * Optional venue-fabric (or other external) mark source.
   * When set, preferred over matching depth mid. Null marks stay null.
   */
  venueMarkSource?: MarkSource | null;
  /**
   * Optional external rate publisher hook for tests.
   * Production ops publishes into memoryFundingRateBook via a real oracle later.
   */
  seedFundingRate?: (entry: FundingRateEntry) => void;
  now?: () => Date;
  onError?: (name: string, err: unknown) => void;
}

export interface FuturesJobsHandle {
  host: JobHost;
  /** Rate book so ops/oracle can publish without invent. */
  publishFundingRate: (entry: FundingRateEntry) => void;
  /** Peek published rate for a market — null if none/stale (never invent). */
  getPublishedRate: (marketId: string) => FundingRateEntry | null;
  /**
   * Mark for a market from the same source liquidation uses
   * (venue fabric preferred, then matching depth mid). Null when unknown.
   * Available even when jobs are disabled so public REST can serve mark honestly.
   */
  markPrice: (marketId: string, at?: Date) => Promise<string | null>;
  /**
   * The assembled mark port itself.
   *
   * Exposed so the position open/close path prices from the SAME source
   * liquidation does. A second mark path for the money-moving routes is how
   * `entryPrice`/`exitPrice` ended up coming off the request in the first
   * place — there was no port there to read from.
   */
  marks: MarkSource;
  stop(): void;
}

/**
 * Assemble futures jobs. Does not invent markets or rates.
 * When disabled, returns a stopped host (list empty) but still exposes markPrice.
 */
export function startFuturesJobs(deps: FuturesJobsDeps): FuturesJobsHandle {
  const host = createJobHost({ onError: deps.onError });
  const rates = memoryFundingRateBook({ now: () => (deps.now ?? (() => new Date()))().getTime() });

  const publishFundingRate = (entry: FundingRateEntry) => {
    rates.set(entry);
    deps.seedFundingRate?.(entry);
  };

  const getPublishedRate = (marketId: string) => rates.peek(marketId);

  // Mark path always assembled — public REST + liq share one non-inventing port.
  const depthMarks = markSourceFromDepth((marketId) => deps.matching.depth(marketId));
  const marks: MarkSource = deps.venueMarkSource ? markSourcePrefer(deps.venueMarkSource, depthMarks) : depthMarks;

  const markPrice = async (marketId: string, at?: Date) => marks.markPrice({ marketId, at: at ?? (deps.now ? deps.now() : new Date()) });

  if (!deps.config.enabled) {
    return {
      host,
      publishFundingRate,
      getPublishedRate,
      markPrice,
      marks,
      stop: () => host.stopAll(),
    };
  }

  const liqLoader = sqlLiquidationPositionLoader(deps.sql);
  const attempts = sqlLiquidationAttemptStore(deps.sql);
  const closer = sqlPositionCloser(deps.sql, deps.bus);
  const fundLoader = sqlFundingPositionLoader(deps.sql);
  const periods = sqlFundingPeriodStore(deps.sql);

  host.every('futures.liquidation', deps.config.liqIntervalMs, async () => {
    await runLiquidationTick({
      marks,
      positions: liqLoader,
      closer,
      attempts,
      ledger: deps.ledger,
      now: deps.now,
    });
  });

  for (const marketId of deps.config.fundingMarketIds) {
    if (!marketId.trim()) continue;
    host.every(`futures.funding.${marketId}`, deps.config.fundingIntervalMs, async () => {
      await runFundingTick(
        {
          rates: rates.source(),
          positions: fundLoader,
          periods,
          ledger: deps.ledger,
          now: deps.now,
        },
        marketId,
      );
    });
  }

  return {
    host,
    publishFundingRate,
    getPublishedRate,
    markPrice,
    marks,
    stop: () => host.stopAll(),
  };
}

/** Parse comma-separated market ids. Empty / whitespace → []. */
export function parseFundingMarketIds(raw: string | undefined): string[] {
  if (raw == null || raw.trim() === '') return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
