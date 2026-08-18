import { describe, expect, it } from 'vitest';
import { div, formatAmount, mul, parseAmount, sum, type Amount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import type { EngineOrder, EngineOrderType, OrderSide, SubmitResult, TimeInForce } from './types.js';

/**
 * The order book, adversarially (§5.1, §5.4).
 *
 * Every price and quantity in this file is a decimal string parsed into an
 * `Amount`. If a test ever needs a JS number to express a price, the test is
 * wrong before the code is.
 */

const A = parseAmount;

let ids = 0;
function nextId(prefix = 'ord'): string {
  ids += 1;
  return `${prefix}-${String(ids).padStart(4, '0')}`;
}

interface OrderSpec {
  id?: string;
  account?: string;
  type?: EngineOrderType;
  side: OrderSide;
  qty: string;
  price?: string;
  stopPrice?: string;
  tif?: TimeInForce;
}

function order(spec: OrderSpec): EngineOrder {
  const type = spec.type ?? (spec.price === undefined ? 'market' : 'limit');
  return {
    orderId: spec.id ?? nextId(),
    accountId: spec.account ?? 'acct-default',
    type,
    side: spec.side,
    qty: A(spec.qty),
    price: spec.price === undefined ? null : A(spec.price),
    stopPrice: spec.stopPrice === undefined ? null : A(spec.stopPrice),
    tif: spec.tif ?? 'GTC',
  };
}

/** Seed resting liquidity without asserting on it — every helper submit must be accepted. */
function seed(book: OrderBook, spec: OrderSpec): SubmitResult {
  const result = book.submit(order(spec));
  expect(result.accepted, `seed order rejected: ${result.rejected?.code}`).toBe(true);
  return result;
}

const fillPrices = (result: SubmitResult): string[] => result.fills.map((f) => formatAmount(f.price));
const fillQtys = (result: SubmitResult): string[] => result.fills.map((f) => formatAmount(f.qty));

// ── Price-time priority ─────────────────────────────────────────────────────

describe('price-time priority', () => {
  it('fills the earliest order first when prices are equal', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { id: 'first', account: 'a', side: 'buy', qty: '1', price: '100' });
    seed(book, { id: 'second', account: 'b', side: 'buy', qty: '1', price: '100' });

    const result = book.submit(order({ account: 'taker', side: 'sell', qty: '1', price: '100' }));

    expect(result.fills).toHaveLength(1);
    expect(result.fills[0]!.makerOrderId).toBe('first');
  });

  it('fills the better price first regardless of arrival order', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { id: 'worse', account: 'a', side: 'buy', qty: '1', price: '99' });
    seed(book, { id: 'better', account: 'b', side: 'buy', qty: '1', price: '101' });

    const result = book.submit(order({ account: 'taker', side: 'sell', qty: '2', price: '99' }));

    expect(result.fills.map((f) => f.makerOrderId)).toEqual(['better', 'worse']);
    expect(fillPrices(result)).toEqual(['101', '99']);
  });

  it('ranks the ask side the other way — lowest price is best', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { account: 'a', side: 'sell', qty: '1', price: '105' });
    seed(book, { account: 'b', side: 'sell', qty: '1', price: '103' });
    seed(book, { account: 'c', side: 'sell', qty: '1', price: '104' });

    expect(formatAmount(book.bestAsk()!)).toBe('103');
    const result = book.submit(order({ account: 'taker', side: 'buy', qty: '3', price: '105' }));
    expect(fillPrices(result)).toEqual(['103', '104', '105']);
  });

  it('a resting order keeps its place in the queue after a partial fill', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { id: 'front', account: 'a', side: 'sell', qty: '5', price: '100' });
    seed(book, { id: 'back', account: 'b', side: 'sell', qty: '5', price: '100' });

    book.submit(order({ account: 'taker', side: 'buy', qty: '2', price: '100' }));
    const second = book.submit(order({ account: 'taker2', side: 'buy', qty: '4', price: '100' }));

    // 3 left on `front` before `back` gets anything.
    expect(second.fills.map((f) => f.makerOrderId)).toEqual(['front', 'back']);
    expect(fillQtys(second)).toEqual(['3', '1']);
  });
});

// ── Resting, partials, and levels ───────────────────────────────────────────

