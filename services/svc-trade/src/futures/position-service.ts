/**
 * Futures position open/close + positionUpdated fan-out (trade.futures F3–F4).
 *
 * STATE in trade.positions; MARGIN only via ledger recipes (Doctrine §0.6).
 * Publishes `positionUpdated` so svc-ws private positions channel is not silent
 * after real opens. Mark/liquidation/funding remain later slices (markPrice null).
 */
import type { Sql } from 'postgres';
import { randomUUID } from 'node:crypto';
import { formatAmount, parseAmount, recipes, type Amount, type LedgerClient } from '@intafaced/ledger-client';
import type { Position } from '@intafaced/exchange-contract';
import type { EventBus } from '@intafaced/events';
import { initialMargin } from './initial-margin.js';

export class FuturesError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'FuturesError';
  }
}

export interface OpenPositionInput {
  userId: string;
  /** Market symbol, e.g. BTC/USDT-PERP — must be kind=futures and active. */
  symbol: string;
  side: 'long' | 'short';
  size: Amount;
  entryPrice: Amount;
  leverage: Amount;
  marginMode?: 'cross' | 'isolated';
}

export interface PositionRow {
  id: string;
  user_id: string;
  market_id: string;
  side: 'long' | 'short';
  status: 'open' | 'closed' | 'liquidated';
  margin_mode: 'cross' | 'isolated';
  size: string;
  entry_price: string;
  leverage: string;
  margin_initial: string;
  margin_asset: string;
  funding_paid: string;
  liq_price: string | null;
  opened_at: Date;
  closed_at: Date | null;
  symbol: string;
}

export class PositionService {
  constructor(
    private readonly sql: Sql,
    private readonly ledger: LedgerClient,
    /** Optional: tests may omit; production passes JetStream bus. */
    private readonly bus: EventBus | null = null,
  ) {}

  async listOpen(userId: string, symbol?: string): Promise<Position[]> {
    const rows = symbol
      ? await this.sql<PositionRow[]>`
          SELECT p.*, m.symbol
          FROM trade.positions p
          JOIN trade.markets m ON m.id = p.market_id
          WHERE p.user_id = ${userId} AND p.status = 'open' AND m.symbol = ${symbol}
          ORDER BY p.opened_at DESC
        `
      : await this.sql<PositionRow[]>`
          SELECT p.*, m.symbol
          FROM trade.positions p
          JOIN trade.markets m ON m.id = p.market_id
          WHERE p.user_id = ${userId} AND p.status = 'open'
          ORDER BY p.opened_at DESC
        `;
    return rows.map(presentPosition);
  }

  async open(input: OpenPositionInput): Promise<Position> {
    const market = await this.sql<
      {
        id: string;
        symbol: string;
        kind: string;
        status: string;
        quote_asset: string;
      }[]
    >`
      SELECT id, symbol, kind, status, quote_asset
      FROM trade.markets
      WHERE symbol = ${input.symbol}
      LIMIT 1
    `;
    const m = market[0];
    if (!m) throw new FuturesError(`unknown market ${input.symbol}`, 'trade.market_not_found', 404);
    if (m.kind !== 'futures') {
      throw new FuturesError(`market ${input.symbol} is ${m.kind}, not futures`, 'trade.not_futures_market', 400);
    }
    if (m.status !== 'active') {
      throw new FuturesError(`market ${input.symbol} is ${m.status}`, 'trade.market_not_tradable', 400);
    }

    const leverage = input.leverage;
    const marginMode = input.marginMode ?? 'isolated';
    const margin = initialMargin({
      size: input.size,
      entryPrice: input.entryPrice,
      leverage,
    });
    const positionId = randomUUID();

    // Money first — never a position row without a ledger claim.
    await this.ledger.post(
      recipes.futuresMarginLock({
        positionId,
        userId: input.userId,
        assetId: m.quote_asset,
        amount: margin,
      }),
    );

    try {
      await this.sql`
        INSERT INTO trade.positions (
          id, user_id, market_id, side, status, margin_mode,
          size, entry_price, leverage, margin_initial, margin_asset, funding_paid
        ) VALUES (
          ${positionId},
          ${input.userId},
          ${m.id},
          ${input.side},
          'open',
          ${marginMode},
          ${formatAmount(input.size)},
          ${formatAmount(input.entryPrice)},
          ${formatAmount(leverage)},
          ${formatAmount(margin)},
          ${m.quote_asset},
          '0'
        )
      `;
    } catch (err) {
      // Roll margin back if the row failed (unique open, etc.).
      await this.ledger.post(
        recipes.futuresMarginRelease({
          positionId,
          userId: input.userId,
          assetId: m.quote_asset,
          amount: margin,
          sequence: 1,
        }),
      );
      throw err;
    }

    const [row] = await this.sql<PositionRow[]>`
      SELECT p.*, m.symbol
      FROM trade.positions p
      JOIN trade.markets m ON m.id = p.market_id
      WHERE p.id = ${positionId}
    `;
    await this.publishPositionUpdated(row!);
    return presentPosition(row!);
  }

