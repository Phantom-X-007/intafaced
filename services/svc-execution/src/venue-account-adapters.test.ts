import { describe, expect, it, vi } from 'vitest';
import type { AccountAdapter, VenueBalance, VenueCredentials } from '@intafaced/venue-contracts';
import { buildExecutionVenueAccountMaps, wireAccountAdapter, wireExecutionVenueAccountAdapter } from './venue-account-adapters.js';
import { ExecutionVenueCredentialsUnsetError, ExecutionVenueUnknownError } from './venue-adapters.js';

const CREDS: VenueCredentials = {
  venueId: 'binance-spot',
  apiKey: 'k',
  apiSecret: 's',
  scopes: ['read', 'trade'],
};

function fakeAccount(balances: VenueBalance[] = []): AccountAdapter {
  return {
    balances: vi.fn(async () => balances),
    positions: vi.fn(async () => []),
    transferRails: vi.fn(async () => []),
  };
}

describe('wireExecutionVenueAccountAdapter', () => {
  it('wires known venue with credentials', () => {
    const createAdapter = vi.fn((id: string, creds: VenueCredentials | null) =>
      id === 'binance-spot' ? fakeAccount([{ asset: 'USDT', free: '1', locked: '0' }]) : null,
    );
    const wire = wireExecutionVenueAccountAdapter('binance-spot', CREDS, { createAdapter });
    expect(createAdapter).toHaveBeenCalledWith('binance-spot', CREDS);
    expect(wire.balances).toBeTypeOf('function');
  });

  it('refuses unknown venue id', () => {
    expect(() => wireExecutionVenueAccountAdapter('unknown-venue', CREDS, { createAdapter: () => null })).toThrow(
      ExecutionVenueUnknownError,
    );
  });

  it('refuses blank credentials', () => {
    expect(() =>
      wireExecutionVenueAccountAdapter('binance-spot', null, {
        createAdapter: (id) => (id === 'binance-spot' ? fakeAccount() : null),
      }),
    ).toThrow(ExecutionVenueCredentialsUnsetError);
  });
});

describe('buildExecutionVenueAccountMaps', () => {
  it('skips venues without credentials — never invents a map entry', () => {
    const maps = buildExecutionVenueAccountMaps(['binance-spot', 'bybit-spot'], {
      credentialsFor: (id) => (id === 'binance-spot' ? CREDS : null),
      createAdapter: (id) => (id === 'binance-spot' || id === 'bybit-spot' ? fakeAccount() : null),
    });
    expect(maps.wiredVenueIds).toEqual(['binance-spot']);
    expect(Object.keys(maps.balancesByVenue)).toEqual(['binance-spot']);
    expect(maps.balancesByVenue['bybit-spot']).toBeUndefined();
  });

  it('forwards adapter balances without rewriting', async () => {
    const balances: VenueBalance[] = [{ asset: 'BTC', free: '0.5', locked: '0.1' }];
    const wire = wireAccountAdapter(fakeAccount(balances));
    await expect(wire.balances()).resolves.toEqual(balances);
  });
});