describe('resting and partial fills', () => {
  it('rests a non-crossing limit order and reports it', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(order({ id: 'maker', account: 'a', side: 'buy', qty: '2.5', price: '99.5' }));

    expect(result.accepted).toBe(true);
    expect(result.fills).toHaveLength(0);
    expect(result.resting).toMatchObject({ kind: 'book', orderId: 'maker' });
    expect(formatAmount(result.resting!.remaining)).toBe('2.5');
    expect(formatAmount(book.bestBid()!)).toBe('99.5');
  });

  it('fills what it can and rests the exact remainder', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { account: 'a', side: 'sell', qty: '3', price: '100' });

    const result = book.submit(order({ id: 'taker', account: 'b', side: 'buy', qty: '10', price: '100' }));

    expect(fillQtys(result)).toEqual(['3']);
    expect(formatAmount(result.resting!.remaining)).toBe('7');
    expect(book.bestAsk()).toBeNull();
    expect(formatAmount(book.bestBid()!)).toBe('100');
  });

  it('removes a price level that empties exactly, and the next level becomes best', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { account: 'a', side: 'buy', qty: '2', price: '100' });
    seed(book, { account: 'a', side: 'buy', qty: '3', price: '99' });

    const result = book.submit(order({ account: 'taker', side: 'sell', qty: '2', price: '100' }));

    expect(fillQtys(result)).toEqual(['2']);
    expect(formatAmount(book.bestBid()!)).toBe('99');
    // The emptied level must not survive as a zero-quantity ghost in the depth feed.
    expect(book.depth().bids).toEqual([['99', '3']]);
  });

  it('empties two levels exactly in one sweep', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { account: 'a', side: 'buy', qty: '2', price: '100' });
    seed(book, { account: 'a', side: 'buy', qty: '3', price: '99' });

    const result = book.submit(order({ account: 'taker', side: 'sell', qty: '5', price: '99' }));

    expect(fillQtys(result)).toEqual(['2', '3']);
    expect(book.bestBid()).toBeNull();
    expect(book.depth().bids).toEqual([]);
  });

  it('carries 18 decimal places through a fill without losing a unit', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { account: 'a', side: 'sell', qty: '0.000000000000000003', price: '0.000000000000000001' });

    const result = book.submit(order({ account: 'b', side: 'buy', qty: '0.000000000000000002', price: '0.000000000000000001' }));

    expect(fillQtys(result)).toEqual(['0.000000000000000002']);
    expect(fillPrices(result)).toEqual(['0.000000000000000001']);
    expect(book.depth().asks).toEqual([['0.000000000000000001', '0.000000000000000001']]);
  });
});

// ── Market orders ───────────────────────────────────────────────────────────

describe('market orders', () => {
  it('into an empty book: accepted, nothing filled, whole quantity cancelled', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(order({ id: 'lonely', account: 'a', side: 'buy', qty: '5' }));

    expect(result.accepted).toBe(true);
    expect(result.fills).toHaveLength(0);
    // It never rests — a market order with nothing to take is a cancel, not a quote.
    expect(result.resting).toBeNull();
    expect(result.cancellations).toHaveLength(1);
    expect(result.cancellations[0]!.reason).toBe('market_remainder');
    expect(formatAmount(result.cancellations[0]!.remainingQty)).toBe('5');
    expect(book.depth().bids).toEqual([]);
  });

  it('exhausts the book and cancels what it could not take', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { account: 'mm', side: 'sell', qty: '1', price: '100' });
    seed(book, { account: 'mm', side: 'sell', qty: '2', price: '101' });

    const result = book.submit(order({ account: 'taker', side: 'buy', qty: '10' }));

    expect(fillQtys(result)).toEqual(['1', '2']);
    expect(formatAmount(result.cancellations[0]!.remainingQty)).toBe('7');
    expect(book.bestAsk()).toBeNull();
  });

  it('crosses multiple levels at each level price, and the weighted average is exact', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { account: 'mm', side: 'sell', qty: '1', price: '100' });
    seed(book, { account: 'mm', side: 'sell', qty: '2', price: '101' });
    seed(book, { account: 'mm', side: 'sell', qty: '3', price: '102' });

    const result = book.submit(order({ account: 'taker', side: 'buy', qty: '5' }));

    expect(fillPrices(result)).toEqual(['100', '101', '102']);
    expect(fillQtys(result)).toEqual(['1', '2', '2']);

    const notional: Amount = sum(result.fills.map((f) => mul(f.price, f.qty)));
    const quantity: Amount = sum(result.fills.map((f) => f.qty));
    expect(formatAmount(notional)).toBe('506');
    expect(formatAmount(quantity)).toBe('5');
    // 506 / 5 = 101.2 exactly. A float VWAP here would read 101.19999999999999.
    expect(formatAmount(div(notional, quantity))).toBe('101.2');

    // One unit of depth survives at the top level, untouched.
    expect(book.depth().asks).toEqual([['102', '1']]);
  });

  it('ignores GTC on a market order — it can never rest', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(order({ account: 'a', side: 'sell', qty: '1', tif: 'GTC' }));

    expect(result.accepted).toBe(true);
    expect(result.resting).toBeNull();
    expect(result.cancellations[0]!.reason).toBe('market_remainder');
  });
});

