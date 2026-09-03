/**
 * Options exercise / assignment / expiry JobHost (R-E5).
 *
 * Wires expired option markets into `runOptionsExerciseJob`. Default OFF.
 * Blank TRADE_OPTIONS_SETTLEMENT_FIXING / settlement asset refuses by name.
 * Never last trade / mark. Never invents a live listing. Does not post
 * (no approved options settlement recipe — PX-S08-O02).
 */
import type { Sql } from 'postgres';
import { parseAmount, type Amount, type LedgerClient } from '@intafaced/ledger-client';
import { createJobHost, type JobHost } from '../futures/job-host.js';
import {
  runOptionsExerciseJob,
  type OptionsExerciseJobResult,
  type OptionsExerciseMarket,
  type OptionsExercisePosition,
} from './options-exercise.js';
import type { OptionStyle, OptionType } from './options-policy.js';
import type { MarketKind } from './types.js';

export {
  OPTIONS_FIXING_UNCONFIGURED,
  OPTIONS_SETTLEMENT_LAW_UNSET,
  optionsAssignmentIdFor,
  optionsExerciseIdFor,
  optionsExpiryIdFor,
  optionsOutcomeIdFor,
  runOptionsExerciseJob,
} from './options-exercise.js';

export interface OptionsExerciseMarkets {
  listExpiredOptions(now: Date): Promise<readonly OptionsExerciseMarket[]>;
}

export interface OptionsExercisePositions {
  listOpenForMarket(marketId: string): Promise<readonly OptionsExercisePosition[]>;
}

export interface OptionsExerciseJobsConfig {
  /** Master kill — false = host created but no intervals started. */
  enabled: boolean;
  /** Scan interval. Default 15s when enabled. */
  intervalMs: number;
  /** TRADE_OPTIONS_SETTLEMENT_ASSET_LAW. Empty refuses. Opaque — never parsed. */
  settlementAssetLaw: string | null | undefined;
  /** TRADE_OPTIONS_SETTLEMENT_FIXING. Empty refuses. Opaque — never last trade. */
  settlementFixing: string | null | undefined;
}

export interface OptionsExerciseJobsDeps {
  sql: Sql;
  ledger: Pick<LedgerClient, 'post'>;
  config: OptionsExerciseJobsConfig;
  now?: () => Date;
  onError?: (name: string, err: unknown) => void;
  /**
   * Owner decimal settlement price per expired option market.
   * Empty / omitted → mill refuses. NEVER last trade or mark.
   * Production omits this (refuse-closed until owner publishes a decimal).
   */
  ownerSettlementPriceFor?: (marketId: string) => string | null | undefined | Promise<string | null | undefined>;
  /**
   * Owner-named settlement asset. Empty / omitted → mill refuses.
   * NEVER parsed from TRADE_OPTIONS_SETTLEMENT_ASSET_LAW. Production omits.
   */
  settlementAssetFor?: (marketId: string) => string | null | undefined | Promise<string | null | undefined>;
  /** Test-only passthrough so JobHost tests prove last-trade / mark are ignored. */
  lastTradePrice?: string | null;
  markPrice?: string | null;
  /** Override SQL loaders (hermetic JobHost tests). */
  exercise?: {
    markets?: OptionsExerciseMarkets;
    positions?: OptionsExercisePositions;
  };
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}

export interface OptionsExerciseJobsHandle {
  host: JobHost;
  stop(): void;
}

function parseStrike(raw: string | null): Amount | null {
  if (raw == null || raw.trim().length === 0) return null;
  try {
    return parseAmount(raw);
  } catch {
    return null;
  }
}

/** Expired option markets. Never invents a last-trade price or settlement asset. */
export function sqlOptionsExerciseMarketLoader(sql: Sql): OptionsExerciseMarkets {
  return {
    async listExpiredOptions(now) {
      const rows = await sql<
        {
          id: string;
          kind: MarketKind;
          option_type: OptionType | null;
          option_style: OptionStyle | null;
          option_strike: string | null;
          option_expiry_at: Date | null;
        }[]
      >`
        SELECT id, kind, option_type, option_style, option_strike, option_expiry_at
        FROM trade.markets
        WHERE kind = 'options'
          AND option_expiry_at IS NOT NULL
          AND option_expiry_at <= ${now}
        ORDER BY option_expiry_at ASC, id ASC
      `;
      return rows.map((row): OptionsExerciseMarket => ({
        marketId: row.id,
        kind: row.kind,
        optionType: row.option_type,
        optionStyle: row.option_style,
        strike: parseStrike(row.option_strike),
        expiryAt: row.option_expiry_at,
      }));
    },
  };
}

