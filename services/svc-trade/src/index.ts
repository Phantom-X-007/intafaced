import Fastify from 'fastify';
import postgres from 'postgres';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createEdgeContext } from '@intafaced/contracts';
import { JetStreamEventBus } from '@intafaced/events';
import { env } from './env.js';
import { TradeService } from './spot/trade-service.js';
import { createMatchingClient } from './spot/matching-client.js';
import { createRankPerksClient } from './spot/rank-perks.js';
import { createAffiliateAccrueClient } from './spot/affiliate-accrue.js';
import { createAffiliatePayoutClient } from './spot/affiliate-payout.js';
import { createSubAccountOwnershipClient } from './spot/sub-account-ownership.js';
import { createLedgerClient } from './ledger-client.js';
import { subscribeMatchingEvents } from './events.js';
import { createTradeRouter, type TradeRouter } from './router.js';
import { registerPublicRest } from './public-rest.js';
import { registerFuturesTickerRest } from './futures/futures-ticker-rest.js';
import { registerPrivateRest } from './private-rest.js';
import { attachExpireStash, bindExpireAt, installGtdGttPlace } from './spot/gtd-gtt-place.js';
import { attachReduceOnlyStash, bindReduceOnly, installReduceOnlyPlace } from './spot/reduce-only-place.js';
import { memoryOutcomeCatalogue, registerOutcomesRest } from './outcomes-rest.js';
import { registerPositionPreviewRest } from './futures/position-preview-rest.js';
import { registerSpotOrderPreviewRest } from './spot/order-preview-rest.js';
import { PositionService, FuturesError } from './futures/position-service.js';
import {
  ADL_DISCLOSURE_VERSION,
  assertAdlDisclosureAcked,
  presentAdlDisclosureWire,
  sqlAdlDisclosureStore,
  AdlDisclosureError,
} from './futures/adl-disclosure.js';
import { presentAdlActionDisclosureWire, sqlAdlDisclosureEventStore } from './futures/adl-last-resort.js';
import { optionalProfitSourceFromConfig } from './futures/profit-source.js';
import { parseConfiguredMaxLeverage } from './futures/initial-margin.js';
import { parseFundingMarketIds, startFuturesJobs } from './futures/futures-jobs.js';
import { presentMarginCallWire } from './futures/margin-call-transport.js';
import { createConfiguredVenueMarkSource, createVenueMarketDataAdapter, parseVenueMarkSymbols } from './futures/mark-from-venue.js';
import { presentVenueLatencyHealth } from './futures/venue-latency-health.js';
import { presentInsuranceListingPolicy } from './futures/insurance-listing-gate.js';
import { presentFuturesJobsHealth } from './futures/futures-jobs-health.js';
import { MaintainedBook } from '@intafaced/venue-adapter';
import { registerInternalFundingRate } from './futures/internal-funding-rate.js';
import { createCopyLeaderFixturesStore } from './agents/copy-leader-fixtures-store.js';
import { registerCopyLeaderFixturesRoutes } from './agents/copy-leader-fixtures-routes.js';
import { resolveFundingMaxAbsRateForBoot } from './futures/funding-rate-bound.js';
import { parseMmSeedTargets, startMmSeedJobs } from './mm/seed-jobs.js';
import { presentMmSeedHealth } from './mm/seed-health.js';
import { createMmMidSourceFromConfig } from './mm/mid-source.js';
import { HOUSE_MM_USER_UUID } from './spot/ids.js';
import { parseCandleMarketIds, parseCandleTimeframes } from './spot/candles.js';
import { startCandleJobs } from './spot/candle-jobs.js';
import { startEngineLedgerReconcileJobs } from './spot/engine-ledger-reconcile-jobs.js';
import { startAlgoJobs } from './algo/algo-jobs.js';
import { checkEngineSequences, describeRegressions } from './spot/sequence-guard.js';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { registerProcessHooks, startTelemetry } from '@intafaced/telemetry';
import { parseOtcDeskLawJson } from './otc/desk-law.js';
import { createOtcMidSourceFromConfig } from './otc/venue-mid-source.js';
import { describeOtcMidFeedWiring } from './otc/mid-feed.js';
import { OtcDeskService } from './otc/otc-service.js';
import { SqlOtcQuoteStore } from './otc/quote-store.js';
import { createOtcStakeSource } from './otc/stake-source.js';
import { canonicalizeCopyFillId } from './copy/fee-share.js';
import { parseCopyFeeShareLawJson, parseCopyJurisdictionLawJson } from './copy/fee-share-law.js';
import { CopyService } from './copy/copy-service.js';
import { SqlCopyFollowStore } from './copy/follow-store.js';
import { SqlMarketLifecycleAuthority, SqlMarketLifecycleEvidenceStore } from './market-lifecycle.js';
import { registerMarketLifecycleRoutes } from './market-lifecycle-routes.js';

