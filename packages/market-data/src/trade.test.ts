import { describe, expect, it } from 'vitest';
import { TRADE_PRINT_PUBLIC_KEYS, tradePrintFromFill, type TradePrint } from './trade.js';

const FILL = {
  marketId: 'BTC-USDT',
  makerOrderId: '11111111-1111-1111-1111-111111111111',
  takerOrderId: '22222222-2222-2222-2222-222222222222',
  price: '30125.5',
  qty: '0.25',
  sequence: 812,
  ts: '2026-07-29T12:00:00.000Z',
};

describe('tradePrintFromFill', () => {
  it('maps a fill to a public trade print', () => {
    const print = tradePrintFromFill(FILL);

    expect(print).toEqual({
      type: 'trade',
      marketId: 'BTC-USDT',
      sequence: 812,
      price: '30125.5',
      quantity: '0.25',
      ts: '2026-07-29T12:00:00.000Z',
    } satisfies TradePrint);
  });

  it('strips order ids — they must never reach the public wire', () => {
    const print = tradePrintFromFill(FILL);
    const keys = Object.keys(print).sort();

    expect(keys).toEqual([...TRADE_PRINT_PUBLIC_KEYS].sort());
    expect(JSON.stringify(print)).not.toContain(FILL.makerOrderId);
    expect(JSON.stringify(print)).not.toContain(FILL.takerOrderId);
    expect(JSON.stringify(print)).not.toContain('makerOrderId');
    expect(JSON.stringify(print)).not.toContain('takerOrderId');
  });

  it('refuses a JSON number where a price belongs', () => {
    expect(() => tradePrintFromFill({ ...FILL, price: 30125.5 as unknown as string })).toThrow(/decimal string/);
  });

  it('refuses a non-integer sequence', () => {
    expect(() => tradePrintFromFill({ ...FILL, sequence: 1.5 })).toThrow(/sequence/);
  });

  it('refuses an empty market id', () => {
    expect(() => tradePrintFromFill({ ...FILL, marketId: '' })).toThrow(/marketId/);
  });
});
