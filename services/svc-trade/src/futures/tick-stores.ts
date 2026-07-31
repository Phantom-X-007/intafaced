/**
 * Durable stores for funding/liq ticks (trade.futures residual).
 *
 * Period / attempt IDENTITY only — never invents rates, marks, or balances.
 */
import type { Sql } from 'postgres';
import type { FundingPeriodStore } from './funding-tick.js';
import type { LiquidationAttemptStore, PositionCloser } from './liquidation-tick.js';
import type { EventBus } from '@intafaced/events';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';

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
          collateral: formatAmount(parseAmount(row.margin_initial)),
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