// §9 — register the TracerProvider before the first span is created.
// `@opentelemetry/api` alone is a no-op: without this call every span in
// ./tracing.ts is built, tagged and then discarded before it reaches the
// collector. Tracers grabbed at module scope resolve lazily through the proxy
// provider, so registering here still captures them.
registerProcessHooks(
  startTelemetry({
    serviceName: env.SERVICE_NAME,
    endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    enabled: env.OTEL_ENABLED,
    environment: env.APP_ENV,
  }),
);

/**
 * svc-trade — the product layer over the matching engine (§5.2).
 *
 * Graph W1-R: mount tRPC; verify edge-signed principal (mount-boundary #48).
 */

const sql = postgres(env.DATABASE_URL, {
  max: env.DATABASE_POOL_MAX,
  ssl: env.DATABASE_SSL ? 'require' : false,
  connection: { search_path: 'trade,public', application_name: env.SERVICE_NAME },
  onnotice: () => undefined,
});

await sql`SELECT 1 FROM trade.markets LIMIT 1`.catch(() => {
  throw new Error('trade schema is missing — run migrations before starting svc-trade');
});

// Value moves through svc-ledger, never through this service's own tables
// (Doctrine §0.6). This client is the only path.
const ledger = createLedgerClient(env.LEDGER_URL, env.INTERNAL_SERVICE_SECRET);

// The book lives in svc-matching. This service never runs one of its own —
// §5.1 draws that line and a second book would be a second truth.
const matching = createMatchingClient(env.MATCHING_URL, env.INTERNAL_SERVICE_SECRET);
const perks = createRankPerksClient(env.IDENTITY_URL, env.INTERNAL_SERVICE_SECRET);
const subAccounts = createSubAccountOwnershipClient(env.IDENTITY_URL, env.INTERNAL_SERVICE_SECRET);
const affiliateAccrue = createAffiliateAccrueClient(env.IDENTITY_URL, env.INTERNAL_SERVICE_SECRET);
const affiliatePayout = createAffiliatePayoutClient(env.IDENTITY_URL, env.INTERNAL_SERVICE_SECRET);

// PX-S01 reads externally published authority/dossier evidence from SQL on
// every decision. Readiness is derived from this process's real kill switch and
// the matching service's explicit market membership; absent evidence remains a
// typed refusal and no process-local cache can become an authority replica.
const marketLifecycleStore = new SqlMarketLifecycleEvidenceStore(sql);
const marketLifecycle = new SqlMarketLifecycleAuthority(sql, matching, {
  spotEnabled: env.TRADE_SPOT_ENABLED,
  futuresEnabled: env.TRADE_FUTURES_ENABLED,
});

const bus = await JetStreamEventBus.connect({
  servers: env.NATS_URL,
  producer: env.SERVICE_NAME,
  streamPrefix: env.NATS_STREAM_PREFIX,
  // Hosts `orderUpdated` (user-visible lifecycle for private streams).
  ownedStreams: ['trade'],
});

