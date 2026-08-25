import { createHash } from 'node:crypto';
import type { Sql } from 'postgres';
import { transaction } from '@intafaced/db';
import type { Timeframe } from '@intafaced/exchange-contract';
import type { EventBus } from '@intafaced/events';
import { requireScope, type Principal } from '@intafaced/auth';
import {
  add,
  formatAmount,
  InsufficientFundsError,
  mul,
  mulBps,
  orderHoldAccount,
  parseAmount,
  recipes,
  sub,
  type Amount,
  type LedgerClient,
} from '@intafaced/ledger-client';
import { withMoneySpan } from '../tracing.js';
import { queryCandlesFromFills, queryTakerVolumeFromFills } from './candles.js';
import { fillPayAmounts, fillReceivablesSurviveFees, ratesForFill } from './fees.js';
import { fillIdFor, fillLegIdFor, orderIdFor } from './ids.js';
import {
  assertMarketOpen,
  assertNotional,
  assertPrice,
  assertQty,
  assertSettlementRails,
  assertSpotSurface,
  assertTradable,
  holdFor,
  protectionPriceFor,
  requireSupportedType,
} from './risk.js';
import { resolveOptionsListing } from './options-listing.js';
import { checkInsuranceFundedForListing } from '../futures/insurance-listing-gate.js';
import { assertProductionUnsettledAssetClassListing } from './forex-settlement.js';
import { toFill, toMarket, toOrder, type FillRow, type MarketRow, type OrderRow } from './rows.js';
import type { RankPerksSource } from './rank-perks.js';
import { fireAffiliateAccrue, affiliateLegsAfterFill, NoopAffiliateAccrue, type AffiliateAccruePort } from './affiliate-accrue.js';
import { fireAffiliatePayout, NoopAffiliatePayout, type AffiliatePayoutPort } from './affiliate-payout.js';
import { NoSubAccounts, assertSubAccountOwned, type SubAccountOwnershipSource } from './sub-account-ownership.js';
import type {
  EngineAmendResult,
  EngineCancellation,
  EngineFill,
  EngineSubmitRequest,
  EngineSubmitResult,
  MatchingClient,
} from './matching-client.js';
import { estimateConvert, presentConvertQuote } from '../convert/quote.js';
import { isHouseMmAccount } from '../mm/seed-market.js';
import { recoverMatchingAccountId } from '../mm/fill-account.js';
import { HOUSE_MM_USER_UUID } from './ids.js';
import {
  presentAlgoProgress,
  SqlTwapParentStore,
  TwapEngine,
  type AlgoProgressView,
  type AlgoQuotedMark,
  type CreateTwapInput,
  type TwapParent,
  type TwapParentStore,
} from '../algo/index.js';
import { captureAlgoPlaceGrant, principalFromAlgoGrant } from '../algo/durable-principal.js';
import { alignLookbackVolumes, sliceCount, timeframeForSliceInterval } from '../algo/volume-plan.js';
import type { TwapParentRecord } from '../algo/parent-store.js';
import { hydrateAlgoFromStore, hydrateAlgoIfMissing, persistAlgoCancelAttempt, persistAlgoMutation } from '../algo/hydrate-on-mutate.js';
import type { MarketLifecyclePort } from '../market-lifecycle.js';
import { createLifecycleAdmissionProof, type LifecycleAdmissionProof } from '../lifecycle-proof.js';
import {
  TradeError,
  type Candle,
  type FillRecord,
  type Market,
  type MarketKind,
  type OrderRecord,
  type OrderSide,
  type OrderStatus,
  type AmendOrderOutcome,
  type AmendOutcomeCode,
  type AmendPriority,
  type ReplaceOrderOutcome,
  type ReplaceOutcomeCode,
  type OrderType,
  type RecoveryReason,
  type PublicTapePrint,
  type ReconcileResult,
  type TimeInForce,
  type TradeErrorCode,
} from './types.js';

/**
 * svc-trade — THE PRODUCT LAYER (§5.2).
 */
export class TradeService {
  private async takeQtyUpHold(
    order: OrderRecord,
    extra: Amount,
    sequence: number,
  ): Promise<{ ok: true } | { ok: false; code: AmendOutcomeCode; reason: string }> {
    try {
      await this.ledger.post(
        recipes.orderHoldAmend({
          orderId: order.id,
          userId: order.userId,
          assetId: order.holdAsset,
          amount: extra,
          sequence,
        }),
      );
    } catch (err) {
      if (err instanceof InsufficientFundsError) {
        return { ok: false, code: 'NOT_AMENDABLE', reason: err.code };
      }
      return { ok: false, code: 'AMEND_UNKNOWN', reason: 'AMEND_UNKNOWN' };
    }
    return { ok: true };
  }
}
