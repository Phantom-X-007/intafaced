import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import { initialMargin } from './initial-margin.js';

describe('initialMargin', () => {
  it('1 BTC at 50_000 with 10x → 5_000 quote units (scaled)', () => {
    // 1e18 * 50000e18 / 1e18 / 10 = 5000e18
    const m = initialMargin({
      size: parseAmount('1'),
      entryPrice: parseAmount('50000'),
      leverage: parseAmount('10'),
    });
    expect(m).toBe(parseAmount('5000'));
  });

  it('refuses zero leverage', () => {
    expect(() =>
      initialMargin({
        size: parseAmount('1'),
        entryPrice: parseAmount('100'),
        leverage: parseAmount('0'),
      }),
    ).toThrow(/leverage/);
  });
});