const trade = new TradeService(sql, ledger, matching, perks, bus, {
  marketLifecycle,
  spotEnabled: env.TRADE_SPOT_ENABLED,
  futuresEnabled: env.TRADE_FUTURES_ENABLED,
  optionsSettlementAssetLaw: env.TRADE_OPTIONS_SETTLEMENT_ASSET_LAW,
  optionsSettlementFixing: env.TRADE_OPTIONS_SETTLEMENT_FIXING,
  marketSlippageCapBps: env.TRADE_MARKET_SLIPPAGE_CAP_BPS,
  convertEnabled: env.TRADE_CONVERT_ENABLED,
  convertSpreadBps: env.TRADE_CONVERT_SPREAD_BPS,
  algoEnabled: env.TRADE_ALGO_ENABLED,
  // SD-4: same kill as TRADE_MM_SEED_ENABLED — seeded placeOrder path stays OFF by default.
  seedPlaceEnabled: env.TRADE_MM_SEED_ENABLED,
  subAccounts,
  affiliateAccrue,
  affiliatePayout,
});

const subscriptions = await subscribeMatchingEvents(bus, trade);

// Venue fabric public mid (A-TRADE-VENUE-1). Empty venue = off. Shared with MM + OTC.
// Unknown venue id → null (refuse invent). Created before OTC so the desk can chain it.
const venuePublicAdapter = createVenueMarketDataAdapter(env.TRADE_VENUE_MARK_VENUE);

// Stream books start after Fastify (needs app.log). The map is filled then;
// lookups before run() returns null (unservable), never an invented mid.
const venueMarkSymbols = parseVenueMarkSymbols(env.TRADE_VENUE_MARK_SYMBOLS);
const otcVenueSymbols = parseVenueMarkSymbols(env.TRADE_OTC_VENUE_SYMBOLS);
const venueStreamSymbols = new Set([...venueMarkSymbols.values(), ...otcVenueSymbols.values()]);
const venueMaintainedBooks = new Map<string, MaintainedBook>();
const venueBookPort =
  env.TRADE_VENUE_MARK_STREAM && venuePublicAdapter && venueStreamSymbols.size > 0
    ? (symbol: string) => {
        const book = venueMaintainedBooks.get(symbol);
        if (!book) return null;
        return {
          get servable() {
            return book.servable;
          },
          top: () => book.top(),
          observedAt: () => book.tracker.observedAt,
        };
      }
    : undefined;

// trade.otc — D-S-02 / D26-P1-T2. Empty TRADE_OTC_DESK_LAW → refuse-closed (no invent).
// Empty TRADE_OTC_MIDS / unmapped venue pair → the desk can source no price and refuses.
// Boot-stamped mids carry asOf; venue observation refreshes asOf when opted in.
const otcDeskLaw = parseOtcDeskLawJson(env.TRADE_OTC_DESK_LAW);
const otcStakes = createOtcStakeSource(env.TOKEN_URL, env.INTERNAL_SERVICE_SECRET);
const otcMidBuilt = createOtcMidSourceFromConfig({
  midsEnv: env.TRADE_OTC_MIDS,
  midFromVenue: env.TRADE_OTC_MID_FROM_VENUE,
  venueAdapter: venuePublicAdapter,
  venueSymbols: env.TRADE_OTC_VENUE_SYMBOLS,
  ...(venueBookPort ? { bookForSymbol: venueBookPort } : {}),
});
const otcMidFeedWiring = describeOtcMidFeedWiring({
  midFromVenue: env.TRADE_OTC_MID_FROM_VENUE,
  venueAdapterInstalled: venuePublicAdapter != null,
  venueSymbolsConfigured: env.TRADE_OTC_VENUE_SYMBOLS.trim().length > 0,
  liveObservationFeed: otcMidBuilt.liveObservationFeed,
});
const otc = new OtcDeskService(ledger, otcStakes, {
  law: otcDeskLaw,
  midSource: otcMidBuilt.source,
  liveObservationFeed: otcMidBuilt.liveObservationFeed,
  midFeedWiring: otcMidFeedWiring,
  store: new SqlOtcQuoteStore(sql),
});

