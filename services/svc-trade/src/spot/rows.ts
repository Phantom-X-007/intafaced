import { parseAmount } from '@intafaced/ledger-client';
import type { Market, OrderRecord, OrderSide, OrderStatus, OrderType, TimeInForce } from './types.js';

/**
 * THE PARSE BOUNDARY.
 *
 * Postgres hands `numeric(38,18)` back as a decimal string and `numeric(8,0)`
 * as a decimal string too. This file is the only place either becomes a
 * TypeScript value, so there is exactly one line to inspect when asking "could
 * a float have got in here" — and the answer is no, because `parseAmount`
 * rejects anything lossy and `Number` is applied only to basis points, which
 * are counts rather than quantities of value.
 */

export interface MarketRow {
  id: string;
  symbol: string;
  base_asset: string;
  quote_asset: string;
  kind: Market['kind'];
  tick_size: string;
  lot_size: string;
  min_qty: string;
  max_qty: string | null;
  min_notional: string;
  status: Market['status'];
  maker_bps: string;
  taker_bps: string;
  listed_at: Date | null;
}

export function toMarket(row: MarketRow): Market {
  return {
    id: row.id,
    symbol: row.symbol,
    baseAsset: row.base_asset,
    quoteAsset: row.quote_asset,
    kind: row.kind,
    tickSize: parseAmount(row.tick_size),
    lotSize: parseAmount(row.lot_size),
    minQty: parseAmount(row.min_qty),
    maxQty: row.max_qty === null ? null : parseAmount(row.max_qty),
    minNotional: parseAmount(row.min_notional),
    status: row.status,
    makerBps: Number(row.maker_bps),
    takerBps: Number(row.taker_bps),
    listedAt: row.listed_at,
  };
}

export interface OrderRow {
  id: string;
  user_id: string;
  sub_account_id: string | null;
  market_id: string;
  client_order_id: string | null;
  side: OrderSide;
  type: OrderType;
  price: string | null;
  qty: string;
  filled_qty: string;
  status: OrderStatus;
  tif: TimeInForce;
  hold_asset: string;
  hold_amount: string;
  fee_discount_bps: string;
  protection_price: string | null;
  engine_sequence: number | null;
  reject_code: string | null;
  created_at: Date;
}

export function toOrder(row: OrderRow): OrderRecord {
  return {
    id: row.id,
    userId: row.user_id,
    subAccountId: row.sub_account_id,
    marketId: row.market_id,
    clientOrderId: row.client_order_id,
    side: row.side,
    type: row.type,
    price: row.price === null ? null : parseAmount(row.price),
    qty: parseAmount(row.qty),
    filledQty: parseAmount(row.filled_qty),
    status: row.status,
    tif: row.tif,
    holdAsset: row.hold_asset,
    holdAmount: parseAmount(row.hold_amount),
    feeDiscountBps: Number(row.fee_discount_bps),
    protectionPrice: row.protection_price === null ? null : parseAmount(row.protection_price),
    engineSequence: row.engine_sequence,
    rejectCode: row.reject_code,
    createdAt: row.created_at,
  };
}

export interface FillRow {
  id: string;
  order_id: string;
  counter_order_id: string;
  market_id: string;
  user_id: string;
  side: OrderSide;
  liquidity: 'maker' | 'taker';
  price: string;
  qty: string;
  quote_amount: string;
  fee_asset: string;
  fee_amount: string;
  fee_bps: string;
  sequence: number;
  ts: Date;
}

export function toFill(row: FillRow) {
  return {
    id: row.id,
    orderId: row.order_id,
    counterOrderId: row.counter_order_id,
    marketId: row.market_id,
    userId: row.user_id,
    side: row.side,
    liquidity: row.liquidity,
    price: parseAmount(row.price),
    qty: parseAmount(row.qty),
    quoteAmount: parseAmount(row.quote_amount),
    feeAsset: row.fee_asset,
    feeAmount: parseAmount(row.fee_amount),
    feeBps: Number(row.fee_bps),
    sequence: row.sequence,
    ts: row.ts,
  };
}
