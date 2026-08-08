/**
 * Durable stores for funding/liq ticks (trade.futures residual).
 *
 * Period / attempt IDENTITY only — never invents rates, marks, or balances.
 */
import type { Sql } from 'postgres';
import type { FundingMarginApplier, FundingPeriodStore } from './funding-tick.js';
import type { LiquidationAttemptStore, PositionCloser } from './liquidation-tick.js';
import type { EventBus } from '@intafaced/events';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';

/**
 * Move margin_current / funding_paid with the ledger after funding posts.
 *
 * ONCE PER (POSITION, PERIOD), and that is the whole design.
 *
 * `runFundingTick` posts to the ledger, calls this, and only then marks the
 * period settled. A restart in the gap leaves the period unsettled, so the next
 * tick re-runs it: the ledger dedupes on its own key and moves nothing twice,
 * and before 0014 this decremented `margin_current` a second time anyway. The
 * trader's residual margin then read lower than the ledger said they had paid
 * for — liquidating early, releasing short, and clamped at zero by GREATEST so
 * nothing raised.
 *
 * The claim and the update are ONE statement. Two statements would only move
 * the crash window rather than close it.
 *
 * paid > 0: position paid (margin_current down). paid < 0: received to available only.
 */
export function sqlFundingMarginApplier(sql: Sql): FundingMarginApplier {
  return {
    async applyFundingNets(nets, periodId) {
      for (const { positionId, paid } of nets) {
        if (paid === 0n) continue;
        const paidStr = formatAmount(paid < 0n ? -paid : paid);
        const signedStr = formatAmount(paid);
        if (paid > 0n) {
          // Payer: reduce residual margin (floor at 0), accumulate funding_paid.
          await sql`
            WITH claim AS (
              INSERT INTO trade.position_funding_applied (position_id, period_id, paid)
              VALUES (${positionId}, ${periodId}, ${signedStr}::numeric)
              ON CONFLICT (position_id, period_id) DO NOTHING
              RETURNING position_id
            )
            UPDATE trade.positions
               SET margin_current = GREATEST(margin_current - ${paidStr}::numeric, 0),
                   funding_paid = funding_paid + ${paidStr}::numeric,
                   updated_at = now()
             WHERE id = ${positionId}
               AND status = 'open'
               AND EXISTS (SELECT 1 FROM claim)
          `;
        } else {
          // Payee: funding lands in available, not re-margin; track net only.
          await sql`
            WITH claim AS (
              INSERT INTO trade.position_funding_applied (position_id, period_id, paid)
              VALUES (${positionId}, ${periodId}, ${signedStr}::numeric)
              ON CONFLICT (position_id, period_id) DO NOTHING
              RETURNING position_id
            )
            UPDATE trade.positions
               SET funding_paid = funding_paid - ${paidStr}::numeric,
                   updated_at = now()
             WHERE id = ${positionId}
               AND status = 'open'
               AND EXISTS (SELECT 1 FROM claim)
          `;
        }
      }
    },
  };
}

export function sqlFundingPeriodStore(sql: Sql): FundingPeriodStore {
  return {
    async isSettled(periodId) {
      const rows = await sql<{ period_id: string }[]>`
        SELECT period_id FROM trade.funding_periods WHERE period_id = ${periodId} LIMIT 1
      `;
      return rows.length > 0;
    },
    async markSettled(periodId, meta) {
      // market_id embedded in periodId when using periodIdFor(market, iso)
      const marketId = periodId.includes(':') ? periodId.slice(0, periodId.indexOf(':')) : periodId;
      await sql`
        INSERT INTO trade.funding_periods (period_id, market_id, leg_count)
        VALUES (${periodId}, ${marketId}, ${meta.legCount})
        ON CONFLICT (period_id) DO NOTHING
      `;
    },
    async recordSkip(periodId, meta) {
      await sql`
        INSERT INTO trade.funding_period_skips (period_id, market_id, reason)
        VALUES (${periodId}, ${meta.marketId}, ${meta.reason})
      `;
    },
    async lastSkip(periodId) {
      const rows = await sql<{ reason: 'no_rate' | 'no_positions'; market_id: string }[]>`
        SELECT reason, market_id FROM trade.funding_period_skips
         WHERE period_id = ${periodId}
         ORDER BY recorded_at DESC
         LIMIT 1
      `;
      const row = rows[0];
      if (!row) return null;
      return { reason: row.reason, marketId: row.market_id };
    },
    async settledLegCount(periodId) {
      const rows = await sql<{ leg_count: number }[]>`
        SELECT leg_count FROM trade.funding_periods WHERE period_id = ${periodId} LIMIT 1
      `;
      return rows[0] ? rows[0].leg_count : null;
    },
  };
}

export function sqlLiquidationAttemptStore(sql: Sql): LiquidationAttemptStore {
  return {
    async isDone(liquidationId) {
      const rows = await sql<{ liquidation_id: string }[]>`
        SELECT liquidation_id FROM trade.liquidation_attempts
        WHERE liquidation_id = ${liquidationId} LIMIT 1
      `;
      return rows.length > 0;
    },
    async markDone(liquidationId) {
      await sql`
        INSERT INTO trade.liquidation_attempts (liquidation_id)
        VALUES (${liquidationId})
        ON CONFLICT (liquidation_id) DO NOTHING
      `;
    },
  };
}

/**
 * Mark position row liquidated after recipes post.
 * Optional bus fan-out — honest status only.
 */
export function sqlPositionCloser(sql: Sql, bus: EventBus | null = null): PositionCloser {
  return {
    async markLiquidated(positionId, meta) {
      await sql`
        UPDATE trade.positions
        SET status = 'liquidated', closed_at = now(), updated_at = now()
        WHERE id = ${positionId} AND status = 'open'
      `;
      if (!bus) return;
      const rows = await sql<
        {
          id: string;
          user_id: string;
          market_id: string;
          side: 'long' | 'short';
          size: string;
          entry_price: string;
          leverage: string;
          margin_initial: string;
          margin_current: string | null;
          margin_mode: 'cross' | 'isolated';
          funding_paid: string;
          liq_price: string | null;
          symbol: string;
        }[]
      >`
        SELECT p.*, m.symbol
        FROM trade.positions p
        JOIN trade.markets m ON m.id = p.market_id
        WHERE p.id = ${positionId}
        LIMIT 1
      `;
      const row = rows[0];
      if (!row) return;
      const size = parseAmount(row.size);
      const entry = parseAmount(row.entry_price);
      const SCALE = 10n ** 18n;
      const notional = (size * entry) / SCALE;
      const ts = new Date().toISOString();
      const collateral = parseAmount(row.margin_current ?? row.margin_initial);
      await bus.publish(
        'positionUpdated',
        {
          positionId: row.id,
          userId: row.user_id,
          marketId: row.market_id,
          symbol: row.symbol,
          status: 'liquidated',
          side: row.side,
          contracts: formatAmount(size),
          entryPrice: formatAmount(entry),
          markPrice: null,
          notional: formatAmount(notional),
          leverage: formatAmount(parseAmount(row.leverage)),
          collateral: formatAmount(collateral),
          unrealizedPnl: null,
          realizedPnl: null,
          liquidationPrice: row.liq_price != null ? formatAmount(parseAmount(row.liq_price)) : null,
          marginMode: row.margin_mode,
          fundingPaid: formatAmount(parseAmount(row.funding_paid ?? '0')),
          ts,
        },
        { idempotencyKey: `trade.position.liquidated:${row.id}:${meta.liquidationId}` },
      );
      // meta.reason is for logs only — not on positionUpdated schema
      void meta.reason;
    },
  };
}
