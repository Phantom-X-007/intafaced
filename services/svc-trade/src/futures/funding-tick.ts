/**
 * Funding settlement tick (trade.futures residual).
 *
 * JOB SHAPE (not a wall-clock cron): one callable tick that:
 *  1. asks an external FundingRateSource for the period rate (never invents)
 *  2. loads open positions for the market
 *  3. plans legs via planFundingSettlement
 *  4. posts ledger recipes + records period settled (idempotent)
 *
 * Out of scope: rate oracle, 8h scheduler host, mark price, insurance.
 * Wire a real rate source + setInterval/cron in ops when ready — this file
 * only proves the tick cannot invent money.
 */
import type { LedgerClient, PostRequest } from '@intafaced/ledger-client';
import { planFundingSettlement, summarizeFundingPlan, type FundingOpenPosition, type FundingLeg } from './funding-settlement.js';

/** External period rate. Null / refuse → tick skips; never synthesize a rate. */
export interface FundingRateQuote {
  /** Absolute period rate as decimal string (e.g. "0.0001"). */
  rate: string;
  /** Unique period id, e.g. marketId + ISO period start. */
  periodId: string;
  marketId: string;
}

export interface FundingRateSource {
  /**
   * Return the rate for this market/period window, or null if no rate is
   * available (oracle down, market not funding-enabled, period already unknown).
   * Implementations MUST NOT invent a placeholder rate.
   */
  quote(input: { marketId: string; at: Date }): Promise<FundingRateQuote | null>;
}

export interface FundingPositionLoader {
  /** Open futures positions for one market (any user). */
  listOpenForMarket(marketId: string): Promise<readonly FundingOpenPosition[]>;
}

/**
 * Period ledger — prevents double-settling the same periodId.
 *
 * ADR done bar §5: skips are **recorded** and distinguishable from zero-rate
 * periods. Zero-rate / one-sided books use `markSettled` with `legCount: 0`
 * (period blocked). Oracle-down / empty book use `recordSkip` (audit only —
 * does not block a later settle when a rate appears).
 */
export type FundingSkipReason = 'no_rate' | 'no_positions';

export interface FundingPeriodStore {
  isSettled(periodId: string): Promise<boolean>;
  markSettled(periodId: string, meta: { legCount: number; totalPosted: number }): Promise<void>;
  /**
   * Record a skip that is NOT a settled zero-leg period.
   * Optional on older stores — tick still returns skipped; production wires it.
   */
  recordSkip?(periodId: string, meta: { marketId: string; reason: FundingSkipReason }): Promise<void>;
  /** Latest skip for a period, if any. Distinguishes skip audit from settled_no_legs. */
  lastSkip?(periodId: string): Promise<{ reason: FundingSkipReason; marketId: string } | null>;
  /** Settled leg_count when period is settled; null if not settled. */
  settledLegCount?(periodId: string): Promise<number | null>;
}

export interface FundingTickDeps {
  rates: FundingRateSource;
  positions: FundingPositionLoader;
  periods: FundingPeriodStore;
  ledger: Pick<LedgerClient, 'post'>;
  /** Optional clock for tests. */
  now?: () => Date;
}

export type FundingTickResult =
  | { status: 'skipped'; reason: 'no_rate' | 'already_settled' | 'no_positions' | 'no_legs'; periodId?: string }
  | {
      status: 'settled';
      periodId: string;
      marketId: string;
      rate: string;
      legCount: number;
      summary: string;
    };

/**
 * Run one funding settlement tick for a market.
 * Idempotent on periodId via FundingPeriodStore + ledger recipe keys.
 */
export async function runFundingTick(deps: FundingTickDeps, marketId: string): Promise<FundingTickResult> {
  const at = (deps.now ?? (() => new Date()))();
  const quote = await deps.rates.quote({ marketId, at });
  if (!quote) {
    // No rate from oracle — record skip (does not invent a rate, does not block
    // a later period id when the oracle returns). Synthetic period id so the
    // audit row is queryable by market+clock.
    const skipId = `${marketId}:no_rate:${at.toISOString()}`;
    await deps.periods.recordSkip?.(skipId, { marketId, reason: 'no_rate' });
    return { status: 'skipped', reason: 'no_rate', periodId: skipId };
  }
  if (quote.marketId !== marketId) {
    // Misconfigured source — refuse rather than settle under the wrong market.
    const skipId = `${marketId}:no_rate:${at.toISOString()}`;
    await deps.periods.recordSkip?.(skipId, { marketId, reason: 'no_rate' });
    return { status: 'skipped', reason: 'no_rate', periodId: skipId };
  }

  if (await deps.periods.isSettled(quote.periodId)) {
    return { status: 'skipped', reason: 'already_settled', periodId: quote.periodId };
  }

  const open = await deps.positions.listOpenForMarket(marketId);
  if (open.length === 0) {
    await deps.periods.recordSkip?.(quote.periodId, { marketId, reason: 'no_positions' });
    return { status: 'skipped', reason: 'no_positions', periodId: quote.periodId };
  }

  const legs = planFundingSettlement({
    periodId: quote.periodId,
    marketId: quote.marketId,
    rate: quote.rate,
    positions: open,
  });

  if (legs.length === 0) {
    // Zero rate or one-sided book — period BLOCKED as settled_no_legs (legCount 0).
    // This is deliberately NOT recordSkip: zero-rate is a completed period outcome.
    await deps.periods.markSettled(quote.periodId, { legCount: 0, totalPosted: 0 });
    return { status: 'skipped', reason: 'no_legs', periodId: quote.periodId };
  }

  await postLegs(deps.ledger, legs);

  await deps.periods.markSettled(quote.periodId, {
    legCount: legs.length,
    totalPosted: legs.length,
  });

  return {
    status: 'settled',
    periodId: quote.periodId,
    marketId: quote.marketId,
    rate: quote.rate,
    legCount: legs.length,
    summary: summarizeFundingPlan(legs),
  };
}

async function postLegs(ledger: Pick<LedgerClient, 'post'>, legs: readonly FundingLeg[]): Promise<void> {
  for (const leg of legs) {
    await ledger.post(leg.recipe as PostRequest);
  }
}

/** In-memory period store for unit tests and single-process dev. */
export function memoryFundingPeriodStore(): FundingPeriodStore {
  const settled = new Map<string, number>();
  const skips = new Map<string, { reason: FundingSkipReason; marketId: string }>();
  return {
    async isSettled(periodId) {
      return settled.has(periodId);
    },
    async markSettled(periodId, meta) {
      settled.set(periodId, meta.legCount);
    },
    async recordSkip(periodId, meta) {
      skips.set(periodId, { reason: meta.reason, marketId: meta.marketId });
    },
    async lastSkip(periodId) {
      return skips.get(periodId) ?? null;
    },
    async settledLegCount(periodId) {
      return settled.has(periodId) ? (settled.get(periodId) ?? 0) : null;
    },
  };
}
