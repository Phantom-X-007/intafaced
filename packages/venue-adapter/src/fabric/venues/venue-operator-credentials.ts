/**
 * venue.aggregation operator credentials — owner-issued keys only (D30).
 *
 * Reads VENUE_AGGREGATION_{VENUE}_API_KEY / _API_SECRET / optional _PASSPHRASE.
 * Blank env → null (refuse-closed). Never invents credentials.
 */
import { assertTradeOnly, type VenueCredentials } from '@intafaced/venue-contracts';
import { createVenueTradeAdapter, PUBLIC_MARKET_DATA_VENUE_IDS, type VenueTradeAdapter, type VenueTradeAdapterOptions } from './factory.js';

export function venueOperatorCredentialEnvPrefix(venueId: string): string {
  return `VENUE_AGGREGATION_${venueId.trim().toUpperCase().replace(/-/g, '_')}`;
}

export function loadVenueOperatorCredentials(venueId: string, env: NodeJS.ProcessEnv = process.env): VenueCredentials | null {
  const id = venueId.trim().toLowerCase();
  const prefix = venueOperatorCredentialEnvPrefix(id);
  const apiKey = env[`${prefix}_API_KEY`]?.trim() ?? '';
  const apiSecret = env[`${prefix}_API_SECRET`]?.trim() ?? '';
  if (!apiKey || !apiSecret) return null;

  const passphrase = env[`${prefix}_PASSPHRASE`]?.trim();
  const credentials: VenueCredentials = {
    venueId: id,
    apiKey,
    apiSecret,
    ...(passphrase ? { passphrase } : {}),
    scopes: ['read', 'trade'],
  };
  assertTradeOnly(credentials);
  return credentials;
}

/** Wire trade adapter from owner env — null when keys unset (refuse-closed). */
export function createVenueTradeAdapterFromOperatorEnv(
  venueId: string,
  env: NodeJS.ProcessEnv = process.env,
  options?: VenueTradeAdapterOptions,
): VenueTradeAdapter | null {
  const credentials = loadVenueOperatorCredentials(venueId, env);
  if (!credentials) return null;
  return createVenueTradeAdapter(venueId, credentials, options);
}

export type OperatorVenueTradeWire = {
  readonly adapters: Readonly<Record<string, VenueTradeAdapter>>;
  readonly wiredVenueIds: readonly string[];
};

/** Build trade adapters for every public MD venue with complete operator env. */
export function buildOperatorVenueTradeAdapters(
  env: NodeJS.ProcessEnv = process.env,
  options?: VenueTradeAdapterOptions,
): OperatorVenueTradeWire {
  const adapters: Record<string, VenueTradeAdapter> = {};
  const wiredVenueIds: string[] = [];
  for (const id of PUBLIC_MARKET_DATA_VENUE_IDS) {
    const adapter = createVenueTradeAdapterFromOperatorEnv(id, env, options);
    if (!adapter) continue;
    adapters[id] = adapter;
    wiredVenueIds.push(id);
  }
  return { adapters, wiredVenueIds };
}

export function describeVenueOperatorCredentials(env: NodeJS.ProcessEnv = process.env) {
  const wiredVenueIds: string[] = [];
  const unsetVenueIds: string[] = [];
  for (const id of PUBLIC_MARKET_DATA_VENUE_IDS) {
    if (loadVenueOperatorCredentials(id, env)) wiredVenueIds.push(id);
    else unsetVenueIds.push(id);
  }
  return {
    venueIds: [...PUBLIC_MARKET_DATA_VENUE_IDS],
    wiredVenueIds,
    unsetVenueIds,
    inventsCredentials: false as const,
    liveCredentialsOperatorIssued: true as const,
  };
}