// trade.copy — D-S-03 Stage product mount. Empty TRADE_COPY_* laws → refuse-closed
// (never invent leader_share_bps or jurisdiction allowlist). Sql store needs
// copy_follows + copy_mirrored_fills migrations; fee-share still ledger-only.
const copyFeeShareLaw = parseCopyFeeShareLawJson(env.TRADE_COPY_FEE_SHARE_LAW);
const copyJurisdictionLaw = parseCopyJurisdictionLawJson(env.TRADE_COPY_JURISDICTION_LAW);
const copy = new CopyService(ledger, {
  feeShareLaw: copyFeeShareLaw,
  jurisdictionLaw: copyJurisdictionLaw,
  store: new SqlCopyFollowStore(sql),
  placeFollowerOrder: async (principal, input) => {
    const order = await trade.placeOrder(principal, {
      symbol: input.symbol,
      marketId: input.marketId,
      side: input.side,
      type: 'limit',
      qty: input.qty,
      price: input.price,
      tif: 'GTC',
      clientOrderId: input.clientOrderId,
    });
    return { orderId: order.id };
  },
  inspectMarket: async (symbol) => {
    const market = await trade.marketBySymbol(symbol);
    return market ? { paper: market.paper } : null;
  },
  lookupFollowerFillFee: async (fillId) => {
    const id = canonicalizeCopyFillId(fillId);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
      return null;
    }
    const [row] = await sql<Array<{ id: string; user_id: string; fee_asset: string; fee_amount: string; created_at: Date }>>`
      SELECT id, user_id, fee_asset, fee_amount, created_at FROM trade.fills WHERE id = ${id} LIMIT 1
    `;
    if (!row) return null;
    const createdAt = row.created_at instanceof Date ? row.created_at : new Date(row.created_at);
    return {
      fillId: row.id,
      userId: row.user_id,
      feeAsset: row.fee_asset,
      feeAmount: parseAmount(row.fee_amount),
      createdAt,
    };
  },
});

export const appRouter = createTradeRouter(trade, otc, copy);
export type AppRouter = typeof appRouter;

const edgeContext = createEdgeContext({ secret: env.EDGE_PRINCIPAL_SECRET, serviceName: env.SERVICE_NAME });

const app = Fastify({ logger: { level: env.LOG_LEVEL }, maxParamLength: 5_000 });

// Venue fabric public mid → mark path (A-TRADE-VENUE-1). Adapter created above (OTC/MM share).
if (venueBookPort && venuePublicAdapter) {
  for (const symbol of venueStreamSymbols) {
    const book = new MaintainedBook(venuePublicAdapter, symbol);
    venueMaintainedBooks.set(symbol, book);
    void book.run().then((status) => {
      app.log.warn({ symbol, status }, 'venue maintained book ended');
    });
  }
}
const venueMarkConfigured = createConfiguredVenueMarkSource({
  venueId: env.TRADE_VENUE_MARK_VENUE,
  symbols: venueMarkSymbols,
  adapter: venuePublicAdapter,
  ...(venueBookPort ? { bookForSymbol: venueBookPort } : {}),
});
if (env.TRADE_VENUE_MARK_VENUE.trim() && !venueMarkConfigured) {
  console.warn(
    `[svc-trade] TRADE_VENUE_MARK_VENUE=${env.TRADE_VENUE_MARK_VENUE.trim()} is not a known public MarketDataAdapter; venue mark off (never invent). Supported: binance-spot, bybit-spot, okx-spot`,
  );
}

const fundingMarketIds = parseFundingMarketIds(env.TRADE_FUTURES_FUNDING_MARKET_IDS);
const fundingMaxAbsRate = resolveFundingMaxAbsRateForBoot({
  fundingMarketIds,
  maxAbsRateRaw: env.TRADE_FUTURES_FUNDING_MAX_ABS_RATE,
});
if (fundingMaxAbsRate) {
  app.log.info({ fundingMaxAbsRate }, 'futures funding |rate| bound is configured');
} else if (fundingMarketIds.length === 0) {
  app.log.info(
    'TRADE_FUTURES_FUNDING_MAX_ABS_RATE unset — funding markets empty; publish/settle still refuse rates until a max is set (no invented ceiling)',
  );
}

