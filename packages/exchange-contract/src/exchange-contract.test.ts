import { describe, expect, it } from 'vitest';
import { parseSymbol, formatSymbol, symbolsEqual, SymbolError } from './symbols.js';
import {
  createOrderRequestSchema,
  orderBookSchema,
  balancesSchema,
  decimal,
  TIMEFRAME_MS,
  TIMEFRAMES,
  EXCHANGE_ERROR_CODES,
} from './schemas.js';
import { REST_ROUTES, WS_CHANNELS } from './api.js';

describe('CCXT unified symbols', () => {
  it('parses a spot pair', () => {
    expect(parseSymbol('BTC/USDT')).toMatchObject({ base: 'BTC', quote: 'USDT', settle: null, type: 'spot' });
  });

  it('parses a linear perpetual', () => {
    expect(parseSymbol('BTC/USDT:USDT')).toMatchObject({ type: 'swap', settle: 'USDT', linear: true, inverse: false });
  });

  it('parses an inverse perpetual', () => {
    expect(parseSymbol('BTC/USD:BTC')).toMatchObject({ type: 'swap', settle: 'BTC', linear: false, inverse: true });
  });

  it('parses a dated future', () => {
    expect(parseSymbol('BTC/USDT:USDT-251226')).toMatchObject({ type: 'future', expiry: '251226' });
  });

  it('parses an option', () => {
    expect(parseSymbol('BTC/USDT:USDT-251226-90000-C')).toMatchObject({
      type: 'option',
      expiry: '251226',
      strike: '90000',
      optionType: 'call',
    });
    expect(parseSymbol('BTC/USDT:USDT-251226-90000-P').optionType).toBe('put');
  });

  it('round-trips every form', () => {
    for (const symbol of ['BTC/USDT', 'ETH/USDT:USDT', 'BTC/USD:BTC', 'BTC/USDT:USDT-251226', 'BTC/USDT:USDT-251226-90000-C', 'IFC/USDT']) {
      expect(formatSymbol(parseSymbol(symbol))).toBe(symbol);
    }
  });

  it('rejects malformed symbols rather than guessing', () => {
    for (const bad of ['', 'BTCUSDT', 'BTC/', '/USDT', 'BTC/USDT/ETH', 'BTC/USDT:USDT:USDT', 'BTC/USDT:ETH']) {
      expect(() => parseSymbol(bad), bad).toThrow(SymbolError);
    }
  });

  it('rejects a settle asset that is neither base nor quote', () => {
    // A contract must settle in one of its own legs, or margining is undefined.
    expect(() => parseSymbol('BTC/USDT:DOGE')).toThrow(/must be either the base or the quote/);
  });

  it('rejects a bad expiry or option type', () => {
    expect(() => parseSymbol('BTC/USDT:USDT-2512')).toThrow(/YYMMDD/);
    expect(() => parseSymbol('BTC/USDT:USDT-251226-90000-X')).toThrow(/option type/);
  });

  it('compares symbols case-insensitively', () => {
    expect(symbolsEqual('btc/usdt', 'BTC/USDT')).toBe(true);
    expect(symbolsEqual('BTC/USDT', 'BTC/USDT:USDT')).toBe(false);
    expect(symbolsEqual('nonsense', 'BTC/USDT')).toBe(false);
  });
});

describe('money crosses the boundary as a decimal string', () => {
  it('accepts full ledger precision', () => {
    expect(decimal.safeParse('1234.123456789012345678').success).toBe(true);
  });

  it('rejects floats, exponents and over-precision', () => {
    for (const bad of [1234.5, '1e18', '1.1234567890123456789', 'abc', '1,000']) {
      expect(decimal.safeParse(bad).success, String(bad)).toBe(false);
    }
  });
});

