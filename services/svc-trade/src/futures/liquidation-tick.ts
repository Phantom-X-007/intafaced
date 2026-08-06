/**
 * Liquidation tick (trade.futures residual).
 *
 * JOB SHAPE (not a wall-clock cron): one callable tick that:
 *  1. loads open positions
 *  2. asks an external MarkSource for each mark (never invents)
 *  3. plans via planLiquidation
 *  4. posts ledger recipes + marks position liquidated (via PositionCloser)
 *
 * Out of scope: mark oracle product, matching engine, partial ladder, funding.
 */
import { formatAmount, type LedgerClient, type PostRequest } from '@intafaced/ledger-client';
import { planLiquidation, summarizeLiquidation, type LiquidationPosition, type LiquidationDecision } from './liquidation-planner.js';
import { DEFAULT_FUTURES_MARK_POLICY, acceptableForLiquidation, type FuturesQuotedMark, type MarkPolicy } from './mark-policy.js';

/** External mark for one market. Null → skip that position (never invent). */
export interface MarkSource {
  markPrice(input: { marketId: string; symbol?: string; at: Date }): Promise<string | null>;
  /**
   * The same mark, LABELLED — price, observation time, and how it was derived.
   *
   * Optional so every existing adapter still satisfies `MarkSource`. A source
   * that provides it gets the `mark-policy.ts` gates applied here, with a
   * stated reason instead of a bare null; a source that does not is limited to
   * whatever gating it does internally.
   */
  quote?(input: { marketId: string; symbol?: string; at: Date }): Promise<FuturesQuotedMark | null>;
}

/** A MarkSource that can say what kind of price it is handing you. */
export interface QuotedMarkSource extends MarkSource {
  quote(input: { marketId: string; symbol?: string; at: Date }): Promise<FuturesQuotedMark | null>;
}

export interface LiquidationPositionRow extends LiquidationPosition {
  marketId: string;
  symbol?: string;
}

export interface LiquidationPositionLoader {
  listOpen(): Promise<readonly LiquidationPositionRow[]>;
}

/**
 * After recipes post, close the position row as liquidated.
 * Production wires PositionService; tests use a recorder.
 */
export interface PositionCloser {
  markLiquidated(positionId: string, meta: { liquidationId: string; reason: string }): Promise<void>;
}

/** Prevent double-liquidation attempts for the same position+attempt key. */
export interface LiquidationAttemptStore {
  isDone(liquidationId: string): Promise<boolean>;
  markDone(liquidationId: string): Promise<void>;
}

export interface LiquidationTickDeps {
  marks: MarkSource;
  positions: LiquidationPositionLoader;
  closer: PositionCloser;
  attempts: LiquidationAttemptStore;
  ledger: Pick<LedgerClient, 'post'>;
  maintenanceBps?: number;
  now?: () => Date;
  /** Build stable attempt id. Default: liq:{positionId}:{isoMinute} */
  liquidationIdFor?: (row: LiquidationPositionRow, at: Date) => string;
  /** Gates a labelled mark must clear before it may close a position. */
  markPolicy?: MarkPolicy;
  /**
   * Last mark this position was accepted against, for the deviation breaker.
   * Absent → the breaker is skipped for that position, exactly as `prices.ts`
   * skips it on a loan's first mark.
   */
  previousMarkFor?: (row: LiquidationPositionRow) => Promise<bigint | null> | bigint | null;
}

export interface LiquidationTickItemResult {
  positionId: string;
  outcome: 'skipped_no_mark' | 'skipped_mark_unusable' | 'skipped_healthy' | 'skipped_already' | 'liquidated' | 'invalid';
  reason: string;
  summary?: string;
}

export interface LiquidationTickResult {
  scanned: number;
  liquidated: number;
  items: LiquidationTickItemResult[];
}

/**
 * Scan open positions once; liquidate those the planner says are underwater
 * given external marks only.
 */
export async function runLiquidationTick(deps: LiquidationTickDeps): Promise<LiquidationTickResult> {
  const at = (deps.now ?? (() => new Date()))();
  const open = await deps.positions.listOpen();
  const items: LiquidationTickItemResult[] = [];
  let liquidated = 0;

  for (const row of open) {
    const liquidationId = deps.liquidationIdFor?.(row, at) ?? `liq:${row.positionId}:${at.toISOString().slice(0, 16)}`;

    if (await deps.attempts.isDone(liquidationId)) {
      items.push({ positionId: row.positionId, outcome: 'skipped_already', reason: 'already_done' });
      continue;
    }

    /**
     * THE GATE, BEFORE ANYTHING IS SEIZED.
     *
     * A labelled source is asked for its quote and judged by
     * `acceptableForLiquidation` — quality, the tighter liquidation staleness
     * limit, and the deviation breaker. `last` never passes under the default
     * policy, so a market with no two-sided quote cannot be liquidated at all:
     * the position sits and an operator looks at it.
     *
     * A source with no `quote` still goes through `markPrice`, which is the
     * behaviour that existed before and is no weaker than it was.
     *
     * Either way, ABSENT IS NOT ZERO. There is no branch below that turns a
     * missing mark into a price — on a perp, valuing a missing mark at zero
     * does not misprice one position, it liquidates every one of them.
     */
    let mark: string | null = null;
    if (deps.marks.quote) {
      const quoted = await deps.marks.quote({ marketId: row.marketId, symbol: row.symbol, at });
      if (!quoted) {
        items.push({ positionId: row.positionId, outcome: 'skipped_no_mark', reason: 'no_mark' });
        continue;
      }
      const previous = (await deps.previousMarkFor?.(row)) ?? null;
      const check = acceptableForLiquidation(quoted, previous, at, deps.markPolicy ?? DEFAULT_FUTURES_MARK_POLICY);
      if (!check.ok) {
        items.push({
          positionId: row.positionId,
          outcome: 'skipped_mark_unusable',
          reason: check.code ?? 'trade.mark_unusable',
          summary: check.reason,
        });
        continue;
      }
      mark = formatAmount(quoted.price);
    } else {
      mark = await deps.marks.markPrice({ marketId: row.marketId, symbol: row.symbol, at });
    }

    if (mark == null || mark === '') {
      items.push({ positionId: row.positionId, outcome: 'skipped_no_mark', reason: 'no_mark' });
      continue;
    }

    const decision: LiquidationDecision = planLiquidation({
      liquidationId,
      position: row,
      markPrice: mark,
      maintenanceBps: deps.maintenanceBps,
    });

    if (!decision.liquidate) {
      const outcome =
        decision.reason === 'invalid_mark' || decision.reason === 'invalid_maintenance_bps' || decision.reason === 'empty_position'
          ? 'invalid'
          : 'skipped_healthy';
      items.push({
        positionId: row.positionId,
        outcome,
        reason: decision.reason,
        summary: summarizeLiquidation(decision),
      });
      continue;
    }

    for (const recipe of decision.recipes) {
      await deps.ledger.post(recipe as PostRequest);
    }
    await deps.closer.markLiquidated(row.positionId, { liquidationId, reason: decision.reason });
    await deps.attempts.markDone(liquidationId);
    liquidated += 1;
    items.push({
      positionId: row.positionId,
      outcome: 'liquidated',
      reason: decision.reason,
      summary: summarizeLiquidation(decision),
    });
  }

  return { scanned: open.length, liquidated, items };
}

export function memoryLiquidationAttemptStore(): LiquidationAttemptStore {
  const done = new Set<string>();
  return {
    async isDone(id) {
      return done.has(id);
    },
    async markDone(id) {
      done.add(id);
    },
  };
}
