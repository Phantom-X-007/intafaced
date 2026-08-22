import { describe, expect, it } from 'vitest';
import { buildOperatorVenueAccountMaps, describeOperatorVenueAccountMaps } from './operator-venue-account-maps.js';

describe('operator venue account maps (D36)', () => {
  it('describeOperatorVenueAccountMaps reports empty when owner env blank', () => {
    expect(describeOperatorVenueAccountMaps({})).toMatchObject({
      wiredVenueIds: [],
      inventsAdapters: false,
      operatorCredentialsRequired: true,
    });
  });

  it('buildOperatorVenueAccountMaps wires only venues with complete operator env', () => {
    const maps = buildOperatorVenueAccountMaps({
      VENUE_AGGREGATION_BINANCE_SPOT_API_KEY: 'k',
      VENUE_AGGREGATION_BINANCE_SPOT_API_SECRET: 's',
    });
    expect(maps.wiredVenueIds).toEqual(['binance-spot']);
    expect(maps.balancesByVenue['binance-spot']).toBeTypeOf('function');
    expect(maps.positionsByVenue['binance-spot']).toBeTypeOf('function');
    expect(maps.transferRailsByVenue['binance-spot']).toBeTypeOf('function');
    expect(maps.balancesByVenue['bybit-spot']).toBeUndefined();
  });

  it('balances refuses not_ready without HTTP port — never silent success', async () => {
    const maps = buildOperatorVenueAccountMaps(
      {
        VENUE_AGGREGATION_BYBIT_SPOT_API_KEY: 'k',
        VENUE_AGGREGATION_BYBIT_SPOT_API_SECRET: 's',
      },
      {
        http: {
          async get() {
            return { status: 503, body: null, header: () => null };
          },
        },
      },
    );
    await expect(maps.balancesByVenue['bybit-spot']!()).rejects.toMatchObject({
      reason: expect.stringMatching(/not_ready|unreachable/),
    });
  });
});
