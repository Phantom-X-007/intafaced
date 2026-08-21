/**
 * Wire `createVenueTradeAdapter` into OMS submit/cancel/fetch/openOrders maps.
 *
 * Venue ids from EXECUTION_VENUE_IDS. Per-venue credentials from
 * EXECUTION_VENUE_{ID}_API_KEY / _API_SECRET / optional _PASSPHRASE (id dashes →
 * underscores, uppercased). Blank credential env → refuse-closed (venue not wired).
 * Unknown ids skipped (no map entry).
 */
import { createVenueTradeAdapter } from '@intafaced/venue-adapter';
import { assertTradeOnly, type TradeAdapter, type VenueCredentials } from '@intafaced/venue-contracts';
import type { OmsCancelFn } from './oms-cancel.js';
import type { OmsFetchFn } from './oms-fetch.js';
import type { OmsOpenOrdersFn } from './oms-open-orders.js';
import type { OmsSubmitFn } from './oms-trade-submit.js';
import { tradeAdapterCancel } from './oms-trade-cancel.js';
import { tradeAdapterFetch } from './oms-trade-fetch.js';
import { tradeAdapterOpenOrders } from './oms-trade-open-orders.js';
import { tradeAdapterSubmit } from './oms-trade-submit.js';
import type {
  ExecutionCancelMap,
  ExecutionFetchMap,
  ExecutionOpenOrdersMap,
  ExecutionSubmitMap,
} from './router.js';

const OFF_TOKENS = new Set(['', 'off', 'none', 'false']);

export class ExecutionVenueUnknownError extends Error {
  readonly venueId: string;

  constructor(venueId: string, message = `unknown execution venue id: ${venueId}`) {
    super(message);
    this.name = 'ExecutionVenueUnknownError';
    this.venueId = venueId;
  }
}

export class ExecutionVenueCredentialsUnsetError extends Error {
  readonly venueId: string;

  constructor(
    venueId: string,
    message = `${venueId}: EXECUTION_VENUE_* API_KEY and API_SECRET are unset — refusing to wire trade adapter`,
  ) {
    super(message);
    this.name = 'ExecutionVenueCredentialsUnsetError';
    this.venueId = venueId;
  }
}

export type ExecutionVenueTradeWire = {
  readonly submit: OmsSubmitFn;
  readonly cancel: OmsCancelFn;
  readonly fetch: OmsFetchFn;
  readonly openOrders: OmsOpenOrdersFn;
};

export type ExecutionVenueTradeMaps = {
  readonly submitByVenue: ExecutionSubmitMap;
  readonly cancelByVenue: ExecutionCancelMap;
  readonly fetchByVenue: ExecutionFetchMap;
  readonly openOrdersByVenue: ExecutionOpenOrdersMap;
  readonly wiredVenueIds: readonly string[];
};

export type BuildExecutionVenueTradeMapsOptions = {
  readonly credentialsFor?: (venueId: string) => VenueCredentials | null;
  readonly createAdapter?: typeof createVenueTradeAdapter;
};

