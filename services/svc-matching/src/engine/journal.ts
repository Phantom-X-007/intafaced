import { closeSync, existsSync, fsyncSync, openSync, readFileSync, writeFileSync, writeSync } from 'node:fs';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import type { MarketLifecycleAdmissionProof } from '@intafaced/exchange-contract';
import { OrderBook } from './book.js';
import type { BookState, EngineAmend, EngineOrder, EngineOrderType, MarketId, OrderId, OrderSide, TimeInForce } from './types.js';

/**
 * THE ENGINE JOURNAL (§5.1).
 *
 * "Every input persisted to an append-only engine_journal before processing →
 *  full replay = current book state (recovery guarantee)."
 *
 * Two properties do all the work:
 *
 *   1. INPUTS ONLY. The journal records what was asked, never what happened.
 *      If it recorded outcomes, a replay would be a transcript rather than a
 *      proof — and a bug in the matcher would replay perfectly while the book
 *      stayed wrong. Replaying inputs through the same matcher is what makes
 *      the state verifiable.
 *
 *   2. BEFORE PROCESSING. The record is durable before the book moves. A crash
 *      between the two costs a **replay of that input into an empty book**
 *      (recovery rebuilds once from the journal; it does not re-emit bus
 *      events). Safety is **not** "duplicate_order_id on live re-submit" —
 *      that guard only covers **still-live** resting/stop ids (README).
 *      Never-rests markets and fully filled ids are reusable by design; a
 *      second live submit of the same id after the order is gone is a new
 *      trade-side concern, not journal crash safety. A crash the other way
 *      (book moved before journal) would cost a fill nobody can reconstruct.
 *
 * Amounts are decimal strings on disk. A journal is read years after it is
 * written, by processes that may not share this build — a scaled bigint is our
 * private representation, not an archival format.
 */

export interface WireOrder {
  readonly orderId: OrderId;
  readonly accountId: string;
  readonly type: EngineOrderType;
  readonly side: OrderSide;
  readonly qty: string;
  readonly price: string | null;
  readonly stopPrice: string | null;
  readonly tif: TimeInForce;
  readonly ocoSiblingId?: string;
  readonly expireAt?: string;
  readonly reduceOnly?: boolean;
  readonly displayQty?: string | null;
  readonly iceberg?: boolean;
  /** Trail distance. Absent when the rest is not a trailing stop. */
  readonly trail?: string | null;
  /** Injected mark the trail walks with. Absent when not supplied. */
  readonly mark?: string | null;
  /** Exact PX-S01 admission evidence for new HTTP submissions. */
  readonly lifecycleProof?: MarketLifecycleAdmissionProof;
}

export interface WireAmendPatch {
  readonly qty?: string;
  readonly price?: string;
  readonly stopPrice?: string;
  readonly tif?: TimeInForce;
}

export type JournalCommand =
  | {
      readonly kind: 'submit';
      readonly marketId: MarketId;
      /** Wall clock at admission. Journalled because event payloads carry it — the book never reads it. */
      readonly at: string;
      readonly order: WireOrder;
    }
  | { readonly kind: 'cancel'; readonly marketId: MarketId; readonly at: string; readonly orderId: OrderId }
  | {
      readonly kind: 'amend';
      readonly marketId: MarketId;
      readonly at: string;
      readonly orderId: OrderId;
      readonly expectedVersion: number;
      readonly patch: WireAmendPatch;
      readonly lifecycleProof?: MarketLifecycleAdmissionProof;
    };

export type JournalRecord = JournalCommand & { readonly seq: number };

export interface EngineJournal {
  /** Append and make durable. Returns the record with its assigned position. */
  append(command: JournalCommand): JournalRecord;
  read(): readonly JournalRecord[];
  readonly length: number;
  close(): void;
}

function persistIceberg(order: { readonly iceberg?: boolean; readonly displayQty?: string | null | unknown }): boolean {
  return order.iceberg === true || order.displayQty !== undefined;
}

function persistTrail(order: { readonly trail?: unknown }): boolean {
  return order.trail !== undefined;
}

export function toWire(order: EngineOrder, lifecycleProof?: MarketLifecycleAdmissionProof): WireOrder {
  return {
    orderId: order.orderId,
    accountId: order.accountId,
    type: order.type,
    side: order.side,
    qty: formatAmount(order.qty),
    price: order.price === null ? null : formatAmount(order.price),
    stopPrice: order.stopPrice === null ? null : formatAmount(order.stopPrice),
    tif: order.tif,
    ...(order.ocoSiblingId ? { ocoSiblingId: order.ocoSiblingId } : {}),
    ...(order.expireAt ? { expireAt: order.expireAt } : {}),
    ...(order.reduceOnly ? { reduceOnly: true } : {}),
    ...(persistIceberg(order)
      ? { iceberg: true, displayQty: order.displayQty == null ? null : formatAmount(order.displayQty) }
      : {}),
    ...(persistTrail(order)
      ? {
          trail: order.trail == null ? null : formatAmount(order.trail),
          ...(order.mark !== undefined ? { mark: order.mark == null ? null : formatAmount(order.mark) } : {}),
        }
      : {}),
    lifecycleProof,
  };
}

export function fromWire(order: WireOrder): EngineOrder {
  return {
    orderId: order.orderId,
    accountId: order.accountId,
    type: order.type,
    side: order.side,
    qty: parseAmount(order.qty),
    price: order.price === null ? null : parseAmount(order.price),
    stopPrice: order.stopPrice === null ? null : parseAmount(order.stopPrice),
    tif: order.tif,
    ...(order.ocoSiblingId ? { ocoSiblingId: order.ocoSiblingId } : {}),
    ...(order.expireAt ? { expireAt: order.expireAt } : {}),
    ...(order.reduceOnly ? { reduceOnly: true } : {}),
    ...(persistIceberg(order)
      ? { iceberg: true, displayQty: order.displayQty == null ? null : parseAmount(order.displayQty) }
      : {}),
    ...(persistTrail(order)
      ? {
          trail: order.trail == null ? null : parseAmount(order.trail),
          ...(order.mark !== undefined ? { mark: order.mark == null ? null : parseAmount(order.mark) } : {}),
        }
      : {}),
  };
}

export function toWireAmend(cmd: EngineAmend): WireAmendPatch {
  return {
    ...(cmd.qty !== undefined ? { qty: formatAmount(cmd.qty) } : {}),
    ...(cmd.price !== undefined ? { price: formatAmount(cmd.price) } : {}),
    ...(cmd.stopPrice !== undefined ? { stopPrice: formatAmount(cmd.stopPrice) } : {}),
    ...(cmd.tif !== undefined ? { tif: cmd.tif } : {}),
  };
}

export function fromWireAmend(orderId: OrderId, expectedVersion: number, patch: WireAmendPatch): EngineAmend {
  return {
    orderId,
    expectedVersion,
    ...(patch.qty !== undefined ? { qty: parseAmount(patch.qty) } : {}),
    ...(patch.price !== undefined ? { price: parseAmount(patch.price) } : {}),
    ...(patch.stopPrice !== undefined ? { stopPrice: parseAmount(patch.stopPrice) } : {}),
    ...(patch.tif !== undefined ? { tif: patch.tif } : {}),
  };
}
