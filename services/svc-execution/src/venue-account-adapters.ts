/**
 * Wire `createVenueAccountAdapter` into OMS balances / positions / rails maps.
 *
 * Same EXECUTION_VENUE_IDS + EXECUTION_VENUE_{ID}_* credential env as trade.
 * Blank credentials → refuse-closed (venue skipped). Unknown ids skipped.
 */
import { createVenueAccountAdapter, loadVenueOperatorCredentials, PUBLIC_MARKET_DATA_VENUE_IDS } from '@intafaced/venue-adapter';
import type { AccountAdapter, VenueCredentials } from '@intafaced/venue-contracts';
import { accountAdapterBalances, type OmsBalancesFn } from './oms-account-balances.js';
import { accountAdapterPositions, type OmsPositionsFn } from './oms-account-positions.js';
import { accountAdapterRails, type OmsRailsFn } from './oms-account-rails.js';
import type { ExecutionBalancesMap, ExecutionPositionsMap, ExecutionRailsMap } from './router.js';
import {
  ExecutionVenueCredentialsUnsetError,
  ExecutionVenueUnknownError,
  loadExecutionVenueCredentials,
  parseExecutionVenueIds,
} from './venue-adapters.js';

export type ExecutionVenueAccountWire = {
  readonly balances: OmsBalancesFn;
  readonly positions: OmsPositionsFn;
  readonly rails: OmsRailsFn;
};

export type ExecutionVenueAccountMaps = {
  readonly balancesByVenue: ExecutionBalancesMap;
  readonly positionsByVenue: ExecutionPositionsMap;
  readonly railsByVenue: ExecutionRailsMap;
  readonly wiredVenueIds: readonly string[];
  readonly operatorSupplementVenueIds: readonly string[];
};

export type BuildExecutionVenueAccountMapsOptions = {
  readonly env?: NodeJS.ProcessEnv;
  readonly credentialsFor?: (venueId: string) => VenueCredentials | null;
  readonly createAdapter?: typeof createVenueAccountAdapter;
};

export function wireAccountAdapter(adapter: AccountAdapter): ExecutionVenueAccountWire {
  return {
    balances: accountAdapterBalances(adapter),
    positions: accountAdapterPositions(adapter),
    rails: accountAdapterRails(adapter),
  };
}

export function wireExecutionVenueAccountAdapter(
  venueId: string,
  credentials: VenueCredentials | null,
  options: Pick<BuildExecutionVenueAccountMapsOptions, 'createAdapter'> = {},
): ExecutionVenueAccountWire {
  const id = venueId.trim().toLowerCase();
  const createAdapter = options.createAdapter ?? createVenueAccountAdapter;
  if (createAdapter(id, null) === null) {
    throw new ExecutionVenueUnknownError(id);
  }
  if (!credentials?.apiKey?.trim() || !credentials.apiSecret?.trim()) {
    throw new ExecutionVenueCredentialsUnsetError(
      id,
      `${id}: EXECUTION_VENUE_* API_KEY and API_SECRET are unset — refusing to wire account adapter`,
    );
  }

  const adapter = createAdapter(id, credentials);
  if (!adapter) {
    throw new ExecutionVenueUnknownError(id);
  }
  return wireAccountAdapter(adapter);
}

export function buildExecutionVenueAccountMaps(
  venueIds: readonly string[],
  options: BuildExecutionVenueAccountMapsOptions = {},
): ExecutionVenueAccountMaps {
  const createAdapter = options.createAdapter ?? createVenueAccountAdapter;
  const credentialsFor = options.credentialsFor ?? loadExecutionVenueCredentials;
  const balancesByVenue: Record<string, OmsBalancesFn> = {};
  const positionsByVenue: Record<string, OmsPositionsFn> = {};
  const railsByVenue: Record<string, OmsRailsFn> = {};
  const wiredVenueIds: string[] = [];

  for (const rawId of venueIds) {
    const venueId = rawId.trim().toLowerCase();
    if (!venueId) continue;

    try {
      const wire = wireExecutionVenueAccountAdapter(venueId, credentialsFor(venueId), { createAdapter });
      balancesByVenue[venueId] = wire.balances;
      positionsByVenue[venueId] = wire.positions;
      railsByVenue[venueId] = wire.rails;
      wiredVenueIds.push(venueId);
    } catch (err) {
      if (err instanceof ExecutionVenueUnknownError || err instanceof ExecutionVenueCredentialsUnsetError) {
        continue;
      }
      throw err;
    }
  }

  return { balancesByVenue, positionsByVenue, railsByVenue, wiredVenueIds, operatorSupplementVenueIds: [] };
}

/** EXECUTION_VENUE_IDS first; supplements public MD venues with VENUE_AGGREGATION_* operator creds. */
export function buildExecutionVenueAccountMapsWithOperatorSupplement(
  venueIds: readonly string[],
  options: BuildExecutionVenueAccountMapsOptions = {},
): ExecutionVenueAccountMaps {
  const env = options.env ?? process.env;
  const primary = buildExecutionVenueAccountMaps(venueIds, {
    ...options,
    credentialsFor: options.credentialsFor ?? ((id) => loadExecutionVenueCredentials(id, env)),
  });

  const balancesByVenue = { ...primary.balancesByVenue };
  const positionsByVenue = { ...primary.positionsByVenue };
  const railsByVenue = { ...primary.railsByVenue };
  const wiredVenueIds = [...primary.wiredVenueIds];
  const operatorSupplementVenueIds: string[] = [];

  for (const venueId of PUBLIC_MARKET_DATA_VENUE_IDS) {
    if (balancesByVenue[venueId]) continue;
    const credentials = loadVenueOperatorCredentials(venueId, env);
    if (!credentials) continue;
    try {
      const wire = wireExecutionVenueAccountAdapter(venueId, credentials, options);
      balancesByVenue[venueId] = wire.balances;
      positionsByVenue[venueId] = wire.positions;
      railsByVenue[venueId] = wire.rails;
      wiredVenueIds.push(venueId);
      operatorSupplementVenueIds.push(venueId);
    } catch (err) {
      if (err instanceof ExecutionVenueUnknownError || err instanceof ExecutionVenueCredentialsUnsetError) {
        continue;
      }
      throw err;
    }
  }

  return { balancesByVenue, positionsByVenue, railsByVenue, wiredVenueIds, operatorSupplementVenueIds };
}

export { parseExecutionVenueIds };
