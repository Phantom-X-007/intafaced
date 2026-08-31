/**
 * Option through matching. Rest as a limit on the public book.
 * Take against a resting option with the same strike and expiry.
 * Refuse if strike or expiry is missing or disagrees. The engine does not invent a mark.
 */
import { ZERO, parseAmount, type Amount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import type { EngineOrder, OrderSide, SubmitResult } from './types.js';

export const STRIKE_MISSING = 'missing_strike' as const;
export const EXPIRY_MISSING = 'missing_expiry' as const;
export const STRIKE_DISAGREES = 'strike_disagrees' as const;
export const EXPIRY_DISAGREES = 'expiry_disagrees' as const;

export type OptionRefuse =
  | typeof STRIKE_MISSING
  | typeof EXPIRY_MISSING
  | typeof STRIKE_DISAGREES
  | typeof EXPIRY_DISAGREES;

const FLAG = Symbol.for('intafaced.matching.option');

type OptionLive = { readonly strike: Amount; readonly expiry: string };
const live = new WeakMap<OrderBook, Map<string, OptionLive>>();

export function wantsOption(order: {
  readonly type?: string;
  readonly strike?: Amount | null;
  readonly expiry?: string | null;
}): boolean {
  return order.type === 'option' || order.strike !== undefined || order.expiry !== undefined;
}

/** Caller strike. Null/zero is missing — never invent from last, mid, best, or mark. */
export function readStrike(order: { readonly strike?: Amount | null }): Amount | null {
  if (order.strike === undefined || order.strike === null || order.strike <= ZERO) return null;
  return order.strike;
}

/** Caller expiry. Null/blank is missing — never invent. */
export function readExpiry(order: { readonly expiry?: string | null }): string | null {
  if (order.expiry === undefined || order.expiry === null) return null;
  const expiry = order.expiry.trim();
  if (expiry.length === 0) return null;
  return expiry;
}

export function strikeRefuse(
  strike: Amount | null,
): { readonly code: typeof STRIKE_MISSING; readonly message: string } | null {
  if (strike !== null) return null;
  return {
    code: STRIKE_MISSING,
    message: 'an option requires a strike; the engine does not invent a strike',
  };
}

export function expiryRefuse(
  expiry: string | null,
): { readonly code: typeof EXPIRY_MISSING; readonly message: string } | null {
  if (expiry !== null) return null;
  return {
    code: EXPIRY_MISSING,
    message: 'an option requires an expiry; the engine does not invent an expiry',
  };
}

function crossesLevel(side: OrderSide, limitPrice: Amount, levelPrice: Amount): boolean {
  return side === 'buy' ? levelPrice <= limitPrice : levelPrice >= limitPrice;
}

function liveOf(book: OrderBook): Map<string, OptionLive> {
  let rows = live.get(book);
  if (!rows) {
    rows = new Map();
    live.set(book, rows);
  }
  return rows;
}

/** Rest that a take would print. Same strike+expiry option, or refuse. Never invent a match. */
export function takeDisagrees(
  book: OrderBook,
  order: { readonly side: OrderSide; readonly price: Amount },
  strike: Amount,
  expiry: string,
): { readonly code: typeof STRIKE_DISAGREES | typeof EXPIRY_DISAGREES; readonly message: string } | null {
  const rows = live.get(book);
  const state = book.toState();
  const opposite = order.side === 'buy' ? state.asks : state.bids;
  for (const level of opposite) {
    const levelPrice = parseAmount(level.price);
    if (!crossesLevel(order.side, order.price, levelPrice)) break;
    for (const rest of level.orders) {
      const rec = rows?.get(rest.orderId);
      if (!rec) {
        return {
          code: STRIKE_DISAGREES,
          message: 'an option takes a resting option with the same strike; the engine does not invent a match',
        };
      }
      if (rec.strike !== strike) {
        return {
          code: STRIKE_DISAGREES,
          message: 'an option takes a resting option with the same strike; the engine does not invent a match',
        };
      }
      if (rec.expiry !== expiry) {
        return {
          code: EXPIRY_DISAGREES,
          message: 'an option takes a resting option with the same expiry; the engine does not invent a match',
        };
      }
    }
  }
  return null;
}

function rejected(
  code: SubmitResult['rejected'] extends infer R ? (R extends { code: infer C } ? C : never) : never,
  message: string,
): SubmitResult {
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

function remember(book: OrderBook, orderId: string, rec: OptionLive): void {
  liveOf(book).set(orderId, rec);
}

export function installOption(ctor: typeof OrderBook): void {
  const proto = ctor.prototype as {
    submit: (order: EngineOrder, now?: Date | null) => SubmitResult;
    [FLAG]?: true;
  };
  if (proto[FLAG]) return;
  proto[FLAG] = true;

  const orig = proto.submit;
  proto.submit = function (this: OrderBook, order: EngineOrder, now?: Date | null) {
    if (!wantsOption(order)) return orig.call(this, order, now);
    const strike = readStrike(order);
    const missingStrike = strikeRefuse(strike);
    if (missingStrike) return rejected(missingStrike.code, missingStrike.message);
    const expiry = readExpiry(order);
    const missingExpiry = expiryRefuse(expiry);
    if (missingExpiry) return rejected(missingExpiry.code, missingExpiry.message);
    const price = order.price;
    if (price === null || price <= ZERO) {
      return rejected('invalid_price', 'an option rests as a limit; the engine does not invent a mark');
    }
    const disagrees = takeDisagrees(this, { side: order.side, price }, strike as Amount, expiry as string);
    if (disagrees) return rejected(disagrees.code, disagrees.message);
    const result = orig.call(
      this,
      {
        ...order,
        type: 'limit',
        price,
        strike,
        expiry,
      },
      now,
    );
    if (result.accepted && result.resting) {
      remember(this, order.orderId, { strike: strike as Amount, expiry: expiry as string });
    }
    return result;
  };
}

installOption(OrderBook);
