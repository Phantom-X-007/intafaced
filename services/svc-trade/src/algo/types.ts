import type { Amount } from '@intafaced/ledger-client';
import type { OrderSide } from '../spot/types.js';

/**
 * ALGO PARENT (D-S-04) — a schedule, not an order.
 *
 * Doctrine load-bearing sentence (`docs/adr/2026-08-04-algo-execution-law.md`):
 * the parent holds no balance, no fill, and no P&L. Everything real happens on
 * a child order that went to the book like any other. Progress is a SUM of
 * child fills, never a number the scheduler computed.
 *
 * There is deliberately no `filledQty`, `avgPrice`, `holdAmount`, `pnl`, or
 * `progressPct` field on the parent. Those would be the fabrication surface.
 */

export type AlgoKind = 'twap';

export type AlgoStatus = 'active' | 'paused' | 'cancelled' | 'completed' | 'halted';

/** Why a slice did not become a fill — surfaced, never silent. */
export type AlgoMissCode =
  | 'trade.algo_no_liquidity'
  | 'trade.algo_price_band'
  | 'trade.algo_mark_unusable'
  | 'trade.algo_mark_missing'
  | 'trade.algo_insufficient_balance'
  | 'trade.algo_market_closed'
  | 'trade.algo_principal_unavailable'
  | 'trade.algo_child_refused';

export interface AlgoChildRef {
  readonly sliceIndex: number;
  readonly orderId: string;
  readonly clientOrderId: string;
  /** Schedule qty for this slice — not a fill. */
  readonly qty: Amount;
  readonly placedAt: Date;
}

export interface AlgoMiss {
  readonly sliceIndex: number;
  readonly code: AlgoMissCode;
  readonly reason: string;
  readonly at: Date;
}

/**
 * Impoverished parent. Schedule + children + misses + status. Nothing else.
 */
export interface TwapParent {
  readonly id: string;
  readonly userId: string;
  readonly subAccountId: string | null;
  readonly marketId: string;
  readonly symbol: string;
  readonly side: OrderSide;
  readonly kind: 'twap';
  /** Total quantity the schedule intends to emit across all slices. Not a balance. */
  readonly totalQty: Amount;
  readonly durationMs: number;
  readonly sliceIntervalMs: number;
  /**
   * Optional limit band for child limit orders.
   * Buy: child price must be ≤ this. Sell: child price must be ≥ this.
   * Null = market IOC children (still refuse on empty book / bad mark).
   */
  readonly limitPrice: Amount | null;
  readonly status: AlgoStatus;
  readonly createdAt: Date;
  readonly startedAt: Date;
  readonly pausedAt: Date | null;
  readonly haltReason: string | null;
  readonly slicesPlanned: number;
  /** Next slice index to emit (0-based). Resume does not rewind elapsed slices. */
  readonly nextSliceIndex: number;
  readonly children: readonly AlgoChildRef[];
  readonly misses: readonly AlgoMiss[];
}

/**
 * User-visible progress. `filledQty` is ONLY the sum of real child fills
 * supplied by the caller — the parent never invents it.
 */
export interface AlgoProgressView {
  readonly parentId: string;
  readonly status: AlgoStatus;
  readonly haltReason: string | null;
  readonly childrenEmitted: number;
  readonly missesRecorded: number;
  readonly slicesPlanned: number;
  readonly nextSliceIndex: number;
  /** Decimal string — sum of child fill qtys. Zero when no fills, never a schedule %. */
  readonly filledQty: string;
  readonly totalQty: string;
}

export interface CreateTwapInput {
  readonly marketId: string;
  readonly symbol: string;
  readonly side: OrderSide;
  readonly totalQty: Amount;
  readonly durationMs: number;
  readonly sliceIntervalMs: number;
  readonly limitPrice: Amount | null;
  readonly subAccountId: string | null;
  readonly clientAlgoId?: string;
}

/** Mark feed for algo halt gates — same vocabulary as prices.ts / futures mark-policy. */
export type AlgoMarkQuality = 'mid' | 'last' | 'index';

export interface AlgoQuotedMark {
  readonly marketId: string;
  readonly price: Amount;
  readonly asOf: Date;
  readonly quality: AlgoMarkQuality;
}
