/**
 * Price-alert watchlist store — memory for tests, Postgres for prod.
 *
 * Doctrine §2: notify schema only. No trade tables. Prices are text.
 */

import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';
import { isValidPositivePrice } from './decimal.js';
import type { AlertDirection, AlertStatus, CreatePriceAlertInput, PriceAlert } from './types.js';

export class AlertValidationError extends Error {
  readonly code: 'alert.invalid_price' | 'alert.invalid_market' | 'alert.invalid_direction';
  constructor(code: AlertValidationError['code'], message: string) {
    super(message);
    this.name = 'AlertValidationError';
    this.code = code;
  }
}

export interface AlertStore {
  create(input: CreatePriceAlertInput): Promise<PriceAlert>;
  list(userId: string): Promise<readonly PriceAlert[]>;
  get(userId: string, id: string): Promise<PriceAlert | null>;
  /** Active alerts for a market — evaluation fan-in. */
  listActiveByMarket(marketId: string): Promise<readonly PriceAlert[]>;
  /**
   * Markets with at least one active watch.
   *
   * The sweep's fan-in: it must not need a list of markets from anywhere else,
   * because a market list held outside this table is a market list that drifts
   * and silently stops evaluating somebody's watch.
   */
  activeMarkets(): Promise<readonly string[]>;
  markFired(userId: string, id: string, at: Date): Promise<PriceAlert | null>;
  cancel(userId: string, id: string): Promise<PriceAlert | null>;
}

function assertCreate(input: CreatePriceAlertInput): void {
  if (!input.marketId.trim()) {
    throw new AlertValidationError('alert.invalid_market', 'marketId required');
  }
  if (input.direction !== 'above' && input.direction !== 'below') {
    throw new AlertValidationError('alert.invalid_direction', `direction=${input.direction}`);
  }
  if (!isValidPositivePrice(input.targetPrice)) {
    throw new AlertValidationError('alert.invalid_price', `targetPrice=${input.targetPrice}`);
  }
}

export class MemoryAlertStore implements AlertStore {
  private readonly byId = new Map<string, PriceAlert>();

  async create(input: CreatePriceAlertInput): Promise<PriceAlert> {
    assertCreate(input);
    const row: PriceAlert = {
      id: randomUUID(),
      userId: input.userId,
      marketId: input.marketId.trim(),
      direction: input.direction,
      targetPrice: input.targetPrice.trim(),
      status: 'active',
      firedAt: null,
      createdAt: new Date(),
    };
    this.byId.set(row.id, row);
    return row;
  }