export function parseExecutionVenueIds(raw: string): readonly string[] {
  const trimmed = raw.trim();
  if (OFF_TOKENS.has(trimmed.toLowerCase())) return [];
  const out: string[] = [];
  for (const part of trimmed.split(',')) {
    const id = part.trim().toLowerCase();
    if (!id || OFF_TOKENS.has(id)) continue;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

export function executionVenueCredentialEnvPrefix(venueId: string): string {
  return `EXECUTION_VENUE_${venueId.trim().toUpperCase().replace(/-/g, '_')}`;
}

export function loadExecutionVenueCredentials(venueId: string): VenueCredentials | null {
  const prefix = executionVenueCredentialEnvPrefix(venueId);
  const apiKey = process.env[`${prefix}_API_KEY`]?.trim() ?? '';
  const apiSecret = process.env[`${prefix}_API_SECRET`]?.trim() ?? '';
  if (!apiKey || !apiSecret) return null;

  const passphrase = process.env[`${prefix}_PASSPHRASE`]?.trim();
  const credentials: VenueCredentials = {
    venueId: venueId.trim().toLowerCase(),
    apiKey,
    apiSecret,
    ...(passphrase ? { passphrase } : {}),
    scopes: ['read', 'trade'],
  };
  assertTradeOnly(credentials);
  return credentials;
}

function openOrdersBridge(adapter: TradeAdapter): OmsOpenOrdersFn {
  const listAcknowledged = tradeAdapterOpenOrders(adapter);
  return async (symbol, side, type, clientOrderId, venueOrderId, feeAsset, status) => {
    let orders = await listAcknowledged(symbol);
    if (side) orders = orders.filter((order) => order.side === side);
    if (type) orders = orders.filter((order) => order.type === type);
    if (clientOrderId) orders = orders.filter((order) => order.clientOrderId === clientOrderId);
    if (venueOrderId) orders = orders.filter((order) => order.venueOrderId === venueOrderId);
    if (feeAsset) orders = orders.filter((order) => order.feeAsset === feeAsset);
    if (status) orders = orders.filter((order) => order.status === status);
    return orders;
  };
}

export function wireTradeAdapter(adapter: TradeAdapter): ExecutionVenueTradeWire {
  return {
    submit: tradeAdapterSubmit(adapter),
    cancel: tradeAdapterCancel(adapter),
    fetch: tradeAdapterFetch(adapter),
    openOrders: openOrdersBridge(adapter),
  };
}

export function wireExecutionVenueTradeAdapter(
  venueId: string,
  credentials: VenueCredentials | null,
  options: Pick<BuildExecutionVenueTradeMapsOptions, 'createAdapter'> = {},
): ExecutionVenueTradeWire {
  const id = venueId.trim().toLowerCase();
  const createAdapter = options.createAdapter ?? createVenueTradeAdapter;
  if (createAdapter(id, null) === null) {
    throw new ExecutionVenueUnknownError(id);
  }
  if (!credentials?.apiKey?.trim() || !credentials.apiSecret?.trim()) {
    throw new ExecutionVenueCredentialsUnsetError(id);
  }

  const adapter = createAdapter(id, credentials);
  if (!adapter) {
    throw new ExecutionVenueUnknownError(id);
  }
  return wireTradeAdapter(adapter);
}

export function buildExecutionVenueTradeMaps(
  venueIds: readonly string[],
  options: BuildExecutionVenueTradeMapsOptions = {},
): ExecutionVenueTradeMaps {
  const createAdapter = options.createAdapter ?? createVenueTradeAdapter;
  const credentialsFor = options.credentialsFor ?? loadExecutionVenueCredentials;
  const submitByVenue: Record<string, OmsSubmitFn> = {};
  const cancelByVenue: Record<string, OmsCancelFn> = {};
  const fetchByVenue: Record<string, OmsFetchFn> = {};
  const openOrdersByVenue: Record<string, OmsOpenOrdersFn> = {};
  const wiredVenueIds: string[] = [];

  for (const rawId of venueIds) {
    const venueId = rawId.trim().toLowerCase();
    if (!venueId || OFF_TOKENS.has(venueId)) continue;

    try {
      const wire = wireExecutionVenueTradeAdapter(venueId, credentialsFor(venueId), { createAdapter });
      submitByVenue[venueId] = wire.submit;
      cancelByVenue[venueId] = wire.cancel;
      fetchByVenue[venueId] = wire.fetch;
      openOrdersByVenue[venueId] = wire.openOrders;
      wiredVenueIds.push(venueId);
    } catch (err) {
      if (err instanceof ExecutionVenueUnknownError || err instanceof ExecutionVenueCredentialsUnsetError) {
        continue;
      }
      throw err;
    }
  }

  return { submitByVenue, cancelByVenue, fetchByVenue, openOrdersByVenue, wiredVenueIds };
}