// ── Time in force ───────────────────────────────────────────────────────────

describe('time in force', () => {
  it('IOC fills what it can and cancels the remainder rather than resting', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { account: 'mm', side: 'sell', qty: '2', price: '100' });

    const result = book.submit(order({ id: 'ioc', account: 'taker', side: 'buy', qty: '5', price: '100', tif: 'IOC' }));

    expect(fillQtys(result)).toEqual(['2']);
    expect(result.resting).toBeNull();
    expect(result.cancellations).toHaveLength(1);
    expect(result.cancellations[0]!).toMatchObject({ orderId: 'ioc', reason: 'ioc_remainder' });
    expect(formatAmount(result.cancellations[0]!.remainingQty)).toBe('3');
    expect(book.bestBid()).toBeNull();
  });

  it('IOC that cannot touch the book at all cancels in full', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { account: 'mm', side: 'sell', qty: '2', price: '105' });

    const result = book.submit(order({ account: 'taker', side: 'buy', qty: '5', price: '100', tif: 'IOC' }));

    expect(result.accepted).toBe(true);
    expect(result.fills).toHaveLength(0);
    expect(formatAmount(result.cancellations[0]!.remainingQty)).toBe('5');
  });

  it('FOK rejects entirely when it cannot fill completely — not one unit trades', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { account: 'mm', side: 'sell', qty: '2', price: '100' });
    const before = book.serialize();

    const result = book.submit(order({ account: 'taker', side: 'buy', qty: '5', price: '100', tif: 'FOK' }));

    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe('fok_unfillable');
    expect(result.fills).toHaveLength(0);
    expect(result.cancellations).toHaveLength(0);
    // The rejection must be invisible in the book — including in the sequence counter.
    expect(book.serialize()).toBe(before);
  });

  it('FOK fills completely when the depth is there, across levels', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { account: 'mm', side: 'sell', qty: '2', price: '100' });
    seed(book, { account: 'mm', side: 'sell', qty: '3', price: '101' });

    const result = book.submit(order({ account: 'taker', side: 'buy', qty: '5', price: '101', tif: 'FOK' }));

    expect(result.accepted).toBe(true);
    expect(fillQtys(result)).toEqual(['2', '3']);
    expect(result.resting).toBeNull();
    expect(result.cancellations).toHaveLength(0);
  });

  it('FOK respects its limit price when deciding it cannot fill', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { account: 'mm', side: 'sell', qty: '2', price: '100' });
    seed(book, { account: 'mm', side: 'sell', qty: '3', price: '101' });

    const result = book.submit(order({ account: 'taker', side: 'buy', qty: '5', price: '100', tif: 'FOK' }));

    expect(result.rejected?.code).toBe('fok_unfillable');
  });

  it('post-only that would cross is rejected and never fills', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { account: 'mm', side: 'sell', qty: '2', price: '100' });
    const before = book.serialize();

    const result = book.submit(order({ account: 'taker', side: 'buy', qty: '1', price: '100', tif: 'PO' }));

    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe('post_only_would_cross');
    expect(result.fills).toHaveLength(0);
    expect(result.resting).toBeNull();
    expect(book.serialize()).toBe(before);
  });

  it('post-only rests when it stays behind the spread', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { account: 'mm', side: 'sell', qty: '2', price: '100' });

    const result = book.submit(order({ id: 'po', account: 'taker', side: 'buy', qty: '1', price: '99.99', tif: 'PO' }));

    expect(result.accepted).toBe(true);
    expect(result.resting).toMatchObject({ orderId: 'po', kind: 'book' });
    expect(formatAmount(book.bestBid()!)).toBe('99.99');
  });

  it('post-only on an order that cannot rest is refused rather than reinterpreted', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(order({ account: 'a', side: 'buy', qty: '1', tif: 'PO' }));
    expect(result.rejected?.code).toBe('invalid_tif');
  });
});

