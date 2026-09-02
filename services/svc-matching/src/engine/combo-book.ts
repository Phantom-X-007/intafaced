/**
 * Combo book (PTX-M11-R04 / CARD E2).
 * Named legs + ratios rest as one instrument. Do not rest two options independently and call it a combo.
 * Incomplete combo keeps A8 refuse. Hitch wraps OrderBook.submit after option so this wrap is outermost.
 */
import type { Amount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import './option.js';
import { comboIntentRefuse, readRatio, wantsCombo } from './option-combo.js';
import type { ComboLeg, EngineOrder, SubmitResult } from './types.js';

const FLAG = Symbol.for('intafaced.matching.combo-book');

export type ComboRestLeg = {
  readonly name: string;
  readonly ratio: Amount;
};

export type ComboRest = {
  readonly orderId: string;
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

function remember(book: OrderBook, orderId: string, legs: readonly ComboLeg[]): void {
  of(book).set(orderId, {
    orderId,
    legs: legs.map((leg) => ({
      name: (leg.name ?? '').trim(),
      ratio: readRatio(leg) as Amount,
    })),
  });
}

export function comboRestOf(book: OrderBook, orderId: string): ComboRest | undefined {
  return rests.get(book)?.get(orderId);
}

export function installComboBook(ctor: typeof OrderBook = OrderBook): void {
  const proto = ctor.prototype as {
    submit: (order: EngineOrder, now?: Date | null) => SubmitResult;
    [FLAG]?: true;
  };
  if (proto[FLAG]) return;
  proto[FLAG] = true;

  const orig = proto.submit;
  proto.submit = function (this: OrderBook, order: EngineOrder, now?: Date | null) {
    if (!wantsCombo(order) || comboIntentRefuse(order) !== null) {
      return orig.call(this, order, now);
    }
    // One EngineOrder, one rest. Never loop submit per leg. Never mint a second option orderId.
    const result = orig.call(this, order, now);
    if (result.accepted && result.resting) {
      remember(this, result.resting.orderId, order.legs as readonly ComboLeg[]);
    }
    return result;
  };
}

try {
  installComboBook();
} catch {
  queueMicrotask(() => installComboBook());
}