  async list(userId: string): Promise<readonly PriceAlert[]> {
    return [...this.byId.values()].filter((r) => r.userId === userId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async get(userId: string, id: string): Promise<PriceAlert | null> {
    const row = this.byId.get(id);
    return row && row.userId === userId ? row : null;
  }

  async listActiveByMarket(marketId: string): Promise<readonly PriceAlert[]> {
    return [...this.byId.values()].filter((r) => r.marketId === marketId && r.status === 'active');
  }

  async activeMarkets(): Promise<readonly string[]> {
    return [...new Set([...this.byId.values()].filter((r) => r.status === 'active').map((r) => r.marketId))].sort();
  }

  async markFired(userId: string, id: string, at: Date): Promise<PriceAlert | null> {
    const row = await this.get(userId, id);
    if (!row || row.status !== 'active') return null;
    const next: PriceAlert = { ...row, status: 'fired', firedAt: at };
    this.byId.set(id, next);
    return next;
  }

  async cancel(userId: string, id: string): Promise<PriceAlert | null> {
    const row = await this.get(userId, id);
    if (!row || row.status === 'cancelled') return row;
    if (row.status === 'fired') return row;
    const next: PriceAlert = { ...row, status: 'cancelled' };
    this.byId.set(id, next);
    return next;
  }
}

/**
 * Postgres-backed store. Migration `0006_notify_price_alerts.sql`.
 * Instantiated only when DATABASE_URL is configured at boot.
 */
export class PostgresAlertStore implements AlertStore {
  constructor(private readonly sql: Sql) {}

  async create(input: CreatePriceAlertInput): Promise<PriceAlert> {
    assertCreate(input);
    const id = randomUUID();
    const rows = await this.sql<
      {
        id: string;
        user_id: string;
        market_id: string;
        direction: AlertDirection;
        target_price: string;
        status: AlertStatus;
        fired_at: Date | null;
        created_at: Date;
      }[]
    >`
      INSERT INTO notify.price_alerts (id, user_id, market_id, direction, target_price, status)
      VALUES (${id}, ${input.userId}, ${input.marketId.trim()}, ${input.direction}, ${input.targetPrice.trim()}, 'active')
      RETURNING id, user_id, market_id, direction, target_price, status, fired_at, created_at
    `;
    return mapRow(rows[0]!);
  }

  async list(userId: string): Promise<readonly PriceAlert[]> {
    const rows = await this.sql<
      {
        id: string;
        user_id: string;
        market_id: string;
        direction: AlertDirection;
        target_price: string;
        status: AlertStatus;
        fired_at: Date | null;
        created_at: Date;
      }[]
    >`
      SELECT id, user_id, market_id, direction, target_price, status, fired_at, created_at
      FROM notify.price_alerts
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `;
    return rows.map(mapRow);
  }

  async get(userId: string, id: string): Promise<PriceAlert | null> {
    const rows = await this.sql<
      {
        id: string;
        user_id: string;
        market_id: string;
        direction: AlertDirection;
        target_price: string;
        status: AlertStatus;
        fired_at: Date | null;
        created_at: Date;
      }[]
    >`
      SELECT id, user_id, market_id, direction, target_price, status, fired_at, created_at
      FROM notify.price_alerts
      WHERE user_id = ${userId} AND id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async listActiveByMarket(marketId: string): Promise<readonly PriceAlert[]> {
    const rows = await this.sql<
      {
        id: string;
        user_id: string;
        market_id: string;
        direction: AlertDirection;
        target_price: string;
        status: AlertStatus;
        fired_at: Date | null;
        created_at: Date;
      }[]
    >`
      SELECT id, user_id, market_id, direction, target_price, status, fired_at, created_at
      FROM notify.price_alerts
      WHERE market_id = ${marketId} AND status = 'active'
    `;
    return rows.map(mapRow);
  }

  async activeMarkets(): Promise<readonly string[]> {
    const rows = await this.sql<{ market_id: string }[]>`
      SELECT DISTINCT market_id
      FROM notify.price_alerts
      WHERE status = 'active'
      ORDER BY market_id
    `;
    return rows.map((r) => r.market_id);
  }

  async markFired(userId: string, id: string, at: Date): Promise<PriceAlert | null> {
    const rows = await this.sql<
      {
        id: string;
        user_id: string;
        market_id: string;
        direction: AlertDirection;
        target_price: string;
        status: AlertStatus;
        fired_at: Date | null;
        created_at: Date;
      }[]
    >`
      UPDATE notify.price_alerts
      SET status = 'fired', fired_at = ${at}
      WHERE user_id = ${userId} AND id = ${id} AND status = 'active'
      RETURNING id, user_id, market_id, direction, target_price, status, fired_at, created_at
    `;
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async cancel(userId: string, id: string): Promise<PriceAlert | null> {
    const rows = await this.sql<
      {
        id: string;
        user_id: string;
        market_id: string;
        direction: AlertDirection;
        target_price: string;
        status: AlertStatus;
        fired_at: Date | null;
        created_at: Date;
      }[]
    >`
      UPDATE notify.price_alerts
      SET status = 'cancelled'
      WHERE user_id = ${userId} AND id = ${id} AND status = 'active'
      RETURNING id, user_id, market_id, direction, target_price, status, fired_at, created_at
    `;
    if (rows[0]) return mapRow(rows[0]);
    return this.get(userId, id);
  }
}

function mapRow(r: {
  id: string;
  user_id: string;
  market_id: string;
  direction: AlertDirection;
  target_price: string;
  status: AlertStatus;
  fired_at: Date | null;
  created_at: Date;
}): PriceAlert {
  return {
    id: r.id,
    userId: r.user_id,
    marketId: r.market_id,
    direction: r.direction,
    targetPrice: r.target_price,
    status: r.status,
    firedAt: r.fired_at,
    createdAt: r.created_at,
  };
}
