import { describe, expect, it } from 'vitest';
import { ladder, bookFromSnapshot } from '@intafaced/market-data';
import { decimalsOf, displayAmount, group, parseAmount, ratio, toFixedString, tryParseAmount } from './money';

/**
 * Money never becomes a number.
 *
 * The headline case is the cumulative column of a depth ladder. It is the one
 * place a float error is guaranteed rather than possible: every row below the
 * top is a running sum, so one bad addition poisons the rest of the column, and
 * the numbers still look like prices while it happens.
 */

describe('display formatting is string surgery on a bigint', () => {
  it('pads to the market’s precision instead of trimming like the ledger does', () => {
    // formatAmount gives "68412.5", which cannot be scanned in a price column.
    expect(toFixedString(parseAmount('68412.5'), 2)).toBe('68412.50');
    expect(toFixedString(parseAmount('68412'), 2)).toBe('68412.00');
  });

  it('truncates rather than rounding up into a price that was never quoted', () => {
    expect(toFixedString(parseAmount('0.129'), 2)).toBe('0.12');
  });

  it('groups thousands without going near Number', () => {
    expect(group('1234567.89')).toBe('1,234,567.89');
    expect(group('999')).toBe('999');
    // 21 digits — past Number.MAX_SAFE_INTEGER, and still exact.
    expect(group('123456789012345678901')).toBe('123,456,789,012,345,678,901');
  });

  it('reads precision off the market’s own tick and lot size', () => {
    expect(decimalsOf('0.01')).toBe(2);
    expect(decimalsOf('0.00000001')).toBe(8);
    expect(decimalsOf('1')).toBe(0);
    expect(decimalsOf('0.0100')).toBe(2);
  });

  it('survives a value larger than a double can represent', () => {
    const huge = parseAmount('9007199254740993.000000000000000001');
    // 2^53 + 1 is the classic float casualty. The last digit must be intact.
    expect(displayAmount(huge, 18)).toBe('9,007,199,254,740,993.000000000000000001');
  });

  it('returns null for junk instead of NaN', () => {
    expect(tryParseAmount('not a number')).toBeNull();
    expect(tryParseAmount('')).toBeNull();
    // 19 decimal places — more precision than the ledger carries. Refused, not
    // silently rounded to 18.
    expect(tryParseAmount(`0.${'1'.repeat(19)}`)).toBeNull();
  });
});

describe('the cumulative depth column', () => {
  /** THE 0.1 + 0.2 CASE, on the exact shape that renders it. */
  it('is exact where a float column would be visibly wrong', () => {
    const book = bookFromSnapshot({
      type: 'snapshot',
      marketId: 'BTC-USDT',
      sequence: 1,
      bids: [
        ['100.03', '0.1'],
        ['100.02', '0.2'],
        ['100.01', '0.3'],
      ],
      asks: [],
    });

    const rows = ladder(book, 'bids');
    const totals = rows.map((r) => displayAmount(r.cumulative, 18));

    expect(totals).toEqual(['0.100000000000000000', '0.300000000000000000', '0.600000000000000000']);
    // What the float version produces, for the record: 0.30000000000000004.
    expect(totals[1]).not.toContain('30000000000000004');
  });

  it('gives the deepest row a full bar and the shallowest a proportional one', () => {
    expect(ratio(parseAmount('0.6'), parseAmount('0.6'))).toBe(1);
    expect(ratio(parseAmount('0.3'), parseAmount('0.6'))).toBe(0.5);
    // An empty book must not divide by zero.
    expect(ratio(parseAmount('0'), parseAmount('0'))).toBe(0);
  });
});