// ── Self-trade prevention ───────────────────────────────────────────────────

describe('self-trade prevention', () => {
  it('never lets one account be both sides of a fill', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { id: 'own', account: 'same', side: 'buy', qty: '1', price: '100' });

    const result = book.submit(order({ id: 'aggressor', account: 'same', side: 'sell', qty: '1', price: '100' }));

    expect(result.fills).toHaveLength(0);
    for (const fill of result.fills) expect(fill.makerAccountId).not.toBe(fill.takerAccountId);
  });

  it('pulls the resting order and keeps matching past it (cancel-oldest)', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { id: 'own', account: 'same', side: 'buy', qty: '1', price: '100' });
    seed(book, { id: 'other', account: 'stranger', side: 'buy', qty: '1', price: '100' });

    const result = book.submit(order({ id: 'aggressor', account: 'same', side: 'sell', qty: '2', price: '100' }));

    expect(result.fills.map((f) => f.makerOrderId)).toEqual(['other']);
    expect(result.cancellations.map((c) => [c.orderId, c.reason])).toEqual([['own', 'self_trade_prevention']]);
    // The unfilled unit rests on the opposite side; the level it emptied is gone.
    expect(formatAmount(result.resting!.remaining)).toBe('1');
    expect(book.bestBid()).toBeNull();
    expect(formatAmount(book.bestAsk()!)).toBe('100');
  });

  it('does not count its own liquidity when deciding whether a FOK can fill', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { id: 'own', account: 'same', side: 'sell', qty: '3', price: '100' });
    seed(book, { id: 'other', account: 'stranger', side: 'sell', qty: '1', price: '100' });
    const before = book.serialize();

    const result = book.submit(order({ account: 'same', side: 'buy', qty: '2', price: '100', tif: 'FOK' }));

    expect(result.rejected?.code).toBe('fok_unfillable');
    // And crucially: the FOK check must not have cancelled anything on the way.
    expect(book.serialize()).toBe(before);
  });

  it('prevention applies across price levels, not just the touch', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { id: 'own-100', account: 'same', side: 'buy', qty: '1', price: '100' });
    seed(book, { id: 'other-99', account: 'stranger', side: 'buy', qty: '1', price: '99' });
    seed(book, { id: 'own-98', account: 'same', side: 'buy', qty: '1', price: '98' });

    const result = book.submit(order({ account: 'same', side: 'sell', qty: '3', price: '98', tif: 'IOC' }));

    expect(result.fills.map((f) => f.makerOrderId)).toEqual(['other-99']);
    expect(result.cancellations.map((c) => c.orderId)).toEqual(['own-100', 'own-98', expect.any(String)]);
    expect(book.depth().bids).toEqual([]);
  });
});

// ── Stops ───────────────────────────────────────────────────────────────────

