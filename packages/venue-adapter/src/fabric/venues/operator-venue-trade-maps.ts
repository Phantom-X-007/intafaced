/**
 * venue.aggregation operator trade maps — OMS-style wiring from owner env (D33).
 *
 * Builds place/cancel/fetch/openOrders maps from VENUE_AGGREGATION_* credentials.
 * Blank env → venue omitted (refuse-closed). Never invents adapters.
 */

import type { TradeAdapter } from '@intafaced/venue-contracts';
import type { VenueTradeAdapterOptions } from './factory.js';
import { buildOperatorVenueTradeAdapters } from './venue-operator-credentials.js';

export type OperatorVenueTradeMaps = {
  readonly placeByVenue: Readonly<Record<string, TradeAdapter['placeOrder']>>;
  readonly cancelByVenue: Readonly<Record<string, TradeAdapter['cancelOrder']>>;
  readonly fetchByVenue: Readonly<Record<string, TradeAdapter['fetchOrder']>>;
  readonly openOrdersByVenue: Readonly<Record<string, TradeAdapter['openOrders']>>;
  readonly wiredVenueIds: readonly string[];
};

export function buildOperatorVenueTradeMaps(
  env: NodeJS.ProcessEnv = process.env,
  options?: VenueTradeAdapterOptions,
): OperatorVenueTradeMaps {
  const { adapters, wiredVenueIds } = buildOperatorVenueTradeAdapters(env, options);
  const placeByVenue: Record<string, TradeAdapter['placeOrder']> = {};
  const cancelByVenue: Record<string, TradeAdapter['cancelOrder']> = {};
  const fetchByVenue: Record<string, TradeAdapter['fetchOrder']> = {};
  const openOrdersByVenue: Record<string, TradeAdapter['openOrders']> = {};

  for (const [venueId, adapter] of Object.entries(adapters)) {
    placeByVenue[venueId] = adapter.placeOrder.bind(adapter);
    cancelByVenue[venueId] = adapter.cancelOrder.bind(adapter);
    fetchByVenue[venueId] = adapter.fetchOrder.bind(adapter);
    openOrdersByVenue[venueId] = adapter.openOrders.bind(adapter);
  }

  return { placeByVenue, cancelByVenue, fetchByVenue, openOrdersByVenue, wiredVenueIds };
}

export function describeOperatorVenueTradeMaps(env: NodeJS.ProcessEnv = process.env) {
  const maps = buildOperatorVenueTradeMaps(env);
  return {
    wiredVenueIds: maps.wiredVenueIds,
    inventsAdapters: false as const,
    operatorCredentialsRequired: true as const,
  };
}
