import { ZERO, formatAmount } from '@intafaced/ledger-client/money';
import type { MarketLifecycleAdmissionProof } from '@intafaced/exchange-contract';
import type { EventBus, PayloadOf } from '@intafaced/events';
import { withEngineSpan, withSpan } from '../tracing.js';
import { OrderBook } from './book.js';
import './trailing-stop.js';
import './option.js';
import { flattenCloseOrder, netPositionOf, positionFlatResult, type ClosePositionCommand } from './close-position.js';
import { haltedAmendResult, haltedSubmitResult, operatorRefuse, readOperatorId, replayHaltedMarkets } from './halt.js';
import { replayVenueHalted, venueHaltedAmendResult, venueHaltedSubmitResult } from './venue-kill.js';
import {
  reduceOnlyMarketAmendResult,
  reduceOnlyMarketSubmitResult,
  replayReduceOnlyMarkets,
  wouldOpenOrIncrease,
} from './reduce-only-market.js';
import { isPostOnlySubmit, postOnlyMarketSubmitResult, replayPostOnlyMarkets } from './post-only-market.js';
import { prelaunchAmendResult, prelaunchSubmitResult, replayPrelaunchMarkets } from './prelaunch.js';
import {
  delistedAmendResult,
  delistedSubmitResult,
  expiredAmendResult,
  expiredSubmitResult,
  replayDelistedMarkets,
  replayExpiredMarkets,
} from './expire.js';
import {
  inFlightAmendResult,
  inFlightCancelResult,
  inFlightSubmitResult,
  parseIfmQty,
  replayInFlight,
  type IfmMutation,
  type InFlightMark,
} from './ifm.js';
import { massCancelSessionRefuse, readMassCancelSide, readSessionId } from './mass-cancel.js';
import { missingSessionRefuse, replayDeadSessions, sessionGoneSubmitResult } from './session.js';
import {
  replay,
  serializeBooks,
  snapshotAll,
  toWire,
  toWireAmend,
  type EngineJournal,
  type EngineSnapshot,
  type JournalRecord,
} from './journal.js';
import type {
  AmendResult,
  CancelResult,
  CancelledRef,
  EngineAmend,
  EngineLiveOrder,
  EngineOrder,
  EngineSurveillanceCase,
  Fill,
  MarketHaltResult,
  MarketId,
  MarketPostOnlyResult,
  MarketDelistResult,
  MarketExpireResult,
  MarketPrelaunchResult,
  MarketReduceOnlyResult,
  MassCancelResult,
  SessionDeadResult,
  VenueKillResult,
  OrderId,
  OrderSide,
  PriceLevelState,
  SubmitResult,
  TriggerOutcome,
} from './types.js';
