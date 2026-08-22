/**
 * venue.aggregation operator account maps — OMS-style wiring from owner env (D36).
 *
 * Builds balances/positions/transferRails maps from VENUE_AGGREGATION_* credentials.
 * Blank env → venue omitted (refuse-closed). Never invents adapters.
 */

import type { AccountAdapter } from '@intafaced/venue-contracts';
import type { VenueAccountAdapterOptions } from './factory.js';
import { buildOperatorVenueAccountAdapters } from './venue-operator-credentials.js';

export type OperatorVenueAccountMaps = {
  readonly balancesByVenue: Readonly<Record<string, AccountAdapter['balances']>>;
  readonly positionsByVenue: Readonly<Record<string, AccountAdapter['positions']>>;
  readonly transferRailsByVenue: Readonly<Record<string, AccountAdapter['transferRails']>>;
  readonly wiredVenueIds: readonly string[];
};

export function buildOperatorVenueAccountMaps(
  env: NodeJS.ProcessEnv = process.env,
  options?: VenueAccountAdapterOptions,
): OperatorVenueAccountMaps {
  const { adapters, wiredVenueIds } = buildOperatorVenueAccountAdapters(env, options);
  const balancesByVenue: Record<string, AccountAdapter['balances']> = {};
  const positionsByVenue: Record<string, AccountAdapter['positions']> = {};
  const transferRailsByVenue: Record<string, AccountAdapter['transferRails']> = {};

  for (const [venueId, adapter] of Object.entries(adapters)) {
    balancesByVenue[venueId] = adapter.balances.bind(adapter);
    positionsByVenue[venueId] = adapter.positions.bind(adapter);
    transferRailsByVenue[venueId] = adapter.transferRails.bind(adapter);
  }

  return { balancesByVenue, positionsByVenue, transferRailsByVenue, wiredVenueIds };
}

export function describeOperatorVenueAccountMaps(env: NodeJS.ProcessEnv = process.env) {
  const maps = buildOperatorVenueAccountMaps(env);
  return {
    wiredVenueIds: maps.wiredVenueIds,
    inventsAdapters: false as const,
    operatorCredentialsRequired: true as const,
  };
}
