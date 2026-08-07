/**
 * SQL position loaders for funding/liq ticks (trade.futures residual).
 *
 * Read-only open positions. Never invents rows or marks.
 */
import type { Sql } from 'postgres';
import { parseAmount } from '@intafaced/ledger-client';
import type { FundingOpenPosition } from './funding-settlement.js';
import type { FundingPositionLoader } from './funding-tick.js';
import type { LiquidationPositionLoader, LiquidationPositionRow } from './liquidation-tick.js';

interface OpenPosRow {
  id: string;
  user_id: string;
  market_id: string;
  side: 'long' | 'short';
  size: string;
  entry_price: string;
  /** Residual margin after funding — not the open-time figure. */
  margin_current: string;
  margin_asset: string;
  liq_price: string | null;
  symbol: string;
}

function mapFunding(row: OpenPosRow): FundingOpenPosition {
  return {
    positionId: row.id,
    userId: row.user_id,
    side: row.side,
    size: parseAmount(row.size),
    entryPrice: parseAmount(row.entry_price),
    marginAsset: row.margin_asset,
  };
}

function mapLiq(row: OpenPosRow): LiquidationPositionRow {
  return {
    positionId: row.id,
    userId: row.user_id,
    side: row.side,
    size: parseAmount(row.size),
    entryPrice: parseAmount(row.entry_price),
    margin: parseAmount(row.margin_current),
    marginAsset: row.margin_asset,
    liqPrice: row.liq_price != null ? parseAmount(row.liq_price) : null,
    marketId: row.market_id,
    symbol: row.symbol,
  };
}

/** Open positions for one market (funding settlement). `closing` rows are excluded — they accrue no funding (ADR 2026-08-07). */
export function sqlFundingPositionLoader(sql: Sql): FundingPositionLoader {
  return {
    async listOpenForMarket(marketId) {
      const rows = await sql<OpenPosRow[]>`
        SELECT p.id, p.user_id, p.market_id, p.side, p.size, p.entry_price,
               p.margin_current, p.margin_asset, p.liq_price, m.symbol
        FROM trade.positions p
        JOIN trade.markets m ON m.id = p.market_id
        WHERE p.status = 'open' AND p.market_id = ${marketId}
        ORDER BY p.opened_at ASC
      `;
      return rows.map(mapFunding);
    },
  };
}

/** All open futures positions (liquidation scan). `closing` rows are excluded — not liquidatable (ADR 2026-08-07). */
export function sqlLiquidationPositionLoader(sql: Sql): LiquidationPositionLoader {
  return {
    async listOpen() {
      const rows = await sql<OpenPosRow[]>`
        SELECT p.id, p.user_id, p.market_id, p.side, p.size, p.entry_price,
               p.margin_current, p.margin_asset, p.liq_price, m.symbol
        FROM trade.positions p
        JOIN trade.markets m ON m.id = p.market_id
        WHERE p.status = 'open'
        ORDER BY p.opened_at ASC
      `;
      return rows.map(mapLiq);
    },
  };
}

/** In-memory loaders for unit tests. */
export function memoryFundingPositionLoader(rows: readonly FundingOpenPosition[]): FundingPositionLoader {
  return {
    async listOpenForMarket() {
      return rows;
    },
  };
}

export function memoryLiquidationPositionLoader(rows: readonly LiquidationPositionRow[]): LiquidationPositionLoader {
  return {
    async listOpen() {
      return rows;
    },
  };
}
