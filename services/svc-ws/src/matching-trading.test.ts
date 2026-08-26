import { describe, expect, it } from 'vitest';
import {
  DEPTH_MARKET_DELISTED,
  DEPTH_MARKET_EXPIRED,
  DEPTH_MARKET_HALTED,
  DEPTH_MARKET_PRELAUNCH,
  DEPTH_VENUE_HALTED,
  ORDERS_MARKET_HALTED,
  ORDERS_VENUE_HALTED,
  ordersCodeForDepth,
  parseMatchingBoard,
  parseMatchingTrading,
  strongerTradingCode,
  tradingFromBoard,
  wouldInventTradableBook,
} from './matching-trading.js';

describe('parseMatchingTrading', () => {
  it('does not invent halt from a bare book', () => {
    expect(parseMatchingTrading({ bids: [['1', '1']], asks: [['2', '1']], sequence: 1 })).toBeNull();
  });

  it('names matching flags without inventing a price', () => {
    expect(parseMatchingTrading({ halted: true })).toBe(DEPTH_MARKET_HALTED);
    expect(parseMatchingTrading({ prelaunch: true })).toBe(DEPTH_MARKET_PRELAUNCH);
    expect(parseMatchingTrading({ expired: true })).toBe(DEPTH_MARKET_EXPIRED);
    expect(parseMatchingTrading({ delisted: true })).toBe(DEPTH_MARKET_DELISTED);
    expect(parseMatchingTrading({ venueHalted: true })).toBe(DEPTH_VENUE_HALTED);
  });

  it('prefers delist over halt when both flags are set', () => {
    expect(parseMatchingTrading({ halted: true, delisted: true })).toBe(DEPTH_MARKET_DELISTED);
    expect(strongerTradingCode(DEPTH_MARKET_HALTED, DEPTH_MARKET_EXPIRED)).toBe(DEPTH_MARKET_EXPIRED);
  });
});

describe('parseMatchingBoard', () => {
  it('reads extra arrays on GET /markets without treating missing as OPEN invention', () => {
    const board = parseMatchingBoard({
      markets: ['BTC-USDT', 'ETH-USDT'],
      halted: ['BTC-USDT'],
      venueHalted: false,
    });
    expect(tradingFromBoard(board, 'BTC-USDT')).toBe(DEPTH_MARKET_HALTED);
    expect(tradingFromBoard(board, 'ETH-USDT')).toBeNull();
  });

  it('applies venue halt-all when matching says so', () => {
    const board = parseMatchingBoard({ markets: ['BTC-USDT'], venueHalted: true });
    expect(tradingFromBoard(board, 'BTC-USDT')).toBe(DEPTH_VENUE_HALTED);
  });
});

describe('ordersCodeForDepth', () => {
  it('maps public depth names onto the private orders.* family', () => {
    expect(ordersCodeForDepth(DEPTH_MARKET_HALTED)).toBe(ORDERS_MARKET_HALTED);
    expect(ordersCodeForDepth(DEPTH_VENUE_HALTED)).toBe(ORDERS_VENUE_HALTED);
  });
});

describe('wouldInventTradableBook', () => {
  it('is true only when a resting ladder would go out while matching is closed', () => {
    expect(wouldInventTradableBook(true, DEPTH_MARKET_HALTED)).toBe(true);
    expect(wouldInventTradableBook(true, null)).toBe(false);
    expect(wouldInventTradableBook(false, DEPTH_MARKET_PRELAUNCH)).toBe(false);
  });
});
