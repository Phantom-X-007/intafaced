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
import type { LedgerClient, PostRequest } from '@intafaced/ledger-client';
import { planLiquidation, summarizeLiquidation, type LiquidationPosition, type LiquidationDecision } from './liquidation-planner.js';

/** External mark for one market. Null → skip that position (never invent). */
export interface MarkSource {
  markPrice(input: { marketId: string; symbol?: string; at: Date }): Promise<string | null>;
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
}

export interface LiquidationTickItemResult {
  positionId: string;
  outcome: 'skipped_no_mark' | 'skipped_healthy' | 'skipped_already' | 'liquidated' | 'invalid';
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

    const mark = await deps.marks.markPrice({ marketId: row.marketId, symbol: row.symbol, at });
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
