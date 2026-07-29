import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import { estimateConvert, snapToTick } from './quote.js';

const TICK = parseAmount('0.01');

describe('estimateConvert', () => {
  it('walks asks for a buy and worsens notional by the convert spread', () => {
    // Two levels: 100 @ 1, 110 @ 1 — buy 2 base → book notional 210
    const q = estimateConvert({
      side: 'buy',
      qty: parseAmount('2'),
      levels: [
        ['100', '1'],
        ['110', '1'],
      ],
      convertSpreadBps: 100, // 1%
      tickSize: TICK,
    });

    expect(q.filledQty).toBe(parseAmount('2'));
    expect(q.bookNotional).toBe(parseAmount('210'));
    // 210 + 1% = 212.1 → ceil bps
    expect(q.userNotional).toBe(parseAmount('212.1'));
    expect(q.fullyFilled).toBe(true);
    // avg >= book VWAP
    expect(q.avgPrice >= parseAmount('105')).toBe(true);
  });

  it('walks bids for a sell and reduces what the user receives', () => {
    const q = estimateConvert({
      side: 'sell',
      qty: parseAmount('1'),
      levels: [['100', '5']],
      convertSpreadBps: 100,
      tickSize: TICK,
    });

    expect(q.bookNotional).toBe(parseAmount('100'));
    expect(q.userNotional).toBe(parseAmount('99'));
    expect(q.avgPrice).toBe(parseAmount('99'));
    expect(q.fullyFilled).toBe(true);
  });

  it('reports partial fill when the book is thin', () => {
    const q = estimateConvert({
      side: 'buy',
      qty: parseAmount('10'),
      levels: [['50', '3']],
      convertSpreadBps: 0,
      tickSize: TICK,
    });

    expect(q.filledQty).toBe(parseAmount('3'));
    expect(q.fullyFilled).toBe(false);
  });

  it('refuses an empty book', () => {
    expect(() =>
      estimateConvert({
        side: 'buy',
        qty: parseAmount('1'),
        levels: [],
        convertSpreadBps: 0,
        tickSize: TICK,
      }),
    ).toThrow(/no liquidity/);
  });
});

describe('snapToTick', () => {
  it('rounds buys up and sells down onto the tick', () => {
    expect(snapToTick(parseAmount('100.001'), TICK, 'buy')).toBe(parseAmount('100.01'));
    expect(snapToTick(parseAmount('100.001'), TICK, 'sell')).toBe(parseAmount('100'));
  });
});