describe('stop orders', () => {
  /** Prime a book with resting asks and a last trade price of 100. */
  function primed(): OrderBook {
    const book = new OrderBook('BTC/USDT');
    seed(book, { account: 'mm', side: 'sell', qty: '2', price: '100' });
    seed(book, { account: 'mm', side: 'sell', qty: '10', price: '106' });
    const warmup = book.submit(order({ account: 'warmup', side: 'buy', qty: '2' }));
    expect(formatAmount(warmup.fills[0]!.price)).toBe('100');
    return book;
  }

  it('never triggers before the market has printed a price', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(order({ id: 'stop', account: 'a', type: 'stop', side: 'buy', qty: '1', stopPrice: '1' }));

    expect(result.accepted).toBe(true);
    expect(result.resting).toMatchObject({ kind: 'stop', orderId: 'stop' });
    expect(result.fills).toHaveLength(0);
  });

  it('rests in the stop book until a print reaches the trigger', () => {
    const book = primed();
    const resting = book.submit(order({ id: 'stop', account: 'b', type: 'stop', side: 'buy', qty: '3', stopPrice: '105' }));

    expect(resting.resting?.kind).toBe('stop');
    expect(resting.fills).toHaveLength(0);

    const trigger = book.submit(order({ account: 'c', side: 'buy', qty: '1' }));

    expect(fillPrices(trigger)).toEqual(['106']);
    expect(trigger.triggered).toHaveLength(1);
    expect(trigger.triggered[0]!.orderId).toBe('stop');
    expect(trigger.triggered[0]!.fills.map((f) => formatAmount(f.qty))).toEqual(['3']);
    expect(formatAmount(trigger.triggered[0]!.fills[0]!.price)).toBe('106');
  });

  it('a triggered stop-limit rests its remainder as an ordinary limit order', () => {
    const book = primed();
    book.submit(order({ id: 'sl', account: 'b', type: 'stop_limit', side: 'buy', qty: '20', price: '106', stopPrice: '105' }));

    const trigger = book.submit(order({ account: 'c', side: 'buy', qty: '1' }));
    const outcome = trigger.triggered[0]!;

    expect(outcome.fills.map((f) => formatAmount(f.qty))).toEqual(['9']);
    expect(outcome.resting).toMatchObject({ kind: 'book', orderId: 'sl' });
    expect(formatAmount(outcome.resting!.remaining)).toBe('11');
    expect(formatAmount(book.bestBid()!)).toBe('106');
  });

  it('a sell stop triggers on the way down', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { account: 'mm', side: 'buy', qty: '5', price: '100' });
    seed(book, { account: 'mm', side: 'buy', qty: '5', price: '90' });
    book.submit(order({ account: 'warmup', side: 'sell', qty: '5' })); // last = 100

    const resting = book.submit(order({ id: 'sl', account: 'b', type: 'stop', side: 'sell', qty: '2', stopPrice: '95' }));
    expect(resting.resting?.kind).toBe('stop');

    const trigger = book.submit(order({ account: 'c', side: 'sell', qty: '1' })); // prints 90
    expect(trigger.triggered.map((t) => t.orderId)).toEqual(['sl']);
  });

  it('cascades: a triggered stop prints a price that arms the next one', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { account: 'mm', side: 'sell', qty: '2', price: '100' });
    seed(book, { account: 'mm', side: 'sell', qty: '5', price: '110' });
    seed(book, { account: 'mm', side: 'sell', qty: '5', price: '120' });
    book.submit(order({ account: 'warmup', side: 'buy', qty: '2' })); // last = 100

    book.submit(order({ id: 'stop-a', account: 'x', type: 'stop', side: 'buy', qty: '5', stopPrice: '105' }));
    book.submit(order({ id: 'stop-b', account: 'y', type: 'stop', side: 'buy', qty: '5', stopPrice: '115' }));

    const trigger = book.submit(order({ account: 'c', side: 'buy', qty: '5' })); // prints 110

    expect(trigger.triggered.map((t) => t.orderId)).toEqual(['stop-a', 'stop-b']);
    expect(trigger.triggered[0]!.fills.map((f) => formatAmount(f.price))).toEqual(['120']);
    // stop-b arms on stop-a's print but finds an empty book.
    expect(trigger.triggered[1]!.fills).toHaveLength(0);
    expect(trigger.triggered[1]!.cancellations[0]!.reason).toBe('market_remainder');
  });

  it('fires the older stop first when two arm on the same print', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { account: 'mm', side: 'sell', qty: '2', price: '100' });
    seed(book, { account: 'mm', side: 'sell', qty: '10', price: '110' });
    book.submit(order({ account: 'warmup', side: 'buy', qty: '2' }));

    book.submit(order({ id: 'older', account: 'x', type: 'stop', side: 'buy', qty: '1', stopPrice: '105' }));
    book.submit(order({ id: 'newer', account: 'y', type: 'stop', side: 'buy', qty: '1', stopPrice: '104' }));

    const trigger = book.submit(order({ account: 'c', side: 'buy', qty: '1' }));
    expect(trigger.triggered.map((t) => t.orderId)).toEqual(['older', 'newer']);
  });

  it('a triggered post-only stop-limit that would cross is rejected, not filled', () => {
    const book = primed();
    book.submit(
      order({ id: 'po-stop', account: 'b', type: 'stop_limit', side: 'buy', qty: '5', price: '106', stopPrice: '105', tif: 'PO' }),
    );

    const trigger = book.submit(order({ account: 'c', side: 'buy', qty: '1' }));
    const outcome = trigger.triggered[0]!;

    expect(outcome.rejected?.code).toBe('post_only_would_cross');
    expect(outcome.fills).toHaveLength(0);
    expect(outcome.cancellations[0]!.reason).toBe('trigger_rejected');
  });

  /**
   * Sequence honesty on trigger rejection (audit M2 / README reject-counter promise).
   *
   * Normal submit checks viability BEFORE nextSequence — a pure reject burns zero.
   * Activation already removed the stop from the book, so the cancel needs one
   * sequence (same as a user cancel of a live stop). Taking an "activation"
   * sequence first and then a second for the cancel burns two for a path that
   * never filled or rested — and leaves cancel.sequence !== outcome.sequence.
   */
  it('a trigger-rejected stop burns one sequence (the cancel), not two', () => {
    const book = primed();
    book.submit(
      order({ id: 'po-stop', account: 'b', type: 'stop_limit', side: 'buy', qty: '5', price: '106', stopPrice: '105', tif: 'PO' }),
    );
    const before = book.currentSequence;

    const trigger = book.submit(order({ account: 'c', side: 'buy', qty: '1' }));
    const outcome = trigger.triggered[0]!;

    expect(outcome.rejected?.code).toBe('post_only_would_cross');
    expect(outcome.cancellations).toHaveLength(1);
    // One shared sequence for the rejected activation cancel — not activation+cancel.
    expect(outcome.cancellations[0]!.sequence).toBe(outcome.sequence);
    // Aggressor: acceptance sequence + one fill sequence = +2; trigger cancel = +1 → +3 total.
    expect(book.currentSequence).toBe(before + 3);
    // Depth memo keys on sequence; stop removal must move it (one cancel is enough).
    expect(book.depth().sequence).toBe(book.currentSequence);
  });
});

