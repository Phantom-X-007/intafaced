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
import type { Amount, LedgerClient, PostRequest } from '@intafaced/ledger-client';
import { planFundingSettlement, summarizeFundingPlan, type FundingOpenPosition, type FundingLeg } from './funding-settlement.js';
import { assertFundingRateWithinBound } from './funding-rate-bound.js';

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
   * Freeze period membership on first plan for `periodId`.
   *
   * First call stores `candidateIds` as the only positions eligible for this
   * period. Later calls return that frozen set and ignore new candidates.
   * Required: without a freeze, a crash between post and settle re-plans
   * against open-now and a position opened mid-gap posts an extra leg (C14).
   */
  freezeMembership(periodId: string, candidateIds: readonly string[]): Promise<readonly string[]>;
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

/**
 * After ledger posts, move the position row with the money.
 *
 * Payers: margin_current -= paid, funding_paid += paid.
 * Payees: funding_paid -= received (receipt goes to available, not re-margin).
 *
 * `periodId` is not decoration. This runs between an idempotent ledger post and
 * the settle marker that stops the tick re-running, so a restart in that gap
 * replays it — and a decrement replayed is a trader's margin charged twice for
 * one funding period. The implementation must be idempotent on
 * (position, period), which is why it is given the period. See 0014.
 */
export interface FundingMarginApplier {
  applyFundingNets(nets: readonly { positionId: string; paid: Amount }[], periodId: string): Promise<void>;
}

export interface FundingTickDeps {
  rates: FundingRateSource;
  positions: FundingPositionLoader;
  periods: FundingPeriodStore;
  ledger: Pick<LedgerClient, 'post'>;
  /**
   * REQUIRED, and the requirement is the fix.
   *
   * This was `margins?`, with `if (deps.margins)` at the call site. #1047 made
   * the applier idempotent on `(position, period)` and closed the double-debit —
   * but only for a wire that passes one. A wire that omits it skipped the step
   * entirely and silently: `margin_current` never moved with funding, so close
   * and liquidation read open-time margin and over-release collateral. That is
   * the Tier-1 defect #1034 existed to close, reachable again through an
   * omission the compiler was happy with and nothing logged at boot.
   *
   * A runtime throw was the other option and is worse: it fails at the first
   * funding tick, which may be hours after the deploy that caused it, on a
   * market that then stops settling. Required in the type fails at build.
   *
   * What the type still cannot state: the applier must be IDEMPOTENT on
   * (position, period), because this call sits between an idempotent ledger post
   * and the settle marker written after it. `sqlFundingMarginApplier` gets that
   * from 0014's claim table; a hand-rolled applier that decrements twice is
   * still a double-debit, so the interface says so above and the memory helper
   * below models it.
   */
  margins: FundingMarginApplier;
  /**
   * Absolute max |period rate| (TRADE_FUTURES_FUNDING_MAX_ABS_RATE).
   * REQUIRED on the deps object (may be null = unconfigured).
   * Null refuses settlement before any ledger post — unpublished bound is not
   * a silent free pass. No product default invented here (owner residual D2).
   */
  maxAbsRate: string | null;
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

  // Membership is frozen on the first plan for this periodId. A position that
  // opens between a crashed post and its replay must not enter the plan: new
  // (payer, payee) pairs mint new ledger keys while applyFundingNets stays
  // idempotent on (position, period) for the original payers — ledger vs
  // margin_current diverge (C14 / funding-settlement residual).
  const frozenIds = await deps.periods.freezeMembership(
    quote.periodId,
    open.map((p) => p.positionId),
  );
  const frozen = new Set(frozenIds);
  const members = open.filter((p) => frozen.has(p.positionId));
  if (members.length === 0) {
    // Every frozen member has closed; period completes with no live book.
    await deps.periods.markSettled(quote.periodId, { legCount: 0, totalPosted: 0 });
    return { status: 'skipped', reason: 'no_legs', periodId: quote.periodId };
  }

  // Bound check before plan so an absurd rate never reaches leg construction
  // or postLegs. assert is also inside planFundingSettlement (belt); this is
  // the explicit money-path gate with the tick's configured max.
  assertFundingRateWithinBound(quote.rate, deps.maxAbsRate);