const futuresJobs = startFuturesJobs({
  sql,
  ledger,
  matching,
  bus,
  venueMarkSource: venueMarkConfigured?.source ?? null,
  config: {
    enabled: env.TRADE_FUTURES_JOBS_ENABLED,
    liqIntervalMs: env.TRADE_FUTURES_LIQ_INTERVAL_MS,
    fundingIntervalMs: env.TRADE_FUTURES_FUNDING_INTERVAL_MS,
    fundingMarketIds,
    fundingMaxAbsRate,
  },
  onError: (name, err) => app.log.error({ err, job: name }, 'futures job tick failed'),
});

const profitSource = optionalProfitSourceFromConfig(env.TRADE_FUTURES_PROFIT_SOURCE);
const maxLeverage = parseConfiguredMaxLeverage(env.TRADE_FUTURES_MAX_LEVERAGE);
if (profitSource) {
  app.log.info({ profitSource: profitSource.configured }, 'futures realised profit is bounded by this account');
} else {
  app.log.warn(
    { variable: 'TRADE_FUTURES_PROFIT_SOURCE' },
    'FUTURES IS DISABLED: no account is named to fund realised profit, so opens are refused and no profit can be paid. ' +
      'Losing and flat closes of existing positions still work, and the rest of svc-trade is serving normally. See .env.example.',
  );
}

const adlDisclosureAcks = sqlAdlDisclosureStore(sql);
const adlDisclosureEvents = sqlAdlDisclosureEventStore(sql);
const positions = new PositionService(sql, ledger, {
  marks: futuresJobs.marks,
  profitSource,
  bus,
  maxLeverage,
  assertAdlDisclosureAcked: async (userId) => {
    try {
      await assertAdlDisclosureAcked(adlDisclosureAcks, userId);
    } catch (err) {
      if (err instanceof AdlDisclosureError) {
        throw new FuturesError(err.message, err.code, err.status);
      }
      throw err;
    }
  },
});

const candleJobs = startCandleJobs({
  sql,
  config: {
    enabled: env.TRADE_CANDLE_JOBS_ENABLED,
    intervalMs: env.TRADE_CANDLE_JOBS_INTERVAL_MS,
    marketIds: parseCandleMarketIds(env.TRADE_CANDLE_JOBS_MARKET_IDS),
    timeframes: parseCandleTimeframes(env.TRADE_CANDLE_JOBS_TIMEFRAMES),
  },
  onError: (name, err) => app.log.error({ err, job: name }, 'candle job tick failed'),
  onResult: (r) => {
    if (r.written > 0) {
      app.log.info(
        { marketId: r.marketId, timeframe: r.timeframe, candleCount: r.candleCount, written: r.written },
        'candle materialize ok',
      );
    }
  },
});

