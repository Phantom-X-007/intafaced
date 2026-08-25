import { ZERO, formatAmount } from '@intafaced/ledger-client/money';
import type { MarketLifecycleAdmissionProof } from '@intafaced/exchange-contract';
import type { EventBus, PayloadOf } from '@intafaced/events';
import { withEngineSpan } from '../tracing.js';
import { OrderBook } from './book.js';
import { flattenCloseOrder, positionFlatResult, type ClosePositionCommand } from './close-position.js';
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
  Fill,
  MarketId,
  OrderId,
  OrderSide,
  PriceLevelState,
  SubmitResult,
  TriggerOutcome,
} from './types.js';
