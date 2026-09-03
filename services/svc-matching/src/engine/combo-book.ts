/**
 * Combo book (PTX-M11-R04 / CARD E2 + H4).
 * Named legs + ratios rest and match as one instrument. Do not rest two options independently and call it a combo.
 * Incomplete combo keeps A8 refuse. Hitch wraps OrderBook.submit after option so this wrap is outermost.
 */
import { parseAmount, type Amount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import { comboDisagreesRefuse, comboIdentity, comboIntentRefuse, readRatio, wantsCombo } from './option-combo.js';
import type { CancelReason, CancelResult, ComboLeg, EngineOrder, OrderSide, SubmitResult } from './types.js';

const FLAG = Symbol.for('intafaced.matching.combo-book');

export type ComboRestLeg = {
  readonly name: string;
  readonly ratio: Amount;
};

export type ComboRest = {
  readonly orderId: string;
  readonly identity: string;
  readonly legs: readonly ComboRestLeg[];
};

const rests = new WeakMap<OrderBook, Map<string, ComboRest>>();

function of(book: OrderBook): Map<string, ComboRest> {
  let rows = rests.get(book);
  if (!rows) {
    rows = new Map();
    rests.set(book, rows);
  }
  return rows;
}

function remember(book: OrderBook, orderId: string, legs: readonly ComboLeg[], identity: string): void {
  of(book).set(orderId, {
    orderId,
    identity,
    legs: legs.map((leg) => ({
      name: (leg.name ?? '').trim(),
      ratio: readRatio(leg) as Amount,
    })),
  });
}

function forget(book: OrderBook, orderId: string): void {
  rests.get(book)?.delete(orderId);
}

export function comboRestOf(book: OrderBook, orderId: string): ComboRest | undefined {
  return rests.get(book)?.get(orderId);
}

function crossesLevel(side: OrderSide, limitPrice: Amount | null, levelPrice: Amount): boolean {
  if (limitPrice === null) return true;
  return side === 'buy' ? levelPrice <= limitPrice : levelPrice >= limitPrice;
}

function liveIds(book: OrderBook): Set<string> {
  const state = book.toState();
  return new Set([
    ...state.bids.flatMap((level) => level.orders.map((order) => order.orderId)),
    ...state.asks.flatMap((level) => level.orders.map((order) => order.orderId)),
  ]);
}

/** Rest that a take would print. Same named legs+ratios combo, or refuse. Never invent a match. */
export function takeComboDisagrees(
  book: OrderBook,
  order: { readonly side: OrderSide; readonly price: Amount | null },
  incomingIdentity: string | null,
): ReturnType<typeof comboDisagreesRefuse> | null {
  const rows = rests.get(book);
  const state = book.toState();
  const opposite = order.side === 'buy' ? state.asks : state.bids;
  for (const level of opposite) {
    const levelPrice = parseAmount(level.price);
    if (!crossesLevel(order.side, order.price, levelPrice)) break;
    for (const rest of level.orders) {
      const rec = rows?.get(rest.orderId);
      if (incomingIdentity === null) {
        if (rec) return comboDisagreesRefuse();
        continue;
      }
      if (!rec || rec.identity !== incomingIdentity) return comboDisagreesRefuse();
    }
  }
  return null;
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

function forgetFilled(book: OrderBook, result: SubmitResult): void {
  const live = liveIds(book);
  for (const fill of result.fills) {
    if (!live.has(fill.makerOrderId)) forget(book, fill.makerOrderId);
    if (!live.has(fill.takerOrderId)) forget(book, fill.takerOrderId);
  }
}

export function installComboBook(ctor: typeof OrderBook = OrderBook): void {
  const proto = ctor.prototype as {
    submit: (order: EngineOrder, now?: Date | null) => SubmitResult;
    cancel: (orderId: string, reason?: CancelReason) => CancelResult;
    [FLAG]?: true;
  };
  if (proto[FLAG]) return;
  proto[FLAG] = true;

  const orig = proto.submit;
  const origCancel = proto.cancel;
  proto.cancel = function (this: OrderBook, orderId: string, reason?: CancelReason) {
    const result = origCancel.call(this, orderId, reason);
    if (result.cancellation) forget(this, orderId);
    return result;
  };
  proto.submit = function (this: OrderBook, order: EngineOrder, now?: Date | null) {
    const incomplete = wantsCombo(order) ? comboIntentRefuse(order) : null;
    if (incomplete) return orig.call(this, order, now);
    const incomingCombo = wantsCombo(order);
    const identity = incomingCombo ? comboIdentity(order.legs as readonly ComboLeg[]) : null;
    const disagrees = takeComboDisagrees(this, order, identity);
    if (disagrees) return rejected(disagrees.code, disagrees.message);
    // One EngineOrder, one rest, one match. Never loop submit per leg. Never mint a second option orderId.
    const result = orig.call(this, order, now);
    if (!result.accepted) return result;
    forgetFilled(this, result);
    if (incomingCombo && result.resting) {
      remember(this, result.resting.orderId, order.legs as readonly ComboLeg[], identity as string);
    }
    return result;
  };
}

try {
  installComboBook();
} catch {
  queueMicrotask(() => installComboBook());
}