  const legs = planFundingSettlement({
    periodId: quote.periodId,
    marketId: quote.marketId,
    rate: quote.rate,
    maxAbsRate: deps.maxAbsRate,
    positions: members,
  });

  if (legs.length === 0) {
    // Zero rate or one-sided book — period BLOCKED as settled_no_legs (legCount 0).
    // This is deliberately NOT recordSkip: zero-rate is a completed period outcome.
    await deps.periods.markSettled(quote.periodId, { legCount: 0, totalPosted: 0 });
    return { status: 'skipped', reason: 'no_legs', periodId: quote.periodId };
  }

  await postLegs(deps.ledger, legs);

  // Ledger first, then row. The ledger dedupes on its own key, and the applier
  // is idempotent on (position, period) — both matter, because markSettled below
  // is written last, so a restart in this gap replays everything above it.
  // Without this step at all, close/liquidation read open-time margin and
  // over-release; without its idempotency, a replay charges margin twice.
  //
  // No longer guarded by `if (deps.margins)`. The guard read as caution and
  // acted as an opt-out from the margin move: a wire that forgot the dep settled
  // funding in the ledger and left every position's margin untouched, with no
  // error anywhere. `margins` is required, so this always runs.
  await deps.margins.applyFundingNets(netFundingPaid(legs), quote.periodId);

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

/** Net paid per position: positive = paid out of collateral, negative = received to available. */
export function netFundingPaid(legs: readonly FundingLeg[]): { positionId: string; paid: Amount }[] {
  const byId = new Map<string, Amount>();
  for (const leg of legs) {
    byId.set(leg.payerPositionId, (byId.get(leg.payerPositionId) ?? 0n) + leg.amount);
    byId.set(leg.payeePositionId, (byId.get(leg.payeePositionId) ?? 0n) - leg.amount);
  }
  return [...byId.entries()].map(([positionId, paid]) => ({ positionId, paid }));
}

/** In-memory period store for unit tests and single-process dev. */
/**
 * In-memory margin applier, with the production idempotency rule modelled.
 *
 * Exists because `margins` is now required, and the honest way to satisfy a
 * required money dependency in a test is a working one, not `{ async
 * applyFundingNets() {} }`. A no-op stub would let a test pass while asserting
 * the opposite of production: it is exactly the shape of the `if (deps.margins)`
 * skip this change removes.
 *
 * Claims `(positionId, periodId)` before applying, the same key and the same
 * order as 0014's claim table, so a replay is a no-op here for the same reason it
 * is a no-op against Postgres. `paidByPosition` lets a test read the effect
 * without a database.
 */
export function memoryFundingMarginApplier(): FundingMarginApplier & {
  paidByPosition(positionId: string): Amount;
  applied(): ReadonlyArray<{ positionId: string; periodId: string }>;
} {
  const claimed = new Set<string>();
  const paid = new Map<string, Amount>();
  const log: Array<{ positionId: string; periodId: string }> = [];

  return {
    async applyFundingNets(nets, periodId) {
      for (const net of nets) {
        const key = `${net.positionId}:${periodId}`;
        if (claimed.has(key)) continue;
        claimed.add(key);
        paid.set(net.positionId, (paid.get(net.positionId) ?? 0n) + net.paid);
        log.push({ positionId: net.positionId, periodId });
      }
    },
    paidByPosition(positionId) {
      return paid.get(positionId) ?? 0n;
    },
    applied() {
      return log;
    },
  };
}

export function memoryFundingPeriodStore(): FundingPeriodStore {
  const settled = new Map<string, number>();
  const skips = new Map<string, { reason: FundingSkipReason; marketId: string }>();
  const membership = new Map<string, readonly string[]>();
  return {
    async isSettled(periodId) {
      return settled.has(periodId);
    },
    async markSettled(periodId, meta) {
      settled.set(periodId, meta.legCount);
    },
    async freezeMembership(periodId, candidateIds) {
      if (!membership.has(periodId)) {
        membership.set(periodId, [...candidateIds]);
      }
      return membership.get(periodId)!;
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
