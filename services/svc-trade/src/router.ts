import { z } from 'zod';
import { router, publicProcedure, scopedProcedure, TRPCError } from '@intafaced/contracts';
import { AuthError } from '@intafaced/auth';
import { formatAmount, parseAmount, InsufficientFundsError, LedgerError } from '@intafaced/ledger-client';
import { orderSideSchema, timeInForceSchema } from '@intafaced/exchange-contract';
import { TradeError, type FillRecord, type Market, type OrderRecord } from './spot/types.js';
import { assertProductionUnsettledAssetClassListing, forexSettlementStatus } from './spot/forex-settlement.js';
import type { TradeService } from './spot/trade-service.js';
import { OtcError } from './otc/errors.js';
import { otcMakerRoutingStatus, OTC_MAKER_ROUTING_RESIDUAL } from './otc/maker-routing.js';
import { otcMidFeedStatus, OTC_MID_FEED_RESIDUAL } from './otc/mid-feed.js';
import type { OtcDeskService } from './otc/otc-service.js';
import { autoMirrorPlaceStatus, COPY_AUTO_MIRROR_PLACE_RESIDUAL } from './copy/auto-mirror-place.js';
import { COPY_FEE_SHARE_RESIDUAL, COPY_JURISDICTION_RESIDUAL, COPY_LAW_RESIDUAL, CopyError } from './copy/errors.js';
import { describeCopyPolicy } from './copy/copy-policy.js';
import type { CopyService } from './copy/copy-service.js';
import { describeFuturesPolicy } from './futures/futures-policy.js';
import { describeOptionsPolicy } from './spot/options-policy.js';
import { describeOtcPolicy } from './otc/otc-policy.js';
import { describeAlgoPolicy } from './algo/algo-policy.js';

/**
 * svc-trade's API (§5.2).
 *
 * Every amount on this boundary is a DECIMAL STRING, in and out. `Amount` is a
 * scaled bigint and bigint does not survive JSON; a JS number would round the
 * 18th decimal place away silently, which is the place the ledger reconciles
 * at. The conversion happens here and nowhere else.
 *
 * Authorisation is declared on the procedure — `scopedProcedure('trade:write',
 * { module: 'trade' })` checks the scope, the verification tier and the
 * jurisdiction matrix in one middleware, so nothing can accidentally skip the
 * matrix. `TradeService` repeats the scope check internally, because a service
 * whose only gate lives in one transport gains a hole the day it gains a second
 * transport.
 *
 * `trade:withdraw` appears nowhere here, deliberately: it is an
 * INTERACTIVE_ONLY scope that no API key may hold, which is what protects a
 * leaked bot key from moving value off the platform.
 */

/** Unsigned decimal string. Reuses the exchange contract's rule rather than inventing a second one. */
const decimal = z.string().regex(/^\d+(\.\d{1,18})?$/, 'amounts are unsigned decimal strings with at most 18 decimal places');
