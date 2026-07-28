import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount as amt } from '@intafaced/ledger-client/money';
import {
  applyDelta,
  bookFromSnapshot,
  bookTop,
  diffDepth,
  emptyBook,
  ladder,
  type DepthBook,
  type DepthDelta,
  type DepthSnapshot,
  type WireLevel,
} from './depth.js';

const MARKET = 'BTC-USDT';

function snapshot(sequence: number, bids: WireLevel[], asks: WireLevel[]): DepthSnapshot {
  return { type: 'snapshot', marketId: MARKET, sequence, bids, asks };
}

function book(sequence: number, bids: WireLevel[], asks: WireLevel[]): DepthBook {
  return bookFromSnapshot(snapshot(sequence, bids, asks));
}

const sideOf = (b: DepthBook, side: 'bids' | 'asks') => Object.fromEntries([...b[side].entries()].map(([p, q]) => [p, formatAmount(q)]));

describe('applying a delta', () => {
  it('updates, adds and removes levels in one message', () => {
    const start = book(10, [['100', '5']], [['101', '3']]);
    const delta: DepthDelta = {
      type: 'delta',
      marketId: MARKET,
      fromSequence: 10,
      sequence: 11,
      bids: [
        ['100', '7'], // update
        ['99', '2'], // add
      ],
      asks: [['101', '0']], // remove
    };

    const result = applyDelta(start, delta);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(sideOf(result.book, 'bids')).toEqual({ '100': '7', '99': '2' });
    expect(sideOf(result.book, 'asks')).toEqual({});
    expect(result.book.sequence).toBe(11);
  });

  it('leaves an absent price UNCHANGED — absent is not removal', () => {
    // The distinction that grows phantom liquidity when it is lost.
    const start = book(
      1,
      [
        ['100', '5'],
        ['99', '4'],
      ],
      [],
    );
    const result = applyDelta(start, {
      type: 'delta',
      marketId: MARKET,
      fromSequence: 1,
      sequence: 2,
      bids: [['100', '6']],
      asks: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(sideOf(result.book, 'bids')).toEqual({ '100': '6', '99': '4' });
  });

  it('does not mutate the book it was given', () => {
    // The book is handed to React state; mutating in place would render stale.
    const start = book(1, [['100', '5']], []);
    const before = sideOf(start, 'bids');

    applyDelta(start, { type: 'delta', marketId: MARKET, fromSequence: 1, sequence: 2, bids: [['100', '0']], asks: [] });

    expect(sideOf(start, 'bids')).toEqual(before);
    expect(start.sequence).toBe(1);
  });
});

describe('the sequence check — what stops a book drifting', () => {
  it('REFUSES a delta that skips a sequence, and says to resnapshot', () => {
    const start = book(10, [['100', '5']], []);
    const result = applyDelta(start, {
      type: 'delta',
      marketId: MARKET,
      fromSequence: 12, // 11 was lost
      sequence: 13,
      bids: [['100', '999']],
      asks: [],
    });

    expect(result).toEqual({ ok: false, reason: 'gap', expected: 10, got: 12 });
  });

  it('hands back NO book on a gap, so a caller cannot accidentally use one', () => {
    // The first version of this test asserted the input was unmutated, which
    // `applyDelta` guarantees anyway — so it passed with the gap check deleted.
    // What matters is that the failure path yields nothing applicable.
    const start = book(10, [['100', '5']], []);
    const result = applyDelta(start, {
      type: 'delta',
      marketId: MARKET,
      fromSequence: 12,
      sequence: 13,
      bids: [['100', '999']],
      asks: [],
    });

    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty('book');
    expect(sideOf(start, 'bids')).toEqual({ '100': '5' });
  });

  it('refuses every gap size, not just an off-by-one', () => {
    const start = book(10, [['100', '5']], []);
    for (const from of [11, 12, 50, 1_000_000]) {
      expect(
        applyDelta(start, { type: 'delta', marketId: MARKET, fromSequence: from, sequence: from + 1, bids: [], asks: [] }),
      ).toMatchObject({ ok: false, reason: 'gap' });
    }
  });

  it('treats a re-delivered delta as stale, not as a gap', () => {
    // A reconnect replays. Answering "gap" would send the client into a
    // resnapshot loop against a stream that is behaving correctly.
    const start = book(10, [['100', '5']], []);
    const result = applyDelta(start, {
      type: 'delta',
      marketId: MARKET,
      fromSequence: 9,
      sequence: 10,
      bids: [['100', '1']],
      asks: [],
    });

    expect(result).toMatchObject({ ok: false, reason: 'stale' });
  });

  it('refuses a delta for a different market', () => {
    const start = book(1, [['100', '5']], []);
    const result = applyDelta(start, {
      type: 'delta',
      marketId: 'ETH-USDT',
      fromSequence: 1,
      sequence: 2,
      bids: [['100', '0']],
      asks: [],
    });

    expect(result).toMatchObject({ ok: false, reason: 'wrong-market' });
  });

  it('accepts the first delta after a snapshot', () => {
    const fresh = bookFromSnapshot(snapshot(42, [['100', '1']], []));
    const result = applyDelta(fresh, { type: 'delta', marketId: MARKET, fromSequence: 42, sequence: 43, bids: [['100', '2']], asks: [] });

    expect(result.ok).toBe(true);
  });
});

describe('diff → apply round trip', () => {
  it('reproduces the target book exactly', () => {
    const prev = book(
      1,
      [
        ['100', '5'],
        ['99', '3'],
      ],
      [['101', '2']],
    );
    const next = book(
      2,
      [
        ['100', '7'],
        ['98', '1'],
      ],
      [
        ['101', '2'],
        ['102', '4'],
      ],
    );

    const result = applyDelta(prev, diffDepth(prev, next));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(sideOf(result.book, 'bids')).toEqual(sideOf(next, 'bids'));
    expect(sideOf(result.book, 'asks')).toEqual(sideOf(next, 'asks'));
    expect(result.book.sequence).toBe(next.sequence);
  });

  /**
   * The property, over generated books rather than examples.
   *
   * Hand-written cases test the transitions someone thought of. This tests the
   * ones nobody did — which is where an incremental book actually breaks.
   */
  it('holds over 300 randomised book transitions', () => {
    let seed = 42;
    const rand = (n: number) => {
      // Deterministic LCG: a property test that fails only on some CI runs is
      // worse than no property test, because nobody can reproduce it.
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const randomSide = (): WireLevel[] => Array.from({ length: rand(8) }, () => [String(100 + rand(20)), String(1 + rand(9))] as WireLevel);

    for (let i = 0; i < 300; i++) {
      const prev = book(i, randomSide(), randomSide());
      const next = book(i + 1, randomSide(), randomSide());

      const result = applyDelta(prev, diffDepth(prev, next));
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(sideOf(result.book, 'bids')).toEqual(sideOf(next, 'bids'));
      expect(sideOf(result.book, 'asks')).toEqual(sideOf(next, 'asks'));
    }
  });

  it('emits nothing but a sequence bump when nothing changed', () => {
    const prev = book(1, [['100', '5']], [['101', '3']]);
    const next = book(2, [['100', '5']], [['101', '3']]);
    const delta = diffDepth(prev, next);

    expect(delta.bids).toEqual([]);
    expect(delta.asks).toEqual([]);
    expect(delta.sequence).toBe(2);
  });

  it('applying the same delta twice is harmless — levels are absolute', () => {
    // The belt, for when the sequence braces have already failed. Absolute
    // levels make a double-apply idempotent; relative ones would corrupt.
    const prev = book(1, [['100', '5']], []);
    const next = book(2, [['100', '9']], []);
    const delta = diffDepth(prev, next);

    const once = applyDelta(prev, delta);
    expect(once.ok).toBe(true);
    if (!once.ok) return;

    const twice = applyDelta({ ...once.book, sequence: 1 }, delta);
    expect(twice.ok).toBe(true);
    if (!twice.ok) return;

    expect(sideOf(twice.book, 'bids')).toEqual(sideOf(once.book, 'bids'));
  });
});

describe('precision — where a float terminal is wrong', () => {
  it('carries 18 decimal places through a diff and an apply', () => {
    const dust = '0.000000000000000001';
    const prev = book(1, [['100', '1']], []);
    const next = book(2, [['100', dust]], []);

    const result = applyDelta(prev, diffDepth(prev, next));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(formatAmount(result.book.bids.get('100')!)).toBe(dust);
  });

  it('sums a cumulative column exactly, where floats would drift', () => {
    // 0.1 + 0.2 + 0.3 is the canonical float failure. Three rows is enough.
    const b = book(
      1,
      [
        ['100', '0.1'],
        ['99', '0.2'],
        ['98', '0.3'],
      ],
      [],
    );
    const rows = ladder(b, 'bids');

    expect(formatAmount(rows[2]!.cumulative)).toBe('0.6');
  });

  it('handles a quantity beyond what a double can represent', () => {
    const huge = '9007199254740993.000000000000000001';
    const b = book(1, [['100', huge]], []);

    expect(formatAmount(ladder(b, 'bids')[0]!.quantity)).toBe(huge);
  });
});

describe('book top', () => {
  it('finds best bid and best ask by price, not by insertion order', () => {
    const b = book(
      1,
      [
        ['99', '1'],
        ['101', '2'],
        ['100', '3'],
      ],
      [
        ['105', '1'],
        ['103', '2'],
      ],
    );
    const top = bookTop(b);

    expect(formatAmount(top.bestBid!)).toBe('101');
    expect(formatAmount(top.bestAsk!)).toBe('103');
    expect(formatAmount(top.bestBidQty!)).toBe('2');
    expect(formatAmount(top.spread!)).toBe('2');
  });

  it('reports no spread for a one-sided book rather than a misleading zero', () => {
    expect(bookTop(book(1, [['100', '1']], [])).spread).toBeNull();
    expect(bookTop(emptyBook(MARKET)).bestBid).toBeNull();
  });
});

describe('ladder ordering', () => {
  it('sorts bids down and asks up — both away from the spread', () => {
    const b = book(
      1,
      [
        ['98', '1'],
        ['100', '1'],
        ['99', '1'],
      ],
      [
        ['103', '1'],
        ['101', '1'],
        ['102', '1'],
      ],
    );

    expect(ladder(b, 'bids').map((r) => formatAmount(r.price))).toEqual(['100', '99', '98']);
    expect(ladder(b, 'asks').map((r) => formatAmount(r.price))).toEqual(['101', '102', '103']);
  });

  it('accumulates from the top of the book down', () => {
    const b = book(
      1,
      [
        ['100', '1'],
        ['99', '2'],
        ['98', '3'],
      ],
      [],
    );
    expect(ladder(b, 'bids').map((r) => formatAmount(r.cumulative))).toEqual(['1', '3', '6']);
  });

  it('respects the limit without disturbing the ordering', () => {
    const b = book(
      1,
      [
        ['98', '1'],
        ['100', '1'],
        ['99', '1'],
      ],
      [],
    );
    expect(ladder(b, 'bids', 2).map((r) => formatAmount(r.price))).toEqual(['100', '99']);
  });

  it('sorts numerically, not lexicographically', () => {
    // '9' > '100' as strings. A book that sorted as text would put a 9-dollar
    // bid above a 100-dollar one, at the top of the ladder, in production.
    const b = book(
      1,
      [
        ['9', '1'],
        ['100', '1'],
        ['1000', '1'],
      ],
      [],
    );
    expect(ladder(b, 'bids').map((r) => formatAmount(r.price))).toEqual(['1000', '100', '9']);
  });
});
