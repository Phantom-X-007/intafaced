import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import { buildOperatorVenueTradeMaps, describeOperatorVenueTradeMaps } from './operator-venue-trade-maps.js';

describe('operator venue trade maps (D33)', () => {
  it('describeOperatorVenueTradeMaps reports empty when owner env blank', () => {
    expect(describeOperatorVenueTradeMaps({})).toMatchObject({
      wiredVenueIds: [],
      inventsAdapters: false,
      operatorCredentialsRequired: true,
    });
  });

  it('buildOperatorVenueTradeMaps wires only venues with complete operator env', () => {
    const maps = buildOperatorVenueTradeMaps({
      VENUE_AGGREGATION_BINANCE_SPOT_API_KEY: 'k',
      VENUE_AGGREGATION_BINANCE_SPOT_API_SECRET: 's',
    });
    expect(maps.wiredVenueIds).toEqual(['binance-spot']);
    expect(maps.placeByVenue['binance-spot']).toBeTypeOf('function');
    expect(maps.cancelByVenue['binance-spot']).toBeTypeOf('function');
    expect(maps.fetchByVenue['binance-spot']).toBeTypeOf('function');
    expect(maps.openOrdersByVenue['binance-spot']).toBeTypeOf('function');
    expect(maps.placeByVenue['bybit-spot']).toBeUndefined();
  });

  it('place refuses not_ready without HTTP port — never silent success', async () => {
    const maps = buildOperatorVenueTradeMaps(
      {
        VENUE_AGGREGATION_BYBIT_SPOT_API_KEY: 'k',
        VENUE_AGGREGATION_BYBIT_SPOT_API_SECRET: 's',
      },
      {
        // Get-only: no signed POST. Must refuse, never hit a live venue.
        http: {
          async get() {
            return { status: 503, body: null, header: () => null };
          },
        },
        snapshotLimit: 5,
      },
    );
    await expect(
      maps.placeByVenue['bybit-spot']!({
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        amount: parseAmount('1'),
        price: parseAmount('100'),
        clientOrderId: 'op-map-test',
      }),
    ).rejects.toMatchObject({ reason: expect.stringMatching(/not_ready|unreachable/) });
  });
});