// ── Cancels ─────────────────────────────────────────────────────────────────

describe('cancel', () => {
  it('removes a resting order and reports its untouched remainder', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { id: 'live', account: 'a', side: 'buy', qty: '4', price: '100' });
    book.submit(order({ account: 'b', side: 'sell', qty: '1', price: '100' }));

    const result = book.cancel('live');

    expect(result.cancelled).toBe(true);
    expect(formatAmount(result.cancellation!.remainingQty)).toBe('3');
    expect(result.cancellation!.reason).toBe('requested');
    expect(book.bestBid()).toBeNull();
  });

  it('removes the price level when the last order at it is cancelled', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { id: 'only', account: 'a', side: 'sell', qty: '1', price: '100' });
    seed(book, { account: 'a', side: 'sell', qty: '1', price: '101' });

    book.cancel('only');

    expect(formatAmount(book.bestAsk()!)).toBe('101');
    expect(book.depth().asks).toEqual([['101', '1']]);
  });

  it('cancels a stop order that never triggered', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { id: 'stop', account: 'a', type: 'stop', side: 'buy', qty: '1', stopPrice: '1' });

    const result = book.cancel('stop');
    expect(result.cancelled).toBe(true);
    expect(formatAmount(result.cancellation!.remainingQty)).toBe('1');
  });

  it('is a no-op for an unknown id — a cancel racing a fill is not an error', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.cancel('never-existed');

    expect(result.cancelled).toBe(false);
    expect(result.sequence).toBeNull();
    expect(book.currentSequence).toBe(0);
  });
});

// ── Validation ──────────────────────────────────────────────────────────────

