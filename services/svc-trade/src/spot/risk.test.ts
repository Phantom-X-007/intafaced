import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount as amt } from '@intafaced/ledger-client';
import { assertNotional, assertPrice, assertQty, assertTradable, holdFor, protectionPriceFor, requireSupportedType } from './risk.js';
import { TradeError, type Market } from './types.js';

/**
 * Risk checks, as pure arithmetic.
 *
 * These run before any value moves, which is the only reason step 3 of the
 * order flow can be trusted: by the time a hold is posted, the order is known
 * to be on the grid, inside the limits, and on a market that is actually open.
 */

const BTCUSDT: Market = {
  id: '00000000-0000-4000-8000-000000000001',
  symbol: 'BTC/USDT',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  kind: 'spot',
  tickSize: amt('0.01'),
  lotSize: amt('0.0001'),
  minQty: amt('0.0001'),
  maxQty: amt('100'),
  minNotional: amt('1'),
  status: 'active',
  makerBps: 10,
  takerBps: 20,
  listedAt: new Date(),
};

const withMarket = (overrides: Partial<Market>): Market => ({ ...BTCUSDT, ...overrides });

describe('market status', () => {
  it('accepts an active spot market', () => {
    expect(() => assertTradable(BTCUSDT)).not.toThrow();
  });

  it('refuses a halted market — a hold behind a book nobody is matching is a trapped fund', () => {
    expect(() => assertTradable(withMarket({ status: 'halted' }))).toThrow(TradeError);
    expect(() => assertTradable(withMarket({ status: 'delisted' }))).toThrow(TradeError);
    expect(() => assertTradable(withMarket({ status: 'pending' }))).toThrow(TradeError);
  });

  it('refuses a non-spot market — this PR is trade.spot only', () => {
    try {
      assertTradable(withMarket({ kind: 'futures' }));
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as TradeError).code).toBe('trade.market_kind_unsupported');
    }
  });
});

describe('order types', () => {
  it('accepts limit and market', () => {
    expect(requireSupportedType('limit')).toBe('limit');
    expect(requireSupportedType('market')).toBe('market');
  });

  it('refuses stops — funding one honestly is not solved (SOCKET §13)', () => {
    for (const type of ['stop', 'stop_limit', 'take_profit', 'nonsense']) {
      try {
        requireSupportedType(type);
        throw new Error(`should have refused ${type}`);
      } catch (err) {
        expect((err as TradeError).code).toBe('trade.order_type_unsupported');
      }
    }
  });
});

describe('size limits', () => {
  it('accepts a quantity on the lot grid and inside the bounds', () => {
    expect(() => assertQty(BTCUSDT, amt('1.5'))).not.toThrow();
    expect(() => assertQty(BTCUSDT, amt('0.0001'))).not.toThrow();
    expect(() => assertQty(BTCUSDT, amt('100'))).not.toThrow();
  });

  it('refuses an off-grid quantity — the engine matches on exact equality', () => {
    expect(() => assertQty(BTCUSDT, amt('1.00005'))).toThrow(TradeError);
  });

  it('refuses zero, below the floor, and above the ceiling', () => {
    expect(() => assertQty(BTCUSDT, amt('0'))).toThrow(TradeError);
    expect(() => assertQty(withMarket({ minQty: amt('0.01') }), amt('0.001'))).toThrow(TradeError);
    expect(() => assertQty(BTCUSDT, amt('100.0001'))).toThrow(TradeError);
  });

  it('allows an unbounded market to take any on-grid size', () => {
    expect(() => assertQty(withMarket({ maxQty: null }), amt('1000000'))).not.toThrow();
  });
});

describe('price grid', () => {
  it('accepts a price on the tick grid', () => {
    expect(() => assertPrice(BTCUSDT, amt('60000.25'))).not.toThrow();
  });

  it('refuses an off-grid price — it would rest at a level nobody can meet', () => {
    expect(() => assertPrice(BTCUSDT, amt('60000.255'))).toThrow(TradeError);
    expect(() => assertPrice(BTCUSDT, amt('0'))).toThrow(TradeError);
  });
});

describe('minimum notional', () => {
  it('accepts an order worth at least the floor', () => {
    expect(() => assertNotional(BTCUSDT, amt('100'), amt('0.01'))).not.toThrow();
  });

  it('refuses dust — a fill worth nothing is a fill the ledger will not post', () => {
    expect(() => assertNotional(BTCUSDT, amt('100'), amt('0.0001'))).toThrow(TradeError);
  });

  it('floors the value, matching how a fill is settled', () => {
    // 3 x 0.3333 = 0.99990 -> below a 1.0 floor even though it "rounds to" 1.
    expect(() => assertNotional(withMarket({ tickSize: amt('0.0001') }), amt('3'), amt('0.3333'))).toThrow(TradeError);
  });
});

describe('the hold', () => {
  it('holds QUOTE for a buy, rounded up', () => {
    const hold = holdFor(BTCUSDT, 'buy', amt('100'), amt('2'));
    expect(hold.assetId).toBe('USDT');
    expect(formatAmount(hold.amount)).toBe('200');
  });

  it('rounds a buy hold UP — a hold one wei short is a fill that cannot settle', () => {
    // 0.000000000000000001 x 3 needs a 19th decimal place it cannot have.
    const hold = holdFor(BTCUSDT, 'buy', amt('0.000000000000000001'), amt('0.3'));
    expect(formatAmount(hold.amount)).toBe('0.000000000000000001');
  });

  it('holds BASE for a sell, exactly the quantity', () => {
    const hold = holdFor(BTCUSDT, 'sell', amt('100'), amt('2.5'));
    expect(hold.assetId).toBe('BTC');
    expect(formatAmount(hold.amount)).toBe('2.5');
  });

  it('a sell hold does not depend on the price at all', () => {
    const cheap = holdFor(BTCUSDT, 'sell', amt('1'), amt('2.5'));
    const dear = holdFor(BTCUSDT, 'sell', amt('1000000'), amt('2.5'));
    expect(cheap.amount).toBe(dear.amount);
  });
});

describe('market buy protection price', () => {
  it('funds above the best ask by the slippage cap, on the tick grid', () => {
    // 100 + 2% = 102, already a multiple of 0.01.
    expect(formatAmount(protectionPriceFor(BTCUSDT, amt('100'), 200))).toBe('102');
  });

  it('rounds UP to the tick — rounding down would fund below the price submitted', () => {
    // 100.005 + 2% = 102.00510 -> 102.01 at a 0.01 tick.
    expect(formatAmount(protectionPriceFor(withMarket({ tickSize: amt('0.01') }), amt('100.005'), 200))).toBe('102.01');
  });

  it('is always at or above the best ask, so a marketable order can actually cross', () => {
    for (const ask of ['0.01', '1', '100', '65432.10']) {
      expect(protectionPriceFor(BTCUSDT, amt(ask), 200)).toBeGreaterThanOrEqual(amt(ask));
    }
  });

  it('refuses when there is no ask to price against, rather than guessing', () => {
    try {
      protectionPriceFor(BTCUSDT, null, 200);
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as TradeError).code).toBe('trade.no_reference_price');
    }
  });
});