/** Open positions on one option market. Never invents size or side. */
export function sqlOptionsExercisePositionLoader(sql: Sql): OptionsExercisePositions {
  return {
    async listOpenForMarket(marketId) {
      const rows = await sql<
        {
          id: string;
          user_id: string;
          side: 'long' | 'short';
          size: string;
        }[]
      >`
        SELECT p.id, p.user_id, p.side, p.size
        FROM trade.positions p
        WHERE p.status = 'open' AND p.market_id = ${marketId}
        ORDER BY p.opened_at ASC, p.id ASC
      `;
      return rows.map((row): OptionsExercisePosition => ({
        positionId: row.id,
        userId: row.user_id,
        side: row.side,
        size: parseAmount(row.size),
      }));
    },
  };
}

async function resolveNamed(
  source: ((marketId: string) => string | null | undefined | Promise<string | null | undefined>) | undefined,
  marketId: string,
): Promise<string> {
  if (source == null) return '';
  const raw = await source(marketId);
  return (raw ?? '').trim();
}

/**
 * Scan expired option markets and classify exercise / assignment / expiry.
 *
 * Blank `settlementFixingConfigured` forces an empty owner price — the mill
 * refuses, last trade / mark are never read. Blank law stamp or blank
 * settlement asset refuses `trade.options_settlement_law_unset`.
 */
export async function runOptionsExerciseScan(input: {
  readonly now: Date;
  readonly settlementAssetLawConfigured: string | null | undefined;
  readonly settlementFixingConfigured: string | null | undefined;
  readonly ownerSettlementPriceFor?: (marketId: string) => string | null | undefined | Promise<string | null | undefined>;
  readonly settlementAssetFor?: (marketId: string) => string | null | undefined | Promise<string | null | undefined>;
  readonly lastTradePrice?: string | null;
  readonly markPrice?: string | null;
  readonly markets: OptionsExerciseMarkets;
  readonly positions: OptionsExercisePositions;
  readonly ledger: Pick<LedgerClient, 'post'>;
}): Promise<readonly OptionsExerciseJobResult[]> {
  void input.lastTradePrice;
  void input.markPrice;
  const law = (input.settlementAssetLawConfigured ?? '').trim();
  const fixing = (input.settlementFixingConfigured ?? '').trim();
  const markets = await input.markets.listExpiredOptions(input.now);
  const results: OptionsExerciseJobResult[] = [];
  for (const market of markets) {
    const ownerSettlementPrice =
      law.length === 0 || fixing.length === 0 ? '' : await resolveNamed(input.ownerSettlementPriceFor, market.marketId);
    const settlementAsset = law.length === 0 ? '' : await resolveNamed(input.settlementAssetFor, market.marketId);
    const positions = await input.positions.listOpenForMarket(market.marketId);
    results.push(
      await runOptionsExerciseJob({
        kind: market.kind,
        optionType: market.optionType,
        optionStyle: market.optionStyle,
        strike: market.strike,
        expiryAt: market.expiryAt,
        now: input.now,
        settlementAssetLawConfigured: law,
        settlementFixingConfigured: fixing,
        ownerSettlementPrice,
        settlementAsset,
        lastTradePrice: input.lastTradePrice,
        markPrice: input.markPrice,
        positions,
        ledger: input.ledger,
      }),
    );
  }
  return results;
}

/** Assemble options expiry jobs. Does not invent markets, assets, or prices. */
export function startOptionsExerciseJobs(deps: OptionsExerciseJobsDeps): OptionsExerciseJobsHandle {
  const host = createJobHost({
    onError: deps.onError,
    setIntervalFn: deps.setIntervalFn,
    clearIntervalFn: deps.clearIntervalFn,
  });

  if (!deps.config.enabled) {
    return { host, stop: () => host.stopAll() };
  }

  const markets = deps.exercise?.markets ?? sqlOptionsExerciseMarketLoader(deps.sql);
  const positions = deps.exercise?.positions ?? sqlOptionsExercisePositionLoader(deps.sql);

  const tick = async () => {
    await runOptionsExerciseScan({
      now: deps.now ? deps.now() : new Date(),
      settlementAssetLawConfigured: deps.config.settlementAssetLaw ?? '',
      settlementFixingConfigured: deps.config.settlementFixing ?? '',
      ownerSettlementPriceFor: deps.ownerSettlementPriceFor,
      settlementAssetFor: deps.settlementAssetFor,
      lastTradePrice: deps.lastTradePrice ?? null,
      markPrice: deps.markPrice ?? null,
      markets,
      positions,
      ledger: deps.ledger,
    });
  };

  host.every('options.exercise', deps.config.intervalMs, tick);
  host.every('options.assignment', deps.config.intervalMs, tick);
  host.every('options.expiry', deps.config.intervalMs, tick);

  return { host, stop: () => host.stopAll() };
}
