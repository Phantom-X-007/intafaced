/**
 * Rest a linked bracket with entry, take-profit, and stop-loss.
 * Entry fill rests the exits. Refuse if any leg is missing.
 * The engine does not invent a trigger.
 * Not a redo of #3628 (OCO rest) or #3654 (bazaar OCO cancel).
 */
import { ZERO, type Amount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import { readStopLoss, readTakeProfit } from './oco-link.js';
import type { EngineOrder, Fill, OrderSide, SubmitResult } from './types.js';

export const ENTRY_MISSING = 'missing_price' as const;
export const TAKE_PROFIT_MISSING = 'missing_stop_price' as const;
export const STOP_LOSS_MISSING = 'missing_stop_price' as const;

const FLAG = Symbol.for('intafaced.matching.bracket');

type BracketOrder = EngineOrder & {
  readonly bracket?: boolean;
  readonly takeProfit?: Amount | null;
  readonly stopLoss?: Amount | null;
  readonly takeProfitOrderId?: string | null;
  readonly stopLossOrderId?: string | null;
  readonly oco?: boolean;
  readonly mark?: Amount | null;
};

type Pending = {
  readonly entryId: string;
  readonly takeProfit: Amount;
  readonly stopLoss: Amount;
  readonly tpId: string;
  readonly slId: string;
  readonly side: OrderSide;
  readonly qty: Amount;
  readonly accountId: string;
  readonly tif: EngineOrder['tif'];
};

const pending = new WeakMap<OrderBook, Map<string, Pending>>();

export function wantsBracket(order: { readonly bracket?: boolean }): boolean {
  return order.bracket === true;
}

/** Caller entry price. Null/zero is missing — never last, mid, or mark. */
export function readEntry(order: { readonly type?: string; readonly price?: Amount | null }): Amount | null {
  if (order.type === 'market') return null;
  if (order.price === undefined || order.price === null || order.price <= ZERO) return null;
  return order.price;
}

export function entryRefuse(
  order: { readonly type?: string; readonly price?: Amount | null },
): { readonly code: typeof ENTRY_MISSING; readonly message: string } | null {
  if (order.type === 'market') return null;
  if (readEntry(order) !== null) return null;
  return {
    code: ENTRY_MISSING,
    message: 'a bracket entry is missing; the engine does not invent a trigger',
  };
}

export function takeProfitRefuse(
  takeProfit: Amount | null,
): { readonly code: typeof TAKE_PROFIT_MISSING; readonly message: string } | null {
  if (takeProfit !== null) return null;
  return {
    code: TAKE_PROFIT_MISSING,
    message: 'a bracket take-profit is missing; the engine does not invent a trigger',
  };
}

export function stopLossRefuse(
  stopLoss: Amount | null,
): { readonly code: typeof STOP_LOSS_MISSING; readonly message: string } | null {
  if (stopLoss !== null) return null;
  return {
    code: STOP_LOSS_MISSING,
    message: 'a bracket stop-loss is missing; the engine does not invent a trigger',
  };
}

function rejected(code: NonNullable<SubmitResult['rejected']>['code'], message: string): SubmitResult {
  return {
    accepted: false,
    sequence: null,
    fills: [],
    resting: null,
    rejected: { code, message },
    cancellations: [],
    triggered: [],
  };
}

function exitSide(side: OrderSide): OrderSide {
  return side === 'buy' ? 'sell' : 'buy';
}

function namedId(raw: string | null | undefined, fallback: string): string {
  if (raw == null) return fallback;
  const id = raw.trim();
  return id.length > 0 ? id : fallback;
}

function of(book: OrderBook): Map<string, Pending> {
  let rows = pending.get(book);
  if (!rows) {
    rows = new Map();
    pending.set(book, rows);
  }
  return rows;
}

function liveIds(book: OrderBook): Set<string> {
  const state = book.toState();
  const ids = new Set<string>();
  for (const level of state.bids) {
    for (const row of level.orders) ids.add(row.orderId);
  }
  for (const level of state.asks) {
    for (const row of level.orders) ids.add(row.orderId);
  }
  for (const stop of state.stops) ids.add(stop.orderId);
  return ids;
}

function collectFills(result: SubmitResult): Fill[] {
  const out = [...result.fills];
  for (const triggered of result.triggered) {
    out.push(...triggered.fills);
  }
  return out;
}

function filledEntry(fills: readonly Fill[], orderId: string): boolean {
  return fills.some((fill) => fill.makerOrderId === orderId || fill.takerOrderId === orderId);
}

function mergeResults(left: SubmitResult, right: SubmitResult): SubmitResult {
  return {
    accepted: left.accepted && right.accepted,
    sequence: right.sequence ?? left.sequence,
    fills: [...left.fills, ...right.fills],
    resting: right.resting ?? left.resting,
    rejected: right.rejected ?? left.rejected,
    cancellations: [...left.cancellations, ...right.cancellations],
    triggered: [...left.triggered, ...right.triggered],
  };
}

function baseEntry(extra: BracketOrder): EngineOrder {
  const {
    takeProfit: _takeProfit,
    stopLoss: _stopLoss,
    bracket: _bracket,
    oco: _oco,
    takeProfitOrderId: _takeProfitOrderId,
    stopLossOrderId: _stopLossOrderId,
    mark: _mark,
    ...base
  } = extra;
  return base;
}

function restExits(
  book: OrderBook,
  orig: (order: EngineOrder, now?: Date | null) => SubmitResult,
  rec: Pending,
  now?: Date | null,
): SubmitResult {
  return orig.call(
    book,
    {
      orderId: rec.entryId,
      accountId: rec.accountId,
      type: 'limit',
      side: exitSide(rec.side),
      qty: rec.qty,
      price: rec.takeProfit,
      stopPrice: null,
      tif: rec.tif,
      oco: true,
      takeProfit: rec.takeProfit,
      stopLoss: rec.stopLoss,
      takeProfitOrderId: rec.tpId,
      stopLossOrderId: rec.slId,
    } as EngineOrder,
    now,
  );
}

function restExitsForFills(
  book: OrderBook,
  orig: (order: EngineOrder, now?: Date | null) => SubmitResult,
  result: SubmitResult,
  now?: Date | null,
): SubmitResult {
  const rows = pending.get(book);
  if (!rows || rows.size === 0) return result;
  const live = liveIds(book);
  const fills = collectFills(result);
  let combined = result;
  for (const [orderId, rec] of [...rows]) {
    if (live.has(orderId)) continue;
    rows.delete(orderId);
    if (!filledEntry(fills, orderId)) continue;
    combined = mergeResults(combined, restExits(book, orig, rec, now));
  }
  return combined;
}

export function installBracket(ctor: typeof OrderBook): void {
  const proto = ctor.prototype as {
    submit: (order: EngineOrder, now?: Date | null) => SubmitResult;
    [FLAG]?: true;
  };
  if (proto[FLAG]) return;
  proto[FLAG] = true;

  const orig = proto.submit;
  proto.submit = function (this: OrderBook, order: EngineOrder, now?: Date | null) {
    const extra = order as BracketOrder;
    if (!wantsBracket(extra)) {
      return restExitsForFills(this, orig, orig.call(this, order, now), now);
    }

    const missingEntry = entryRefuse(extra);
    if (missingEntry) return rejected(missingEntry.code, missingEntry.message);
    const takeProfit = readTakeProfit(extra);
    const missingTp = takeProfitRefuse(takeProfit);
    if (missingTp) return rejected(missingTp.code, missingTp.message);
    const stopLoss = readStopLoss(extra);
    const missingSl = stopLossRefuse(stopLoss);
    if (missingSl) return rejected(missingSl.code, missingSl.message);

    const tpId = namedId(extra.takeProfitOrderId, `${order.orderId}:tp`);
    const slId = namedId(extra.stopLossOrderId, `${order.orderId}:sl`);
    const entry = orig.call(this, baseEntry(extra), now);
    if (!entry.accepted) return entry;

    of(this).set(order.orderId, {
      entryId: order.orderId,
      takeProfit: takeProfit as Amount,
      stopLoss: stopLoss as Amount,
      tpId,
      slId,
      side: extra.side,
      qty: extra.qty,
      accountId: extra.accountId,
      tif: extra.tif,
    });
    return restExitsForFills(this, orig, entry, now);
  };
}

installBracket(OrderBook);
