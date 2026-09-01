/**
 * Option through matching. Rest as a limit on the public book.
 * Take against a resting option with the same strike and expiry.
 * Exercise a long option at strike. Assign the short when that long is exercised.
 * Cover a short option after assignment.
 * Expire a resting option at expiry. Unfilled remainder leaves the book.
 * Cancel a resting option. Unfilled remainder leaves the book.
 * Amend qty on a resting option. Refuse if strike, expiry, or qty is missing.
 * Amend price on a resting option. Refuse if strike, expiry, or price is missing.
 * Replace a resting option (price and qty together). Refuse if strike, expiry, price, or qty is missing.
 * Refuse if strike or expiry is missing or disagrees.
 * A combo without named legs/ratios refuses. Missing strike/expiry/ratio on a combo rest refuses.
 * The engine does not invent a mark or a combo book.
 */
import { ZERO, formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import { comboIntentRefuse } from './option-combo.js';
import type { AmendResult, CancelledRef, EngineAmend, EngineOrder, Fill, OrderSide, SubmitResult } from './types.js';

export const STRIKE_MISSING = 'missing_strike' as const;
export const EXPIRY_MISSING = 'missing_expiry' as const;
export const PRICE_MISSING = 'missing_price' as const;
export const STRIKE_DISAGREES = 'strike_disagrees' as const;
export const EXPIRY_DISAGREES = 'expiry_disagrees' as const;

export type OptionRefuse =
  typeof STRIKE_MISSING | typeof EXPIRY_MISSING | typeof PRICE_MISSING | typeof STRIKE_DISAGREES | typeof EXPIRY_DISAGREES;

const FLAG = Symbol.for('intafaced.matching.option');

type OptionLive = { readonly strike: Amount; readonly expiry: string };
type OptionLot = { qty: Amount; orderId: string };
type OptionOpen = {
  readonly rest: Map<string, OptionLive>;
  readonly open: Map<string, Map<string, OptionLot>>;
  readonly assigned: Map<string, Map<string, OptionLot>>;
};

const books = new WeakMap<OrderBook, OptionOpen>();

export function wantsOption(order: { readonly type?: string; readonly strike?: Amount | null; readonly expiry?: string | null }): boolean {
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

export function strikeRefuse(strike: Amount | null): { readonly code: typeof STRIKE_MISSING; readonly message: string } | null {
  if (strike !== null) return null;
  return {
    code: STRIKE_MISSING,
    message: 'an option requires a strike; the engine does not invent a strike',
  };
}

export function expiryRefuse(expiry: string | null): { readonly code: typeof EXPIRY_MISSING; readonly message: string } | null {
  if (expiry !== null) return null;
  return {
    code: EXPIRY_MISSING,
    message: 'an option requires an expiry; the engine does not invent an expiry',
  };
}

export function priceRefuse(price: Amount | null): { readonly code: typeof PRICE_MISSING; readonly message: string } | null {
  if (price !== null) return null;
  return {
    code: PRICE_MISSING,
    message: 'an option amend requires a price; the engine does not invent a mark',
  };
}

export function wantsExercise(order: { readonly exercise?: boolean }): boolean {
  return order.exercise === true;
}

export function wantsCover(order: { readonly cover?: boolean }): boolean {
  return order.cover === true;
}

export function wantsCancel(order: { readonly cancel?: boolean }): boolean {
  return order.cancel === true;
}

export function wantsAmend(order: { readonly amend?: boolean }): boolean {
  return order.amend === true;
}

export function wantsReplace(order: { readonly replace?: boolean }): boolean {
  return order.replace === true;
}

function crossesLevel(side: OrderSide, limitPrice: Amount, levelPrice: Amount): boolean {
  return side === 'buy' ? levelPrice <= limitPrice : levelPrice >= limitPrice;
}

function of(book: OrderBook): OptionOpen {
  let rows = books.get(book);
  if (!rows) {
    rows = { rest: new Map(), open: new Map(), assigned: new Map() };
    books.set(book, rows);
  }
  return rows;
}

function contractKey(strike: Amount, expiry: string): string {
  return `${formatAmount(strike)}|${expiry}`;
}

function bump(open: Map<string, Map<string, OptionLot>>, key: string, accountId: string, orderId: string, delta: Amount): void {
  let lots = open.get(key);
  if (!lots) {
    lots = new Map();
    open.set(key, lots);
  }
  const prev = lots.get(accountId);
  const qty = (prev?.qty ?? ZERO) + delta;
  if (qty === ZERO) lots.delete(accountId);
  else lots.set(accountId, { qty, orderId });
  if (lots.size === 0) open.delete(key);
}

function applyFills(open: Map<string, Map<string, OptionLot>>, fills: readonly Fill[], strike: Amount, expiry: string): void {
  const key = contractKey(strike, expiry);
  for (const fill of fills) {
    const signed = fill.takerSide === 'buy' ? fill.qty : -fill.qty;
    bump(open, key, fill.takerAccountId, fill.takerOrderId, signed);
    bump(open, key, fill.makerAccountId, fill.makerOrderId, -signed);
  }
}

/** Rest that a take would print. Same strike+expiry option, or refuse. Never invent a match. */
export function takeDisagrees(
  book: OrderBook,
  order: { readonly side: OrderSide; readonly price: Amount },
  strike: Amount,
  expiry: string,
): { readonly code: typeof STRIKE_DISAGREES | typeof EXPIRY_DISAGREES; readonly message: string } | null {
  const rows = books.get(book)?.rest;
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

function amendRefused(
  orderId: string,
  code: AmendResult['rejected'] extends infer R ? (R extends { code: infer C } ? C : never) : never,
  message: string,
): AmendResult {
  return {
    accepted: false,
    orderId,
    sequence: null,
    version: null,
    priority: null,
    fills: [],
    resting: null,
    rejected: { code, message },
    cancellations: [],
    triggered: [],
  };
}

function remember(book: OrderBook, orderId: string, rec: OptionLive): void {
  of(book).rest.set(orderId, rec);
}

type AssignClip = { readonly accountId: string; readonly orderId: string; readonly qty: Amount };

/** FIFO shorts on this contract. Null when there is not enough short — never invent a writer. */
function assignShorts(lots: Map<string, OptionLot> | undefined, holderId: string, qty: Amount): AssignClip[] | null {
  if (!lots) return null;
  let need = qty;
  const clips: AssignClip[] = [];
  for (const [accountId, lot] of lots) {
    if (accountId === holderId) continue;
    if (lot.qty >= ZERO) continue;
    const avail = -lot.qty;
    const clip = avail < need ? avail : need;
    clips.push({ accountId, orderId: lot.orderId, qty: clip });
    need -= clip;
    if (need === ZERO) break;
  }
  if (need !== ZERO) return null;
  return clips;
}

function dueAt(expiry: string, now: Date): boolean {
  const ms = Date.parse(expiry);
  return Number.isFinite(ms) && ms <= now.getTime();
}

/** Pull resting options whose expiry has arrived. Remainder leaves. Never invent an expiry or a mark. */
function expireDueOptions(book: OrderBook, now?: Date | null): CancelledRef[] {
  if (now == null) return [];
  const rows = of(book).rest;
  const due = [...rows.entries()]
    .filter(([, rec]) => dueAt(rec.expiry, now))
    .map(([orderId]) => orderId)
    .sort();
  const out: CancelledRef[] = [];
  for (const orderId of due) {
    const result = book.cancel(orderId, 'expired');
    if (result.cancellation) {
      out.push(result.cancellation);
      rows.delete(orderId);
    }
  }
  return out;
}

function withExpired(result: SubmitResult, expired: readonly CancelledRef[]): SubmitResult {
  if (expired.length === 0) return result;
  return { ...result, cancellations: [...expired, ...result.cancellations] };
}

export function installOption(ctor: typeof OrderBook): void {
  const proto = ctor.prototype as {
    submit: (order: EngineOrder, now?: Date | null) => SubmitResult;
    cancel: (orderId: string, reason?: 'expired') => { cancellation: CancelledRef | null };
    amend: (cmd: EngineAmend) => AmendResult;
    [FLAG]?: true;
  };
  if (proto[FLAG]) return;
  proto[FLAG] = true;

  const orig = proto.submit;
  const origCancel = proto.cancel;
  const origAmend = proto.amend;
  proto.cancel = function (this: OrderBook, orderId: string, reason?: 'expired') {
    const result = origCancel.call(this, orderId, reason);
    if (result.cancellation) of(this).rest.delete(orderId);
    return result;
  };
  proto.amend = function (this: OrderBook, cmd: EngineAmend) {
    const rec = of(this).rest.get(cmd.orderId);
    if (!rec) return origAmend.call(this, cmd);
    const extra = cmd as EngineAmend & {
      readonly strike?: Amount | null;
      readonly expiry?: string | null;
      readonly mark?: Amount | null;
      readonly price?: Amount | null;
      readonly replace?: boolean;
    };
    const strike = readStrike(extra);
    const missingStrike = strikeRefuse(strike);
    if (missingStrike) return amendRefused(cmd.orderId, missingStrike.code, missingStrike.message);
    const expiry = readExpiry(extra);
    const missingExpiry = expiryRefuse(expiry);
    if (missingExpiry) return amendRefused(cmd.orderId, missingExpiry.code, missingExpiry.message);
    const replacing = extra.replace === true;
    const priceGiven = extra.price !== undefined;
    const qtyGiven = extra.qty !== undefined;
    if (replacing || priceGiven) {
      const price = extra.price ?? null;
      const missingPrice = priceRefuse(price === null || price <= ZERO ? null : price);
      if (missingPrice) return amendRefused(cmd.orderId, missingPrice.code, missingPrice.message);
    }
    if (replacing || !priceGiven) {
      if (!qtyGiven || extra.qty <= ZERO) {
        return amendRefused(
          cmd.orderId,
          'invalid_qty',
          replacing
            ? 'an option replace requires a qty; the engine does not invent a mark'
            : 'an option amend requires a qty; the engine does not invent a mark',
        );
      }
    }
    if (qtyGiven && extra.qty <= ZERO) {
      return amendRefused(
        cmd.orderId,
        'invalid_qty',
        replacing
          ? 'an option replace requires a qty; the engine does not invent a mark'
          : 'an option amend requires a qty; the engine does not invent a mark',
      );
    }
    if (rec.strike !== strike) {
      return amendRefused(
        cmd.orderId,
        STRIKE_DISAGREES,
        'amend is a resting option with the same strike; the engine does not invent a mark',
      );
    }
    if (rec.expiry !== expiry) {
      return amendRefused(
        cmd.orderId,
        EXPIRY_DISAGREES,
        'amend is a resting option with the same expiry; the engine does not invent a mark',
      );
    }
    return origAmend.call(this, {
      orderId: cmd.orderId,
      expectedVersion: cmd.expectedVersion,
      ...(qtyGiven || replacing ? { qty: extra.qty } : {}),
      ...(priceGiven || replacing ? { price: extra.price as Amount } : {}),
      tif: cmd.tif,
      expireAt: cmd.expireAt,
    });
  };

  proto.submit = function (this: OrderBook, order: EngineOrder, now?: Date | null) {
    const comboed = comboIntentRefuse(order);
    if (comboed) return rejected(comboed.code, comboed.message);
    if (wantsCover(order)) {
      const strike = readStrike(order);
      const missingStrike = strikeRefuse(strike);
      if (missingStrike) return rejected(missingStrike.code, missingStrike.message);
      const expiry = readExpiry(order);
      const missingExpiry = expiryRefuse(expiry);
      if (missingExpiry) return rejected(missingExpiry.code, missingExpiry.message);
      if (order.qty <= ZERO) {
        return rejected('invalid_qty', 'an option cover requires a qty; the engine does not invent a mark');
      }
      const book = this as OrderBook & {
        nextSequence: () => number;
        addPosition: (accountId: string, delta: Amount) => void;
      };
      const rows = of(this);
      const key = contractKey(strike as Amount, expiry as string);
      const assigned = rows.assigned.get(key)?.get(order.accountId);
      if (!assigned || assigned.qty <= ZERO || assigned.qty < order.qty) {
        return rejected('position_flat', 'cover is a short option after assignment; the engine does not invent a mark');
      }
      const expired = expireDueOptions(this, now);
      const sequence = book.nextSequence();
      const qty = order.qty;
      bump(rows.assigned, key, order.accountId, assigned.orderId, -qty);
      return withExpired(
        {
          accepted: true,
          sequence,
          fills: [
            {
              sequence,
              makerOrderId: assigned.orderId,
              makerAccountId: order.accountId,
              takerOrderId: order.orderId,
              takerAccountId: order.accountId,
              takerSide: 'buy',
              price: strike as Amount,
              qty,
            },
          ],
          resting: null,
          cancellations: [],
          triggered: [],
        },
        expired,
      );
    }
    if (wantsExercise(order)) {
      const strike = readStrike(order);
      const missingStrike = strikeRefuse(strike);
      if (missingStrike) return rejected(missingStrike.code, missingStrike.message);
      const expiry = readExpiry(order);
      const missingExpiry = expiryRefuse(expiry);
      if (missingExpiry) return rejected(missingExpiry.code, missingExpiry.message);
      if (order.qty <= ZERO) {
        return rejected('invalid_qty', 'an option exercise requires a qty; the engine does not invent a mark');
      }
      const book = this as OrderBook & {
        nextSequence: () => number;
        addPosition: (accountId: string, delta: Amount) => void;
      };
      const rows = of(this);
      const key = contractKey(strike as Amount, expiry as string);
      const lots = rows.open.get(key);
      const long = lots?.get(order.accountId);
      if (!long || long.qty <= ZERO || long.qty < order.qty) {
        return rejected('position_flat', 'exercise is a long option; the engine does not invent a mark');
      }
      const clips = assignShorts(lots, order.accountId, order.qty);
      if (!clips) {
        return rejected('position_flat', 'exercise assigns a short option; the engine does not invent a mark');
      }
      const expired = expireDueOptions(this, now);
      const sequence = book.nextSequence();
      const fills: Fill[] = [];
      for (const clip of clips) {
        fills.push({
          sequence,
          makerOrderId: clip.orderId,
          makerAccountId: clip.accountId,
          takerOrderId: order.orderId,
          takerAccountId: order.accountId,
          takerSide: 'sell',
          price: strike as Amount,
          qty: clip.qty,
        });
        book.addPosition(clip.accountId, clip.qty);
        bump(rows.open, key, clip.accountId, clip.orderId, clip.qty);
        bump(rows.assigned, key, clip.accountId, clip.orderId, clip.qty);
      }
      book.addPosition(order.accountId, -order.qty);
      bump(rows.open, key, order.accountId, order.orderId, -order.qty);
      return withExpired(
        {
          accepted: true,
          sequence,
          fills,
          resting: null,
          cancellations: [],
          triggered: [],
        },
        expired,
      );
    }
    if (wantsCancel(order as { cancel?: boolean })) {
      const strike = readStrike(order);
      const missingStrike = strikeRefuse(strike);
      if (missingStrike) return rejected(missingStrike.code, missingStrike.message);
      const expiry = readExpiry(order);
      const missingExpiry = expiryRefuse(expiry);
      if (missingExpiry) return rejected(missingExpiry.code, missingExpiry.message);
      const rec = of(this).rest.get(order.orderId);
      if (!rec) {
        return rejected('order_not_found', 'cancel is a resting option; the engine does not invent a mark');
      }
      if (rec.strike !== strike) {
        return rejected(STRIKE_DISAGREES, 'cancel is a resting option with the same strike; the engine does not invent a mark');
      }
      if (rec.expiry !== expiry) {
        return rejected(EXPIRY_DISAGREES, 'cancel is a resting option with the same expiry; the engine does not invent a mark');
      }
      const pulled = origCancel.call(this, order.orderId, 'requested');
      of(this).rest.delete(order.orderId);
      if (!pulled.cancellation) {
        return rejected('order_not_found', 'cancel is a resting option; the engine does not invent a mark');
      }
      return {
        accepted: true,
        sequence: pulled.cancellation.sequence,
        fills: [],
        resting: null,
        cancellations: [pulled.cancellation],
        triggered: [],
      };
    }
    if (!wantsOption(order)) {
      const expired = expireDueOptions(this, now);
      return withExpired(orig.call(this, order, now), expired);
    }
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
    const expired = expireDueOptions(this, now);
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
    if (result.accepted) {
      applyFills(of(this).open, result.fills, strike as Amount, expiry as string);
      if (result.resting) {
        remember(this, order.orderId, { strike: strike as Amount, expiry: expiry as string });
        if (now != null && dueAt(expiry as string, now)) {
          const pulled = this.cancel(order.orderId, 'expired');
          of(this).rest.delete(order.orderId);
          return withExpired(
            {
              ...result,
              resting: null,
              cancellations: [...result.cancellations, ...(pulled.cancellation ? [pulled.cancellation] : [])],
            },
            expired,
          );
        }
      }
    }
    return withExpired(result, expired);
  };
}

installOption(OrderBook);
