import { afterEach, describe, expect, it } from 'vitest';
import { MarketError } from './vendor-service.js';
import {
  MARKET_LISTING_PIN_ENV,
  MARKET_LISTING_PIN_IEEE,
  MARKET_LISTING_PIN_UNSET,
  MARKET_LISTING_SET_UNSET,
  listLiveMarkets,
  readOwnerListingPin,
} from './live-markets.js';

const SAVED = process.env[MARKET_LISTING_PIN_ENV];

afterEach(() => {
  if (SAVED === undefined) delete process.env[MARKET_LISTING_PIN_ENV];
  else process.env[MARKET_LISTING_PIN_ENV] = SAVED;
});

describe('live markets listing pin (P0-06 SOCKET)', () => {
  it('treats missing, empty, and whitespace as unset — not a catalogue', () => {
    for (const raw of [undefined, '', ' ', '  ', '\t', '\n', ' \t\n ']) {
      if (raw === undefined) delete process.env[MARKET_LISTING_PIN_ENV];
      else process.env[MARKET_LISTING_PIN_ENV] = raw;
      try {
        listLiveMarkets();
        throw new Error('expected refuse');
      } catch (err) {
        expect(err).toBeInstanceOf(MarketError);
        expect((err as MarketError).code).toBe(MARKET_LISTING_PIN_UNSET);
      }
    }
  });

  it('refuses an IEEE number pin — not a coin list', () => {
    try {
      listLiveMarkets({ [MARKET_LISTING_PIN_ENV]: 1 as unknown as string });
      throw new Error('expected refuse');
    } catch (err) {
      expect(err).toBeInstanceOf(MarketError);
      expect((err as MarketError).code).toBe(MARKET_LISTING_PIN_IEEE);
    }
  });

  it('pin present still refuses the set — does not invent listed assets', () => {
    process.env[MARKET_LISTING_PIN_ENV] = 'owner-stamp';
    expect(readOwnerListingPin()).toBe('owner-stamp');
    try {
      listLiveMarkets();
      throw new Error('expected refuse');
    } catch (err) {
      expect(err).toBeInstanceOf(MarketError);
      expect((err as MarketError).code).toBe(MARKET_LISTING_SET_UNSET);
      expect(JSON.stringify(err)).not.toMatch(/BTC|USDT|ETH/i);
    }
  });
});