const mmMidSource = createMmMidSourceFromConfig({
  midsEnv: env.TRADE_MM_SEED_MIDS,
  midFromVenue: env.TRADE_MM_SEED_MID_FROM_VENUE,
  venueAdapter: venuePublicAdapter,
  resolveVenueSymbol: (marketId) => venueMarkSymbols.get(marketId) ?? null,
  ...(venueBookPort ? { bookForSymbol: venueBookPort } : {}),
});
const mmSeedTargets = parseMmSeedTargets(env.TRADE_MM_SEED_MARKETS);
const mmSeedJobs = startMmSeedJobs({
  ledger,
  matching,
  midSource: mmMidSource,
  marketFor: async (marketId) => {
    const m = await trade.marketById(marketId);
    if (!m) return null;
    return m;
  },
  marketLifecycle,
  now: () => new Date(),
  futuresEnabled: env.TRADE_FUTURES_ENABLED,
  config: {
    enabled: env.TRADE_MM_SEED_ENABLED,
    intervalMs: env.TRADE_MM_SEED_INTERVAL_MS,
    halfSpreadBps: env.TRADE_MM_SEED_HALF_SPREAD_BPS,
    stepBps: env.TRADE_MM_SEED_STEP_BPS,
    levels: env.TRADE_MM_SEED_LEVELS,
    qtyPerLevel: env.TRADE_MM_SEED_QTY,
    targets: mmSeedTargets,
  },
  statePath: env.TRADE_MM_SEED_STATE_PATH,
  recordSeededOrder: async (row) => {
    await sql`
      INSERT INTO trade.orders (
        id, user_id, market_id, side, type, price, qty, status, tif,
        hold_asset, hold_amount, fee_discount_bps, seeded, lifecycle_proof
      ) VALUES (
        ${row.orderId}, ${HOUSE_MM_USER_UUID}, ${row.marketId}, ${row.side}, ${'limit'},
        ${row.price}::numeric, ${row.qty}::numeric, ${'open'}, ${'PO'},
        ${row.holdAsset}, ${row.holdAmount}::numeric, ${0}, ${true}, ${JSON.stringify(row.lifecycleProof)}::jsonb
      )
      ON CONFLICT (id) DO NOTHING
    `;
  },
  onError: (name, err) => app.log.error({ err, job: name }, 'mm seed job tick failed'),
  onResult: (marketId, result) => {
    if ('skipped' in result) {
      app.log.info({ marketId, skipped: result.skipped }, 'mm seed skipped');
    } else if (result.ok) {
      app.log.info({ marketId, mid: result.mid, placements: result.placements.length }, 'mm seed ok');
    } else {
      app.log.warn({ marketId, reason: result.reason }, 'mm seed failed');
    }
  },
});

const algoJobs = startAlgoJobs({
  trade,
  config: {
    enabled: env.TRADE_ALGO_JOBS_ENABLED,
    intervalMs: env.TRADE_ALGO_JOBS_INTERVAL_MS,
  },
  onError: (name, err) => app.log.error({ err, job: name }, 'algo job tick failed'),
});

const reconcileJobs = startEngineLedgerReconcileJobs({
  sql,
  ledger,
  matching,
  config: {
    enabled: env.TRADE_RECONCILE_JOBS_ENABLED,
    intervalMs: env.TRADE_RECONCILE_JOBS_INTERVAL_MS,
  },
  onError: (name, err) => app.log.error({ err, job: name }, 'engine-ledger reconcile job tick failed'),
  onResult: (r) => {
    if (r.marketIdDrift.drifted) {
      app.log.warn(
        {
          tradeCount: r.marketIdDrift.tradeCount,
          engineCount: r.marketIdDrift.engineCount,
          onlyInTrade: r.marketIdDrift.onlyInTrade,
          onlyInEngine: r.marketIdDrift.onlyInEngine,
        },
        'engine-ledger market-id DRIFT — alarm only; no invent/delete of markets',
      );
    }
    if (r.plan.refusals.length > 0) {
      app.log.warn(
        {
          checked: r.report.checked,
          refusals: r.plan.refusals.length,
          findings: r.plan.refusals.map((f) => ({
            orderId: f.orderId,
            case: f.case,
            engine: f.engine,
            counterpart: f.counterpart,
          })),
        },
        'engine-ledger reconcile REFUSE — no write; operator must resolve',
      );
    }
    if (r.deleted.length > 0) {
      app.log.info({ deleted: r.deleted }, 'engine-ledger reconcile auto-deleted unfunded pending');
    }
    if (r.plan.autoNonDelete.length > 0) {
      app.log.info(
        { autoNonDelete: r.plan.autoNonDelete.map((f) => ({ orderId: f.orderId, case: f.case })) },
        'engine-ledger reconcile auto findings not deleted (pending-only rule)',
      );
    }
  },
});