  async close(userId: string, positionId: string): Promise<Position> {
    const [row] = await this.sql<PositionRow[]>`
      SELECT p.*, m.symbol
      FROM trade.positions p
      JOIN trade.markets m ON m.id = p.market_id
      WHERE p.id = ${positionId} AND p.user_id = ${userId}
      LIMIT 1
    `;
    if (!row) throw new FuturesError('position not found', 'trade.position_not_found', 404);
    if (row.status !== 'open') {
      throw new FuturesError(`position is ${row.status}`, 'trade.position_not_open', 400);
    }

    const margin = parseAmount(row.margin_initial);
    // v1: release full initial margin (no realized PnL path yet — F4/F5).
    await this.ledger.post(
      recipes.futuresMarginRelease({
        positionId: row.id,
        userId,
        assetId: row.margin_asset,
        amount: margin,
        sequence: 0,
      }),
    );

    await this.sql`
      UPDATE trade.positions
      SET status = 'closed', closed_at = now(), updated_at = now()
      WHERE id = ${positionId} AND user_id = ${userId} AND status = 'open'
    `;

    const [closed] = await this.sql<PositionRow[]>`
      SELECT p.*, m.symbol
      FROM trade.positions p
      JOIN trade.markets m ON m.id = p.market_id
      WHERE p.id = ${positionId}
    `;
    await this.publishPositionUpdated(closed!);
    return presentPosition(closed!);
  }

  /** Fan-out for private WS — honest nulls for mark/PnL until mark path exists. */
  private async publishPositionUpdated(row: PositionRow): Promise<void> {
    if (!this.bus) return;
    const size = parseAmount(row.size);
    const entry = parseAmount(row.entry_price);
    const SCALE = 10n ** 18n;
    const notional = (size * entry) / SCALE;
    const ts = new Date().toISOString();
    await this.bus.publish(
      'positionUpdated',
      {
        positionId: row.id,
        userId: row.user_id,
        marketId: row.market_id,
        symbol: row.symbol,
        status: row.status,
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
      { idempotencyKey: `trade.position.updated:${row.id}:${row.status}:${ts}` },
    );
  }
}

function presentPosition(row: PositionRow): Position {
  const size = parseAmount(row.size);
  const entry = parseAmount(row.entry_price);
  const leverage = parseAmount(row.leverage);
  const margin = parseAmount(row.margin_initial);
  const SCALE = 10n ** 18n;
  const notional = (size * entry) / SCALE;
  const opened = row.opened_at instanceof Date ? row.opened_at : new Date(row.opened_at);
  const liq = row.liq_price != null ? formatAmount(parseAmount(row.liq_price)) : null;
  return {
    id: row.id,
    symbol: row.symbol,
    timestamp: opened.getTime(),
    datetime: opened.toISOString(),
    side: row.side,
    contracts: formatAmount(size),
    contractSize: null,
    entryPrice: formatAmount(entry),
    markPrice: null,
    notional: formatAmount(notional),
    leverage: formatAmount(leverage),
    collateral: formatAmount(margin),
    initialMargin: formatAmount(margin),
    maintenanceMargin: null,
    unrealizedPnl: null,
    realizedPnl: null,
    liquidationPrice: liq,
    marginMode: row.margin_mode,
    percentage: null,
  };
}