describe('validation', () => {
  const cases: Array<[string, OrderSpec, string]> = [
    ['zero quantity', { side: 'buy', qty: '0', price: '100' }, 'invalid_qty'],
    ['negative price', { side: 'buy', qty: '1', price: '0' }, 'invalid_price'],
    ['limit without a price', { type: 'limit', side: 'buy', qty: '1' }, 'missing_price'],
    ['market carrying a price', { type: 'market', side: 'buy', qty: '1', price: '100' }, 'unexpected_price'],
    ['stop without a stopPrice', { type: 'stop', side: 'buy', qty: '1' }, 'missing_stop_price'],
    ['limit carrying a stopPrice', { side: 'buy', qty: '1', price: '100', stopPrice: '99' }, 'unexpected_stop_price'],
  ];

  for (const [name, spec, code] of cases) {
    it(`rejects ${name}`, () => {
      const book = new OrderBook('BTC/USDT');
      const result = book.submit(order(spec));
      expect(result.accepted).toBe(false);
      expect(result.rejected?.code).toBe(code);
    });
  }

  it('rejects a duplicate order id — a bot retry must not open a second order', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { id: 'dup', account: 'a', side: 'buy', qty: '1', price: '100' });

    const result = book.submit(order({ id: 'dup', account: 'a', side: 'buy', qty: '1', price: '100' }));

    expect(result.rejected?.code).toBe('duplicate_order_id');
    expect(book.depth().bids).toEqual([['100', '1']]);
  });

  it('rejects a duplicate id held by an untriggered stop', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { id: 'dup', account: 'a', type: 'stop', side: 'buy', qty: '1', stopPrice: '1' });
    expect(book.submit(order({ id: 'dup', account: 'a', side: 'buy', qty: '1', price: '100' })).rejected?.code).toBe('duplicate_order_id');
  });

  // ── The scope of that guard, pinned ────────────────────────────────────────
  //
  // Both tests above resubmit an id that is still LIVE, which is the only case
  // the guard covers. The two below are the cases it does not, and they are
  // asserted rather than left to be discovered: the README's scope note is only
  // worth having if a change that widens or narrows it fails here.
  //
  // This is not the engine conceding the point. Order identity across time is
  // enforced by the caller, which has a durable row to check; the engine keeps
  // no history and rejecting an id it has ever seen would mean keeping every id
  // forever in an in-memory book.

  it('does NOT guard an id whose order has fully filled — the caller owns identity across time', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { id: 'maker', account: 'a', side: 'sell', qty: '1', price: '100' });

    // Take the whole resting order, so `maker` leaves the book entirely.
    book.submit(order({ id: 'taker', account: 'b', side: 'buy', qty: '1', price: '100' }));
    expect(book.depth().asks).toEqual([]);

    const again = book.submit(order({ id: 'maker', account: 'a', side: 'sell', qty: '1', price: '100' }));

    expect(again.accepted).toBe(true);
    expect(again.rejected).toBeFalsy();
    expect(book.depth().asks).toEqual([['100', '1']]);
  });

  it('does NOT guard the id of an order that never rests — it is never live to be found', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { id: 'liq1', account: 'a', side: 'sell', qty: '1', price: '100' });
    seed(book, { id: 'liq2', account: 'a', side: 'sell', qty: '1', price: '100' });

    // A market order is never in the index at any point in its life, so the
    // guard has nothing to check even while the order is executing.
    const first = book.submit(order({ id: 'mkt', account: 'b', type: 'market', side: 'buy', qty: '1' }));
    expect(first.accepted).toBe(true);

    const second = book.submit(order({ id: 'mkt', account: 'b', type: 'market', side: 'buy', qty: '1' }));

    expect(second.accepted).toBe(true);
    expect(second.rejected).toBeFalsy();
    expect(second.fills).toHaveLength(1);
  });
});

// ── Sequences ───────────────────────────────────────────────────────────────

describe('sequence numbers', () => {
  it('are strictly monotonic across acceptances and fills', () => {
    const book = new OrderBook('BTC/USDT');
    const a = seed(book, { account: 'mm', side: 'sell', qty: '1', price: '100' });
    const b = seed(book, { account: 'mm', side: 'sell', qty: '1', price: '101' });
    const taker = book.submit(order({ account: 'taker', side: 'buy', qty: '2' }));

    const seen = [a.sequence!, b.sequence!, taker.sequence!, ...taker.fills.map((f) => f.sequence)];
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThan(seen[i - 1]!);
  });

  it('are not consumed by a rejected order', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { account: 'mm', side: 'sell', qty: '1', price: '100' });
    const before = book.currentSequence;

    book.submit(order({ account: 'taker', side: 'buy', qty: '9', price: '100', tif: 'FOK' }));
    book.submit(order({ account: 'taker', side: 'buy', qty: '1', price: '100', tif: 'PO' }));
    book.submit(order({ account: 'taker', side: 'buy', qty: '0', price: '100' }));

    expect(book.currentSequence).toBe(before);
  });

  it('gives a triggered stop its activation sequence, not its admission sequence', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { account: 'mm', side: 'sell', qty: '2', price: '100' });
    seed(book, { account: 'mm', side: 'sell', qty: '5', price: '110' });
    book.submit(order({ account: 'warmup', side: 'buy', qty: '2' }));

    const admitted = book.submit(order({ id: 'stop', account: 'x', type: 'stop', side: 'buy', qty: '1', stopPrice: '105' }));
    const trigger = book.submit(order({ account: 'c', side: 'buy', qty: '1' }));

    expect(trigger.triggered[0]!.sequence).toBeGreaterThan(admitted.sequence!);
  });
});

// ── Serialisation, replay, and the no-float guarantee (§5.4) ────────────────

