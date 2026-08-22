import { describe, expect, it } from 'vitest';
import { PUBLIC_MARKET_DATA_VENUE_IDS } from './factory.js';
import {
  buildOperatorVenueTradeAdapters,
  createVenueTradeAdapterFromOperatorEnv,
  describeVenueOperatorCredentials,
  loadVenueOperatorCredentials,
  venueOperatorCredentialEnvPrefix,
} from './venue-operator-credentials.js';

describe('venue operator credentials (D30)', () => {
  it('env prefix maps venue id to VENUE_AGGREGATION_* keys', () => {
    expect(venueOperatorCredentialEnvPrefix('binance-spot')).toBe('VENUE_AGGREGATION_BINANCE_SPOT');
    expect(venueOperatorCredentialEnvPrefix('okx-spot')).toBe('VENUE_AGGREGATION_OKX_SPOT');
  });

  it('loadVenueOperatorCredentials returns null when owner env is blank', () => {
    expect(loadVenueOperatorCredentials('binance-spot', {})).toBeNull();
    expect(loadVenueOperatorCredentials('binance-spot', { VENUE_AGGREGATION_BINANCE_SPOT_API_KEY: 'k' })).toBeNull();
  });

  it('loadVenueOperatorCredentials returns trade-only creds when owner env is complete', () => {
    const creds = loadVenueOperatorCredentials('okx-spot', {
      VENUE_AGGREGATION_OKX_SPOT_API_KEY: 'key',
      VENUE_AGGREGATION_OKX_SPOT_API_SECRET: 'secret',
      VENUE_AGGREGATION_OKX_SPOT_PASSPHRASE: 'pass',
    });
    expect(creds).toMatchObject({
      venueId: 'okx-spot',
      apiKey: 'key',
      apiSecret: 'secret',
      passphrase: 'pass',
      scopes: ['read', 'trade'],
    });
  });

  it('createVenueTradeAdapterFromOperatorEnv returns null when env is blank', () => {
    expect(createVenueTradeAdapterFromOperatorEnv('binance-spot', {})).toBeNull();
  });

  it('createVenueTradeAdapterFromOperatorEnv wires trade adapter when env is complete', () => {
    const adapter = createVenueTradeAdapterFromOperatorEnv('bybit-spot', {
      VENUE_AGGREGATION_BYBIT_SPOT_API_KEY: 'k',
      VENUE_AGGREGATION_BYBIT_SPOT_API_SECRET: 's',
    });
    expect(adapter).not.toBeNull();
    expect(adapter!.venue.id).toBe('bybit-spot');
  });

  it('buildOperatorVenueTradeAdapters only wires venues with complete owner env', () => {
    const wire = buildOperatorVenueTradeAdapters({
      VENUE_AGGREGATION_OKX_SPOT_API_KEY: 'k',
      VENUE_AGGREGATION_OKX_SPOT_API_SECRET: 's',
      VENUE_AGGREGATION_OKX_SPOT_PASSPHRASE: 'p',
    });
    expect(wire.wiredVenueIds).toEqual(['okx-spot']);
    expect(wire.adapters['okx-spot']?.venue.id).toBe('okx-spot');
  });

  it('describeVenueOperatorCredentials never invents wired venues', () => {
    const board = describeVenueOperatorCredentials({});
    expect(board.venueIds).toEqual([...PUBLIC_MARKET_DATA_VENUE_IDS]);
    expect(board.wiredVenueIds).toEqual([]);
    expect(board.unsetVenueIds).toEqual([...PUBLIC_MARKET_DATA_VENUE_IDS]);
    expect(board.inventsCredentials).toBe(false);
  });
});
