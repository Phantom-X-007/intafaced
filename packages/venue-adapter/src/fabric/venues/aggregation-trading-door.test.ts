/**
 * D27-P4 venue.aggregation trading half — factory door through the package
 * surface (`@intafaced/venue-adapter` index), not deep fabric imports alone.
 *
 * Promise: market-data, trade, and account factories share
 * PUBLIC_MARKET_DATA_VENUE_IDS; unknown ids return null; signed ops refuse
 * without credentials or wired HTTP port.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import { VenueCredentialsMissingError } from '@intafaced/venue-contracts';
import {
  PUBLIC_MARKET_DATA_VENUE_IDS,
  createVenueAccountAdapter,
  createVenueAccountAdapterFromOperatorEnv,
  createVenueMarketDataAdapter,
  createVenueTradeAdapter,
  createVenueTradeAdapterFromOperatorEnv,
  describeOperatorVenueAccountMaps,
  describeTradingHalfPolicy,
  loadVenueOperatorCredentials,
  buildOperatorVenueAccountMaps,
  buildOperatorVenueTradeMaps,
  buildOperatorVenueAccountAdapters,
  buildOperatorVenueTradeAdapters,
  describeOperatorVenueAccountMaps,
  describeOperatorVenueTradeMaps,
  describeVenueOperatorCredentials,
  venueOperatorCredentialEnvPrefix,
} from '../../index.js';
import type { HttpPort, HttpResponse } from '../transport.js';

class GetOnlyHttp implements HttpPort {
  async get(url: string): Promise<HttpResponse> {
    return { status: 200, body: {}, header: () => null };
  }
}

const tradeOnlyCreds = (venueId: string) => ({
  venueId,
  apiKey: 'k',
  apiSecret: 's',
  scopes: ['read', 'trade'] as const,
  ...(venueId === 'okx-spot' ? { passphrase: 'p' } : {}),
});

const LIMIT_ORDER = {
  symbol: 'BTC/USDT',
  side: 'buy' as const,
  type: 'limit' as const,
  amount: parseAmount('1'),
  price: parseAmount('100'),
  clientOrderId: 'door-test',
};

describe('D27-P4 aggregation trading door — package export + factory trio', () => {
  it('exports MD + trade + account factories and trading-half policy on the package index', () => {
    expect(typeof createVenueMarketDataAdapter).toBe('function');
    expect(typeof createVenueTradeAdapter).toBe('function');
    expect(typeof createVenueAccountAdapter).toBe('function');
    expect(typeof describeTradingHalfPolicy).toBe('function');
    expect(typeof loadVenueOperatorCredentials).toBe('function');
    expect(typeof createVenueTradeAdapterFromOperatorEnv).toBe('function');
    expect(typeof createVenueAccountAdapterFromOperatorEnv).toBe('function');
    expect(typeof buildOperatorVenueTradeMaps).toBe('function');
    expect(typeof buildOperatorVenueAccountMaps).toBe('function');
    expect(typeof buildOperatorVenueTradeAdapters).toBe('function');
    expect(typeof buildOperatorVenueAccountAdapters).toBe('function');
    expect(typeof describeOperatorVenueAccountMaps).toBe('function');
    expect(typeof describeOperatorVenueTradeMaps).toBe('function');
    expect(typeof venueOperatorCredentialEnvPrefix).toBe('function');
    expect(typeof describeVenueOperatorCredentials).toBe('function');
    expect(PUBLIC_MARKET_DATA_VENUE_IDS).toEqual(['binance-spot', 'bybit-spot', 'okx-spot']);
  });

  it('describeOperatorVenueTradeMaps wires when operator env is complete (D41)', () => {
    expect(describeOperatorVenueTradeMaps({})).toMatchObject({
      wiredVenueIds: [],
      inventsAdapters: false,
      operatorCredentialsRequired: true,
    });
    expect(
      describeOperatorVenueTradeMaps({
        VENUE_AGGREGATION_OKX_SPOT_API_KEY: 'k',
        VENUE_AGGREGATION_OKX_SPOT_API_SECRET: 's',
        VENUE_AGGREGATION_OKX_SPOT_PASSPHRASE: 'p',
      }),
    ).toMatchObject({
      wiredVenueIds: ['okx-spot'],
      inventsAdapters: false,
    });
  });

  it('describeOperatorVenueAccountMaps wires when operator env is complete (D42)', () => {
    expect(describeOperatorVenueAccountMaps({})).toMatchObject({
      wiredVenueIds: [],
      inventsAdapters: false,
      operatorCredentialsRequired: true,
    });
    expect(
      describeOperatorVenueAccountMaps({
        VENUE_AGGREGATION_BINANCE_SPOT_API_KEY: 'k',
        VENUE_AGGREGATION_BINANCE_SPOT_API_SECRET: 's',
      }),
    ).toMatchObject({
      wiredVenueIds: ['binance-spot'],
      inventsAdapters: false,
    });
  });

  it('buildOperatorVenueTradeMaps and buildOperatorVenueAccountMaps wire when operator env is complete (D43)', () => {
    const env = {
      VENUE_AGGREGATION_BYBIT_SPOT_API_KEY: 'k',
      VENUE_AGGREGATION_BYBIT_SPOT_API_SECRET: 's',
    };
    expect(buildOperatorVenueTradeMaps(env).wiredVenueIds).toEqual(['bybit-spot']);
    expect(buildOperatorVenueAccountMaps(env).wiredVenueIds).toEqual(['bybit-spot']);
  });

  it('createVenueTradeAdapterFromOperatorEnv and createVenueAccountAdapterFromOperatorEnv wire when operator env is complete (D44)', () => {
    const env = {
      VENUE_AGGREGATION_OKX_SPOT_API_KEY: 'k',
      VENUE_AGGREGATION_OKX_SPOT_API_SECRET: 's',
      VENUE_AGGREGATION_OKX_SPOT_PASSPHRASE: 'p',
    };
    expect(createVenueTradeAdapterFromOperatorEnv('okx-spot', env)).not.toBeNull();
    expect(createVenueAccountAdapterFromOperatorEnv('okx-spot', env)).not.toBeNull();
    expect(createVenueTradeAdapterFromOperatorEnv('okx-spot', {})).toBeNull();
    expect(createVenueAccountAdapterFromOperatorEnv('binance-spot', {})).toBeNull();
  });

  it('loadVenueOperatorCredentials wires when operator env is complete (D45)', () => {
    const env = {
      VENUE_AGGREGATION_BYBIT_SPOT_API_KEY: 'k',
      VENUE_AGGREGATION_BYBIT_SPOT_API_SECRET: 's',
    };
    expect(loadVenueOperatorCredentials('bybit-spot', env)).toMatchObject({
      venueId: 'bybit-spot',
      scopes: ['read', 'trade'],
    });
    expect(loadVenueOperatorCredentials('bybit-spot', {})).toBeNull();
    expect(loadVenueOperatorCredentials('kraken-spot', env)).toBeNull();
  });

  it('describeVenueOperatorCredentials wires when operator env is complete (D46)', () => {
    expect(describeVenueOperatorCredentials({})).toMatchObject({
      wiredVenueIds: [],
      inventsCredentials: false,
      liveCredentialsOperatorIssued: true,
    });
    expect(
      describeVenueOperatorCredentials({
        VENUE_AGGREGATION_BINANCE_SPOT_API_KEY: 'k',
        VENUE_AGGREGATION_BINANCE_SPOT_API_SECRET: 's',
      }),
    ).toMatchObject({
      wiredVenueIds: ['binance-spot'],
      unsetVenueIds: ['bybit-spot', 'okx-spot'],
    });
  });

  it('describeVenueOperatorCredentials exposes full public MD venue board (D51)', () => {
    const board = describeVenueOperatorCredentials({});
    expect(board.venueIds).toEqual(PUBLIC_MARKET_DATA_VENUE_IDS);
    expect(board.wiredVenueIds).toEqual([]);
    expect(board.unsetVenueIds).toEqual([...PUBLIC_MARKET_DATA_VENUE_IDS]);
    expect(board.liveCredentialsOperatorIssued).toBe(true);
    expect(board.inventsCredentials).toBe(false);
  });

  it('buildOperatorVenueTradeAdapters and buildOperatorVenueAccountAdapters wire when operator env is complete (D47)', () => {
    const env = {
      VENUE_AGGREGATION_OKX_SPOT_API_KEY: 'k',
      VENUE_AGGREGATION_OKX_SPOT_API_SECRET: 's',
      VENUE_AGGREGATION_OKX_SPOT_PASSPHRASE: 'p',
    };
    expect(buildOperatorVenueTradeAdapters(env).wiredVenueIds).toEqual(['okx-spot']);
    expect(buildOperatorVenueAccountAdapters(env).wiredVenueIds).toEqual(['okx-spot']);
    expect(buildOperatorVenueTradeAdapters({}).wiredVenueIds).toEqual([]);
    expect(buildOperatorVenueAccountAdapters({}).wiredVenueIds).toEqual([]);
  });

  it('venueOperatorCredentialEnvPrefix maps venue ids to operator env keys (D49)', () => {
    expect(venueOperatorCredentialEnvPrefix('binance-spot')).toBe('VENUE_AGGREGATION_BINANCE_SPOT');
    expect(venueOperatorCredentialEnvPrefix('okx-spot')).toBe('VENUE_AGGREGATION_OKX_SPOT');
    const env = {
      [`${venueOperatorCredentialEnvPrefix('bybit-spot')}_API_KEY`]: 'k',
      [`${venueOperatorCredentialEnvPrefix('bybit-spot')}_API_SECRET`]: 's',
    };
    expect(loadVenueOperatorCredentials('bybit-spot', env)).toMatchObject({ venueId: 'bybit-spot' });
  });

  it('package index re-exports trading-half policy through fabric', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkgIndex = readFileSync(join(here, '..', '..', 'index.ts'), 'utf8');
    expect(pkgIndex).toMatch(/fabric\/index/);
    expect(describeTradingHalfPolicy().tradeFactoryCoversAllPublicMarketDataVenues).toBe(true);
  });
});

describe('aggregation trading door — factory integration', () => {
  for (const id of PUBLIC_MARKET_DATA_VENUE_IDS) {
    it(`${id}: MD + trade + account adapters exist; null creds probe`, () => {
      const md = createVenueMarketDataAdapter(id);
      const trade = createVenueTradeAdapter(id, null);
      const account = createVenueAccountAdapter(id, null);
      expect(md).not.toBeNull();
      expect(trade).not.toBeNull();
      expect(account).not.toBeNull();
      expect(md!.venue.id).toBe(id);
      expect(trade!.venue.id).toBe(id);
      expect(account!.venue.id).toBe(id);
    });

    it(`${id}: place refuses not_ready without HTTP port`, async () => {
      const adapter = createVenueTradeAdapter(id, tradeOnlyCreds(id), {
        http: new GetOnlyHttp(),
        restBase: 'https://rest.test',
        clock: () => 1,
      });
      expect(adapter).not.toBeNull();
      await expect(adapter!.placeOrder(LIMIT_ORDER)).rejects.toMatchObject({ reason: 'not_ready' });
    });
  }

  it('unknown venue id returns null for all factories', () => {
    for (const bad of ['', 'off', 'none', 'false', 'not-a-venue', 'ccxt', 'kraken-spot']) {
      expect(createVenueMarketDataAdapter(bad)).toBeNull();
      expect(createVenueTradeAdapter(bad, null)).toBeNull();
      expect(createVenueAccountAdapter(bad, null)).toBeNull();
    }
  });

  it('trade/account refuse without credentials — never silent success', async () => {
    const trade = createVenueTradeAdapter('binance-spot', null);
    const account = createVenueAccountAdapter('binance-spot', null);
    expect(trade).not.toBeNull();
    expect(account).not.toBeNull();
    await expect(trade!.placeOrder(LIMIT_ORDER)).rejects.toThrow(VenueCredentialsMissingError);
    await expect(account!.balances()).rejects.toThrow(VenueCredentialsMissingError);
  });
});