describe('serialised state', () => {
  /** A book with every feature live: both sides, multiple levels, partials, and a pending stop. */
  function busyBook(): OrderBook {
    const book = new OrderBook('ETH/USDT');
    seed(book, { account: 'mm', side: 'buy', qty: '1.5', price: '1999.25' });
    seed(book, { account: 'mm', side: 'buy', qty: '2', price: '1998' });
    seed(book, { account: 'mm2', side: 'buy', qty: '3', price: '1999.25' });
    seed(book, { account: 'mm', side: 'sell', qty: '4.125', price: '2000.5' });
    seed(book, { account: 'mm', side: 'sell', qty: '0.000000000000000001', price: '2001' });
    book.submit(order({ account: 'taker', side: 'buy', qty: '1', price: '2000.5' }));
    seed(book, { account: 'x', type: 'stop_limit', side: 'sell', qty: '2.5', price: '1990', stopPrice: '1995' });
    return book;
  }

  it('round-trips through a snapshot byte for byte', () => {
    const book = busyBook();
    const serialised = book.serialize();

    const restored = OrderBook.fromState(JSON.parse(serialised) as ReturnType<OrderBook['toState']>);

    expect(restored.serialize()).toBe(serialised);
  });

  it('a restored book keeps matching exactly where the original left off', () => {
    const original = busyBook();
    const restored = OrderBook.fromState(original.toState());

    const next = { side: 'sell' as const, qty: '5', price: '1998', account: 'late' };
    const a = original.submit(order({ id: 'twin', ...next }));
    const b = restored.submit(order({ id: 'twin', ...next }));

    expect(JSON.stringify(a.fills.map((f) => [formatAmount(f.price), formatAmount(f.qty), f.sequence]))).toBe(
      JSON.stringify(b.fills.map((f) => [formatAmount(f.price), formatAmount(f.qty), f.sequence])),
    );
    expect(original.serialize()).toBe(restored.serialize());
  });

  it('contains no floating-point value anywhere — every amount is a decimal string', () => {
    const serialised = busyBook().serialize();

    // 1 · No JSON number in the whole document has a fraction or an exponent.
    //     `JSON.stringify(0.1 + 0.2)` is "0.30000000000000004"; this catches it.
    expect(serialised).not.toMatch(/:\s*-?\d+\.\d/);
    expect(serialised).not.toMatch(/:\s*-?\d+(\.\d+)?[eE][+-]?\d+/);

    // 2 · Structurally: every amount-bearing field is a decimal string, and the
    //     only numbers in the document are integer sequences.
    const decimalString = /^-?\d+(\.\d{1,18})?$/;
    const amountKeys = new Set(['price', 'remaining', 'qty', 'stopPrice', 'lastTradePrice']);
    const numberKeys = new Set(['sequence']);
    const problems: string[] = [];

    const walk = (node: unknown, path: string): void => {
      if (node === null || typeof node === 'string' || typeof node === 'boolean') return;
      if (typeof node === 'number') {
        const key = path.slice(path.lastIndexOf('.') + 1);
        if (!numberKeys.has(key)) problems.push(`${path} is a JS number`);
        else if (!Number.isSafeInteger(node)) problems.push(`${path} is not a safe integer`);
        return;
      }
      if (Array.isArray(node)) {
        node.forEach((child, i) => walk(child, `${path}[${i}]`));
        return;
      }
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (amountKeys.has(key)) {
          if (value === null) continue;
          if (typeof value !== 'string') problems.push(`${path}.${key} is ${typeof value}, not a decimal string`);
          else if (!decimalString.test(value)) problems.push(`${path}.${key} = "${value}" is not a decimal string`);
        }
        walk(value, `${path}.${key}`);
      }
    };

    walk(JSON.parse(serialised), '$');
    expect(problems).toEqual([]);
  });

  it('depth is emitted as decimal-string tuples, never numbers', () => {
    const depth = busyBook().depth();
    for (const [price, qty] of [...depth.bids, ...depth.asks]) {
      expect(typeof price).toBe('string');
      expect(typeof qty).toBe('string');
      expect(price).toMatch(/^\d+(\.\d{1,18})?$/);
      expect(qty).toMatch(/^\d+(\.\d{1,18})?$/);
    }
  });

  it('aggregates a price level rather than reporting each order', () => {
    const book = busyBook();
    // 1.5 + 3 resting at 1999.25 across two accounts.
    expect(book.depth().bids[0]).toEqual(['1999.25', '4.5']);
  });
});