describe('order validation at the boundary', () => {
  const base = { symbol: 'BTC/USDT', side: 'buy', amount: '1' } as const;

  it('accepts a well-formed limit order', () => {
    expect(createOrderRequestSchema.safeParse({ ...base, type: 'limit', price: '90000' }).success).toBe(true);
  });

  it('rejects a limit order with no price — the classic integration bug', () => {
    const result = createOrderRequestSchema.safeParse({ ...base, type: 'limit' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toMatch(/requires a price/);
  });

  it('rejects a market order carrying a price', () => {
    const result = createOrderRequestSchema.safeParse({ ...base, type: 'market', price: '90000' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toMatch(/must not carry a price/);
  });

  it('requires a stop price on stop orders', () => {
    expect(createOrderRequestSchema.safeParse({ ...base, type: 'stop' }).success).toBe(false);
    expect(createOrderRequestSchema.safeParse({ ...base, type: 'stop', stopPrice: '85000' }).success).toBe(true);
  });

  it('refuses postOnly combined with an immediate time-in-force', () => {
    expect(createOrderRequestSchema.safeParse({ ...base, type: 'limit', price: '90000', postOnly: true, timeInForce: 'IOC' }).success).toBe(
      false,
    );
    expect(createOrderRequestSchema.safeParse({ ...base, type: 'limit', price: '90000', postOnly: true, timeInForce: 'GTC' }).success).toBe(
      true,
    );
  });

  it('carries a client order id for idempotent retries', () => {
    const parsed = createOrderRequestSchema.parse({ ...base, type: 'market', clientOrderId: 'bot-42' });
    expect(parsed.clientOrderId).toBe('bot-42');
  });
});

describe('response shapes', () => {
  it('accepts a well-formed order book with a resync nonce', () => {
    const book = {
      symbol: 'BTC/USDT',
      bids: [['89999.5', '1.25']],
      asks: [['90000.5', '0.75']],
      timestamp: 1750000000000,
      datetime: new Date(1750000000000).toISOString(),
      nonce: 42,
    };
    expect(orderBookSchema.safeParse(book).success).toBe(true);
  });

  it('rejects an order book level with a float price', () => {
    const book = {
      symbol: 'BTC/USDT',
      bids: [[89999.5, 1.25]],
      asks: [],
      timestamp: 1750000000000,
      datetime: new Date(1750000000000).toISOString(),
      nonce: 1,
    };
    expect(orderBookSchema.safeParse(book).success).toBe(false);
  });

  it('projects ledger account kinds into the CCXT free/used/total shape', () => {
    const balances = {
      timestamp: 1750000000000,
      datetime: new Date(1750000000000).toISOString(),
      balances: {
        USDT: { free: '1000', used: '250', total: '1250' },
        IFC: { free: '0', used: '4000', total: '4000' },
      },
    };
    expect(balancesSchema.safeParse(balances).success).toBe(true);
  });
});

describe('API surface', () => {
  it('leaves market data public and gates account data', () => {
    expect(REST_ROUTES.fetchOrderBook.scope).toBeNull();
    expect(REST_ROUTES.fetchMarkets.scope).toBeNull();
    expect(REST_ROUTES.fetchBalance.scope).toBe('trade:read');
    expect(REST_ROUTES.createOrder.scope).toBe('trade:write');
  });

  it('exposes no withdrawal route — an API key must never move value off-platform', () => {
    const paths = Object.values(REST_ROUTES).map((r) => r.path);
    expect(paths.some((p) => /withdraw|payout|transfer/i.test(p))).toBe(false);
  });

  it('marks private WS channels as scoped', () => {
    expect(WS_CHANNELS.orderbook.private).toBe(false);
    expect(WS_CHANNELS.positions.private).toBe(true);
  });

  it('declares a millisecond span for every timeframe', () => {
    for (const tf of TIMEFRAMES) {
      expect(TIMEFRAME_MS[tf], tf).toBeGreaterThan(0);
    }
  });

  it('keeps the CCXT error taxonomy so bot retry logic keeps working', () => {
    for (const code of ['InsufficientFunds', 'InvalidOrder', 'OrderNotFound', 'RateLimitExceeded'] as const) {
      expect(EXCHANGE_ERROR_CODES).toContain(code);
    }
  });
});
