import { parseAmount as amt } from '@intafaced/ledger-client/money';
import { describe, expect, it } from 'vitest';
import { OrderBook } from './book.js';
import type { EngineOrder } from './types.js';

/**
 * THE MEMO MUST NEVER OUTLIVE THE BOOK IT DESCRIBES.
 *
 * `depth()` caches its answer keyed on `sequence`, on the argument that no
 * mutating path exists which does not consume a sequence. These tests are that
 * argument, executed — one per mutation shape, each asserting the depth AFTER
 * the change differs from the depth BEFORE it.
 *
 * A stale cache here would be invisible everywhere else. `toState` folds from
 * `orders` rather than from the cache, so journal-replay determinism stays
 * byte-identical while every market-data consumer is served a book that no
 * longer exists. That is why these assert reported depth, not internal state.
 */

let seq = 0;
const order = (over: Partial<EngineOrder> & Pick<EngineOrder, 'side' | 'qty'>): EngineOrder => ({
  orderId: `o-${++seq}`,
  accountId: 'acct-1',
  type: 'limit',
  price: amt('100'),
  stopPrice: null,
  tif: 'GTC',
  ...over,
});

/** Total size reported at a given price, or null when the level is absent. */
const sizeAt = (book: OrderBook, side: 'bids' | 'asks', price: string): string | null =>
  book.depth(50)[side].find(([p]) => p === price)?.[1] ?? null;

describe('depth memo — invalidated by every mutation', () => {
  it('a new resting order changes the reported size', () => {
    const book = new OrderBook('m');
    book.submit(order({ side: 'buy', qty: amt('1') }));
    expect(sizeAt(book, 'bids', '100')).toBe('1');

    // Read again first, so the cache is definitely populated before the change.
    expect(sizeAt(book, 'bids', '100')).toBe('1');

    book.submit(order({ side: 'buy', qty: amt('2') }));
    expect(sizeAt(book, 'bids', '100')).toBe('3');
  });

  it('a cancel removes the level from the reported book', () => {
    const book = new OrderBook('m');
    const placed = book.submit(order({ side: 'buy', qty: amt('5') }));
    expect(sizeAt(book, 'bids', '100')).toBe('5');

    const restingId = placed.resting?.orderId as string;
    book.cancel(restingId);

    expect(sizeAt(book, 'bids', '100')).toBeNull();
  });

  it('a partial fill decrements the reported size', () => {
    // The dangerous one: the maker's `remaining` is mutated IN PLACE, the level
    // and the orders array are untouched, and only the sequence moves.
    //
    // The taker is a DIFFERENT account on purpose. With one account both sides
    // meet self-trade prevention, which cancels the resting order instead of
    // filling it — and this assertion caught exactly that when the helper
    // defaulted every order to the same account.
    const book = new OrderBook('m');
    book.submit(order({ side: 'sell', qty: amt('10') }));
    expect(sizeAt(book, 'asks', '100')).toBe('10');

    book.submit(order({ side: 'buy', qty: amt('4'), tif: 'IOC', accountId: 'acct-2' }));

    expect(sizeAt(book, 'asks', '100')).toBe('6');
  });

  it('a full fill empties the reported book', () => {
    const book = new OrderBook('m');
    book.submit(order({ side: 'sell', qty: amt('3') }));
    expect(sizeAt(book, 'asks', '100')).toBe('3');

    // Distinct account again: with STP this would empty the level by CANCELLING
    // rather than by filling, and the assertion below would pass for the wrong
    // reason.
    book.submit(order({ side: 'buy', qty: amt('3'), tif: 'IOC', accountId: 'acct-2' }));

    expect(sizeAt(book, 'asks', '100')).toBeNull();
  });

  it('a REJECTED order leaves the answer alone — the book did not change', () => {
    // Rejections return before `nextSequence`, so the cache is correctly reused.
    // Asserted because "the sequence did not move" must mean "nothing changed",
    // and a rejection that mutated would break the memo's whole premise.
    const book = new OrderBook('m');
    book.submit(order({ side: 'buy', qty: amt('7') }));
    const before = book.depth(50);

    const rejectedResult = book.submit(order({ side: 'buy', qty: amt('0') }));
    expect(rejectedResult.accepted).toBe(false);

    expect(book.depth(50)).toEqual(before);
  });

  it('different limits do not serve each other answers', () => {
    const book = new OrderBook('m');
    for (let i = 0; i < 5; i++) book.submit(order({ side: 'buy', qty: amt('1'), price: amt(String(100 - i)) }));

    expect(book.depth(2).bids).toHaveLength(2);
    // Same sequence, wider window: a cache keyed only on sequence would hand
    // back the two-level answer here.
    expect(book.depth(5).bids).toHaveLength(5);
    expect(book.depth(2).bids).toHaveLength(2);
  });

  it('hands back a fresh outer array each call, so a caller cannot corrupt the cache', () => {
    const book = new OrderBook('m');
    book.submit(order({ side: 'buy', qty: amt('1') }));

    const first = book.depth(50);
    first.bids.length = 0;

    expect(book.depth(50).bids).toHaveLength(1);
  });

  it('a restored book starts with no inherited answer', () => {
    const book = new OrderBook('m');
    book.submit(order({ side: 'buy', qty: amt('9') }));
    expect(sizeAt(book, 'bids', '100')).toBe('9');

    const restored = OrderBook.fromState(book.toState());
    expect(sizeAt(restored, 'bids', '100')).toBe('9');

    // And the restored book's own cache tracks its own mutations.
    restored.submit(order({ side: 'buy', qty: amt('1') }));
    expect(sizeAt(restored, 'bids', '100')).toBe('10');
  });
});
