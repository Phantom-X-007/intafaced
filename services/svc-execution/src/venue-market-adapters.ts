/**
 * Wire `createVenueMarketDataAdapter` into OMS snapshot / markets / latency /
 * funding / borrow observation maps.
 *
 * Venue ids from EXECUTION_VENUE_IDS. Public market data only — no credentials.
 * Unknown ids skipped (no map entry).
 */
import { createVenueMarketDataAdapter } from '@intafaced/venue-adapter';
import type { MarketDataAdapter } from '@intafaced/venue-contracts';
import { marketDataAdapterBorrow } from './oms-market-borrow.js';
import { marketDataAdapterFunding } from './oms-market-funding.js';
import { marketDataAdapterLatency } from './oms-market-latency.js';
import { marketDataAdapterMarkets } from './oms-market-markets.js';
import { marketDataAdapterSnapshot } from './oms-market-snapshot.js';
import type { OmsBorrowFn } from './oms-borrow.js';
import type { OmsFundingFn } from './oms-funding.js';
import type { OmsLatencyFn } from './oms-latency.js';
import type { OmsMarketsFn } from './oms-markets.js';
import type { OmsSnapshotFn } from './oms-snapshot.js';
import type { ExecutionBorrowMap, ExecutionFundingMap, ExecutionLatencyMap, ExecutionMarketsMap, ExecutionSnapshotMap } from './router.js';
import { ExecutionVenueUnknownError, parseExecutionVenueIds } from './venue-adapters.js';

export type ExecutionVenueMarketWire = {
  readonly snapshot: OmsSnapshotFn;
  readonly markets: OmsMarketsFn;
  readonly latency: OmsLatencyFn;
  readonly funding: OmsFundingFn;
  readonly borrow: OmsBorrowFn;
};

export type ExecutionVenueMarketMaps = {
  readonly snapshotByVenue: ExecutionSnapshotMap;
  readonly marketsByVenue: ExecutionMarketsMap;
  readonly latencyByVenue: ExecutionLatencyMap;
  readonly fundingByVenue: ExecutionFundingMap;
  readonly borrowByVenue: ExecutionBorrowMap;
  readonly wiredVenueIds: readonly string[];
};

export type BuildExecutionVenueMarketMapsOptions = {
  readonly createAdapter?: typeof createVenueMarketDataAdapter;
};

function marketsBridge(adapter: MarketDataAdapter): OmsMarketsFn {
  const listAll = marketDataAdapterMarkets(adapter);
  return async (type, quote, base, active, settle, symbol, venueSymbol, expiry) => {
    let rows = await listAll();
    if (type !== undefined) rows = rows.filter((m) => m.type === type);
    if (quote !== undefined) rows = rows.filter((m) => m.quote === quote);
    if (base !== undefined) rows = rows.filter((m) => m.base === base);
    if (active !== undefined) rows = rows.filter((m) => m.active === active);
    if (settle !== undefined) rows = rows.filter((m) => m.settle === settle);
    if (symbol !== undefined) rows = rows.filter((m) => m.symbol === symbol);
    if (venueSymbol !== undefined) rows = rows.filter((m) => m.venueSymbol === venueSymbol);
    if (expiry !== undefined) rows = rows.filter((m) => m.expiry?.getTime() === expiry.getTime());
    return rows;
  };
}

export function wireMarketAdapter(adapter: MarketDataAdapter): ExecutionVenueMarketWire {
  return {
    snapshot: marketDataAdapterSnapshot(adapter),
    markets: marketsBridge(adapter),
    latency: marketDataAdapterLatency(adapter),
    funding: marketDataAdapterFunding(adapter),
    borrow: marketDataAdapterBorrow(adapter),
  };
}

export function wireExecutionVenueMarketAdapter(
  venueId: string,
  options: Pick<BuildExecutionVenueMarketMapsOptions, 'createAdapter'> = {},
): ExecutionVenueMarketWire {
  const id = venueId.trim().toLowerCase();
  const createAdapter = options.createAdapter ?? createVenueMarketDataAdapter;
  if (createAdapter(id) === null) {
    throw new ExecutionVenueUnknownError(id);
  }

  const adapter = createAdapter(id);
  if (!adapter) {
    throw new ExecutionVenueUnknownError(id);
  }
  return wireMarketAdapter(adapter);
}

export function buildExecutionVenueMarketMaps(
  venueIds: readonly string[],
  options: BuildExecutionVenueMarketMapsOptions = {},
): ExecutionVenueMarketMaps {
  const createAdapter = options.createAdapter ?? createVenueMarketDataAdapter;
  const snapshotByVenue: Record<string, OmsSnapshotFn> = {};
  const marketsByVenue: Record<string, OmsMarketsFn> = {};
  const latencyByVenue: Record<string, OmsLatencyFn> = {};
  const fundingByVenue: Record<string, OmsFundingFn> = {};
  const borrowByVenue: Record<string, OmsBorrowFn> = {};
  const wiredVenueIds: string[] = [];

  for (const rawId of venueIds) {
    const venueId = rawId.trim().toLowerCase();
    if (!venueId) continue;

    try {
      const wire = wireExecutionVenueMarketAdapter(venueId, { createAdapter });
      snapshotByVenue[venueId] = wire.snapshot;
      marketsByVenue[venueId] = wire.markets;
      latencyByVenue[venueId] = wire.latency;
      fundingByVenue[venueId] = wire.funding;
      borrowByVenue[venueId] = wire.borrow;
      wiredVenueIds.push(venueId);
    } catch (err) {
      if (err instanceof ExecutionVenueUnknownError) {
        continue;
      }
      throw err;
    }
  }

  return { snapshotByVenue, marketsByVenue, latencyByVenue, fundingByVenue, borrowByVenue, wiredVenueIds };
}

export { parseExecutionVenueIds };
