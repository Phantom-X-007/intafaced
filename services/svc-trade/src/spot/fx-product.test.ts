import { describe, expect, it } from 'vitest';
import { FX_GLOBAL } from '@intafaced/contracts';
import { parseAmount } from '@intafaced/ledger-client';
import {
  FX_HOLIDAY_CALENDAR_UNPUBLISHED_CODE,
  FX_HOLIDAY_CODE,
  FX_NOT_SPOT_CODE,
  assertFxHolidayNamedDegrade,
  assertFxSeparateFromSpot,
  fxNamedDegrade,
  isFxProduct,
} from './fx-product.js';
import { FOREX_SETTLEMENT_SOCKET } from './forex-settlement.js';
import { TradeError, type Market } from './types.js';

const EURUSD: Market = {
  id: '00000000-0000-4000-8000-000000000002',
  symbol: 'EUR/USD',
  baseAsset: 'EUR',
  quoteAsset: 'USD',
  kind: 'spot',
  tickSize: parseAmount('0.00001'),
  lotSize: parseAmount('1000'),
  minQty: parseAmount('1000'),
  maxQty: null,
  minNotional: parseAmount('1000'),
  status: 'active',
  makerBps: 5,
  takerBps: 10,
  listedAt: new Date(),
  assetClass: 'forex',
  schedule: 'fx-global',
  paper: true,
};

const BTC: Pick<Market, 'symbol' | 'assetClass'> = { symbol: 'BTC/USDT', assetClass: 'crypto' };

describe('R-fx product separation + named holiday degrade', () => {
  it('names FX vs crypto', () => {
    expect(isFxProduct(EURUSD)).toBe(true);
    expect(isFxProduct(BTC)).toBe(false);
  });

  it('productStatus names convert refuse, unpublished holiday, rail socket', () => {
    const d = fxNamedDegrade();
    expect(d.product).toBe('fx');
    expect(d.separateFromSpot).toBe(true);
    expect(d.convert).toBe('refused');
    expect(d.matching).toBe('not_spot_book');
    expect(d.holidayCalendar.published).toBe(false);
    expect(d.holidayCalendar.residual).toMatch(/never invent days/i);
    expect(d.rail.published).toBe(false);
    expect(d.rail.socket).toBe(FOREX_SETTLEMENT_SOCKET);
  });

  it('convert/TWAP on FX refuse before any book walk', () => {
    expect(() => assertFxSeparateFromSpot(BTC, 'convert')).not.toThrow();
    try {
      assertFxSeparateFromSpot(EURUSD, 'convert');
      throw new Error('expected refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(TradeError);
      expect((e as TradeError).code).toBe(FX_NOT_SPOT_CODE);
      expect((e as TradeError).message).not.toMatch(/\b0(\.0+)?\b/);
    }
  });

  it('weekend FX stays trade.market_closed (caller) — not unpublished', () => {
    expect(() => assertFxHolidayNamedDegrade(EURUSD, new Date('2026-01-10T12:00:00Z'), FX_GLOBAL)).not.toThrow();
  });

  it('weekday FX with empty holidays names unpublished (not silent open)', () => {
    try {
      assertFxHolidayNamedDegrade(EURUSD, new Date('2026-01-14T12:00:00Z'), FX_GLOBAL);
      throw new Error('expected refuse');
    } catch (e) {
      expect((e as TradeError).code).toBe(FX_HOLIDAY_CALENDAR_UNPUBLISHED_CODE);
    }
  });

  it('published holiday day names trade.fx_holiday, not market_closed', () => {
    const withHoliday = { ...FX_GLOBAL, holidays: ['2026-01-14'] };
    try {
      assertFxHolidayNamedDegrade(EURUSD, new Date('2026-01-14T15:00:00Z'), withHoliday);
      throw new Error('expected refuse');
    } catch (e) {
      expect((e as TradeError).code).toBe(FX_HOLIDAY_CODE);
      expect((e as TradeError).message).toContain('2026-01-14');
    }
  });

  it('crypto is not holiday-degraded', () => {
    expect(() => assertFxHolidayNamedDegrade(BTC, new Date('2026-01-14T12:00:00Z'), FX_GLOBAL)).not.toThrow();
  });
});
