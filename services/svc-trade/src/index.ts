import Fastify from 'fastify';
import postgres from 'postgres';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createEdgeContext } from '@intafaced/contracts';
import { JetStreamEventBus } from '@intafaced/events';
import { env } from './env.js';
import { TradeService } from './spot/trade-service.js';
import { createMatchingClient } from './spot/matching-close.js';
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
import { attachClosePosition, closeSpotPosition, installClosePosition } from './spot/close-position.js';
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
